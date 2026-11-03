# Plan de mejoras — JEN STUDIO

Este documento divide las mejoras en micropasos ejecutables uno a uno.

## Reglas de trabajo

- [ ] Completar una sola tarea cada vez.
- [ ] Validar la tarea antes de comenzar la siguiente.
- [ ] No mezclar cambios visuales, API y base de datos en el mismo micropaso salvo que sea imprescindible.
- [ ] No eliminar datos existentes sin copia de seguridad y migracion comprobada.
- [ ] Ejecutar `npm run build` despues de cada bloque frontend.
- [ ] Ejecutar las pruebas del backend/API despues de cada bloque de backend.
- [ ] Revisar movil y escritorio despues de cada bloque visual importante.

## Decisiones previas

Estas decisiones deben quedar cerradas antes de implementar los bloques que dependen de ellas.

- [x] Confirmar el enlace exacto del proyecto de GitHub de Pizzeria los Herrera: `Jorge-Luis-Herrera/Pizzas-Los-Herrera`.
- [x] Confirmar el archivo final del isotipo: `Resources/Isotypo.jpg`.
- [x] Confirmar el nombre de la referencia tipografica: `JEN STUDIO`.
- [x] Confirmar moneda visible: USD solamente.
- [x] Confirmar que no se usara tipo de cambio.
- [x] Confirmar que no existira logica automatica de agotados ni existencias.
- [x] Confirmar que desaparece completamente la palabra `Agotado`.
- [x] Confirmar que cada producto pertenece a una sola sesion.

## Bloque 0 — Preparacion y seguridad

- [x] Crear copia de seguridad de la base de datos actual.
- [x] Guardar una copia de las imagenes subidas.
- [x] Registrar el esquema actual y las migraciones existentes.
- [x] Anotar productos premium y productos normales actuales.
- [x] Crear una rama de trabajo o punto de restauracion local.
- [x] Confirmar que el frontend compila antes de empezar.
- [x] Confirmar que las pruebas actuales pasan antes de empezar.

**Validacion:** backup comprobado, frontend compilando y pruebas actuales verdes.

**Referencia inicial:** 12 productos (8 premium y 4 normales), 36 variantes, 12 imagenes y 0 pedidos.

## Bloque 1 — Identidad visual JEN STUDIO

### Marca

- [x] Añadir el isotipo recibido a `Frontend/public/media/`.
- [x] Cambiar el nombre visible de Jenny a `JEN STUDIO` en la tienda.
- [x] Cambiar el nombre visible en el panel administrador.
- [x] Sustituir los marcadores de letra por el isotipo real.
- [x] Añadir texto alternativo al isotipo.

### Paleta

- [x] Crear variables CSS para chocolate `#62402D`.
- [x] Crear variable para beige `#EBDCCD`.
- [x] Crear variable para caramelo `#A77E5D`.
- [ ] Reemplazar colores antiguos del storefront.
- [ ] Reemplazar colores antiguos del panel.
- [ ] Mantener contraste suficiente para textos y botones.

### Tipografia

- [ ] Incorporar la tipografia confirmada.
- [ ] Aplicarla a tienda, panel, botones, formularios y modales.
- [ ] Ajustar pesos y tamaños para mantener la jerarquia de la imagen de referencia.

### Fondos y cierre de la pagina

- [ ] Unificar el fondo entre hero, premium, catalogo y seccion final.
- [ ] Eliminar separaciones que produzcan cuadrados visuales.
- [ ] Rediseñar la seccion final con la paleta JEN STUDIO.
- [ ] Sustituir el texto final por: `No se trata solo de como te ves, sino de como avanzas, creces y descubres hacia donde quieres llegar.`
- [ ] Añadir el corazon marron de forma coherente con la identidad visual.

**Validacion:** revisar capturas en movil y escritorio; comprobar contraste y ausencia de bloques bruscos.

## Bloque 2 — Eliminar dependencia de stock

### Backend

- [x] Localizar validaciones de `stock_quantity` al crear pedidos.
- [x] Eliminar el bloqueo de pedidos por falta de existencias.
- [x] Eliminar la resta automatica de existencias.
- [ ] Mantener los snapshots de los pedidos existentes.
- [x] Mantener las columnas antiguas de stock solo como compatibilidad de datos.
- [x] Evitar que el API nuevo dependa de stock para publicar un producto.

### Frontend publico

- [x] Eliminar estados `disponible`, `sin stock` y botones desactivados por stock.
- [x] Eliminar limites de cantidad basados en `stockQuantity`.
- [x] Eliminar mensajes de error relacionados con falta de stock.
- [ ] Cambiar el flujo de compra a flujo de encargo.

### Panel

- [x] Eliminar campo de existencias de cada variante.
- [x] Eliminar filtros y contadores de stock.
- [x] Eliminar textos de inventario del catalogo administrador.
- [x] Mantener solo los datos necesarios para talla, color, precio y activacion.

**Validacion:** crear un pedido de una variante con stock legacy cero y comprobar que se procesa correctamente. Suite verificada sin fallos.

## Bloque 3 — Variantes con seleccion multiple

- [x] Definir lista inicial de tallas: `S`, `M`, `L`.
- [x] Definir lista inicial de colores.
- [x] Crear control multiple de colores con checkboxes.
- [x] Crear control multiple de tallas con checkboxes.
- [x] Mostrar una vista previa de combinaciones antes de guardar.
- [x] Generar automaticamente todas las combinaciones talla/color.
- [x] Evitar combinaciones duplicadas.
- [x] Mantener precio base y precio opcional por variante.
- [x] Mantener SKU opcional si sigue siendo necesario.
- [x] Guardar todas las variantes nuevas con un solo boton.
- [x] Permitir editar o eliminar combinaciones generadas.
- [ ] Mostrar errores concretos si una combinacion no se puede guardar.

**Validacion:** seleccionar 3 colores y 3 tallas; comprobar que se generan 9 variantes y que no aparecen duplicadas.

## Bloque 4 — Sesiones o categorias del catalogo

### Base de datos y API

- [x] Crear migracion para tabla de sesiones.
- [x] Crear migracion para relacion producto-sesion.
- [ ] Definir slug, nombre, descripcion, orden y estado visible.
- [x] Crear endpoint publico para listar sesiones visibles.
- [x] Crear endpoints protegidos para crear, editar y eliminar sesiones.
- [x] Definir comportamiento al eliminar una sesion con productos.
- [x] Permitir productos sin sesion durante la migracion inicial.

### Panel administrador

- [x] Añadir gestion de sesiones.
- [x] Crear sesion nueva.
- [x] Editar nombre y orden.
- [x] Ocultar o eliminar sesion.
- [x] Asignar productos a una sesion.
- [x] Mostrar cuantas prendas contiene cada sesion.

### Tienda publica

- [x] Añadir botonera o lista de sesiones encima del catalogo.
- [x] Añadir filtro por sesion.
- [ ] Mantener busqueda junto con el filtro de sesion.
- [ ] Mostrar estado vacio cuando una sesion no tenga productos.
- [ ] Mantener el catalogo sin productos premium.

**Validacion:** crear `Monos`, añadir tres productos y comprobar que solo aparecen al seleccionar esa sesion.

## Bloque 5 — Separacion estricta de premium

- [ ] Cambiar la consulta normal para pedir solo productos no premium.
- [x] Comprobar que un producto premium nunca aparece en el catalogo normal.
- [ ] Mantener la consulta independiente de productos premium.
- [ ] Revisar productos existentes que pudieran aparecer duplicados.
- [x] Cambiar la primera frase premium a `¿Buscas una prenda exclusiva?`.
- [x] En movil eliminar el boton visible `Ver ficha`.
- [x] Hacer que tocar cualquier producto premium abra directamente la ficha.
- [ ] Mantener el boton o interaccion de ficha en escritorio si sigue siendo util.
- [x] Aplicar el difuminado inferior a las imagenes premium.

**Validacion:** marcar un producto como premium y comprobar que desaparece del catalogo normal sin desaparecer de premium.

## Bloque 6 — Imagenes asociadas a variantes

### Modelo

- [x] Añadir relacion opcional entre imagen y variante.
- [x] Mantener compatibles las imagenes actuales sin variante.
- [x] Crear migracion sin borrar galerias existentes.

### Panel

- [x] Mostrar selector de variante al subir imagenes.
- [x] Permitir imagenes generales del producto.
- [x] Permitir imagenes especificas por color/talla.
- [ ] Ordenar imagenes dentro de cada grupo.
- [ ] Elegir portada general o portada de variante.
- [x] Mantener eliminacion y texto alternativo.

### Tienda

- [x] Cambiar imagen principal al seleccionar variante.
- [x] Usar galeria general como respaldo si la variante no tiene imagenes.
- [ ] Evitar parpadeos o saltos de altura al cambiar imagen.

**Validacion:** crear dos colores con galerias diferentes y comprobar que cada color muestra sus imagenes.

## Bloque 7 — Carrusel automatico y ficha deslizable

- [x] Crear componente de galeria reutilizable.
- [ ] Avanzar automaticamente cada 3 segundos.
- [ ] Pausar al tocar, enfocar o interactuar.
- [ ] Reanudar solo cuando corresponda.
- [x] Añadir indicadores de posicion.
- [x] Añadir navegacion lateral en escritorio.
- [x] Añadir gestos de deslizamiento en movil.
- [x] Permitir recorrer todas las imagenes dentro de la ficha.
- [x] Mantener lightbox o visor ampliado.
- [x] Cerrar correctamente con boton, fondo y tecla Escape.
- [ ] Respetar `prefers-reduced-motion`.

**Validacion:** comprobar avance automatico, swipe movil, flechas de escritorio y apertura de todas las imagenes.

## Bloque 8 — Encargos directos por WhatsApp

- [ ] Revisar el repositorio de Pizzeria los Herrera cuando se reciba el enlace.
- [ ] Comparar su generacion de mensajes, apertura de WhatsApp y fallback.
- [ ] Definir numero de WhatsApp configurable.
- [ ] Crear mensaje de encargo de ropa.
- [ ] Incluir producto, sesion, variante, color, talla, cantidad y precio.
- [ ] Incluir nombre, telefono, direccion y notas.
- [ ] Abrir WhatsApp con el mensaje preparado dentro del gesto del usuario.
- [ ] Mantener alternativa de copiar el mensaje.
- [ ] Decidir si el encargo crea registro interno antes o despues de abrir WhatsApp.
- [ ] Eliminar errores derivados de stock.
- [ ] Mostrar confirmacion clara de que el encargo fue preparado.

**Validacion:** probar Android, iPhone, escritorio con WhatsApp Web y navegador sin WhatsApp instalado.

## Bloque 9 — Moneda y precios

- [ ] Confirmar si se muestra EUR, USD o ambas.
- [ ] Si se muestran ambas, definir fuente y frecuencia del tipo de cambio.
- [ ] Centralizar formato de moneda.
- [ ] Aplicar el formato en tarjetas, ficha, carrito, premium, panel y WhatsApp.
- [ ] Evitar diferencias entre precio base y precio de variante.
- [ ] Revisar pedidos historicos para no cambiar sus importes.

**Validacion:** comprobar un mismo precio en tarjeta, ficha, carrito, pedido, panel y mensaje de WhatsApp.

## Bloque 10 — Ajustes responsive y acabado

- [ ] Reducir la imagen de la chica en el hero movil.
- [ ] Revisar header en pantallas pequeñas.
- [ ] Revisar tarjetas de dos columnas en movil.
- [ ] Revisar modal de producto en movil.
- [ ] Comprobar que no hay textos cortados ni solapados.
- [ ] Revisar botones y controles tactiles.
- [ ] Revisar scroll entre secciones.
- [ ] Revisar carga de imagenes y estados sin imagen.

**Validacion:** revisar al menos 375 px, 768 px, 1280 px y una pantalla grande.

## Bloque 11 — Migracion de datos

- [ ] Ejecutar migraciones sobre una copia de la base actual.
- [ ] Asociar productos existentes a sesiones.
- [ ] Revisar productos premium actuales.
- [ ] Revisar imagenes actuales sin variante.
- [ ] Confirmar que los pedidos historicos siguen visibles.
- [ ] Confirmar que las URLs de imagen siguen funcionando.
- [ ] Ejecutar migracion sobre una base de prueba limpia.
- [ ] Preparar procedimiento de rollback.

**Validacion:** comparar conteo de productos, variantes, imagenes y pedidos antes y despues.

## Bloque 12 — Pruebas finales y despliegue

- [ ] Ejecutar pruebas de API.
- [ ] Ejecutar `npm run test:api`.
- [ ] Ejecutar `npm run build`.
- [ ] Probar creacion y edicion desde el panel.
- [ ] Probar sesiones y filtros.
- [ ] Probar premium y catalogo normal.
- [ ] Probar pedidos y WhatsApp.
- [ ] Probar carrusel en movil y escritorio.
- [ ] Revisar consola del navegador.
- [ ] Revisar respuestas de API y errores HTTP.
- [ ] Crear backup previo al despliegue.
- [ ] Desplegar backend y frontend.
- [ ] Verificar el entorno publicado.
- [ ] Confirmar que las fotos se sirven por HTTPS.

## Estado actual

- [x] Planning creado.
- [ ] Decisiones previas confirmadas.
- [x] Bloque 0 — Preparacion y seguridad.
- [ ] Bloque 1 — Identidad visual JEN STUDIO.
- [x] Bloque 2 — Eliminar dependencia de stock.
- [ ] Bloque 3 — Variantes con seleccion multiple.
- [x] Bloque 4 — Sesiones o categorias.
- [ ] Bloque 5 — Separacion estricta de premium.
- [ ] Bloque 6 — Imagenes por variante.
- [ ] Bloque 7 — Carrusel automatico.
- [ ] Bloque 8 — WhatsApp.
- [ ] Bloque 9 — Moneda.
- [ ] Bloque 10 — Responsive y acabado.
- [ ] Bloque 11 — Migracion de datos.
- [ ] Bloque 12 — Pruebas y despliegue.
