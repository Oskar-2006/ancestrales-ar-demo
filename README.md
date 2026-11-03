# Ancestrales AR · demo

Página web de realidad aumentada del proyecto **Ancestrales** (leyendas colombianas). El QR de cada figura coleccionable abre esta página en el celular: se activa la cámara, la persona toca el piso o una mesa y aparece el guardián (por ahora, **El Mohán**) de pie en ese punto. Se puede caminar alrededor de él, girarlo con un dedo y cambiar su tamaño pellizcando con dos.

- Motor de AR: **8th Wall** (XR8, de Niantic Spatial), con rastreo del entorno (SLAM).
- Render 3D: **three.js** r160.
- Sitio estático: funciona en GitHub Pages sin servidor propio ni compilación.

## Estructura

```
index.html            pantallas (inicio, carga, AR, errores) y créditos
css/style.css         estilo visual (piedra, musgo, oro), pensado primero para celular
js/app.js             lógica: XR8 + three.js, colocación, gestos, estados de la interfaz
js/guardians.js       catálogo de guardianes (?guardian=clave → modelo .glb)
assets/               modelos .glb
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

y abrir `http://localhost:3000/?guardian=mohan`. En el computador la página muestra el aviso «Ábrelo en tu celular», que es lo esperado: el rastreo del entorno necesita la cámara y los sensores de un teléfono.

Navegadores probados por el motor: Chrome en Android y Safari en iPhone (iOS 15 o superior). Dentro de apps como Instagram o WhatsApp la página pide abrirla en el navegador.

## Cambiar o añadir un guardián

1. En Blender, con el modelo en metros y la animación de reposo llamada `Idle`, exporta **Archivo › Exportar › glTF 2.0** con formato **glTF Binary (.glb)**. Activa *Animation* y deja desactivada la compresión Draco: el demo no incluye su decodificador.
2. Copia el `.glb` en `assets/`.
3. Añade una entrada en `js/guardians.js`:

```js
madremonte: {
  name: 'La Madremonte',
  tagline: 'Guardiana de los bosques',
  model: 'assets/madremonte.glb',
  heightMeters: 0.3,
  idleClip: 'Idle',
},
```

La página ajusta sola el modelo: lo centra, le pone los pies en el suelo y lo escala a `heightMeters`. Si no encuentra una animación llamada `Idle`, reproduce la primera que tenga.

## Hacer el QR

1. Abre la página publicada en Chrome con el parámetro del guardián, por ejemplo `https://TU-USUARIO.github.io/ancestrales-ar-demo/?guardian=mohan`.
2. En el celular: menú **⋮ › Compartir › Código QR**. En el computador: icono de compartir en la barra de direcciones › **Crear código QR**.
3. Descarga la imagen y úsala en la figura. Prueba el QR impreso antes de producirlo en serie, a la distancia y con la luz reales.

Un código inexistente (por ejemplo `?guardian=xyz`) muestra la pantalla «Guardián no encontrado». Sin parámetro, abre a El Mohán.

## Notas técnicas

- Escala: el motor trabaja en modo `responsive`, que supone el piso en `y = 0` y la cámara a 1,5 m. Por eso el tamaño real del guardián es aproximado (unos 30 cm a escala 1); sobre una mesa se verá algo más grande que en el piso.
- La primera vez el celular pide dos permisos: cámara y, en iPhone, movimiento y orientación. Si se niegan, la página explica cómo activarlos.
- Gestos: tocar coloca o mueve; arrastrar con un dedo gira; pellizcar escala entre 0,5× y 3×. **Reiniciar** vuelve a calibrar el entorno.
