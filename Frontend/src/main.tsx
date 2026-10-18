import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, Field, Input, Select, Spinner, Tab, TabList, Textarea, Toaster, useId, useToastController, Toast, ToastTitle } from '@fluentui/react-components';
import { STORE_CURRENCY, STORE_LOCALE, api, CartLine, Order, Product, Variant } from './api';
import { AdminApp } from './admin/AdminApp';
import './styles.css';

const money = (value: number) => new Intl.NumberFormat(STORE_LOCALE, { style: 'currency', currency: STORE_CURRENCY }).format(value);
const readCart = (): CartLine[] => { try { return JSON.parse(localStorage.getItem('jenny-cart') || '[]'); } catch { return []; } };

/** WhatsApp de la tienda: al confirmar pedido se manda el resumen por aqui. */
const WHATSAPP_NUMBER = '5354504048';

/** Texto del mensaje de WhatsApp con el pedido ya creado (lo que le llega a la tienda). */
const mensajeWhatsapp = (order: Order) => {
  const lineas = order.items.map(it => `• ${it.quantity} × ${it.name} (${it.size} / ${it.color}) — ${money(it.lineTotal)}`).join('\n');
  return `¡Hola Jenny! 🛍️ Confirmo el pedido #${order.id.slice(0, 8)}\n\n${lineas}\n\nTotal: ${money(order.total)}\n\n👤 ${order.customerName}\n📞 ${order.customerPhone}\n📍 ${order.deliveryAddress}${order.notes ? `\n📝 ${order.notes}` : ''}`;
};

const PAGE_SIZE = 12;

function Storefront() {
  const [products, setProducts] = useState<Product[]>([]), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [query, setQuery] = useState(''), [busqueda, setBusqueda] = useState(''), [total, setTotal] = useState(0), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false), [cart, setCart] = useState<CartLine[]>(readCart), [selected, setSelected] = useState<Record<string, string>>({}), [checkout, setCheckout] = useState(false), [sent, setSent] = useState(false);
  // Ficha de producto: abrir la imagen del catalogo muestra una hoja flotante con la foto y
  // los detalles delante; dentro de la hoja, tocar la foto alterna fotografia normal/ampliada.
  const [detail, setDetail] = useState<Product | null>(null), [zoomed, setZoomed] = useState(false);
  // GPS de la entrega: se pide con el boton del checkout, se previsualiza en el mapa
  // (embed de Google Maps) y viaja aparte de la direccion escrita en el pedido.
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  // Cartelito de confirmacion: pedido creado (respuesta del backend) resumen + WhatsApp.
  const [recibo, setRecibo] = useState<Order | null>(null);
  const toasterId = useId('toaster'), { dispatchToast } = useToastController(toasterId);
  const sentinel = useRef<HTMLDivElement>(null);

  /** Carga una pagina del catalogo. `append` la añade a lo ya visible («cargar más»), si no la
   *  reemplaza. El catalogo lo pagina y filtra el backend: antes se pedia una sola vez con un
   *  tope de 24 y los productos siguientes no existian para el navegador. */
  const loadPage = async (buscar: string, numero: number, append: boolean) => {
    const data = await api.products({ search: buscar, page: numero, pageSize: PAGE_SIZE });
    setProducts((current) => append ? [...current, ...data.items] : data.items);
    setTotal(data.total);
    setPage(data.page);
    setHasMore(data.hasMore ?? data.items.length > 0);
    return data;
  };

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    loadPage(busqueda, 1, false)
      .catch(() => { if (!cancelado) dispatchToast(<Toast><ToastTitle>No pudimos cargar el catálogo.</ToastTitle></Toast>, { intent: 'error' }); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [busqueda]);

  // Espera medio segundo tras escribir para no lanzar una peticion por cada tecla.
  useEffect(() => { const t = window.setTimeout(() => setBusqueda(query), 350); return () => window.clearTimeout(t); }, [query]);

  // La ficha se cierra con Escape, como en el resto de la web (para que no haya que cazar la X).
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try { await loadPage(busqueda, page + 1, true); } catch { dispatchToast(<Toast><ToastTitle>No pudimos cargar más prendas.</ToastTitle></Toast>, { intent: 'error' }); } finally { setLoadingMore(false); }
  };

  // Carga automática al llegar al final de la lista. El botón sigue ahí por si el navegador
  // no soporta IntersectionObserver o simplemente se prefiere pulsar.
  useEffect(() => {
    const nodo = sentinel.current;
    if (!nodo || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver((entradas) => { if (entradas[0].isIntersecting) void loadMore(); }, { rootMargin: '250px' });
    observador.observe(nodo);
    return () => observador.disconnect();
  });

  useEffect(() => localStorage.setItem('jenny-cart', JSON.stringify(cart)), [cart]);
  const totalCarrito = cart.reduce((sum, line) => sum + (line.variant.price * line.quantity), 0);
  const add = (product: Product, variant: Variant) => setCart(current => { const found = current.find(line => line.variant.id === variant.id); return found ? current.map(line => line.variant.id === variant.id ? { ...line, quantity: Math.min(line.quantity + 1, variant.stockQuantity) } : line) : [...current, { product, variant, quantity: 1 }]; });
  /** Captura la ubicacion GPS y la deja en el estado para el pedido. Si el cliente no la da,
   *  el pedido sale igual: solo pierde el punto del mapa. */
  const takeGps = () => {
    if (!('geolocation' in navigator)) { dispatchToast(<Toast><ToastTitle>Este navegador no da ubicación.</ToastTitle></Toast>, { intent: 'error' }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (error) => dispatchToast(
        <Toast><ToastTitle>{error.code === error.PERMISSION_DENIED ? 'No diste permiso a tu ubicación.' : 'No pudimos obtener tu ubicación.'}</ToastTitle></Toast>,
        { intent: 'error' }),
      { enableHighAccuracy: true, timeout: 20000 });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const address = String(data.get('address') ?? '').trim();
    // El GPS viaja DENTRO de deliveryAddress (aparte de lo escrito a mano), para que quede
    // registrado en el pedido sin cambiar el schema del backend.
    const gpsLine = gps ? `\n📍 GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (https://www.google.com/maps?q=${gps.lat},${gps.lng})` : '';
    try {
      const pedido = await api.order({ customerName: data.get('name'), customerPhone: data.get('phone'), deliveryAddress: address + gpsLine, notes: data.get('notes'), items: cart.map(line => ({ variantId: line.variant.id, quantity: line.quantity })) }) as Order | null;
      if (!pedido) throw new Error('El servidor no devolvió el pedido creado.');
      setCart([]); setCheckout(false); setSent(false); setGps(null); setRecibo(pedido);
    } catch (error) { dispatchToast(<Toast><ToastTitle>{error instanceof Error ? error.message : 'No se pudo crear el pedido.'}</ToastTitle></Toast>, { intent: 'error' }); }
  };
  return <><Toaster toasterId={toasterId} /><header className="topbar"><div className="brand"><span className="brand-mark">J</span><span>Jenny</span></div><nav><a href="#catalogo">Catálogo</a><a href="#historia">La colección</a></nav></header><main><section className="hero"><div><p className="eyebrow">NUEVA TEMPORADA / 2026</p><h1>Viste tu<br /><em>propio ritmo.</em></h1><p className="hero-copy">Prendas pensadas para acompañarte todos los días, con materiales honestos y detalles que se sienten tuyos.</p><Button appearance="primary" size="large" onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })}>Explorar colección ↓</Button></div><div className="hero-art"><div className="hero-shape">J</div><span>ESSENTIALS<br /><small>JENNY STUDIO</small></span></div></section><section id="catalogo" className="catalog"><div className="section-heading"><div><p className="eyebrow">CURATED FOR YOU</p><h2>Piezas para quedarte.</h2></div><Input aria-label="Buscar productos" placeholder="Buscar en la colección" value={query} onChange={(_, d) => setQuery(d.value)} /></div>{loading ? <Spinner label="Cargando colección" /> : products.length === 0 ? <p className="catalog-empty">{busqueda ? <>No hay prendas que cuenten con «{busqueda}».</> : 'Todavía no hay prendas publicadas.'}</p> : <div className="product-grid">{products.map(product => { const variant = product.variants.find(v => v.id === selected[product.id]) || product.variants[0]; return <Card className="product-card" key={product.id}><div className="product-image" role="button" tabIndex={0} aria-label={`Ver detalle de ${product.name}`} onClick={() => { setDetail(product); setZoomed(false); }} onKeyDown={e => { if (e.key === 'Enter') { setDetail(product); setZoomed(false); } }}>{product.images[0] ? <img src={product.images[0].url} alt={product.images[0].altText} /> : <span>{product.name.slice(0, 1)}</span>}<span className="tag">{variant?.stockQuantity ? 'Disponible' : 'Agotado'}</span></div><div className="product-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><strong>{money(variant?.price ?? product.basePrice)}</strong></div><div className="variant-row">{product.variants.map(v => <Button key={v.id} size="small" appearance={variant?.id === v.id ? 'primary' : 'outline'} disabled={!v.stockQuantity} onClick={() => setSelected({ ...selected, [product.id]: v.id })}>{v.size} / {v.color}</Button>)}</div><Button disabled={!variant?.stockQuantity} onClick={() => variant && add(product, variant)}>{variant?.stockQuantity ? 'Añadir al carrito' : 'Sin stock'}</Button></Card>})}</div>}
          <div className="catalog-more" ref={sentinel}>
            {loadingMore ? <Spinner size="tiny" label="Cargando más prendas" /> : hasMore ? <Button appearance="outline" onClick={() => void loadMore()}>Cargar más prendas</Button> : products.length > 0 && <p className="catalog-count">Has visto las {total} {total === 1 ? 'prenda' : 'prendas'} de la temporada.</p>}
          </div></section><section id="historia" className="manifesto"><p className="eyebrow">JENNY STUDIO</p><h2>Menos ruido.<br /><em>Más tú.</em></h2><p>Diseñamos con una idea sencilla: que abrir tu armario se sienta como volver a ti.</p></section></main>{detail && (() => { const sheetVariant = detail.variants.find(v => v.id === selected[detail.id]) || detail.variants[0];
  return <div className="sheet-veil" onClick={() => setDetail(null)}>
  <section className="sheet" role="dialog" aria-modal="true" aria-label={detail.name} onClick={e => e.stopPropagation()}>
    <button className="sheet-close" aria-label="Cerrar ficha de producto" onClick={() => setDetail(null)}>×</button>
    <div className={`sheet-photo${zoomed ? ' zoomed' : ''}`} title={zoomed ? 'Toca para reducir' : 'Toca para agrandar'} onClick={() => setZoomed(z => !z)}>
      {detail.images[0] ? <img src={detail.images[0].url} alt={detail.images[0].altText} /> : <span>{detail.name.slice(0, 1)}</span>}
    </div>
    <div className="sheet-info">
      <p className="eyebrow">JENNY STUDIO</p>
      <h3>{detail.name}</h3>
      <p>{detail.description}</p>
      <strong className="sheet-price">{money(sheetVariant?.price ?? detail.basePrice)}</strong>
      <div className="sheet-variants">{detail.variants.map(v => <Button key={v.id} size="small" appearance={sheetVariant?.id === v.id ? 'primary' : 'outline'} disabled={!v.stockQuantity} onClick={() => setSelected({ ...selected, [detail.id]: v.id })}>{v.size} / {v.color}</Button>)}</div>
      <Button appearance="primary" disabled={!sheetVariant?.stockQuantity} onClick={() => sheetVariant && add(detail, sheetVariant)}>{sheetVariant?.stockQuantity ? 'Añadir al carrito' : 'Sin stock'}</Button>
      <p className="sheet-hint">{sheetVariant?.stockQuantity ? `Disponible · ${sheetVariant.stockQuantity} en inventario` : 'Agotado'} · Toca la foto para agrandar o reducir.</p>
    </div>
  </section></div>; })()}
  {recibo && <div className="sheet-veil" onClick={() => setRecibo(null)}>
  <section className="sheet receipt" role="dialog" aria-modal="true" aria-label="Pedido confirmado" onClick={e => e.stopPropagation()}>
    <button className="sheet-close" aria-label="Cerrar resumen de pedido" onClick={() => setRecibo(null)}>×</button>
    <div className="sheet-info">
      <p className="eyebrow">PEDIDO CONFIRMADO</p>
      <h3>Pedido #{recibo.id.slice(0, 8)}</h3>
      <ul className="recibo-lines">
        {recibo.items.map(it => <li key={`${it.name}-${it.size}-${it.color}`}><span>{it.quantity} × {it.name} <small>{it.size} / {it.color}</small></span><strong>{money(it.lineTotal)}</strong></li>)}
      </ul>
      <strong className="sheet-price">Total: {money(recibo.total)}</strong>
      <p className="sheet-hint">👤 {recibo.customerName} · 📞 {recibo.customerPhone}</p>
      <p className="recibo-address">{recibo.deliveryAddress}</p>
      <Button appearance="primary" onClick={() => window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(mensajeWhatsapp(recibo))}`, '_blank')}>Enviar pedido por WhatsApp 💬</Button>
      <p className="sheet-hint">Se abre el chat de la tienda ({WHATSAPP_NUMBER}) con el detalle ya escrito: revísalo y mándalo.</p>
    </div>
  </section></div>}
  <aside className={`cart-drawer ${cart.length || checkout ? 'open' : ''}`}><div className="cart-head"><h2>{checkout ? 'Finalizar pedido' : `Tu selección (${cart.length})`}</h2><Button appearance="subtle" onClick={() => { setCheckout(false); setCart([]); setGps(null); }}>Vaciar</Button></div>{checkout ? <form onSubmit={submit} className="checkout-form"><Field label="Nombre" required><Input name="name" required /></Field><Field label="Teléfono" required><Input name="phone" required /></Field><Field label="Dirección de entrega" required><Textarea name="address" required /></Field>
<div className="gps-block">
  <Button type="button" appearance="outline" onClick={takeGps}>{gps ? '📍 Repetir ubicación GPS' : '📍 Usar mi ubicación GPS'}</Button>
  {gps && <iframe className="gps-map" title="Punto de entrega en el mapa" src={`https://maps.google.com/maps?q=${gps.lat},${gps.lng}&z=15&output=embed`} loading="lazy" />}
  <p className="gps-hint">{gps ? <>Punto de entrega adjunto ✓ — <a href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`} target="_blank" rel="noreferrer">abrir en Google Maps</a></> : 'Opcional: adjunta tu punto en el mapa para que la entrega te encuentre justo ahí.'}</p>
</div>
<Field label="Notas"><Textarea name="notes" /></Field><Button appearance="primary" type="submit">Confirmar pedido · {money(totalCarrito)}</Button></form> : <>{cart.map(line => <div className="cart-line" key={line.variant.id}><span>{line.product.name}<small>{line.variant.size} / {line.variant.color}</small></span><strong>{line.quantity} × {money(line.variant.price)}</strong></div>)}{cart.length > 0 && <Button appearance="primary" onClick={() => setCheckout(true)}>Continuar · {money(totalCarrito)}</Button>}{sent && <p className="success">Pedido recibido. Te contactaremos pronto.</p>}</>}</aside></>;
}

/** El panel ya no tiene boton en la web: se entra por la URL /#admin y se sale cerrando sesion
 *  (o editando la URL). Asi la puerta existe, pero no queda a la vista de cualquier visitante. */
function App() {
  const esRutaAdmin = () => window.location.hash === '#admin';
  const [admin, setAdmin] = useState(esRutaAdmin);
  useEffect(() => {
    const onHash = () => setAdmin(esRutaAdmin());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Al salir del panel (p. ej. tras cerrar sesion) limpiamos el #admin para que una recarga
  // no devuelva al panel por accidente.
  useEffect(() => { if (!admin && esRutaAdmin()) history.replaceState(null, '', location.pathname + location.search); }, [admin]);
  return admin ? <AdminApp /> : <Storefront />;
}
createRoot(document.getElementById('root')!).render(<App />);
