/**
 * Prueba de la paginacion del catalogo: se crean muchos productos y se comprueba que la tienda
 * los va mostrando todos, que la busqueda y los filtros funcionan en el servidor y que el coste
 * ya no crece con el numero de productos.
 */
const BASE = 'http://127.0.0.1:8099';
const realFetch = globalThis.fetch;
globalThis.fetch = (path, init) => realFetch(String(path).startsWith('/') ? BASE + path : path, init);
const { api } = await import(new URL('../Frontend/src/api.ts', import.meta.url).href);

const filas = [];
const ok = (n, d) => { filas.push(['OK', n]); console.log('  OK    ' + n.padEnd(56) + ' -> ' + d); };
const mal = (n, d) => { filas.push(['FALLO', n]); console.log('  FALLO ' + n.padEnd(56) + ' -> ' + d); };
const check = (n, c, d) => (c ? ok(n, d) : mal(n, d));
const eq = (n, a, e) => check(n, JSON.stringify(a) === JSON.stringify(e), JSON.stringify(a) + (JSON.stringify(a) === JSON.stringify(e) ? '' : ' != ' + JSON.stringify(e)));

const login = await realFetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'AuditPass2026' }) });
const { token } = await login.json();
const MARCA = 'ZZP' + Date.now();
const NOMBRES = { 0: 'Camisa', 1: 'Pantalon', 2: 'Vestido', 3: 'Bolsa', 4: 'Bufanda', 5: 'Zapatos' };

console.log('\n== 1. Crear catalogo grande ==');
const creados = [];
for (let i = 0; i < 30; i++) {
  const nombre = `${NOMBRES[i % 6]} ${MARCA} ${i}`;
  const p = await api.createProduct(token, { name: nombre, description: 'Prenda de prueba ' + i, basePrice: 20 + i, published: true });
  creados.push(p.id);
  await api.saveVariant(token, p.id, { size: i % 2 ? 'M' : 'L', color: i % 3 ? 'Negro' : 'Blanco', stockQuantity: 5, isActive: true });
}
ok('productos publicados creados', creados.length);
const primera = await api.products({ pageSize: 12 });
check('la primera pagina trae 12', primera.items.length, 12);
eq('el total anuncia los 30', primera.total, 30);
eq('dice que hay mas', primera.hasMore, true);
eq('la pagina actual es la 1', primera.page, 1);

console.log('\n== 2. Recorrer todo el catalogo como haria la tienda ==');
let vistos = [];
let pagina = 1;
for (;;) {
  const p = await api.products({ page: pagina, pageSize: 12 });
  vistos.push(...p.items.map((x) => x.id));
  if (!p.hasMore) break;
  pagina += 1;
  if (pagina > 10) break;
}
eq('la tienda alcanza los 30 productos con 3 paginas', pagina, 3);
eq('y son todos distintos', new Set(vistos).size, 30);
eq('sin repetidos entre paginas', vistos.length, 30);

console.log('\n== 3. Sin huecos ni solapamientos ==');
const vista = await api.products({ pageSize: 100 });
eq('una pagina de 100 lo trae todo', vista.items.length, 30);
const ordenA = vista.items.map((x) => x.id);
const ordenB = [];
for (let i = 1; i <= 3; i++) { const p = await api.products({ page: i, pageSize: 12 }); ordenB.push(...p.items.map((x) => x.id)); }
eq('paginar da el mismo orden que traerlo todo', ordenB, ordenA);
eq('cada producto trae sus tallas', vista.items.every((x) => x.variants.length === 1), true);

console.log('\n== 4. Busqueda en el servidor ==');
const buscar = await api.products({ search: 'Camisa ' + MARCA, pageSize: 100 });
eq('buscar por nombre filtra en el servidor', buscar.total, 5);
eq('y devuelve solo los que coinciden', buscar.items.every((x) => x.name.includes('Camisa')), true);
const conTilde = await api.products({ search: 'prenda de prueba 7', pageSize: 100 });
eq('buscar en la descripcion tambien', conTilde.total, 1);
const nada = await api.products({ search: 'esto-no-existe-xyz' });
eq('una busqueda sin resultados da 0 y lista vacia', [nada.total, nada.items.length, nada.hasMore], [0, 0, false]);

console.log('\n== 5. Filtros por talla y color ==');
const porTalla = await api.products({ size: 'L', pageSize: 100 });
eq('filtrar por talla L', porTalla.total, 15);
const porColor = await api.products({ color: 'Blanco', pageSize: 100 });
eq('filtrar por color Blanco', porColor.total, 10);
eq('talla + color a la vez', (await api.products({ size: 'M', color: 'Blanco', pageSize: 100 })).total, 5);
eq('una talla que no existe da 0', (await api.products({ size: 'XXXL', pageSize: 100 })).total, 0);

console.log('\n== 6. Parametros absurdos ==');
eq('page=0 se corrige a 1', (await api.products({ page: 0 })).page, 1);
eq('page=-5 se corrige a 1', (await api.products({ page: -5 })).page, 1);
eq('page=99999 da lista vacia pero total real', (await api.products({ page: 99999 })).items.length, 0);
eq('pageSize=10000 se acota a 60', (await api.products({ pageSize: 10000 })).pageSize, 60);
eq('busqueda con espacios sobrantes se ignora', (await api.products({ search: '   ' })).total, 30);

console.log('\n== 7. Rendimiento (ya no debe crecer con el catalogo) ==');
const medir = async (q) => { const t = Date.now(); await api.products(q); return Date.now() - t; };
await medir({ pageSize: 12 });
const t1 = await medir({ pageSize: 12 });
const t2 = await medir({ pageSize: 12 });
const t100 = await medir({ pageSize: 100 });
console.log(`     pagina de 12: ${t1} ms y ${t2} ms · pagina de 100: ${t100} ms`);
check('pedir 12 productos cuesta lo mismo (o menos) que pedir 100', t1 + t2 < t100 + 12, `${t1 + t2} ms vs ${t100} ms`);
const tBusqueda = await medir({ search: 'Camisa ' + MARCA, pageSize: 12 });
check('la busqueda no encarece', tBusqueda < 60, tBusqueda + ' ms');

// limpieza
const todos = await api.adminProducts(token);
for (const p of todos.filter((x) => x.name.includes(MARCA))) await api.deleteProduct(token, p.id);
eq('limpieza: no quedan productos de prueba', (await api.adminProducts(token)).filter((x) => x.name.includes(MARCA)).length, 0);

const fallos = filas.filter((f) => f[0] === 'FALLO').length;
console.log(`\nRESULTADO: ${filas.length - fallos}/${filas.length} comprobaciones de la paginacion correctas`);
process.exit(fallos ? 1 : 0);