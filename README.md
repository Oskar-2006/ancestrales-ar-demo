# El último recuerdo · Realidad aumentada

Abre la página en el celular, pulsa **Iniciar AR** y permite el acceso a la cámara. Apunta a una imagen de la carpeta `figura/`, impresa o mostrada en otra pantalla. Al reconocerla, la experiencia muestra el personaje y su historia. Desde el mismo escáner puedes apuntar a otra imagen para cambiar de personaje. Mantén la imagen quieta unos segundos: con el anclaje espacial activo, el escáner alterna grupos de hasta cinco imágenes cada cinco segundos.

El panel acompaña a la figura. **Leer en pantalla** abre la historia en grande. Arrastra con un dedo para girar el personaje o pellizca con dos para ajustar su tamaño.

## Recursos

- `figura/` contiene las imágenes que debes presentar a la cámara, en formato vertical 3:4.
- `assets/` contiene los personajes en GLB.
- `js/guardians.js` relaciona cada imagen con su personaje y su texto.
- `image-targets/` contiene los datos de reconocimiento que carga 8th Wall.

Para regenerar los datos después de cambiar un render, ejecuta `node tools/build_image_target.js` con Node y sharp disponibles. Si sharp está en otra instalación, asigna a `SHARP_DIR` la carpeta que contiene su directorio node_modules.

La cámara necesita un contexto seguro (HTTPS o localhost). En el computador, `?preview=1` permite revisar la escena sin cámara. La validación del reconocimiento, la iluminación y el anclaje requiere un celular real.
