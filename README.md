# Ancestrales AR · demo

Página web de realidad aumentada del proyecto **Ancestrales** (leyendas colombianas). Cada guardián (por ahora, **El Mohán**) tiene una **imagen** (su arte) que la cámara reconoce para colocarlo. La página se abre solo con su enlace; no hay que escanear ningún código. El recorrido es:

1. **Abrir el enlace** de la página en el celular. Sin `?guardian=` abre a El Mohán.
2. Tocar **Iniciar AR** y permitir la cámara (en iPhone, también el movimiento y la orientación).
3. **Apuntar la cámara a la imagen de El Mohán** (en otra pantalla o impresa): en cuanto la reconoce, el guardián aparece de pie sobre ella y **se queda anclado en ese lugar del cuarto**. Ya no hace falta seguir viendo la imagen: se puede guardar, caminar alrededor del guardián y verlo desde otros ángulos. No hay que tocar la pantalla para colocarlo.
4. Junto al guardián, a su derecha según la cámara, aparece un **panel flotante** con su historia. Gira solo para mirar siempre al celular. Al tocar **Leer en pantalla** se abre un lector a pantalla completa con el mismo texto en letra grande (se cierra con **Cerrar**, con Esc o tocando el fondo).

Con un dedo se gira y pellizcando con dos se cambia su tamaño (el panel crece con el pellizco, pero no se encoge por debajo de su tamaño base). **Reiniciar** lo quita, olvida el lugar, el giro y el tamaño, y vuelve a pedir la imagen: al reconocerla otra vez, el guardián aparece de nuevo donde esté.

- Motor de AR: **8th Wall** (XR8, de Niantic Spatial), con rastreo del entorno (SLAM) y rastreo de imágenes (*image targets*) a la vez.
- Render 3D: **three.js** r160.
- Sitio estático: funciona en GitHub Pages sin servidor propio ni compilación.

## Estructura

```
index.html            pantallas (inicio, carga, AR, errores) y créditos
css/style.css         estilo visual (piedra, musgo, oro), pensado primero para celular
js/app.js             lógica: XR8 + three.js, rastreo de la imagen, panel de historia, lector, gestos, vista previa
js/guardians.js       catálogo de guardianes (?guardian=clave → modelo .glb, texto de historia e image target)
assets/               modelos .glb
image-targets/        datos de los image targets (.json + imágenes), generados con tools/build_image_target.js
figura/               la imagen de El Mohán que la cámara reconoce (mohan-figura.png)
tools/                scripts de construcción: build_figura.py dibuja la imagen y build_image_target.js construye el target (no forman parte de la experiencia)
vendor/8thwall/       motor 8th Wall 1.0.0 sin modificar (incluye su LICENSE)
vendor/three/         three.js 0.160.0 sin modificar (módulo, GLTFLoader y su LICENSE)
CREDITOS.md           qué es original y qué es de terceros
```

Las librerías van copiadas en `vendor/` en lugar de cargarse desde un CDN: así la página no depende de servicios externos el día de la presentación.

## Probarla

La cámara del celular solo se abre en páginas **HTTPS** (o en `localhost`). Por eso la forma más sencilla de probar en el teléfono es publicarla en GitHub Pages:

1. Sube esta carpeta a un repositorio, por ejemplo `ancestrales-ar-demo`.
2. En GitHub: **Settings › Pages › Build and deployment › Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Al minuto queda en `https://TU-USUARIO.github.io/ancestrales-ar-demo/?guardian=mohan`.

Para revisar la interfaz en el computador basta un servidor local cualquiera:

```
npx serve .
```

y abrir `http://localhost:3000/?guardian=mohan`. En el computador la página muestra el aviso «Ábrelo en tu celular», que es lo esperado: el anclaje necesita la cámara trasera y los sensores de movimiento de un teléfono. Para revisar la escena, el panel y el lector en el computador, usa la vista previa (más abajo).

Navegadores probados por el motor: Chrome en Android y Safari en iPhone (iOS 15 o superior). Dentro de apps como Instagram o WhatsApp la página pide abrirla en el navegador.

## Vista previa en el computador (`?preview=1`)

`http://localhost:3000/?guardian=mohan&preview=1` muestra la misma escena de three.js **sin cámara ni motor AR** (no pide permisos ni muestra el aviso de escritorio): un fondo oscuro con degradado, una cámara fija que mira al guardián de pie sobre un suelo invisible, su animación `Idle` y el panel de historia a su derecha. Sirve para revisar el arte, el panel y el lector:

- El panel, el botón **Leer en pantalla**, el lector, el giro con un dedo o el ratón, el pellizco y **Reiniciar** funcionan igual que en AR. Se reutiliza el mismo código: la vista previa solo entrega a la lógica de anclaje una pose de imagen falsa, tumbada en el suelo.
- No sustituye la prueba en el celular: no hay rastreo, ni anclaje al cuarto, ni cámara.
- Sin el parámetro, la página se comporta como siempre.

## Mostrar o imprimir la imagen

La imagen es `figura/mohan-figura.png` (900 × 1200 px, 3:4): el arte de El Mohán con su medallón del río. Es lo que la cámara reconoce, así que se muestra o se imprime con cuidado:

- **En pantalla** (otro celular, tableta o computador): la imagen completa, sin recortar, con el brillo alto y sin reflejos de ventanas o lámparas encima.
- **Impresa**: papel **mate**, sin plastificar con brillo (el reflejo borra zonas de la imagen y el rastreador la pierde). Impresora a color de buena calidad, con los negros bien negros.
- **Tamaño impreso recomendado (propuesta, sin probar): de 10 a 15 cm de ancho** (13,3 a 20 cm de alto, proporción 3:4). El guardián mide **2 veces el ancho de la imagen**: con 10 cm sale de unos 20 cm; con 15 cm, de 30 cm.
- **Distancia de uso: 40 a 60 cm** de la imagen (propuesta, sin probar). El panel de historia acompaña al guardián con el título y el texto en letra pequeña; para leerlo cómodo, **Leer historia** (botón de abajo) o **Leer en pantalla** (botón del panel) abren la versión grande.
- Se reconoce mejor **plana sobre una mesa** o en una pantalla quieta, con luz difusa.

Todavía no se ha probado el reconocimiento con un celular real: antes de presentar, pruébalo con la imagen en pantalla y en papel, a la distancia y con la luz reales.

## Target: la imagen de El Mohán

El Mohán tiene un único image target (`js/guardians.js`):

| Target | Imagen | Uso |
| --- | --- | --- |
| `mohan-figura` | `figura/mohan-figura.png` (900 × 1200 px, 3:4) | El guardián se para en el centro de la imagen y mide 2 veces su ancho (`heightOnTarget: 2`), así que se adapta a una imagen de 10 cm o a una de 15 cm. |

La imagen tiene detalle repartido por todo el cuadro (piedras, hojas, olas, marco) y ninguna zona lisa, que es lo que necesita el rastreador. Es arte propio, generado con `tools/build_figura.py`. Una vez colocado, el guardián no depende de seguir viendo la imagen (lo sostiene el SLAM).

## Regenerar la imagen y los image targets

Hay que regenerar el target cada vez que cambie `figura/mohan-figura.png`: el motor compara la cámara con esa imagen exacta.

Las herramientas (`@8thwall/image-target-cli` y `sharp`) solo se usan para construir; no se suben al repositorio ni las carga la página. Instálalas en una carpeta aparte, fuera del repositorio:

```
mkdir -p /tmp/itc-tool && cd /tmp/itc-tool
npm init -y && npm install @8thwall/image-target-cli@1.0.0
```

y, desde la raíz del repositorio:

```
TOOL_DIR=/tmp/itc-tool python tools/build_figura.py        # dibuja figura/mohan-figura.png (el SVG queda en la carpeta temporal)
node tools/build_image_target.js --tool-dir /tmp/itc-tool   # construye image-targets/
```

El primer comando solo hace falta si cambias el arte (usa semillas fijas, así que siempre da la misma imagen). El segundo escribe en `image-targets/` un `.json` por target y sus imágenes (`_luminance.jpg`, que es la que carga el motor, más `_cropped`, `_thumbnail` y `_original`, que la página no usa). Usa el recorte por defecto de la herramienta, que en una imagen 3:4 vertical es la imagen completa, y deja `imagePath` como ruta relativa (`image-targets/…`) para que funcione dentro de la subcarpeta de GitHub Pages. Con `--only mohan-figura` se construye uno solo (útil cuando haya varios guardianes).

## Cambiar o añadir un guardián

1. En Blender, con el modelo en metros y la animación de reposo llamada `Idle`, exporta **Archivo › Exportar › glTF 2.0** con formato **glTF Binary (.glb)**. Activa *Animation* y deja desactivada la compresión Draco: el demo no incluye su decodificador.
2. Copia el `.glb` en `assets/`.
3. Añade una entrada en `js/guardians.js`:

```js
madremonte: {
  name: 'La Madremonte',
  tagline: 'Guardiana de los bosques',
  model: 'assets/madremonte.glb',
  idleClip: 'Idle',
  lore: {
    title: 'La Madremonte',
    subtitle: 'Guardiana de los bosques',
    paragraphs: [
      'Primer párrafo de su historia.',
      'Segundo párrafo.',
    ],
  },
  targets: [
    { name: 'madremonte-figura', data: 'image-targets/madremonte-figura.json', heightOnTarget: 2, footOffset: 0 },
  ],
},
```

4. Prepara su imagen 3:4 en `figura/` (con detalle en todo el cuadro, sin zonas lisas), añádela a la lista `TARGETS` de `tools/build_image_target.js` y regenera los targets.

La página ajusta sola el modelo: lo centra, le pone los pies sobre la imagen y lo escala para que mida `heightOnTarget` veces el ancho del target. `footOffset` dice dónde se para a lo largo del target (0 es el centro, 0,5 el borde de arriba). Si no encuentra una animación llamada `Idle`, reproduce la primera que tenga.

El campo `lore` es el texto del panel flotante y del lector: `title` (título grande, dorado), `subtitle` (línea en cursiva) y `paragraphs` (una lista de párrafos). Los dos se dibujan a partir de ese único objeto, así que basta cambiarlo ahí; el panel se hace más alto o más bajo según el largo del texto. Sin `lore`, el guardián aparece sin panel.

## El enlace

La experiencia se abre solo con el enlace de la página, por ejemplo `https://TU-USUARIO.github.io/ancestrales-ar-demo/` (o con `?guardian=mohan`). Una clave inexistente (por ejemplo `?guardian=xyz`) muestra la pantalla «Guardián no encontrado». Sin parámetro, abre a El Mohán.

## Cómo funciona el anclaje

1. **Antes de ver la imagen**, la pantalla dice «Apunta la cámara a la imagen de El Mohán».
2. **La primera vez que lo reconoce**, el guardián aparece con su animación de entrada sobre la imagen. Como el rastreo del entorno (SLAM) está activo, la posición de la imagen llega en las mismas coordenadas del cuarto que la cámara: ese punto queda como **ancla**. Sale el aviso «El Mohán se quedó aquí. Puedes moverte a su alrededor.» y después la ayuda de los gestos. Cuando termina la entrada, aparece el panel de historia.
3. **Mientras la imagen sigue a la vista**, el ancla se afina poco a poco (suavizado de unos 50 ms) para que quede bien puesta.
4. **Si la imagen sale de cuadro**, no pasa nada: el guardián se queda donde estaba y el SLAM lo mantiene quieto mientras el celular se mueve.
5. **Si se vuelve a apuntar a la imagen** después de moverlo, el guardián se desliza hasta el nuevo sitio (en un cuarto de segundo, más o menos) en lugar de saltar.
6. **Si el rastreo del entorno se pone difícil** (estado `LIMITED` durante más de 1,5 s), aparece arriba «Mueve el celular despacio para no perder el lugar». El guardián no se esconde.

### Cómo se para el guardián

- **Imagen acostada o inclinada** (mesa, mano): se para con los pies en el centro de la imagen, con la cabeza hacia afuera de ella (su «arriba» es la perpendicular a la imagen) y mirando hacia el borde inferior, es decir, hacia quien lo sostiene.
- **Imagen casi vertical** (en la mano frente a la cámara, en una pantalla apoyada o pegada en una pared, con la perpendicular a menos de unos 35° de la horizontal): ahí pararlo «de lado» lo dejaría saliendo horizontal de la pared, como un clavo. En ese caso se para **derecho según la gravedad**, sobre el borde de abajo de la imagen y un poco por delante de ella, mirando hacia afuera de la cara impresa. La sombra se aclara, porque ahí no hay suelo. Entre los dos modos hay un margen (35° para pasar a vertical, 42° para volver) para que no cambie de postura con cada temblor.

### El panel de historia

- Es un objeto 3D de la escena (un plano con el texto dibujado en un lienzo de 1024 px de ancho), así que se ve en perspectiva. Se pone a la derecha del guardián **según la cámara**, centrado a la altura del pecho y sin tapar la figura. Si la cámara se acerca mucho al panel, este se desvanece.
- Cada cuadro se coloca de nuevo junto al guardián y se gira solo alrededor de la vertical para mirar a la cámara: nunca se inclina, y sigue al lado del guardián aunque el usuario camine a su alrededor.
- Su tamaño es proporcional a la altura del guardián, que sale del ancho de la imagen; crece con el pellizco, pero no se encoge por debajo de su tamaño base. El texto del panel es pequeño: para leer con comodidad, **Leer historia** (botón en la parte de abajo, visible mientras el panel está) o **Leer en pantalla**.
- Un toque corto (menos de unos 10 px y 350 ms) sobre la fila del botón (con un margen mínimo de unos 24 px en pantalla) lo pulsa y abre el lector. Tocar el panel no gira ni escala al guardián. Mientras el lector está abierto, el AR de atrás no recibe toques y queda fuera del alcance del teclado y de los lectores de pantalla (`inert`, que necesita iOS 15.5 o superior; en versiones anteriores solo se marca con `aria-hidden`).

## Límites

- **Deriva**: el SLAM se apoya en la textura del entorno y en los sensores del celular. Con poca luz, sobre superficies lisas (mesa blanca, pared sin detalles) o con movimientos bruscos, el guardián puede irse corriendo de a poco. La solución es **volver a apuntar a la imagen** (se reacomoda solo) o tocar **Reiniciar**.
- El rastreo del entorno usa más procesador que el de solo imágenes: en celulares de gama baja puede bajar la fluidez.
- Con la escala «responsive» las unidades del mundo no son metros exactos. Al guardián no le afecta: su tamaño sale siempre del ancho de la imagen.

## Notas técnicas

- Rastreo: SLAM y image targets juntos (`XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive', imageTargetData })`). El motor carga su módulo de SLAM (`vendor/8thwall/xr-slam.js`) antes de arrancar, gracias a `data-preload-chunks="slam"` en `index.html`. Se usa la escala `responsive` porque la `absolute` (métrica) obliga a una calibración extra y no aporta nada aquí. La cámara arranca a 1,5 unidades de altura para que la escala del mundo sea predecible.
- Permisos: cámara y, en iPhone, movimiento y orientación. Safari solo deja pedir los sensores dentro de un toque, así que se piden en el mismo toque de **Iniciar AR**. Si se niegan, la página explica cómo volver a activarlos. En Android Chrome no hay pregunta: los sensores vienen permitidos salvo que se hayan bloqueado en los ajustes del sitio.
- El guardián vive en una sola agrupación anclada al mundo (posición de los pies, orientación y tamaño). Cuando hay una pose nueva de la imagen, el ancla se acerca a ella con un suavizado exponencial; si la diferencia pasa de 0,35 alturas del guardián o de 25°, usa un suavizado más lento para que se note un deslizamiento y no un salto.
- Gestos: arrastrar con un dedo gira al guardián sobre su eje vertical; pellizcar escala entre 0,5× y 3× del tamaño base. **Reiniciar** borra el ancla, el giro y el tamaño y cierra el lector si estuviera abierto.
- Movimiento reducido (`prefers-reduced-motion`): el panel aparece y se va sin animación y el lector no hace fundido.
