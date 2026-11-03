# Carta coleccionable · El Mohán

La carta cumple dos funciones: es el **marcador de imagen** (image target) que reconoce 8th Wall y lleva el **QR** que abre la página de AR.

| Archivo | Qué es |
| --- | --- |
| `mohan-card.svg` | Fuente editable. Arte original; solo usa las familias genéricas del sistema (`serif`, `sans-serif`) |
| `mohan-card.png` | Para imprimir: 780 × 1040 px a 300 ppp = **66 × 88 mm** |
| `mohan-card-bleed.png` | Igual, con 3 mm de sangrado por lado (850 × 1110 px = 72 × 94 mm), para imprenta |
| `mohan-card-target.png` | La imagen de la que se genera el target de 8th Wall (la carta completa, 3:4 vertical, sin sangrado) |
| `preview-gray.png` | Vista en escala de grises para revisar el contraste que ve el rastreador |

## Cómo imprimirla

1. **Tamaño exacto: 66 × 88 mm.** Imprime `mohan-card.png` al 100 % / «tamaño real», nunca con «ajustar a la página». Mide la carta impresa con una regla: si no da 66 mm de ancho, el rastreo pierde precisión.
2. **Papel mate**, de 200 a 300 g (cartulina mate o papel fotográfico mate). El brillo del papel satinado borra zonas de la imagen bajo la luz y el rastreador las pierde.
3. **Sin plastificar** o, si hace falta protegerla, con laminado mate. El plástico brillante produce reflejos que impiden reconocer la carta.
4. Impresora a color, calidad alta. No hace falta impresora fotográfica, pero los negros deben salir negros (no grises lavados).
5. **Recorta por el borde exterior** de la imagen, con bisturí y regla si es posible. Hay unos 2 mm de margen antes del marco dorado, así que un corte un poco desviado no afecta.
6. En imprenta: usa `mohan-card-bleed.png` y pide corte final a 66 × 88 mm.

## Comprobar antes de presentar

- Escanea el QR con la cámara del celular desde unos 20 cm: debe abrir la página de AR.
- Prueba el rastreo con buena luz difusa y la carta plana sobre la mesa.
- Si cambias el arte, regenera los targets con `tools/build_image_target.js` (ver el README principal): el motor aprende exactamente esa imagen. Si el QR cambia de posición, actualiza también el rectángulo que el script tapa de blanco.
