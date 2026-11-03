// Guardian catalogue. The QR on each collectible figure opens index.html?guardian=<key>.
// To add a guardian: export its .glb into assets/ and add an entry here.
//   model        relative path to the .glb (relative paths keep GitHub Pages subpaths working)
//   heightMeters height the model is normalized to at scale 1
//   idleClip     name of the looping animation to play (falls back to the first clip)
//   name/tagline user-facing text (Spanish)

export const GUARDIANS = {
  mohan: {
    name: 'El Mohán',
    tagline: 'Guardián de los ríos',
    model: 'assets/mohan-prueba.glb',
    heightMeters: 0.3,
    idleClip: 'Idle',
  },
};

// Used when the URL has no ?guardian= parameter at all.
export const DEFAULT_GUARDIAN = 'mohan';
