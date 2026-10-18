// Prueba de regresion del 415 contra el API real, usando el Frontend/src/api.ts REAL.
const BASE = 'http://127.0.0.1:8099';
const realFetch = globalThis.fetch;
globalThis.fetch = (path, init) => realFetch(String(path).startsWith('/') ? BASE + path : path, init);

const { api } = await import(new URL('../Frontend/src/api.ts', import.meta.url).href);

const login = await realFetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'AuditPass2026' }) });
const { token } = await login.json();
const rows = [];
const t = async (name, fn) => {
  try { rows.push([name, 'OK', await fn()]); } catch (e) { rows.push([name, 'FALLO', e.message.slice(0, 70)]); }
};

let pid, vid;
await t('createProduct', async () => { const p = await api.createProduct(token, { name: 'Prueba 415 ' + Date.now(), description: 'x', basePrice: 100, published: false }); pid = p.id; return 'id ' + p.id.slice(0, 8); });
await t('updateProduct', async () => { await api.updateProduct(token, pid, { name: 'Prueba editada', description: 'x', basePrice: 120, published: true }); return 'precio 120, publicado'; });
await t('saveVariant', async () => { const v = await api.saveVariant(token, pid, { size: 'M', color: 'Negro', stockQuantity: 2, isActive: true }); vid = v.id; return 'id ' + v.id.slice(0, 8); });
await t('updateVariant', async () => { await api.updateVariant(token, pid, vid, { size: 'M', color: 'Negro', stockQuantity: 5, isActive: true }); return 'stock 5'; });
await t('order (publico)', async () => { const o = await api.order({ customerName: 'Ana', customerPhone: '600', deliveryAddress: 'Calle 1', items: [{ variantId: vid, quantity: 1 }] }); return 'total ' + o.total; });
let oid;
await t('adminOrders', async () => { const os = await api.adminOrders(token); oid = os[0].id; return os.length + ' pedido(s)'; });
await t('setStatus', async () => { await api.setStatus(token, oid, 'Confirmed'); return 'Confirmed'; });
await t('adminProducts', async () => { const ps = await api.adminProducts(token); const p = ps.find((x) => x.id === pid); return 'precio ' + p.basePrice + ', stock ' + p.variants[0].stockQuantity; });

// que cabeceras ve de verdad el servidor
const seen = [];
globalThis.fetch = (path, init) => { seen.push({ path: String(path), headers: init?.headers, hasBody: !!init?.body }); return realFetch(String(path).startsWith('/') ? BASE + path : path, init); };
await api.createProduct(token, { name: 'Cabeceras ' + Date.now(), basePrice: 1, published: false }).catch(() => {});
const headersVistos = seen[0].headers;

for (const [n, r, d] of rows) console.log('  ' + (r === 'OK' ? 'OK    ' : 'FALLO ') + n.padEnd(18) + ' -> ' + d);
console.log('\n  Cabeceras que ve el backend en createProduct:');
console.log('    Content-Type  = ' + (headersVistos['Content-Type'] ?? 'AUSENTE'));
console.log('    Authorization = ' + (headersVistos.Authorization ? headersVistos.Authorization.slice(0, 22) + '...' : 'AUSENTE'));

// limpieza
globalThis.fetch = (path, init) => realFetch(String(path).startsWith('/') ? BASE + path : path, init);
const prods = await api.adminProducts(token);
for (const p of prods.filter((x) => /^Prueba 415|^Cabeceras/.test(x.name))) await api.deleteProduct(token, p.id);
await api.deleteOrder(token, oid).catch(() => {});
const fallos = rows.filter((r) => r[1] !== 'OK').length;
console.log('\n  RESULTADO: ' + (rows.length - fallos) + '/' + rows.length + ' escrituras del panel funcionan');
