# Serie premium

Catalogo curado que se muestra **antes** del catalogo normal, con la ficha tecnica de cada
prenda a la vista (composicion, gramaje, origen, cuidados y ensayos).

La idea es que una prenda no sea "premium" por el precio, sino porque Jenny la elige y puede
contar por que: de que fibra esta hecha, cuanto pesa el tejido, donde se hizo y que ensayos
paso. **Nada de eso se inventa**: la tienda solo pinta los campos que se rellenan en el panel.

## Como se marca una prenda

1. Panel (`/#admin`) → **Catalogo** → **Editar** en la prenda.
2. Marcar **Producto premium**.
3. Rellenar lo que exista de verdad. Todo es opcional salvo el nombre y el precio:
   - **Orden en la serie**: numero menor = antes. Vacio = al final.
   - **Frase de la ficha**: una linea, la que abre la ficha (p. ej. "Lino europeo tejido en Portugal").
   - **Composicion**: fibra + porcentaje. Si se rellena, **debe sumar 100 %**.
   - **Gramaje** (g/m²), **origen**, **tirada** (unidades).
   - **Cuidados**: uno por linea.
   - **Ensayos**: nombre, norma y resultado. Solo con el informe del proveedor delante.
   - **Historia de la prenda**: un parrafo corto, opcional.
4. Guardar. La prenda aparece en la seccion premium y sigue en el catalogo normal.

Quitar la marca **no borra la ficha**: se conserva por si se vuelve a activar.

## Que se ve en la tienda

- Seccion `#premium` entre el hero y `#catalogo`; solo aparece si hay prendas premium publicadas.
- Enlace **Premium** en la barra superior, solo cuando la seccion existe.
- Cada prenda se presenta como una ficha: foto, numero de serie, frase, barra de composicion,
  tabla de datos, ensayos, precio y "Ver ficha" (abre la hoja de producto de siempre).
- La hoja de producto muestra la misma ficha tecnica debajo del boton de compra.
- En el catalogo normal, las prendas premium llevan un distintivo **Premium** y salen primero.

### Decision: los premium tambien salen en el catalogo normal

Es lo habitual en una tienda ("destacados" + "todo") y evita que una prenda desaparezca si se
marca casi todo como premium. Si algun dia se quiere separar del todo, el backend ya acepta
`GET /api/products?tier=normal` (solo normales) o `?tier=premium` (solo premium); basta con que
la tienda mande ese parametro.

## API

- `GET /api/premium` → `{ "items": [Product] }`, solo publicados, ordenados por `premium_rank`
  y despues por fecha. Sin paginar: la serie es corta por definicion.
- `GET /api/products?tier=premium|normal` → filtra el catalogo por serie (sin parametro, todo).
- `Product` incorpora `isPremium`, `premiumRank` y `premium` (objeto o `null`).
- `POST/PUT /api/admin/products` aceptan `isPremium`, `premiumRank` y `premium`. El backend
  valida que la composicion sume 100 %, que el gramaje sea positivo y que la tirada no sea
  negativa. Producto y ficha se guardan en la misma transaccion.

## Modelo de datos

`Backend-Rust/migrations/0003_premium.sql` (aditiva, se aplica sola al arrancar):

- `products.is_premium` (0/1, por defecto 0) y `products.premium_rank` (nullable).
- Indice `idx_products_premium` para la consulta de la serie.
- Tabla `product_premium` 1:1 con `products` (`ON DELETE CASCADE`) con los campos de la ficha.
  `composition`, `care` y `tests` se guardan como JSON validado en el backend.

## Despliegue

1. **Backup de la base** antes de desplegar (`./deploy/backup.sh`): la migracion se aplica al
   arrancar el contenedor.
2. Desplegar. Si algo falla, la migracion no borra nada: las columnas y la tabla nuevas pueden
   quedarse sin uso y la version anterior sigue funcionando.
3. Rellenar las fichas desde el panel con los datos reales del proveedor.

## Pendiente

- Cargar composicion, gramaje, origen y ensayos reales de cada prenda premium (hoy la seccion
  sale vacia hasta que se rellene).
- Fotos definitivas: la seccion usa la primera foto del producto, la misma que el catalogo.
