import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Field, Input, Select, Spinner, Tab, TabList, Textarea, Toaster, useId, useToastController, Toast, ToastTitle } from '@fluentui/react-components';
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

/** Tarjeta del catálogo hecha a mano (sin el <Card> de Fluent, que imponía su
 *  propio border-radius de 4px y dejaba las esquinas puntiagudas). Es puro React +
 *  CSS: esquinas redondeadas, sombra suave, imagen que hace zoom al pasar el ratón
 *  y las imágenes en `loading="lazy"` para no perder velocidad de carga. */
function ProductCard({ product, variant, activeVariantId, onOpen, onSelectVariant, onAdd }: {
  product: Product; variant?: Variant; activeVariantId?: string;
  onOpen: () => void; onSelectVariant: (id: string) => void; onAdd: () => void;
}) {
  const disponible = !!variant?.stockQuantity;
  return (
    <article className="pcard">
      <button type="button" className="pcard-media" aria-label={`Ver detalle de ${product.name}`} onClick={onOpen}>
        {product.images[0]
          ? <img src={product.images[0].url} alt={product.images[0].altText} loading="lazy" decoding="async" />
          : <span className="pcard-initial">{product.name.slice(0, 1)}</span>}
        <span className="pcard-badge" data-off={!disponible}>{disponible ? 'Disponible' : 'Agotado'}</span>
        <span className="pcard-hint">Ver detalles</span>
      </button>
      <div className="pcard-body">
        <h3 className="pcard-name">{product.name}</h3>
        {product.description ? <p className="pcard-desc">{product.description}</p> : null}
        {product.variants.length > 0 && (
          <div className="pcard-variants">
            {product.variants.map(v => (
              <button type="button" key={v.id} className="pcard-chip" data-on={activeVariantId === v.id} disabled={!v.stockQuantity} onClick={() => onSelectVariant(v.id)}>{v.size} / {v.color}</button>
            ))}
          </div>
        )}
        <div className="pcard-foot">
          <strong className="pcard-price">{money(variant?.price ?? product.basePrice)}</strong>
          <button type="button" className="pcard-add" disabled={!disponible} onClick={onAdd}>{disponible ? 'Añadir' : 'Sin stock'}</button>
        </div>
      </div>
    </article>
  );
}

function Storefront() {
  const [products, setProducts] = useState<Product[]>([]), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [query, setQuery] = useState(''), [busqueda, setBusqueda] = useState(''), [total, setTotal] = useState(0), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false), [cart, setCart] = useState<CartLine[]>(readCart), [selected, setSelected] = useState<Record<string, string>>({}), [checkout, setCheckout] = useState(false), [sent, setSent] = useState(false);
  // El carrito es un panel flotante: se abre al añadir una prenda, se cierra con la cruz
  // (por si no quieres pedir) y se vuelve a abrir con el botón de la bolsa.
  const [cartOpen, setCartOpen] = useState(false);
  // Ficha de producto: abrir la imagen del catalogo muestra una hoja flotante con la foto y
  // los detalles delante; dentro de la hoja, tocar la foto abre la imagen completa en pantalla.
  const [detail, setDetail] = useState<Product | null>(null), [foto, setFoto] = useState<string | null>(null);
  // GPS de la entrega: se pide con el boton del checkout, se previsualiza en el mapa
  // (embed de Google Maps) y viaja aparte de la direccion escrita en el pedido.
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  // Plan B de la ubicación: si el equipo no logra ubicar al cliente, se muestran las
  // coordenadas pegadas a mano (de Google Maps) para no perder el punto de entrega.
  const [gpsError, setGpsError] = useState<string | null>(null), [gpsManual, setGpsManual] = useState('');
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

  // Escape cierra por capas: primero la foto completa, luego la ficha.
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (foto) setFoto(null); else setDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail, foto]);

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
  // Si el pedido se queda sin prendas, el panel se esconde solo.
  useEffect(() => { if (cart.length === 0 && !checkout) setCartOpen(false); }, [cart.length, checkout]);
  const totalCarrito = cart.reduce((sum, line) => sum + (line.variant.price * line.quantity), 0);
  const add = (product: Product, variant: Variant) => { setCart(current => { const found = current.find(line => line.variant.id === variant.id); return found ? current.map(line => line.variant.id === variant.id ? { ...line, quantity: Math.min(line.quantity + 1, variant.stockQuantity) } : line) : [...current, { product, variant, quantity: 1 }]; }); setCartOpen(true); };
  /** Sube o baja la cantidad de una línea; si llega a cero, la quita del pedido. */
  const changeQty = (variantId: string, delta: number) => setCart(current => current.flatMap(line => { if (line.variant.id !== variantId) return [line]; const next = Math.min(Math.max(line.quantity + delta, 0), Math.max(line.variant.stockQuantity, 1)); return next <= 0 ? [] : [{ ...line, quantity: next }]; }));
  /** Quita una prenda entera del pedido. */
  const removeLine = (variantId: string) => setCart(current => current.filter(line => line.variant.id !== variantId));
  /** Ubica al cliente en dos intentos: primero por red (rápido, y sí funciona en laptops sin
   *  GPS), y si falla con alta precisión. Como último recurso, se ofrecen las coordenadas pegadas
   *  a mano: así el punto de entrega no se pierde aunque el equipo no sepa dónde está. */
  const takeGps = async () => {
    if (!('geolocation' in navigator)) { setGpsError('Este navegador no da ubicación. Pega las coordenadas a mano.'); return; }
    setGpsError(null);
    const pedir = (opciones: PositionOptions) => new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, opciones));
    const intentos: PositionOptions[] = [{ enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }];
    let ultimo: GeolocationPositionError | null = null;
    for (const intento of intentos) {
      try { const pos = await pedir(intento); setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); return; }
      catch (e) { ultimo = e as GeolocationPositionError; if (ultimo.code === 1) break; }
    }
    const aviso = ultimo?.code === 1
      ? 'Bloqueaste el permiso de ubicación. Actívalo desde el candado de la barra de direcciones, o pega las coordenadas a mano.'
      : 'Tu equipo no pudo ubicarte automáticamente (pasa en laptops sin GPS). Pega las coordenadas de Google Maps a mano.';
    setGpsError(aviso);
    dispatchToast(<Toast><ToastTitle>{aviso}</ToastTitle></Toast>, { intent: 'error' });
  };
  /** Toma coordenadas pegadas a mano: sirve «23.1136, -82.3666» o un enlace de Google Maps. */
  const usarGpsManual = () => {
    const m = gpsManual.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)/);
    if (!m) { dispatchToast(<Toast><ToastTitle>Pega algo como «23.1136, -82.3666».</ToastTitle></Toast>, { intent: 'error' }); return; }
    setGps({ lat: Number(m[1]), lng: Number(m[2]) });
    setGpsError(null); setGpsManual('');
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
  return <><Toaster toasterId={toasterId} /><header className="topbar"><div className="brand"><span className="brand-mark">J</span><span>Jenny</span></div><nav><a href="#catalogo">Catálogo</a><a href="#historia">La colección</a></nav></header><main><section className="hero"><div><p className="eyebrow">NUEVA TEMPORADA / 2026</p><h1>Viste tu<br /><em>propio ritmo.</em></h1><p className="hero-copy">Prendas pensadas para acompañarte todos los días, con materiales honestos y detalles que se sienten tuyos.</p><Button appearance="primary" size="large" onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })}>Explorar colección ↓</Button></div><div className="hero-art"><div className="hero-shape">J</div><span>ESSENTIALS<br /><small>JENNY STUDIO</small></span></div></section><section id="catalogo" className="catalog"><div className="section-heading"><div><p className="eyebrow">CURATED FOR YOU</p><h2>Piezas para quedarte.</h2></div><Input aria-label="Buscar productos" placeholder="Buscar en la colección" value={query} onChange={(_, d) => setQuery(d.value)} /></div>{loading ? <Spinner label="Cargando colección" /> : products.length === 0 ? <p className="catalog-empty">{busqueda ? <>No hay prendas que cuenten con «{busqueda}».</> : 'Todavía no hay prendas publicadas.'}</p> : <div className="product-grid">{products.map(product => { const variant = product.variants.find(v => v.id === selected[product.id]) || product.variants[0]; return <ProductCard key={product.id} product={product} variant={variant} activeVariantId={variant?.id} onOpen={() => setDetail(product)} onSelectVariant={id => setSelected({ ...selected, [product.id]: id })} onAdd={() => { if (variant) add(product, variant); }} />})}</div>}
          <div className="catalog-more" ref={sentinel}>
            {loadingMore ? <Spinner size="tiny" label="Cargando más prendas" /> : hasMore ? <Button appearance="outline" onClick={() => void loadMore()}>Cargar más prendas</Button> : products.length > 0 && <p className="catalog-count">Has visto las {total} {total === 1 ? 'prenda' : 'prendas'} de la temporada.</p>}
          </div></section><section id="historia" className="manifesto"><p className="eyebrow">JENNY STUDIO</p><h2>Menos ruido.<br /><em>Más tú.</em></h2><p>Diseñamos con una idea sencilla: que abrir tu armario se sienta como volver a ti.</p></section></main>{detail && (() => { const sheetVariant = detail.variants.find(v => v.id === selected[detail.id]) || detail.variants[0];
  return <div className="sheet-veil" onClick={() => setDetail(null)}>
  <section className="sheet" role="dialog" aria-modal="true" aria-label={detail.name} onClick={e => e.stopPropagation()}>
    <button className="sheet-close" aria-label="Cerrar ficha de producto" onClick={() => setDetail(null)}>×</button>
    <div className="sheet-photo" title="Toca para verla completa en pantalla" onClick={() => { if (detail.images[0]) setFoto(detail.images[0].url); }}>
      {detail.images[0] ? <img src={detail.images[0].url} alt={detail.images[0].altText} /> : <span>{detail.name.slice(0, 1)}</span>}
    </div>
    <div className="sheet-info">
      <p className="eyebrow">JENNY STUDIO</p>
      <h3>{detail.name}</h3>
      <p>{detail.description}</p>
      <strong className="sheet-price">{money(sheetVariant?.price ?? detail.basePrice)}</strong>
      <div className="sheet-variants">{detail.variants.map(v => <Button key={v.id} size="small" appearance={sheetVariant?.id === v.id ? 'primary' : 'outline'} disabled={!v.stockQuantity} onClick={() => setSelected({ ...selected, [detail.id]: v.id })}>{v.size} / {v.color}</Button>)}</div>
      <Button appearance="primary" disabled={!sheetVariant?.stockQuantity} onClick={() => sheetVariant && add(detail, sheetVariant)}>{sheetVariant?.stockQuantity ? 'Añadir al carrito' : 'Sin stock'}</Button>
      <p className="sheet-hint">{sheetVariant?.stockQuantity ? `Disponible · ${sheetVariant.stockQuantity} en inventario` : 'Agotado'} · Toca la foto para verla completa en pantalla.</p>
    </div>
  </section></div>; })()}
  {foto && <div className="lightbox" onClick={() => setFoto(null)}>
    <button className="lightbox-close" aria-label="Cerrar foto" onClick={() => setFoto(null)}>×</button>
    <img src={foto} alt={detail?.name ?? ''} onClick={e => e.stopPropagation()} />
  </div>}
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
  <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`} aria-label="Carrito">
  <div className="cart-top">
    <div>
      <p className="eyebrow">{checkout ? 'ÚLTIMO PASO' : 'TU PEDIDO'}</p>
      <h2>{checkout ? 'Finalizar pedido' : 'Tu selección'}</h2>
    </div>
    <button type="button" className="cart-close" aria-label="Cerrar carrito" onClick={() => { setCartOpen(false); setCheckout(false); }}>×</button>
  </div>
  {checkout ? <form onSubmit={submit} className="cart-form">
    <Field label="Nombre" required><Input name="name" required /></Field>
    <Field label="Teléfono" required><Input name="phone" required /></Field>
    <Field label="Dirección de entrega" required><Textarea name="address" required /></Field>
    <div className="gps-block">
      <Button type="button" appearance="outline" onClick={() => void takeGps()}>{gps ? '📍 Repetir ubicación GPS' : '📍 Usar mi ubicación GPS'}</Button>
      {gps && <iframe className="gps-map" title="Punto de entrega en el mapa" src={`https://maps.google.com/maps?q=${gps.lat},${gps.lng}&z=15&output=embed`} loading="lazy" />}
      {gps ? <p className="gps-hint">Punto de entrega adjunto ✓ — <a href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`} target="_blank" rel="noreferrer">abrir en Google Maps</a></p> : <>
        {gpsError && <p className="gps-hint gps-error">{gpsError}</p>}
        <p className="gps-hint">Opcional: si tu equipo no te ubica, abre <a href="https://www.google.com/maps" target="_blank" rel="noreferrer">Google Maps</a>, mantén pulsado tu punto y pega aquí las coordenadas.</p>
        <div className="gps-manual">
          <Input aria-label="Coordenadas de entrega" placeholder="23.1136, -82.3666" value={gpsManual} onChange={(_, d) => setGpsManual(d.value)} />
          <Button type="button" appearance="outline" onClick={usarGpsManual} disabled={!gpsManual.trim()}>Usar</Button>
        </div>
      </>}
    </div>
    <Field label="Notas"><Textarea name="notes" /></Field>
    <div className="cart-foot">
      <div className="cart-total"><span>Total</span><strong>{money(totalCarrito)}</strong></div>
      <button type="submit" className="cart-cta">Confirmar pedido · {money(totalCarrito)}</button>
      <button type="button" className="cart-cancel" onClick={() => setCheckout(false)}>← Volver al carrito</button>
    </div>
  </form> : <>
    {cart.length === 0 ? <p className="cart-empty">Tu selección está vacía.<br />Toca una prenda para añadirla.</p> : <ul className="cart-items">
      {cart.map(line => <li className="cart-item" key={line.variant.id}>
        <div className="cart-thumb">{line.product.images[0] ? <img src={line.product.images[0].url} alt="" loading="lazy" /> : <span>{line.product.name.slice(0, 1)}</span>}</div>
        <div className="cart-item-info">
          <strong>{line.product.name}</strong>
          <small>{line.variant.size} / {line.variant.color}</small>
          <div className="cart-qty">
            <button type="button" aria-label="Quitar una unidad" onClick={() => changeQty(line.variant.id, -1)}>−</button>
            <span>{line.quantity}</span>
            <button type="button" aria-label="Añadir una unidad" disabled={line.quantity >= line.variant.stockQuantity} onClick={() => changeQty(line.variant.id, 1)}>+</button>
          </div>
        </div>
        <div className="cart-item-price">
          <strong>{money(line.variant.price * line.quantity)}</strong>
          <small>{money(line.variant.price)} c/u</small>
          <button type="button" className="cart-remove" onClick={() => removeLine(line.variant.id)}>Quitar</button>
        </div>
      </li>)}
    </ul>}
    {sent && <p className="success">Pedido recibido. Te contactaremos pronto.</p>}
    {cart.length > 0 && <div className="cart-foot">
      <div className="cart-total"><span>Total</span><strong>{money(totalCarrito)}</strong></div>
      <button type="button" className="cart-cta" onClick={() => setCheckout(true)}>Continuar · {money(totalCarrito)}</button>
    </div>}
  </>}
</aside>
{cart.length > 0 && !cartOpen && <button type="button" className="cart-fab" aria-label={`Abrir carrito (${cart.length})`} onClick={() => setCartOpen(true)}>🛍️<span>{cart.length}</span></button>}</>;
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
