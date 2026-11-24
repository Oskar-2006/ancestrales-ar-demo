export const GUARDIANS = {
  mohan: {
    giroInicial: -Math.PI / 2,
    name: 'El Mohán',
    tagline: 'Guardián de los ríos',
    model: 'assets/mohan.glb?v=respiracion-1',
    lore: {
      title: 'El Mohán',
      subtitle: 'Guardián de los ríos',
      paragraphs: [
        'Viejo, corpulento y de barba larga, con el cabello enredado de algas y musgo de río. Vive en una gruta bajo el agua, en los ríos andinos, sobre todo en el Magdalena, en el Tolima.',
        'Es paciente y burlón, y desconfía de quienes olvidaron el río. Cree que nada se pierde del todo mientras corra el agua.',
        'Cuando el Olvido contamina sus ríos, descubre que la pérdida empieza cuando las personas dejan de contar sus historias. Por eso defiende el Libro Sagrado de las Leyendas.',
      ],
    },
    targets: [
      { name: 'mohan-figura', data: 'image-targets/mohan-figura.json', heightOnTarget: 2, footOffset: 0 },
    ],
  },

  patasola: {
    name: 'La Patasola',
    tagline: 'Cazadora de la espesura',
    model: 'assets/patasola.glb?v=respiracion-1',
    lore: {
      title: 'La Patasola',
      subtitle: 'Cazadora de la espesura',
      paragraphs: [
        'Mujer de una sola pierna, con el cabello largo y enmarañado y un rostro que cambia de bello a temible. Conoce los senderos y las sombras de la selva y se mueve entre la espesura y los caminos.',
        'Es desconfiada, rápida e implacable con quien invade el monte. Quiere preservar los misterios de la selva y cree que el monte solo se defiende si alguien le teme y lo respeta.',
      ],
    },
    targets: [
      { name: 'patasola-figura', data: 'image-targets/patasola-figura.json', heightOnTarget: 2, footOffset: 0 },
    ],
  },

  hojarasquin: {
    name: 'Hojarasquín del Monte',
    tagline: 'Espíritu del bosque',
    model: 'assets/hojarasquin.glb?v=respiracion-1',
    lore: {
      title: 'Hojarasquín del Monte',
      subtitle: 'Espíritu del bosque',
      paragraphs: [
        'Figura cubierta de hojas secas, musgo y ramas, con el cuerpo a medio camino entre hombre y árbol. Vive en los bosques de montaña, entre senderos de hojarasca.',
        'Es silencioso, tímido y protector. Defiende los bosques y las historias que viven en ellos, y cree que cada camino del bosque es una historia.',
      ],
    },
    targets: [
      { name: 'hojarasquin-figura', data: 'image-targets/hojarasquin-figura.json', heightOnTarget: 2, footOffset: 0 },
    ],
  },

  madremonte: {
    name: 'La Madremonte',
    tagline: 'Protectora del equilibrio',
    model: 'assets/madremonte.glb',
    lore: {
      title: 'La Madremonte',
      subtitle: 'Protectora del equilibrio',
      paragraphs: [
        'Mujer alta cubierta de musgo, hojas y bejucos, con un sombrero de ramas que le tapa el rostro. Habita las montañas andinas, donde nacen los ríos y empiezan los bosques.',
        'Es severa y protectora. Quiere conservar el vínculo entre humanidad, naturaleza y tradición, y cree que todo está conectado.',
      ],
    },
    targets: [
      { name: 'madremonte-figura', data: 'image-targets/madremonte-figura.json', heightOnTarget: 2, footOffset: 0 },
    ],
  },
};

function personaje(clave, nombre, subtitulo, historia) {
  const objetivo = clave + '-figura';
  return {
    name: nombre, tagline: subtitulo, model: 'assets/' + clave + '.glb',
    lore: {title: nombre, subtitle: subtitulo, paragraphs: historia},
    targets: [{name: objetivo, data: 'image-targets/' + objetivo + '.json', heightOnTarget: 2, footOffset: 0}],
  };
}

// La ciénaga y el ataque desde el lodo aparecen en el borrador grupal de Ancestrales.
GUARDIANS.hombrecaiman = personaje('hombrecaiman', 'El Hombre Caimán', 'La Ciénaga subterránea', [
  'El Hombre Caimán habita una ciénaga bajo tierra. Entre plataformas flotantes, sus mordidas llegan desde el lodo.',
]);
GUARDIANS.hombrecaiman.model += '?v=respiracion-1';

// Lore de los atacantes (propuesta), a partir del propósito indicado por Oskar.
const relatos = [
  'El primero espera a que alguien empiece a contar la historia del Mohán. Le basta robar una palabra: el abuelo se queda en silencio y el niño vuelve a casa sin saber quién vive en el río.',
  'El segundo busca los nombres escritos al margen del Libro. Los borra letra por letra. Cuando alguien abre la página, reconoce el rostro del guardián, pero ya no sabe cómo llamarlo.',
  'El tercero sigue a quienes todavía recuerdan. Si una niña cuenta la leyenda de la Patasola, vuelve a su puerta la noche siguiente. Quiere oírla decir que ya se le olvidó.',
];
relatos.forEach((relato, indice) => {
  const numero = indice + 1;
  const clave = 'enemigo' + numero;
  GUARDIANS[clave] = personaje(clave, 'Atacante ' + numero, 'Criaturas del Olvido', [relato]);
});
export const DEFAULT_GUARDIAN = 'mohan';
