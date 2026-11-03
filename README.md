# Ancestrales AR · demo

Página web de realidad aumentada del proyecto **Ancestrales** (leyendas colombianas). Cada guardián (por ahora, **El Mohán**) tiene una carta impresa con un QR. El recorrido es:

1. **Escanear el QR** de la carta con la cámara del celular: abre esta página.
2. Tocar **Iniciar AR** y permitir la cámara.
3. **Apuntar a la carta**: en cuanto la cámara la reconoce, el guardián aparece de pie sobre ella, la sigue si se mueve y desaparece si se pierde de vista. No hay que tocar la pantalla para colocarlo.

Con un dedo se gira y pellizcando con dos se cambia su tamaño. **Reiniciar** deshace el giro y el tamaño.

- Motor de AR: **8th Wall** (XR8, de Niantic Spatial), con rastreo de imágenes (*image targets*).
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

y abrir `http://localhost:3000/?guardian=mohan`. En el computador la página muestra el aviso «Ábrelo en tu celular», que es lo esperado: la experiencia está pensada para la cámara trasera de un teléfono.

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

Si los dos están a la vista manda la carta; entre targets de la misma prioridad se queda el primero que se encontró.

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

## Notas técnicas

- Rastreo: solo image targets, con el rastreo del entorno (SLAM) **desactivado** (`disableWorldTracking: true`). La carta puede estar en la mano y moverse, así que anclar al cuarto no aporta nada. Sin SLAM el rastreador de imágenes tiene todo el procesador para él (más cuadros por segundo, más estable en celulares de gama media), no hay fase de calibración y no se piden los sensores de movimiento: en iPhone sale un permiso menos.
- El guardián se para con los pies sobre la carta y la cabeza hacia afuera de ella (su «arriba» es la perpendicular a la carta), mirando hacia el borde inferior, es decir, hacia quien la sostiene. Si la carta se pone de frente a la cámara, el guardián apunta hacia el celular y se le ve desde arriba.
- El movimiento se suaviza un poco (unos 50 ms) para quitar el temblor sin que se note retraso. Si la carta se pierde, el guardián espera medio segundo antes de desvanecerse, por si fue solo un dedo o un movimiento brusco.
- Gestos: arrastrar con un dedo gira al guardián sobre la carta; pellizcar escala entre 0,5× y 3× del tamaño base. **Reiniciar** vuelve al giro y al tamaño iniciales.
- El único permiso es la cámara. Si se niega, la página explica cómo activarla.
