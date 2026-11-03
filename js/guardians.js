// Guardian catalogue. The QR on each printed card opens index.html?guardian=<key>, and the
// camera then looks for that same card (an 8th Wall image target) to stand the guardian on.
// To add a guardian: export its .glb into assets/, build its image target with
// tools/build_image_target.js, and add an entry here.
//   model        relative path to the .glb (relative paths keep GitHub Pages subpaths working)
//   idleClip     name of the looping animation to play (falls back to the first clip)
//   name/tagline user-facing text (Spanish)
//   targets      image targets that anchor the guardian in the room; all are tracked at once. The
//                first anchor prefers the highest priority (a lower one waits a moment for it);
//                once anchored, the highest priority in view refines or moves the anchor.
//                Per target:
//     name          image target name; must equal "name" inside the target JSON
//     data          relative path to the JSON written by tools/build_image_target.js
//     heightOnCard  figure height as a multiple of the target's width (1 = as tall as it is wide),
//                   so it fits a small printed QR and a full card alike
//     footOffset    where the feet stand along the target's vertical axis, in target heights
//                   (0 = centre, -0.5 = bottom edge, 0.5 = top edge). Used when the target lies
//                   flat-ish; on a near-vertical target the guardian stands on its lowest edge.
//     priority      higher wins when several targets are in view

export const GUARDIANS = {
  mohan: {
    name: 'El Mohán',
    tagline: 'Guardián de los ríos',
    model: 'assets/mohan-prueba.glb',
    idleClip: 'Idle',
    targets: [
      // Recommended: the whole card (rich, non-repetitive artwork). The feet stand on the river
      // emblem in the upper half, leaving the name and the QR visible in front of the figure.
      { name: 'mohan-card', data: 'image-targets/mohan-card.json', heightOnCard: 1, footOffset: 0.18, priority: 1 },
      // Experimental: the QR alone (centred on a white 3:4 canvas, so its width = the QR's width).
      // The card target has its QR masked out (tools/build_image_target.js), so a bare QR can only
      // match this target; on the full card, the card takes over as soon as it is recognised.
      { name: 'mohan-qr', data: 'image-targets/mohan-qr.json', heightOnCard: 1, footOffset: 0, priority: 0 },
    ],
  },
};

// Used when the URL has no ?guardian= parameter at all.
export const DEFAULT_GUARDIAN = 'mohan';
