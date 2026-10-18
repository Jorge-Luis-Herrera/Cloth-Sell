/**
 * Prueba de regresion del contrato de cabeceras de `api.ts`.
 *
 * Sin dependencias: se ejecuta con el Node 22 del repo mediante
 *   npm run test:api
 * o directamente
 *   node --experimental-strip-types src/api.test.mjs
 *
 * Que protege:
 *  - Que las llamadas con cuerpo JSON manden `Content-Type: application/json`.
 *    Si alguna vez vuelve el orden `{ headers: {...}, ...init }`, el backend responde 415
 *    a todas las escrituras del panel (crear/editar producto, tallas, estado de pedido).
 *  - Que las llamadas sin cuerpo (GET, DELETE) no manden Content-Type.
 *  - Que un 200 con cuerpo vacio no reviente con "Unexpected end of JSON input".
 *  - Que la subida de imagen NO lleve Content-Type manual: debe ganar el
 *    `multipart/form-data` con boundary que pone el navegador.
 *
 * `fetch` esta simulado, asi que no hace falta un backend arrancado.
 */
import assert from 'node:assert/strict';
import { api } from './api.ts';

const llamadas = [];
const fetchBase = async (path, init = {}) => {
  const headers = init.headers ?? {};
  const registro = { path: String(path), method: init.method ?? 'GET', headers, body: init.body };
  llamadas.push(registro);
  if (registro.metodo === 'DELETE') return { ok: true, status: 204, text: async () => '' };
  return { ok: true, status: 200, text: async () => '{"ok":true}' };
};
globalThis.fetch = fetchBase;

const ultima = () => llamadas[llamadas.length - 1];
const pruebas = [];
const probar = (nombre, fn) => pruebas.push([nombre, fn]);
const token = 'admin|123.firma';

probar('createProduct manda Content-Type: application/json', async () => {
  await api.createProduct(token, { name: 'Camisa', basePrice: 100, published: false });
  assert.equal(ultima().headers['Content-Type'], 'application/json');
});

probar('updateProduct manda Content-Type: application/json', async () => {
  await api.updateProduct(token, 'p1', { name: 'Camisa', basePrice: 100, published: true });
  assert.equal(ultima().headers['Content-Type'], 'application/json');
});

probar('saveVariant y updateVariant mandan Content-Type: application/json', async () => {
  await api.saveVariant(token, 'p1', { size: 'M', color: 'Negro', stockQuantity: 1, isActive: true });
  assert.equal(ultima().headers['Content-Type'], 'application/json');
  await api.updateVariant(token, 'p1', 'v1', { size: 'M', color: 'Negro', stockQuantity: 2, isActive: true });
  assert.equal(ultima().headers['Content-Type'], 'application/json');
});

probar('setStatus manda Content-Type: application/json', async () => {
  await api.setStatus(token, 'o1', 'Confirmed');
  assert.equal(ultima().headers['Content-Type'], 'application/json');
});

probar('las llamadas con Authorization siguen mandandolo', async () => {
  await api.createProduct(token, { name: 'Camisa', basePrice: 100, published: false });
  assert.equal(ultima().headers.Authorization, `Bearer ${token}`);
});

probar('las llamadas SIN cuerpo no mandan Content-Type', async () => {
  await api.adminProducts(token);
  assert.equal('Content-Type' in ultima().headers, false);
  await api.deleteProduct(token, 'p1');
  assert.equal('Content-Type' in ultima().headers, false);
});

probar('un 200 con cuerpo vacio devuelve null y no lanza', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => '' });
  assert.equal(await api.adminProducts(token), null);
});

probar('un 204 devuelve null', async () => {
  globalThis.fetch = async () => ({ ok: true, status: 204, text: async () => '' });
  assert.equal(await api.deleteProduct(token, 'p1'), null);
});

probar('un error sigue lanzando con el mensaje del servidor', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 400, text: async () => 'Ya existe un producto llamado X' });
  await assert.rejects(() => api.createProduct(token, { name: 'X', basePrice: 1, published: false }), /Ya existe un producto/);
});

probar('uploadImage NO manda Content-Type manual (gana el boundary del navegador)', async () => {
  // `upload()` usa XMLHttpRequest y no fetch: es lo unico que permite conocer el progreso de
  // subida, porque fetch solo avisa cuando la peticion ha terminado.
  const enviados = [];
  globalThis.XMLHttpRequest = class {
    constructor() { this.upload = {}; this.headers = {}; this.status = 0; this.responseText = ''; }
    open(m, url) { this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    send() {
      enviados.push(this);
      this.upload.onprogress?.({ lengthComputable: true, loaded: 30, total: 60 });
      this.status = 201;
      this.responseText = '{"id":"i1"}';
      this.onload?.();
    }
  };
  const porcentajes = [];
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'camisa.png');
  await api.uploadImage(token, 'p1', form.get('file'), 'Camisa', (percent) => porcentajes.push(percent));
  assert.equal('Content-Type' in enviados[0].headers, false, 'si se manda Content-Type a mano se rompe el boundary multipart');
  assert.equal(enviados[0].headers.Authorization, `Bearer ${token}`);
  assert.deepEqual(porcentajes, [50], 'el progreso se traduce a porcentaje entero');
  delete globalThis.XMLHttpRequest;
});

probar('un error de subida muestra el mensaje del servidor, no el JSON crudo', async () => {
  globalThis.XMLHttpRequest = class {
    open() {}
    setRequestHeader() {}
    send() { this.status = 409; this.responseText = '{"request":"Ya existe un producto llamado X"}'; this.onload?.(); }
  };
  await assert.rejects(() => api.uploadImage(token, 'p1', new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })), /Ya existe un producto llamado X/);
  delete globalThis.XMLHttpRequest;
});

probar('reorderImages y setImageAlt mandan el cuerpo JSON', async () => {
  await api.reorderImages(token, 'p1', ['a', 'b']);
  assert.equal(ultima().method, 'PATCH');
  assert.equal(ultima().headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(ultima().body), { ids: ['a', 'b'] });
  await api.setImageAlt(token, 'p1', 'a', 'Vista frontal');
  assert.equal(ultima().headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(ultima().body), { altText: 'Vista frontal' });
});

probar('products() pagina y filtra contra el servidor', async () => {
  await api.products();
  assert.equal(ultima().path, '/api/products', 'sin filtros no se mandan parametros vacios al catalogo');
  await api.products({ page: 3, pageSize: 12 });
  assert.equal(ultima().path, '/api/products?page=3&page_size=12');
  await api.products({ search: 'camisa de lino' });
  assert.equal(ultima().path, '/api/products?search=camisa+de+lino');
  await api.products({ search: '   ', page: 1 });
  assert.equal(ultima().path, '/api/products', 'una busqueda en blanco no genera una query');
  await api.products({ size: 'M', color: 'Negro' });
  assert.equal(ultima().path, '/api/products?size=M&color=Negro');
});

probar('products() NO manda Content-Type (es una lectura sin cuerpo)', async () => {
  await api.products({ page: 2 });
  assert.equal('Content-Type' in ultima().headers, false);
});

let fallos = 0;
for (const [nombre, fn] of pruebas) {
  // Cada prueba arranca con el fetch limpio: si una lo sustituye para simular un error, la
  // siguiente no debe heredar ese error (asi se colaba un fallo falso hace un momento).
  globalThis.fetch = fetchBase;
  delete globalThis.XMLHttpRequest;
  try {
    await fn();
    console.log(`  OK    ${nombre}`);
  } catch (e) {
    fallos += 1;
    console.log(`  FALLA ${nombre}\n         ${e.message}`);
  }
}
console.log(`\n${pruebas.length - fallos}/${pruebas.length} pruebas del contrato de api.ts correctas`);
process.exit(fallos ? 1 : 0);