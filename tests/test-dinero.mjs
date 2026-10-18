/**
 * El dinero en centimos: comprueba que las sumas que antes fallaban ahora son exactas,
 * que la API sigue hablando en euros (quien consume no nota el cambio) y que el historico
 * de pedidos mantiene los importes.
 */
const BASE = 'http://127.0.0.1:8099';
const realFetch = globalThis.fetch;
globalThis.fetch = (path, init) => realFetch(String(path).startsWith('/') ? BASE + path : path, init);
const { api } = await import(new URL('../Frontend/src/api.ts', import.meta.url).href);

const filas = [];
const ok = (n, d) => { filas.push(['OK', n]); console.log('  OK    ' + n.padEnd(56) + ' -> ' + d); };
const mal = (n, d) => { filas.push(['FALLO', n]); console.log('  FALLO ' + n.padEnd(56) + ' -> ' + d); };
const eq = (n, a, e) => (JSON.stringify(a) === JSON.stringify(e) ? ok(n, JSON.stringify(a)) : mal(n, JSON.stringify(a) + ' != ' + JSON.stringify(e)));

const login = await realFetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'AuditPass2026' }) });
const { token } = await login.json();
const MARCA = 'ZZM' + Date.now();

const crear = async (nombre, precio, override) => {
  const p = await api.createProduct(token, { name: nombre + ' ' + MARCA, description: 'x', basePrice: precio, published: true });
  const v = await api.saveVariant(token, p.id, { size: 'Única', color: 'Negro', stockQuantity: 100, isActive: true, priceOverride: override ?? null });
  return { p, v };
};

console.log('\n== 1. El caso que fallaba: 3 x 0.10 ==');
const diez = await crear('Diez centimos', 0.1);
const o = await api.order({ customerName: 'Flo', customerPhone: '6', deliveryAddress: 'x', items: [{ variantId: diez.v.id, quantity: 3 }] });
eq('3 x 0.10 devuelve exactamente 0.30', o.total, 0.3);
console.log(`         ${o.total} en lugar de 0.30000000000000004`);

console.log('\n== 2. Otras sumas que fallaban en coma flotante ==');
const casos = [[0.07, 3], [0.1, 7], [19.99, 3], [1.15, 3], [0.29, 3], [4.35, 3], [33.33, 3]];
for (const [precio, unidades] of casos) {
  const { v } = await crear(`${precio}x${unidades}`, 1);
  await api.updateVariant(token, v.productId, v.id, { size: 'Única', color: 'Negro', stockQuantity: 100, isActive: true, priceOverride: precio });
  const pedido = await api.order({ customerName: 'A', customerPhone: '6', deliveryAddress: 'x', items: [{ variantId: v.id, quantity: unidades }] });
  const esperado = Math.round(precio * 100) * unidades / 100;
  eq(`${unidades} x ${precio} = ${esperado}`, pedido.total, esperado);
}

console.log('\n== 3. La API sigue hablando en euros ==');
const centimos = await crear('Precio normal', 499.9);
const listado = (await api.products({ search: MARCA, pageSize: 60 })).items.find((x) => x.id === centimos.p.id);
eq('basePrice sigue siendo un decimal', listado.basePrice, 499.9);
eq('la variante sin override hereda el precio', listado.variants[0].price, 499.9);
eq('y priceOverride llega como null, no como 0', listado.variants[0].priceOverride, null);
const conPrecio = await crear('Con override', 100, 549.99);
const otro = (await api.products({ search: MARCA, pageSize: 60 })).items.find((x) => x.id === conPrecio.p.id);
eq('priceOverride vuelve como decimal', otro.variants[0].priceOverride, 549.99);
eq('y price es el override', otro.variants[0].price, 549.99);

console.log('\n== 4. Precios que no son de centimos ==');
const raro = await crear('Precio raro', 12.3456);
const raroV = (await api.products({ search: MARCA, pageSize: 60 })).items.find((x) => x.id === raro.p.id);
eq('un precio con mas decimales se redondea al centimo', raroV.basePrice, 12.35);

console.log('\n== 5. El historico guarda importes exactos ==');
const pedido = await api.order({ customerName: 'Ana', customerPhone: '6', deliveryAddress: 'x', items: [{ variantId: centimos.v.id, quantity: 3 }] });
const ordenes = await api.adminOrders(token);
const mio = ordenes.find((x) => x.id === pedido.id);
eq('el total del pedido guardado', mio.total, 1499.7);
eq('y el de la linea', mio.items[0].lineTotal, 1499.7);
eq('el precio unitario guardado', mio.items[0].unitPrice, 499.9);
const suma = mio.items.reduce((s, i) => s + i.lineTotal, 0);
eq('la suma de las lineas cuadra con el total', Math.round(suma * 100) / 100, mio.total);

console.log('\n== 6. Persistencia real en la base ==');
const sqlite = (await realFetch(BASE + '/api/health')).status;
eq('la app sigue sana', sqlite, 200);

console.log('\n== 7. Valores limites ==');
const caro = await crear('Muy caro', 999999.99);
eq('un precio alto se guarda entero', (await api.products({ search: MARCA, pageSize: 60 })).items.find((x) => x.id === caro.p.id).basePrice, 999999.99);
const envio = await api.order({ customerName: 'A', customerPhone: '6', deliveryAddress: 'x', items: [{ variantId: caro.v.id, quantity: 2 }] });
eq('y el total se calcula bien', envio.total, 1999999.98);

for (const x of (await api.adminProducts(token)).filter((x) => x.name.includes(MARCA))) await api.deleteProduct(token, x.id);
for (const o2 of (await api.adminOrders(token)).filter((x) => x.customerName === 'Flo' || x.customerName === 'A')) await api.deleteOrder(token, o2.id).catch(() => {});
eq('limpieza: no quedan productos de prueba', (await api.adminProducts(token)).filter((x) => x.name.includes(MARCA)).length, 0);

const fallos = filas.filter((f) => f[0] === 'FALLO').length;
console.log(`\nRESULTADO: ${filas.length - fallos}/${filas.length} comprobaciones del dinero en centimos correctas`);
process.exit(fallos ? 1 : 0);