/**
 * Prueba end-to-end del panel de fotos: subida con progreso, galeria, reordenacion,
 * texto alternativo, borrado y cabeceras. Usa el `api.ts` REAL contra el backend real.
 *
 * Node no tiene XMLHttpRequest, asi que se instala un shim sobre fetch (que si soporta FormData).
 * Los eventos de progreso que emite el shim son sinteticos: en el navegador salen de verdad del
 * upload de XHR, y lo que se comprueba aqui es que `api.ts` lostraduce bien y no rompe nada.
 */
const BASE = 'http://127.0.0.1:8099';
const realFetch = globalThis.fetch;
globalThis.fetch = (path, init) => realFetch(String(path).startsWith('/') ? BASE + path : path, init);

let progresoEmitido = false;
globalThis.XMLHttpRequest = class {
  constructor() { this.upload = {}; this.status = 0; this.responseText = ''; this.headers = {}; }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  async send(body) {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 2 });
    this.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 2 });
    progresoEmitido = true;
    const res = await realFetch(this.url.startsWith("/") ? BASE + this.url : this.url, { method: this.method, headers: this.headers, body });
    this.status = res.status;
    this.responseText = await res.text();
    this.onload?.();
  }
  abort() { this.onabort?.(); }
};

const { api } = await import(new URL('../Frontend/src/api.ts', import.meta.url).href);

const filas = [];
const ok = (n, d) => { filas.push(['OK', n]); console.log('  OK    ' + n.padEnd(54) + ' -> ' + d); };
const mal = (n, d) => { filas.push(['FALLO', n]); console.log('  FALLO ' + n.padEnd(54) + ' -> ' + d); };
const check = (n, cond, d) => (cond ? ok(n, d) : mal(n, d));
const eq = (n, actual, esperado) => check(n, JSON.stringify(actual) === JSON.stringify(esperado), JSON.stringify(actual) + (JSON.stringify(actual) === JSON.stringify(esperado) ? '' : ' != ' + JSON.stringify(esperado)));

const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const login = await realFetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'AuditPass2026' }) });
const { token } = await login.json();

console.log('\n== 1. Progreso de subida ==');
const p = await api.createProduct(token, { name: 'Prueba galeria ' + Date.now(), description: 'x', basePrice: 100, published: false });
ok('crear producto para la prueba', p.id.slice(0, 8));
const eventos = [];
await api.uploadImage(token, p.id, new File([png], 'a.png', { type: 'image/png' }), 'texto', (percent, loaded, total) => eventos.push([percent, loaded, total]));
check('uploadImage dispara el progreso', progresoEmitido && eventos.length === 2, JSON.stringify(eventos));
eq('el progreso llega como porcentaje 0-100', eventos.map((e) => e[0]), [50, 100]);

console.log('\n== 2. Galeria real ==');
const ids = [p.id];
const galeria = (await api.adminProducts(token)).find((x) => x.id === p.id);
eq('la primera foto subida es la portada', galeria.images.length, 1);
const nuevas = [];
for (const nombre of ['dos', 'tres']) {
  const res = await api.uploadImage(token, p.id, new File([png], nombre + '.png', { type: 'image/png' }), 'Foto ' + nombre);
  nuevas.push(res.id);
}
const idsFotos = [galeria.images[0].id, ...nuevas];
const trasSubir = (await api.adminProducts(token)).find((x) => x.id === p.id);
eq('las tres fotos estan en el producto', trasSubir.images.length, 3);
eq('ordenadas por sort_order', trasSubir.images.map((i) => i.sortOrder), [0, 1, 2]);
eq('la primera es la portada', trasSubir.images[0].id, idsFotos[0]);
eq('sizeBytes correcto en cada una', trasSubir.images.map((i) => i.sizeBytes), [png.length, png.length, png.length]);

console.log('\n== 3. Reordenar ==');
await api.reorderImages(token, p.id, [idsFotos[2], idsFotos[0], idsFotos[1]]);
const reordenado = (await api.adminProducts(token)).find((x) => x.id === p.id);
eq('el orden guardado se respeta', reordenado.images.map((i) => i.id), [idsFotos[2], idsFotos[0], idsFotos[1]]);
eq('la nueva portada es la tercera subida', reordenado.images[0].id, idsFotos[2]);
let fallo = '';
try { await api.reorderImages(token, p.id, [idsFotos[0]]); } catch (e) { fallo = e.message; }
check('una lista incompleta se rechaza con mensaje claro', /no coincide/.test(fallo), fallo.slice(0, 80));
let fallo2 = '';
try { await api.reorderImages(token, p.id, ['no-existe', idsFotos[0], idsFotos[1]]); } catch (e) { fallo2 = e.message; }
check('una foto ajena al producto se rechaza', /no coincide/.test(fallo2), fallo2.slice(0, 60));

console.log('\n== 4. Texto alternativo ==');
await api.setImageAlt(token, p.id, idsFotos[0], 'Camisa de lino, vista frontal');
const conAlt = (await api.adminProducts(token)).find((x) => x.id === p.id).images.find((i) => i.id === idsFotos[0]);
eq('el texto alternativo se guarda', conAlt.altText, 'Camisa de lino, vista frontal');
let fallo3 = '';
try { await api.setImageAlt(token, p.id, idsFotos[0], 'x'.repeat(201)); } catch (e) { fallo3 = e.message; }
check('texto alternativo de 201 caracteres se rechaza', /200 caracteres/.test(fallo3), fallo3.slice(0, 60));

console.log('\n== 5. Como se sirven ==');
const url = conAlt.url;
const head = await realFetch(url);
eq('las fotos se sirven con cache inmutable', head.headers.get('cache-control'), 'public, max-age=31536000, immutable');
eq('y con nosniff', head.headers.get('x-content-type-options'), 'nosniff');

console.log('\n== 6. Imagenes que no valen ==');
const subirRaw = async (nombre, tipo, datos) => {
  const fd = new FormData();
  fd.append('file', new Blob([datos], { type: tipo }), nombre);
  const res = await realFetch(BASE + '/api/admin/products/' + p.id + '/images', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  return { status: res.status, body: await res.text() };
};
let r = await subirRaw('nota.png', 'image/png', new TextEncoder().encode('esto no es una imagen'));
check('un .txt que dice ser .png se rechaza', r.status === 400, r.status + ' ' + r.body.slice(0, 60));
// PNG valido pero de 20000 px de ancho: la cabecera IHDR va en 16..20 y 20..24.
const enorme = new Uint8Array(png);
enorme.set([0x00, 0x4e, 0x20, 0x00], 16); // 20000 px de ancho
enorme.set([0x00, 0x00, 0x00, 0x14], 20); // 20 px de alto
r = await subirRaw('enorme.png', 'image/png', enorme);
check('una imagen de 20000 px de ancho se avisa', r.status === 400 && /20000x20/.test(r.body), r.status + ' ' + r.body.slice(0, 100));

console.log('\n== 7. Mensajes de error legibles en el panel ==');
await api.createProduct(token, { name: 'Duplicada ' + Date.now(), basePrice: 1, published: false });
const dup = (await api.adminProducts(token)).find((x) => /^Duplicada/.test(x.name));
let feo = '';
try { await api.createProduct(token, { name: dup.name, basePrice: 1, published: false }); } catch (e) { feo = e.message; }
check('un 409 se muestra como texto, no como JSON crudo', !feo.includes('{') && /Ya existe/.test(feo), feo.slice(0, 80));

// limpieza
const prod = (await api.adminProducts(token)).find((x) => x.id === p.id);
for (const img of prod?.images ?? []) await api.deleteImage(token, p.id, img.id).catch(() => {});
await api.deleteProduct(token, p.id);
await api.deleteProduct(token, dup.id);
for (const x of (await api.adminProducts(token)).filter((x) => /Prueba galeria|^Duplicada/.test(x.name))) {
  for (const img of x.images) await api.deleteImage(token, x.id, img.id).catch(() => {});
  await api.deleteProduct(token, x.id);
}
const quedan = (await api.adminProducts(token)).filter((x) => /Prueba galeria|^Duplicada/.test(x.name));
eq('limpieza: no quedan productos de prueba', quedan.length, 0);

const fallos = filas.filter((f) => f[0] === 'FALLO').length;
console.log(`\nRESULTADO: ${filas.length - fallos}/${filas.length} comprobaciones del panel de fotos correctas`);
process.exit(fallos ? 1 : 0);