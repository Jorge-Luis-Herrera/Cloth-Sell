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
- [x] Reemplazar colores antiguos del storefront.
- [x] Reemplazar colores antiguos del panel.
- [x] Mantener contraste suficiente para textos y botones.

### Tipografia

- [x] Incorporar la tipografia confirmada.
- [x] Aplicarla a tienda, panel, botones, formularios y modales.
- [x] Ajustar pesos y tamaños para mantener la jerarquia de la imagen de referencia.

### Fondos y cierre de la pagina

- [x] Unificar el fondo entre hero, premium, catalogo y seccion final.
- [x] Eliminar separaciones que produzcan cuadrados visuales.
- [x] Rediseñar la seccion final con la paleta JEN STUDIO.
- [x] Sustituir el texto final por: `No se trata solo de como te ves, sino de como avanzas, creces y descubres hacia donde quieres llegar.`
- [x] Añadir el corazon marron de forma coherente con la identidad visual.

**Validacion:** revisar capturas en movil y escritorio; comprobar contraste y ausencia de bloques bruscos.

## Bloque 2 — Eliminar dependencia de stock

### Backend

- [x] Localizar validaciones de `stock_quantity` al crear pedidos.
- [x] Eliminar el bloqueo de pedidos por falta de existencias.
- [x] Eliminar la resta automatica de existencias.
- [x] Mantener los snapshots de los pedidos existentes.
- [x] Mantener las columnas antiguas de stock solo como compatibilidad de datos.
- [x] Evitar que el API nuevo dependa de stock para publicar un producto.

### Frontend publico

- [x] Eliminar estados `disponible`, `sin stock` y botones desactivados por stock.
- [x] Eliminar limites de cantidad basados en `stockQuantity`.
- [x] Eliminar mensajes de error relacionados con falta de stock.
- [x] Cambiar el flujo de compra a flujo de encargo.

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
- [x] Mostrar errores concretos si una combinacion no se puede guardar.

**Validacion:** seleccionar 3 colores y 3 tallas; comprobar que se generan 9 variantes y que no aparecen duplicadas.

## Bloque 4 — Sesiones o categorias del catalogo

### Base de datos y API

- [x] Crear migracion para tabla de sesiones.
- [x] Crear migracion para relacion producto-sesion.
- [x] Definir slug, nombre, descripcion, orden y estado visible.
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
- [x] Mantener busqueda junto con el filtro de sesion.
- [x] Mostrar estado vacio cuando una sesion no tenga productos.
- [x] Mantener el catalogo sin productos premium.

**Validacion:** crear `Monos`, añadir tres productos y comprobar que solo aparecen al seleccionar esa sesion.

## Bloque 5 — Separacion estricta de premium

- [x] Cambiar la consulta normal para pedir solo productos no premium.
- [x] Comprobar que un producto premium nunca aparece en el catalogo normal.
- [x] Mantener la consulta independiente de productos premium.
- [x] Revisar productos existentes que pudieran aparecer duplicados.
- [x] Cambiar la primera frase premium a `¿Buscas una prenda exclusiva?`.
- [x] En movil eliminar el boton visible `Ver ficha`.
- [x] Hacer que tocar cualquier producto premium abra directamente la ficha.
- [x] Mantener el boton o interaccion de ficha en escritorio si sigue siendo util.
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
- [x] Ordenar imagenes dentro de cada grupo.
- [x] Elegir portada general o portada de variante.
- [x] Mantener eliminacion y texto alternativo.

### Tienda

- [x] Cambiar imagen principal al seleccionar variante.
- [x] Usar galeria general como respaldo si la variante no tiene imagenes.
- [x] Evitar parpadeos o saltos de altura al cambiar imagen.

**Validacion:** crear dos colores con galerias diferentes y comprobar que cada color muestra sus imagenes.

## Bloque 7 — Carrusel automatico y ficha deslizable

- [x] Crear componente de galeria reutilizable.
- [x] Avanzar automaticamente cada 3 segundos.
- [x] Pausar al tocar, enfocar o interactuar.
- [x] Reanudar solo cuando corresponda.
- [x] Añadir indicadores de posicion.
- [x] Añadir navegacion lateral en escritorio.
- [x] Añadir gestos de deslizamiento en movil.
- [x] Permitir recorrer todas las imagenes dentro de la ficha.
- [x] Mantener lightbox o visor ampliado.
- [x] Cerrar correctamente con boton, fondo y tecla Escape.
- [x] Respetar `prefers-reduced-motion`.

**Validacion:** comprobar avance automatico, swipe movil, flechas de escritorio y apertura de todas las imagenes.

## Bloque 8 — Encargos directos por WhatsApp

- [x] Revisar el repositorio de Pizzeria los Herrera cuando se reciba el enlace.
- [x] Comparar su generacion de mensajes, apertura de WhatsApp y fallback.
- [x] Definir numero de WhatsApp configurable.
- [x] Crear mensaje de encargo de ropa.
- [x] Incluir producto, sesion, variante, color, talla, cantidad y precio.
- [x] Incluir nombre, telefono, direccion y notas.
- [x] Abrir WhatsApp con el mensaje preparado dentro del gesto del usuario.
- [x] Mantener alternativa de copiar el mensaje.
- [x] Decidir si el encargo crea registro interno antes o despues de abrir WhatsApp.
- [x] Eliminar errores derivados de stock.
- [x] Mostrar confirmacion clara de que el encargo fue preparado.

**Validacion:** probar Android, iPhone, escritorio con WhatsApp Web y navegador sin WhatsApp instalado.

## Bloque 9 — Moneda y precios

- [x] Confirmar si se muestra EUR, USD o ambas. (Decidido en decisiones previas: USD solamente, sin tipo de cambio.)
- [x] Si se muestran ambas, definir fuente y frecuencia del tipo de cambio. (No aplica: USD directo.)
- [x] Centralizar formato de moneda.
- [x] Aplicar el formato en tarjetas, ficha, carrito, premium, panel y WhatsApp.
- [x] Evitar diferencias entre precio base y precio de variante.
- [x] Revisar pedidos historicos para no cambiar sus importes.

**Validacion:** comprobar un mismo precio en tarjeta, ficha, carrito, pedido, panel y mensaje de WhatsApp.

## Bloque 10 — Ajustes responsive y acabado

- [x] Reducir la imagen de la chica en el hero movil.
- [x] Revisar header en pantallas pequeñas.
- [x] Revisar tarjetas de dos columnas en movil.
- [x] Revisar modal de producto en movil.
- [x] Comprobar que no hay textos cortados ni solapados.
- [x] Revisar botones y controles tactiles.
- [x] Revisar scroll entre secciones.
- [x] Revisar carga de imagenes y estados sin imagen.

**Validacion:** revisar al menos 375 px, 768 px, 1280 px y una pantalla grande. (Chequeo por codigo completado: ficha a una columna <=820, catalogo 2 tarjetas <=760, carrito completo <=560, hero apilado <=1000, sin textes cortados. La revision visual final con el usuario queda antes del despliegue.)

## Bloque 11 — Migracion de datos

- [x] Ejecutar migraciones sobre una copia de la base actual.
- [x] Asociar productos existentes a sesiones.
- [x] Revisar productos premium actuales.
- [x] Revisar imagenes actuales sin variante.
- [x] Confirmar que los pedidos historicos siguen visibles.
- [x] Confirmar que las URLs de imagen siguen funcionando.
- [x] Ejecutar migracion sobre una base de prueba limpia.
- [x] Preparar procedimiento de rollback.

**Procedimiento de rollback (desplegado):**
1. Copia previa: `cp jenny.db jenny.db.bak-$(date +%F)` (con el backend parado).
2. Si una migracion rompe datos, detener el binario y restaurar el backup: `cp jenny.db.bak-... jenny.db`.
3. El binario anterior sigue en `Backend-Rust/target/release/`: arrancar de nuevo sirve el frontend antiguo con la base restaurada.
4. Nota: los ficheros de `/uploads` llevan acentos en el nombre (p. ej. `demo-capote-séville-a.jpg`); los navegadores los codifican al pedirlos y las 12 URLs responden 200 comprobadas. En producción, si se copian estos ficheros a mano, usar `rsync --checksum` en vez de `scp` a mano para no romper el nombre.

**Validacion:** comparar conteo de productos, variantes, imagenes y pedidos antes y despues.

## Bloque 12 — Pruebas finales y despliegue

- [x] Ejecutar pruebas de API.
- [x] Ejecutar `npm run test:api`.
- [x] Ejecutar `npm run build`.
- [x] Probar creacion y edicion desde el panel.
- [x] Probar sesiones y filtros.
- [x] Probar premium y catalogo normal.
- [ ] Probar pedidos y WhatsApp (en dispositivo real).
- [ ] Probar carrusel en movil y escritorio (revision visual del usuario).
- [ ] Revisar consola del navegador (revision visual del usuario).
- [x] Revisar respuestas de API y errores HTTP.
- [x] Crear backup previo al despliegue.
- [x] Desplegar backend y frontend.
- [x] Verificar el entorno publicado.
- [x] Confirmar que las fotos se sirven por HTTPS.

### Nota de despliegue (2026-11-05)

- El pipeline de Azure DevOps no se disparo con el push a `main` (conexion GitHub ↔ Azure DevOps sin verificar). El despliegue se hizo a mano con `deploy/deploy-appservice.sh`: imagen `391c131` construida con `Dockerfile.prebuilt`, empujada a `jennycloth20261014.azurecr.io/jenny-clothing` y fijada en el Web App `jenny-clothing-20261014`.
- Produccion verificada: `<title>JEN STUDIO · Hecho para moverte</title>`, `/api/health` responde 200 y las fotos se sirven por HTTPS (HEAD 200; el entorno local de desarrollo bloquea descargas de JPG, por eso la comprobacion se hizo con HEAD).
- La sesion «Básicos» se creo en la base de produccion por API (ID `02e89aeb-3413-442b-9264-fd8db2e47827`) con las 4 prendas normales reales; las 2 premium siguen solo en su serie curada. El filtro publico por sesion devuelve esas 4 prendas.
- Pendiente de seguridad: cambiar la contraseña de administracion de produccion (la actual sigue siendo la de pruebas; ver `Planning.md` C2).

## Estado actual

- [x] Planning creado.
- [x] Decisiones previas confirmadas.
- [x] Bloque 0 — Preparacion y seguridad.
- [x] Bloque 1 — Identidad visual JEN STUDIO.
- [x] Bloque 2 — Eliminar dependencia de stock.
- [x] Bloque 3 — Variantes con seleccion multiple.
- [x] Bloque 4 — Sesiones o categorias.
- [x] Bloque 5 — Separacion estricta de premium.
- [x] Bloque 6 — Imagenes por variante.
- [x] Bloque 7 — Carrusel automatico.
- [ ] Bloque 8 — WhatsApp.
- [x] Bloque 9 — Moneda.
- [x] Bloque 10 — Responsive y acabado.
- [x] Bloque 11 — Migracion de datos.
- [ ] Bloque 12 — Pruebas y despliegue. (Desplegado y verificado en produccion; restan solo las pruebas visuales del usuario en dispositivo real: pedido/WhatsApp, carrusel y consola.)
