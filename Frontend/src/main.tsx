import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, Field, Input, Select, Spinner, Tab, TabList, Textarea, Toaster, useId, useToastController, Toast, ToastTitle } from '@fluentui/react-components';
import { STORE_CURRENCY, STORE_LOCALE, api, CartLine, Product, Variant } from './api';
import { AdminApp } from './admin/AdminApp';
import './styles.css';

const money = (value: number) => new Intl.NumberFormat(STORE_LOCALE, { style: 'currency', currency: STORE_CURRENCY }).format(value);
const readCart = (): CartLine[] => { try { return JSON.parse(localStorage.getItem('jenny-cart') || '[]'); } catch { return []; } };

const PAGE_SIZE = 12;

function Storefront({ onAdmin }: { onAdmin: () => void }) {
  const [products, setProducts] = useState<Product[]>([]), [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false), [query, setQuery] = useState(''), [busqueda, setBusqueda] = useState(''), [total, setTotal] = useState(0), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false), [cart, setCart] = useState<CartLine[]>(readCart), [selected, setSelected] = useState<Record<string, string>>({}), [checkout, setCheckout] = useState(false), [sent, setSent] = useState(false);
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
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); try { await api.order({ customerName: data.get('name'), customerPhone: data.get('phone'), deliveryAddress: data.get('address'), notes: data.get('notes'), items: cart.map(line => ({ variantId: line.variant.id, quantity: line.quantity })) }); setCart([]); setSent(true); setCheckout(false); } catch (error) { dispatchToast(<Toast><ToastTitle>{error instanceof Error ? error.message : 'No se pudo crear el pedido.'}</ToastTitle></Toast>, { intent: 'error' }); } };
  return <><Toaster toasterId={toasterId} /><header className="topbar"><div className="brand"><span className="brand-mark">J</span><span>Jenny</span></div><nav><a href="#catalogo">Catálogo</a><a href="#historia">La colección</a><Button appearance="subtle" onClick={onAdmin}>Admin</Button></nav></header><main><section className="hero"><div><p className="eyebrow">NUEVA TEMPORADA / 2026</p><h1>Viste tu<br /><em>propio ritmo.</em></h1><p className="hero-copy">Prendas pensadas para acompañarte todos los días, con materiales honestos y detalles que se sienten tuyos.</p><Button appearance="primary" size="large" onClick={() => document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })}>Explorar colección ↓</Button></div><div className="hero-art"><div className="hero-shape">J</div><span>ESSENTIALS<br /><small>JENNY STUDIO</small></span></div></section><section id="catalogo" className="catalog"><div className="section-heading"><div><p className="eyebrow">CURATED FOR YOU</p><h2>Piezas para quedarte.</h2></div><Input aria-label="Buscar productos" placeholder="Buscar en la colección" value={query} onChange={(_, d) => setQuery(d.value)} /></div>{loading ? <Spinner label="Cargando colección" /> : products.length === 0 ? <p className="catalog-empty">{busqueda ? <>No hay prendas que cuenten con «{busqueda}».</> : 'Todavía no hay prendas publicadas.'}</p> : <div className="product-grid">{products.map(product => { const variant = product.variants.find(v => v.id === selected[product.id]) || product.variants[0]; return <Card className="product-card" key={product.id}><div className="product-image">{product.images[0] ? <img src={product.images[0].url} alt={product.images[0].altText} /> : <span>{product.name.slice(0, 1)}</span>}<span className="tag">{variant?.stockQuantity ? 'Disponible' : 'Agotado'}</span></div><div className="product-info"><div><h3>{product.name}</h3><p>{product.description}</p></div><strong>{money(variant?.price ?? product.basePrice)}</strong></div><div className="variant-row">{product.variants.map(v => <Button key={v.id} size="small" appearance={variant?.id === v.id ? 'primary' : 'outline'} disabled={!v.stockQuantity} onClick={() => setSelected({ ...selected, [product.id]: v.id })}>{v.size} / {v.color}</Button>)}</div><Button disabled={!variant?.stockQuantity} onClick={() => variant && add(product, variant)}>{variant?.stockQuantity ? 'Añadir al carrito' : 'Sin stock'}</Button></Card>})}</div>}
          <div className="catalog-more" ref={sentinel}>
            {loadingMore ? <Spinner size="tiny" label="Cargando más prendas" /> : hasMore ? <Button appearance="outline" onClick={() => void loadMore()}>Cargar más prendas</Button> : products.length > 0 && <p className="catalog-count">Has visto las {total} {total === 1 ? 'prenda' : 'prendas'} de la temporada.</p>}
          </div></section><section id="historia" className="manifesto"><p className="eyebrow">JENNY STUDIO</p><h2>Menos ruido.<br /><em>Más tú.</em></h2><p>Diseñamos con una idea sencilla: que abrir tu armario se sienta como volver a ti.</p></section></main><aside className={`cart-drawer ${cart.length || checkout ? 'open' : ''}`}><div className="cart-head"><h2>{checkout ? 'Finalizar pedido' : `Tu selección (${cart.length})`}</h2><Button appearance="subtle" onClick={() => { setCheckout(false); setCart([]); }}>Vaciar</Button></div>{checkout ? <form onSubmit={submit} className="checkout-form"><Field label="Nombre" required><Input name="name" required /></Field><Field label="Teléfono" required><Input name="phone" required /></Field><Field label="Dirección de entrega" required><Textarea name="address" required /></Field><Field label="Notas"><Textarea name="notes" /></Field><Button appearance="primary" type="submit">Confirmar pedido · {money(totalCarrito)}</Button></form> : <>{cart.map(line => <div className="cart-line" key={line.variant.id}><span>{line.product.name}<small>{line.variant.size} / {line.variant.color}</small></span><strong>{line.quantity} × {money(line.variant.price)}</strong></div>)}{cart.length > 0 && <Button appearance="primary" onClick={() => setCheckout(true)}>Continuar · {money(totalCarrito)}</Button>}{sent && <p className="success">Pedido recibido. Te contactaremos pronto.</p>}</>}</aside></>;
}

function App() { const [admin, setAdmin] = useState(false); return admin ? <AdminApp /> : <Storefront onAdmin={() => setAdmin(true)} />; }
createRoot(document.getElementById('root')!).render(<App />);
