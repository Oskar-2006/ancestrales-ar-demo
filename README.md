# Ancestrales AR · demo

Página web de realidad aumentada del proyecto **Ancestrales** (leyendas colombianas). Cada guardián (por ahora, **El Mohán**) tiene una carta impresa con un QR. El recorrido es:

1. **Escanear el QR** de la carta con la cámara del celular: abre esta página.
2. Tocar **Iniciar AR** y permitir la cámara (en iPhone, también el movimiento y la orientación).
3. **Apuntar a la carta**: en cuanto la cámara la reconoce, el guardián aparece de pie sobre ella y **se queda anclado en ese lugar del cuarto**. Ya no hace falta seguir viendo la carta: se puede guardar, caminar alrededor del guardián y verlo desde otros ángulos. No hay que tocar la pantalla para colocarlo.

Con un dedo se gira y pellizcando con dos se cambia su tamaño. **Reiniciar** lo quita, olvida el lugar, el giro y el tamaño, y vuelve a pedir la carta: al reconocerla otra vez, el guardián aparece de nuevo donde esté.

- Motor de AR: **8th Wall** (XR8, de Niantic Spatial), con rastreo del entorno (SLAM) y rastreo de imágenes (*image targets*) a la vez.
- Render 3D: **three.js** r160.
- Sitio estático: funciona en GitHub Pages sin servidor propio ni compilación.

## Estructura

```
index.html            pantallas (inicio, carga, AR, errores) y créditos
css/style.css         estilo visual (piedra, musgo, oro), pensado primero para celular
js/app.js             lógica: XR8 + three.js, rastreo de la carta, gestos, estados de la interfaz
js/guardians.js       catálogo de guardianes (?guardian=clave → modelo .glb y sus image targets)
assets/               modelos .glb
image-targets/        datos de los image targets (.json + imágenes), generados con tools/build_image_target.js
card/                 la carta de El Mohán: arte, versión para imprimir e instrucciones (card/README.md)
qr/                   el QR propio que abre la página
tools/                scripts de construcción (no forman parte del sitio)
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

y abrir `http://localhost:3000/?guardian=mohan`. En el computador la página muestra el aviso «Ábrelo en tu celular», que es lo esperado: el anclaje necesita la cámara trasera y los sensores de movimiento de un teléfono.

Navegadores probados por el motor: Chrome en Android y Safari en iPhone (iOS 15 o superior). Dentro de apps como Instagram o WhatsApp la página pide abrirla en el navegador.

## Imprimir la carta

Las instrucciones completas están en [`card/README.md`](card/README.md). Lo esencial: imprimir `card/mohan-card.png` a **tamaño real (66 × 88 mm)**, en papel **mate**, sin plastificar con brillo, y recortarla por el borde. El rastreador aprende la imagen exacta: si la impresión sale con otros colores, otro recorte o reflejos, la reconoce peor.

La carta se reconoce mejor plana sobre una mesa, con buena luz difusa y desde 20 a 40 cm.

## Targets: carta completa y QR solo

El Mohán tiene dos image targets activos a la vez (en `js/guardians.js`):

| Target | Imagen | Uso |
| --- | --- | --- |
| `mohan-card` | la carta completa, **sin el QR** (el script lo tapa de blanco) | **El recomendado.** El arte es rico en detalles y no se repite, así que el rastreo es estable. El guardián se para sobre el emblema del río, con el nombre y el QR a la vista delante de él. |
| `mohan-qr` | el QR solo (`qr/qr-mohan.png`, centrado en un lienzo blanco 3:4) | Experimental, para probar el QR impreso suelto. El guardián se para en el centro del QR y mide lo mismo que su ancho, así que se adapta a un QR de 23 mm o a uno más grande. |

Para el primer anclaje manda la carta: si lo primero que se ve es el QR, la página espera un instante por si aparece la carta. Una vez anclado, cualquiera de los dos puede afinar o mover el anclaje (si los dos están a la vista, sigue mandando la carta, y el QR no mueve al guardián hasta 1,5 s después de que la carta se perdió de vista).

El QR solo **puede rastrearse peor que la carta**: su patrón de cuadros se repite y tiene pocos puntos distintivos. En las pruebas automáticas lo reconoció de frente, pero no muy inclinado. Para la presentación usa la carta.

Al target de la carta se le quita el QR a propósito. Si lo conservara, un QR suelto se confundiría con la carta entera y el guardián aparecería flotando donde estaría el centro de una carta que no está. Por eso, si cambia la posición del QR en el diseño, hay que actualizar el rectángulo `maskWhite` en `tools/build_image_target.js` (el script avisa si ya no encuentra un QR ahí).

## Regenerar los image targets

Hay que hacerlo cada vez que cambie `card/mohan-card-target.png` o `qr/qr-mohan.png`: el motor compara la cámara con esas imágenes exactas.

Las herramientas (`@8thwall/image-target-cli` y `sharp`) solo se usan para construir; no se suben al repositorio ni las carga la página. Instálalas en una carpeta aparte, fuera del repositorio:

```
mkdir -p /tmp/itc-tool && cd /tmp/itc-tool
npm init -y && npm install @8thwall/image-target-cli@1.0.0
```

y, desde la raíz del repositorio:

```
node tools/build_image_target.js --tool-dir /tmp/itc-tool
```

El script escribe en `image-targets/` un `.json` por target y sus imágenes (`_luminance.jpg`, que es la que carga el motor, más `_cropped`, `_thumbnail` y `_original`). Usa el recorte por defecto de la herramienta, que en una imagen 3:4 vertical es la imagen completa, y deja `imagePath` como ruta relativa (`image-targets/…`) para que funcione dentro de la subcarpeta de GitHub Pages. Con `--only mohan-card` o `--only mohan-qr` se construye uno solo.

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
  targets: [
    { name: 'madremonte-card', data: 'image-targets/madremonte-card.json', heightOnCard: 1, footOffset: 0.18, priority: 1 },
  ],
},
```

4. Añade su carta a la lista `TARGETS` de `tools/build_image_target.js` y regenera los targets.

La página ajusta sola el modelo: lo centra, le pone los pies sobre la carta y lo escala para que mida `heightOnCard` veces el ancho del target. `footOffset` dice dónde se para a lo largo de la carta (0 es el centro, 0,5 el borde de arriba). Si no encuentra una animación llamada `Idle`, reproduce la primera que tenga.

## Hacer el QR

1. Abre la página publicada en Chrome con el parámetro del guardián, por ejemplo `https://TU-USUARIO.github.io/ancestrales-ar-demo/?guardian=mohan`.
2. En el celular: menú **⋮ › Compartir › Código QR**. En el computador: icono de compartir en la barra de direcciones › **Crear código QR**.
3. Descarga la imagen y úsala en la figura. Prueba el QR impreso antes de producirlo en serie, a la distancia y con la luz reales.

Un código inexistente (por ejemplo `?guardian=xyz`) muestra la pantalla «Guardián no encontrado». Sin parámetro, abre a El Mohán.

El QR de la carta ya está hecho (`qr/qr-mohan.png`). Si lo cambias, regenera también el target `mohan-qr` y revisa el `maskWhite` de la carta.

## Cómo funciona el anclaje

1. **Antes de ver la carta**, la pantalla dice «Apunta la cámara a la tarjeta de El Mohán».
2. **La primera vez que la reconoce**, el guardián aparece con su animación de entrada sobre la carta. Como el rastreo del entorno (SLAM) está activo, la posición de la carta llega en las mismas coordenadas del cuarto que la cámara: ese punto queda como **ancla**. Sale el aviso «El Mohán se quedó aquí. Puedes moverte a su alrededor.» y después la ayuda de los gestos.
3. **Mientras la carta sigue a la vista**, el ancla se afina poco a poco (suavizado de unos 50 ms) para que quede bien puesta.
4. **Si la carta sale de cuadro**, no pasa nada: el guardián se queda donde estaba y el SLAM lo mantiene quieto mientras el celular se mueve.
5. **Si se vuelve a apuntar a la carta** después de moverla, el guardián se desliza hasta el nuevo sitio (en un cuarto de segundo, más o menos) en lugar de saltar.
6. **Si el rastreo del entorno se pone difícil** (estado `LIMITED` durante más de 1,5 s), aparece arriba «Mueve el celular despacio para no perder el lugar». El guardián no se esconde.

### Cómo se para el guardián

- **Carta acostada o inclinada** (mesa, mano): se para con los pies sobre la carta, sobre el emblema del río, con la cabeza hacia afuera de ella (su «arriba» es la perpendicular a la carta) y mirando hacia el borde inferior, es decir, hacia quien la sostiene.
- **Carta casi vertical** (en la mano frente a la cámara o pegada en una pared, con la perpendicular a menos de unos 35° de la horizontal): ahí pararlo «de lado» lo dejaría saliendo horizontal de la pared, como un clavo. En ese caso se para **derecho según la gravedad**, sobre el borde de abajo de la carta y un poco por delante de ella, mirando hacia afuera de la cara impresa. La carta queda como un telón detrás de él y la sombra se aclara, porque ahí no hay suelo. Entre los dos modos hay un margen (35° para pasar a vertical, 42° para volver) para que no cambie de postura con cada temblor.

## Límites

- **Deriva**: el SLAM se apoya en la textura del entorno y en los sensores del celular. Con poca luz, sobre superficies lisas (mesa blanca, pared sin detalles) o con movimientos bruscos, el guardián puede irse corriendo de a poco. La solución es **volver a apuntar a la carta** (se reacomoda solo) o tocar **Reiniciar**.
- El rastreo del entorno usa más procesador que el de solo imágenes: en celulares de gama baja puede bajar la fluidez.
- Si la carta sale de cuadro y por un momento solo queda el QR a la vista (por ejemplo, al guardarla), el QR se ignora durante 1,5 s después de la última vez que se vio la carta, para que el guardián no se deslice hacia el QR. Pasado ese tiempo, el QR solo sí puede reanclarlo.
- Con la escala «responsive» las unidades del mundo no son metros exactos. Al guardián no le afecta: su tamaño sale siempre del ancho de la carta.

## Notas técnicas

- Rastreo: SLAM y image targets juntos (`XR8.XrController.configure({ disableWorldTracking: false, scale: 'responsive', imageTargetData })`). El motor carga su módulo de SLAM (`vendor/8thwall/xr-slam.js`) antes de arrancar, gracias a `data-preload-chunks="slam"` en `index.html`. Se usa la escala `responsive` porque la `absolute` (métrica) obliga a una calibración extra y no aporta nada aquí. La cámara arranca a 1,5 unidades de altura para que la escala del mundo sea predecible.
- Permisos: cámara y, en iPhone, movimiento y orientación. Safari solo deja pedir los sensores dentro de un toque, así que se piden en el mismo toque de **Iniciar AR**. Si se niegan, la página explica cómo volver a activarlos. En Android Chrome no hay pregunta: los sensores vienen permitidos salvo que se hayan bloqueado en los ajustes del sitio.
- El guardián vive en una sola agrupación anclada al mundo (posición de los pies, orientación y tamaño). Cuando hay una pose nueva de la carta, el ancla se acerca a ella con un suavizado exponencial; si la diferencia pasa de 0,35 alturas del guardián o de 25°, usa un suavizado más lento para que se note un deslizamiento y no un salto.
- Gestos: arrastrar con un dedo gira al guardián sobre su eje vertical; pellizcar escala entre 0,5× y 3× del tamaño base. **Reiniciar** borra el ancla, el giro y el tamaño.
