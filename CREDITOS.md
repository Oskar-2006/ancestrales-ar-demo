# Créditos

Los modelos proceden de los archivos de Blender aportados por el equipo. Los objetivos de reconocimiento son renders de esos personajes. El catálogo conserva las historias del proyecto. La integración de cámara, gestos, lector y panel 3D se desarrolló para este demo.

### Motor de AR: 8th Wall (Distributed Engine Binary 1.0.0)

- Autor: **Niantic Spatial, Inc.** © 2026 Niantic Spatial, Inc. Todos los derechos reservados.
- Licencia: *XR Engine License Agreement*. Texto completo en [`vendor/8thwall/LICENSE`](vendor/8thwall/LICENSE).
- Uso: cámara y rastreo de imágenes (*image targets*) para reconocer los renders de los personajes. Se distribuye en `vendor/8thwall/` en su forma original, sin modificaciones, como permite la sección 1.1 de la licencia.
- El software se ofrece «tal cual» (*as is*), sin garantías de ningún tipo, según la sección 4 de la licencia.
- La licencia prohíbe usarlo en productos de pago cuyo valor dependa sobre todo del motor. Este es un proyecto académico gratuito. El uso del motor no implica que Niantic Spatial patrocine ni respalde el proyecto.

### Render 3D: three.js r160 (0.160.0)

- Autores: © 2010-2023 three.js authors.
- Licencia: **MIT**. Texto en [`vendor/three/LICENSE`](vendor/three/LICENSE).
- Archivos usados sin modificar: `build/three.module.min.js`, `examples/jsm/loaders/GLTFLoader.js` y `examples/jsm/utils/BufferGeometryUtils.js`.

Los recursos de seguimiento se preparan con Node.js y sharp (Apache 2.0). El navegador carga los recursos ya generados.

## Modelos y relatos

Los archivos de origen son MOHÁN FINAL.blend, los modelos de Patasola_finalVer y Hojarazquin, madremonte.blend, Hombre Caimanblend.blend y las tres mallas de Atacantes.blend. Los GLB son versiones estáticas para esta experiencia. El Mohán conserva la geometría del archivo entregado y utiliza materiales de respaldo porque faltan sus mapas externos.

El relato del Hombre Caimán recupera la Ciénaga subterránea del borrador grupal de Ancestrales. Los tres microrrelatos de las Criaturas del Olvido son **(propuesta)** para el demo AR, escritos a partir del propósito definido por Oskar.
