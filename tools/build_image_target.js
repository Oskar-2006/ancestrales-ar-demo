#!/usr/bin/env node
// Builds the 8th Wall image targets for El Mohán.
//
// Targets (both are loaded by the page at once; either one makes the guardian appear):
//   mohan-card  from card/mohan-card-target.png  (3:4 portrait, the full card art incl. its QR)
//   mohan-qr    from qr/qr-mohan.png             (square QR incl. quiet zone), centred on a white
//               3:4 canvas first, because 8th Wall image targets are always 3:4
//
// Output per target in image-targets/: <name>.json plus <name>_luminance.jpg (what XR8 actually
// loads and tracks), <name>_cropped.jpg, <name>_thumbnail.jpg and <name>_original.jpg.
//
// It drives @8thwall/image-target-cli (MIT) non-interactively: the CLI is a readline
// wrapper around applyCrop(), so we call that function directly with a flat (PLANAR)
// geometry and the CLI's own default crop, which for a 3:4 portrait image is the whole image.
//
// The CLI and its dependency sharp are build-time tools only and are NOT part of the site.
// Install them anywhere outside the repo, e.g.:
//   mkdir -p /tmp/itc-tool && cd /tmp/itc-tool && npm init -y && npm install @8thwall/image-target-cli@1.0.0
// then, from the repo root:
//   node tools/build_image_target.js --tool-dir /tmp/itc-tool
//
// Options (all optional):
//   --tool-dir <dir>  folder whose node_modules holds @8thwall/image-target-cli (or env IMAGE_TARGET_CLI_DIR;
//                     defaults to the current directory)
//   --only <name>     build just one target (mohan-card or mohan-qr)
//   --input <png>     with --only: use another source image (e.g. a test stand-in)
//   --out <dir>       output folder (default image-targets)

import fs from 'fs/promises'
import path from 'path'
import {createRequire} from 'module'
import {fileURLToPath, pathToFileURL} from 'url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// JPEG keeps the luminance image small (it is downloaded on every visit); 92 keeps print detail.
const JPEG_QUALITY = 92

// Target names must match js/guardians.js.
//   pad3x4:    centre the source on a white 3:4 portrait canvas (as wide as the source)
//   maskWhite: rectangle (source pixels) painted white before building the target.
//              The card's QR is the same pattern as the mohan-qr target; if the card target kept it,
//              a bare printed QR would be recognised as the whole card and the guardian would be
//              placed where the (absent) card centre would be. Without it, the card is tracked by
//              its artwork only and the QR belongs to mohan-qr alone. If the card layout changes,
//              update this rectangle (it must cover the QR modules, inside the QR's white box).
const TARGETS = [
  {
    name: 'mohan-card',
    input: 'card/mohan-card-target.png',
    pad3x4: false,
    maskWhite: {left: 474, top: 741, width: 239, height: 239},
  },
  {name: 'mohan-qr', input: 'qr/qr-mohan.png', pad3x4: true},
]

function parseArgs(argv) {
  const args = {
    toolDir: process.env.IMAGE_TARGET_CLI_DIR || process.cwd(),
    only: null,
    input: null,
    out: path.join(REPO_ROOT, 'image-targets'),
  }
  for (let i = 2; i < argv.length; i += 2) {
    const key = argv[i]
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`Missing value for ${key}`)
    if (key === '--tool-dir') args.toolDir = path.resolve(value)
    else if (key === '--only') args.only = value
    else if (key === '--input') args.input = path.resolve(value)
    else if (key === '--out') args.out = path.resolve(value)
    else throw new Error(`Unknown option ${key}`)
  }
  if (args.input && !args.only) throw new Error('--input needs --only <name>')
  return args
}

/** Loads a module from the tool folder's node_modules (the repo itself has no dependencies). */
async function importFromToolDir(toolDir, specifier) {
  const require = createRequire(path.join(toolDir, 'package.json'))
  let resolved
  try {
    resolved = require.resolve(specifier)
  } catch (err) {
    throw new Error(
      `Cannot find "${specifier}" under ${toolDir}. Install the build tools first ` +
      '(npm install @8thwall/image-target-cli@1.0.0) and pass --tool-dir.'
    )
  }
  return import(pathToFileURL(resolved).href)
}

/** Builds one target; returns the written JSON data. */
async function buildTarget(tools, target, input, outDir) {
  const {sharp, applyCrop, getDefaultCrop} = tools
  await fs.access(input)

  // Flatten any transparency onto white (what it looks like on paper) and re-encode as JPEG,
  // so the CLI writes .jpg resources instead of large PNGs.
  let source = sharp(input).flatten({background: '#ffffff'})
  if (target.maskWhite) {
    const m = target.maskWhite
    // Sanity check: the rectangle should hold a QR (a mix of dark and light modules).
    const stats = await sharp(input).flatten({background: '#ffffff'}).extract(m).greyscale().raw()
      .toBuffer({resolveWithObject: true})
    let dark = 0
    for (const v of stats.data) if (v < 100) dark++
    const darkRatio = dark / stats.data.length
    if (darkRatio < 0.25 || darkRatio > 0.75) {
      console.warn(
        `Warning: the maskWhite rectangle of "${target.name}" is ${Math.round(darkRatio * 100)} % dark; ` +
        'it does not look like the QR any more. Check the rectangle against the card layout.'
      )
    }
    const white = await sharp({
      create: {width: m.width, height: m.height, channels: 3, background: '#ffffff'},
    }).png().toBuffer()
    source = sharp(await source.composite([{input: white, left: m.left, top: m.top}]).png().toBuffer())
  }
  if (target.pad3x4) {
    const meta = await sharp(input).metadata()
    const width = meta.width
    const height = Math.max(meta.height, Math.round((width * 4) / 3))
    const top = Math.floor((height - meta.height) / 2)
    source = source.extend({
      top, bottom: height - meta.height - top, left: 0, right: 0, background: '#ffffff',
    })
  }
  const jpeg = await source
    .toColourspace('srgb')
    .jpeg({quality: JPEG_QUALITY, chromaSubsampling: '4:4:4'})
    .toBuffer()
  const rawImage = sharp(jpeg)
  const metadata = await rawImage.metadata()

  // Same choice the interactive CLI makes for "Use default crop? Y": the largest centred 3:4
  // region, rotated only for landscape sources. For a 3:4 portrait image this is the full image.
  const isRotated = metadata.width >= metadata.height
  const geometry = getDefaultCrop(metadata, isRotated)
  const fullImage = geometry.left === 0 && geometry.top === 0 &&
    geometry.width === (isRotated ? metadata.height : metadata.width) &&
    geometry.height === (isRotated ? metadata.width : metadata.height)
  if (!fullImage) {
    console.warn(
      `Warning: ${metadata.width}x${metadata.height} is not 3:4; "${target.name}" keeps only the centred ` +
      `${geometry.width}x${geometry.height} region. Export the source at 3:4 to track all of it.`
    )
  }

  // Remove resources left by a previous run (possibly with another extension).
  await fs.mkdir(outDir, {recursive: true})
  for (const file of await fs.readdir(outDir)) {
    if (file === `${target.name}.json` || file.startsWith(`${target.name}_`)) {
      await fs.rm(path.join(outDir, file))
    }
  }

  const {dataPath} = await applyCrop(rawImage, {type: 'PLANAR', geometry}, outDir, target.name, true)

  // The CLI writes imagePath as "image-targets/<file>". XR8 loads it with <img src>, so it is
  // resolved against the page URL: keep it relative (no leading slash) so the site also works
  // under a GitHub Pages subpath such as /ancestrales-ar-demo/.
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'))
  const outFolder = path.relative(REPO_ROOT, outDir).split(path.sep).join('/')
  data.imagePath = `${outFolder}/${data.resources.luminanceImage}`
  if (data.imagePath.startsWith('/') || data.imagePath.startsWith('..')) {
    throw new Error(`imagePath must stay relative to the site root, got ${data.imagePath}`)
  }
  await fs.writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`)

  const lum = await sharp(path.join(outDir, data.resources.luminanceImage)).metadata()
  console.log(`Image target "${data.name}" (${data.type}) written to ${path.relative(REPO_ROOT, dataPath)}`)
  console.log(`  source    ${path.relative(REPO_ROOT, input)} -> ${metadata.width}x${metadata.height}${target.pad3x4 ? ' (padded to 3:4)' : ''}`)
  if (target.maskWhite) console.log(`  mask      ${JSON.stringify(target.maskWhite)} painted white`)
  console.log(`  crop      left ${geometry.left}, top ${geometry.top}, ${geometry.width}x${geometry.height}, rotated ${geometry.isRotated}`)
  console.log(`  imagePath ${data.imagePath} (${lum.width}x${lum.height})`)
  return data
}

async function main() {
  const args = parseArgs(process.argv)
  const selected = args.only ? TARGETS.filter((t) => t.name === args.only) : TARGETS
  if (!selected.length) throw new Error(`Unknown target "${args.only}" (known: ${TARGETS.map((t) => t.name).join(', ')})`)

  const tools = {
    sharp: (await importFromToolDir(args.toolDir, 'sharp')).default,
    applyCrop: (await importFromToolDir(args.toolDir, '@8thwall/image-target-cli/src/apply.js')).applyCrop,
    getDefaultCrop: (await importFromToolDir(args.toolDir, '@8thwall/image-target-cli/src/crop.js')).getDefaultCrop,
  }
  for (const target of selected) {
    const input = args.input || path.join(REPO_ROOT, target.input)
    await buildTarget(tools, target, input, args.out)
  }
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
