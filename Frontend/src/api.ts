export type Variant = { id: string; size: string; color: string; sku?: string; price: number; priceOverride?: number | null; stockQuantity: number; isActive: boolean };
export type ProductImage = { id: string; url: string; altText: string };

/** Una fibra de la composicion, con su porcentaje. Suman 100. */
export type PremiumComposition = { fiber: string; percent: number };
/** Un ensayo de laboratorio tal como lo declara el fabricante. `method` es la norma
 *  (por ejemplo "UNE-EN ISO 13934-1") y `result` el valor medido. */
export type PremiumTest = { name: string; method: string; result: string };
/** Ficha tecnica de una prenda de la serie premium. */
export type PremiumSpec = {
  tagline: string; composition: PremiumComposition[]; fabricWeightGsm: number | null; origin: string;
  care: string[]; tests: PremiumTest[]; story: string; limitedUnits: number | null;
};
/** Al escribir solo hace falta mandar lo que se rellena; el backend rellena el resto. */
export type PremiumInput = Partial<PremiumSpec>;

export type Product = { id: string; slug: string; name: string; description: string; basePrice: number; published: boolean; isPremium?: boolean; premiumRank?: number | null; premium?: PremiumSpec | null; createdAt: string; updatedAt: string; variants: Variant[]; images: ProductImage[] };
export type CartLine = { variant: Variant; product: Product; quantity: number };

export type OrderItem = { name: string; size: string; color: string; unitPrice: number; quantity: number; lineTotal: number };
export type Order = { id: string; status: string; customerName: string; customerPhone: string; deliveryAddress: string; notes: string | null; total: number; createdAt: string; updatedAt: string; items: OrderItem[] };

export type ProductInput = { name: string; description?: string | null; basePrice: number; published: boolean; isPremium?: boolean; premiumRank?: number | null; premium?: PremiumInput | null };
export type VariantInput = { size: string; color: string; sku?: string | null; priceOverride?: number | null; stockQuantity: number; isActive: boolean };

/** Estados que acepta el backend. El orden es el del ciclo de vida del pedido. */
export const ORDER_STATUSES = ['Pending', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: 'Recibido',
  Confirmed: 'Confirmado',
  Preparing: 'En preparación',
  Shipped: 'Enviado',
  Delivered: 'Entregado',
  Cancelled: 'Cancelado',
};

/** Tallas y colores sugeridos al crear un producto de ropa. */
export const SUGGESTED_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Única'];
export const SUGGESTED_COLORS = ['Negro', 'Blanco', 'Beige', 'Gris', 'Azul', 'Rojo', 'Verde', 'Rosa', 'Marrón'];

/**
 * Moneda y locale de la tienda. Viven aqui para que la tienda y el panel no puedan divergir:
 * antes la tienda formateaba en EUR (`es-ES`) y el panel en MXN (`es-MX`), y el mismo producto
 * salia con dos monedas distintas segun donde se mirara.
 */
export const STORE_CURRENCY = 'EUR';
export const STORE_LOCALE = 'es-ES';

export type ProductPage = { items: Product[]; total: number; page: number; pageSize: number; hasMore?: boolean };

/** Filtros del catalogo publico. El backend pagina y filtra en SQL: filtrar en el navegador
 *  solo применaria a los productos de la pagina actual, no al catalogo entero. */
export type CatalogQuery = { search?: string; size?: string; color?: string; page?: number; pageSize?: number };

const catalogQuery = (q: CatalogQuery = {}) => {
  const params = new URLSearchParams();
  if (q.search?.trim()) params.set('search', q.search.trim());
  if (q.size) params.set('size', q.size);
  if (q.color) params.set('color', q.color);
  if (q.page && q.page > 1) params.set('page', String(q.page));
  if (q.pageSize) params.set('page_size', String(q.pageSize));
  const s = params.toString();
  return s ? `/api/products?${s}` : '/api/products';
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Saca un mensaje legible de un cuerpo de error del backend.
 *
 * El API devuelve `{ "request": "..." }` en los errores de validacion, `{ "error": "..." }` en el
 * login y texto plano en los rechazos de Axum (415, 422). Antes el panel enseñaba el JSON crudo.
 */
const mensajeDeError = (texto: string, estado: number) => {
  const limpio = texto.trim();
  if (!limpio) return `Error ${estado}`;
  try {
    const datos = JSON.parse(limpio) as { request?: string; error?: string; message?: string };
    return datos.request || datos.error || datos.message || limpio;
  } catch {
    return limpio;
  }
};

/**
 * Lee la respuesta de forma tolerante: 204 o cuerpo vacio -> null, si no, JSON.
 * Axum responde 200 con cuerpo vacio en algunas rutas y con `text/plain` en los errores
 * de deserializacion, asi que leer texto primero evita "Unexpected end of JSON input".
 */
const leer = async (response: Response) => {
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

/**
 * Envuelve fetch para las llamadas con cuerpo JSON.
 *
 * El `...init` va ANTES de `headers` a proposito: si fuera despues, el objeto `headers` que se construye
 * en la llamada se descartaria entero y solo llegaria `init.headers` (Authorization), sin Content-Type.
 * El navegador pondria entonces `text/plain` y el backend responderia 415 a todas las escrituras del panel.
 * Solo se anade Content-Type si hay cuerpo: en un GET o un DELETE sin cuerpo sobra y evita ruido.
 */
const json = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, { ...init, headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) throw new Error(mensajeDeError(await response.text(), response.status));
  return leer(response);
};

/** Avanza de la subida: porcentaje 0-100, o null si el navegador no sabe el total. */
export type ProgressHandler = (percent: number | null, loaded: number, total: number) => void;

/**
 * Subida de imagen con progreso real.
 *
 * Usa XMLHttpRequest y no fetch porque `fetch` no expone el progreso de subida: solo avisa al
 * terminar. Con XHR se puede pintar una barra con el porcentaje, que es justo lo que se pierde
 * con una foto de 3 MB en un movil.
 *
 * NO se fija Content-Type a proposito: si se pusiera, el `multipart/form-data` sin boundary
 * pisaria el que genera el navegador y el backend no reconoceria el fichero.
 */
const upload = (path: string, token: string, form: FormData, onProgress?: ProgressHandler) =>
  new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : null, e.loaded, e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null);
        } catch {
          resolve(null);
        }
      } else {
        reject(new Error(mensajeDeError(xhr.responseText, xhr.status)));
      }
    };
    xhr.onerror = () => reject(new Error('No se pudo conectar con el servidor.'));
    xhr.onabort = () => reject(new Error('Subida cancelada.'));
    xhr.send(form);
  });

export const api = {
  /** Filtros del catalogo publico. El backend pagina y filtra en SQL: filtrar en el navegador
   *  solo aplicaria a los productos de la pagina actual, no al catalogo entero. */
  products: (query: CatalogQuery = {}) => json(catalogQuery(query)),
  /** Serie premium, ya ordenada por curaduria. Va aparte del catalogo porque la portada la
   *  pinta antes y sin paginar. */
  premium: () => json('/api/premium'),
  login: (password: string) => json('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  order: (data: unknown) => json('/api/orders', { method: 'POST', body: JSON.stringify(data) }),

  adminProducts: (token: string) => json('/api/admin/products', { headers: auth(token) }),
  createProduct: (token: string, data: ProductInput) => json('/api/admin/products', { method: 'POST', headers: auth(token), body: JSON.stringify(data) }),
  updateProduct: (token: string, id: string, data: ProductInput) => json(`/api/admin/products/${id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify(data) }),
  deleteProduct: (token: string, id: string) => json(`/api/admin/products/${id}`, { method: 'DELETE', headers: auth(token) }),

  saveVariant: (token: string, productId: string, data: VariantInput) => json(`/api/admin/products/${productId}/variants`, { method: 'POST', headers: auth(token), body: JSON.stringify(data) }),
  updateVariant: (token: string, productId: string, variantId: string, data: VariantInput) => json(`/api/admin/products/${productId}/variants/${variantId}`, { method: 'PUT', headers: auth(token), body: JSON.stringify(data) }),
  deleteVariant: (token: string, productId: string, variantId: string) => json(`/api/admin/products/${productId}/variants/${variantId}`, { method: 'DELETE', headers: auth(token) }),

  uploadImage: (token: string, productId: string, file: File, altText = '', onProgress?: ProgressHandler) => {
    const form = new FormData();
    form.append('file', file);
    if (altText) form.append('altText', altText);
    return upload(`/api/admin/products/${productId}/images`, token, form, onProgress);
  },
  deleteImage: (token: string, productId: string, imageId: string) => json(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE', headers: auth(token) }),
  /** Guarda el orden de la galeria. La primera foto de la lista es la portada. */
  reorderImages: (token: string, productId: string, ids: string[]) => json(`/api/admin/products/${productId}/images`, { method: 'PATCH', headers: auth(token), body: JSON.stringify({ ids }) }),
  /** Cambia el texto alternativo de una foto sin volver a subirla. */
  setImageAlt: (token: string, productId: string, imageId: string, altText: string) => json(`/api/admin/products/${productId}/images/${imageId}`, { method: 'PATCH', headers: auth(token), body: JSON.stringify({ altText }) }),

  adminOrders: (token: string) => json('/api/admin/orders', { headers: auth(token) }),
  setStatus: (token: string, id: string, status: string) => json(`/api/admin/orders/${id}/status`, { method: 'PATCH', headers: auth(token), body: JSON.stringify({ status }) }),
  deleteOrder: (token: string, id: string) => json(`/api/admin/orders/${id}`, { method: 'DELETE', headers: auth(token) }),
};