// Guardian catalogue. The page opens from a plain link (index.html?guardian=<key>; without the
// parameter it opens DEFAULT_GUARDIAN). The camera then looks for the guardian's picture
// (figura/<name>.png, shown on a screen or printed): that picture is the image target.
// To add a guardian: export its .glb into assets/, build its image target with
// tools/build_image_target.js, and add an entry here.
//   model        relative path to the .glb (relative paths keep GitHub Pages subpaths working)
//   idleClip     name of the looping animation to play (falls back to the first clip)
//   name/tagline user-facing text (Spanish)
//   lore         text of the floating panel next to the guardian and of the on-screen reader
//                (Spanish; both are drawn from this one object)
//     title         large heading (gold)
//     subtitle      line under the title (italic)
//     paragraphs    array of strings, one per paragraph
//   targets      image targets that anchor the guardian in the room (today one picture per guardian);
//                the guardian appears on the first one recognised. Per target:
//     name          image target name; must equal "name" inside the target JSON
//     data          relative path to the JSON written by tools/build_image_target.js
//     heightOnTarget  figure height as a multiple of the target's width (2 = twice as tall as the
//                   picture is wide, i.e. 1.5x its 3:4 height), so the figure scales with the picture
//     footOffset    where the feet stand along the target's vertical axis, in target heights
//                   (0 = centre, -0.5 = bottom edge, 0.5 = top edge). Used when the target lies
//                   flat-ish; on a near-vertical target the guardian stands on its lowest edge.

export const GUARDIANS = {
  mohan: {
    name: 'El Mohán',
    tagline: 'Guardián de las aguas',
    model: 'assets/mohan-prueba.glb',
    idleClip: 'Idle',
    lore: {
      title: 'El Mohán',
      subtitle: 'Guardián de las aguas',
      paragraphs: [
        'Viejo, corpulento y de barba larga, con el cabello enredado de algas y musgo de río. Vive en una gruta bajo el agua, en los ríos andinos, sobre todo en el Magdalena, en el Tolima.',
        'Es paciente y burlón, y desconfía de quienes olvidaron el río. Cree que nada se pierde del todo mientras corra el agua.',
        'Cuando el Olvido contamina sus ríos, descubre que la pérdida empieza cuando las personas dejan de contar sus historias. Por eso defiende el Libro Sagrado de las Leyendas.',
      ],
    },
    targets: [
      // figura/mohan-figura.png (3:4, built by tools/build_figura.py): the target's width = the picture's width.
      { name: 'mohan-figura', data: 'image-targets/mohan-figura.json', heightOnTarget: 2, footOffset: 0 },
    ],
  },
};

// Used when the URL has no ?guardian= parameter at all.
export const DEFAULT_GUARDIAN = 'mohan';
