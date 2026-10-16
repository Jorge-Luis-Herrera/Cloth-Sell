export type Variant = { id: string; size: string; color: string; sku?: string; price: number; priceOverride?: number | null; stockQuantity: number; isActive: boolean };
export type ProductImage = { id: string; url: string; altText: string };
export type Product = { id: string; slug: string; name: string; description: string; basePrice: number; published: boolean; createdAt: string; updatedAt: string; variants: Variant[]; images: ProductImage[] };
export type CartLine = { variant: Variant; product: Product; quantity: number };

export type OrderItem = { name: string; size: string; color: string; unitPrice: number; quantity: number; lineTotal: number };
export type Order = { id: string; status: string; customerName: string; customerPhone: string; deliveryAddress: string; notes: string | null; total: number; createdAt: string; updatedAt: string; items: OrderItem[] };

export type ProductInput = { name: string; description?: string | null; basePrice: number; published: boolean };
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

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const json = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }, ...init });
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
};

const upload = async (path: string, token: string, form: FormData) => {
  const response = await fetch(path, { method: 'POST', headers: auth(token), body: form });
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${response.status}`);
  return response.json();
};

export const api = {
  products: (query = '') => json(`/api/products${query}`),
  login: (password: string) => json('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  order: (data: unknown) => json('/api/orders', { method: 'POST', body: JSON.stringify(data) }),

  adminProducts: (token: string) => json('/api/admin/products', { headers: auth(token) }),
  createProduct: (token: string, data: ProductInput) => json('/api/admin/products', { method: 'POST', headers: auth(token), body: JSON.stringify(data) }),
  updateProduct: (token: string, id: string, data: ProductInput) => json(`/api/admin/products/${id}`, { method: 'PUT', headers: auth(token), body: JSON.stringify(data) }),
  deleteProduct: (token: string, id: string) => json(`/api/admin/products/${id}`, { method: 'DELETE', headers: auth(token) }),

  saveVariant: (token: string, productId: string, data: VariantInput) => json(`/api/admin/products/${productId}/variants`, { method: 'POST', headers: auth(token), body: JSON.stringify(data) }),
  updateVariant: (token: string, productId: string, variantId: string, data: VariantInput) => json(`/api/admin/products/${productId}/variants/${variantId}`, { method: 'PUT', headers: auth(token), body: JSON.stringify(data) }),
  deleteVariant: (token: string, productId: string, variantId: string) => json(`/api/admin/products/${productId}/variants/${variantId}`, { method: 'DELETE', headers: auth(token) }),

  uploadImage: (token: string, productId: string, file: File, altText = '') => {
    const form = new FormData();
    form.append('file', file);
    if (altText) form.append('altText', altText);
    return upload(`/api/admin/products/${productId}/images`, token, form);
  },
  deleteImage: (token: string, productId: string, imageId: string) => json(`/api/admin/products/${productId}/images/${imageId}`, { method: 'DELETE', headers: auth(token) }),

  adminOrders: (token: string) => json('/api/admin/orders', { headers: auth(token) }),
  setStatus: (token: string, id: string, status: string) => json(`/api/admin/orders/${id}/status`, { method: 'PATCH', headers: auth(token), body: JSON.stringify({ status }) }),
  deleteOrder: (token: string, id: string) => json(`/api/admin/orders/${id}`, { method: 'DELETE', headers: auth(token) }),
};