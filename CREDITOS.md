# Créditos

## Trabajo original del proyecto Ancestrales

- **Código**: `index.html`, `css/style.css`, `js/app.js` y `js/guardians.js`. La colocación por toque, los gestos, las pantallas de carga, permisos y error, y el ajuste del lienzo están escritos para este proyecto; no se usó código de ejemplo de terceros.
- **Modelo 3D**: `assets/mohan-prueba.glb` (El Mohán, con su animación `Idle`).
- **Interfaz y gráficos**: emblema, iconos y fondos hechos a mano en SVG y CSS. La sombra de contacto y el anillo de luz bajo el guardián se dibujan por código. No se usan imágenes, fuentes, iconos ni sonidos de terceros; los textos usan las fuentes del sistema.

## Herramientas de terceros

### Motor de AR: 8th Wall (Distributed Engine Binary 1.0.0)

- Autor: **Niantic Spatial, Inc.** © 2026 Niantic Spatial, Inc. Todos los derechos reservados.
- Licencia: *XR Engine License Agreement*. Texto completo en [`vendor/8thwall/LICENSE`](vendor/8thwall/LICENSE).
- Uso: rastreo del entorno (SLAM), cámara y detección de superficies. Se distribuye en `vendor/8thwall/` en su forma original, sin modificaciones, como permite la sección 1.1 de la licencia.
- El software se ofrece «tal cual» (*as is*), sin garantías de ningún tipo, según la sección 4 de la licencia.
- La licencia prohíbe usarlo en productos de pago cuyo valor dependa sobre todo del motor. Este es un proyecto académico gratuito. El uso del motor no implica que Niantic Spatial patrocine ni respalde el proyecto.

### Render 3D: three.js r160 (0.160.0)

- Autores: © 2010-2023 three.js authors.
- Licencia: **MIT**. Texto en [`vendor/three/LICENSE`](vendor/three/LICENSE).
- Archivos usados sin modificar: `build/three.module.min.js`, `examples/jsm/loaders/GLTFLoader.js` y `examples/jsm/utils/BufferGeometryUtils.js`.

La página muestra estos créditos en la pantalla de inicio y, en versión corta, durante la experiencia AR.
