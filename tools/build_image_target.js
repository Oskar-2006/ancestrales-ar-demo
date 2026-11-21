// Genera los recursos PLANAR de XR8 a partir de los renders verticales del catálogo.
import fs from 'node:fs/promises'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {GUARDIANS} from '../js/guardians.js'

const raiz = fileURLToPath(new URL('../', import.meta.url))
const dependencias = process.env.SHARP_DIR || raiz
const sharp = createRequire(path.resolve(dependencias, 'package.json'))('sharp')
const carpeta = path.join(raiz, 'image-targets')
await fs.mkdir(carpeta, {recursive: true})

for (const personaje of Object.values(GUARDIANS)) {
  for (const {name: nombre} of personaje.targets) {
    const imagen = sharp(path.join(raiz, 'figura', nombre + '.png')).flatten({background: 'white'})
    const {width, height} = await imagen.metadata()
    if (width * 4 !== height * 3) throw Error('La imagen debe ser vertical 3:4: ' + nombre)
    const resources = {}
    async function guardar(campo, sufijo, variante) {
      const archivo = nombre + '_' + sufijo + '.jpg'
      await variante.jpeg({quality: 92}).toFile(path.join(carpeta, archivo))
      resources[campo] = archivo
    }
    await guardar('originalImage', 'original', imagen.clone())
    await guardar('croppedImage', 'cropped', imagen.clone())
    await guardar('thumbnailImage', 'thumbnail', imagen.clone().resize({height: 350}))
    await guardar('luminanceImage', 'luminance', imagen.clone().resize(480, 640).greyscale())
    const datos = {
      imagePath: 'image-targets/' + resources.luminanceImage, metadata: null, name: nombre,
      type: 'PLANAR', properties: {left: 0, top: 0, width, height, isRotated: false,
        originalWidth: width, originalHeight: height}, resources,
    }
    await fs.writeFile(path.join(carpeta, nombre + '.json'), JSON.stringify(datos, null, 2) + '\n')
  }
}
