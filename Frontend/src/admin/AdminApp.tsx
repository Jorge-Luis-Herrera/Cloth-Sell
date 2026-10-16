import { useCallback, useEffect, useState } from 'react';
import { api, type Order, type Product } from '../api';
import { OrdersTab } from './OrdersTab';
import { ProductDialog } from './ProductDialog';
import { ProductsTab } from './ProductsTab';
import { ToastProvider, useToast } from './ui';

const TOKEN_KEY = 'jenny-admin-token';
type Tab = 'products' | 'orders';

function Login({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.login(password);
      localStorage.setItem(TOKEN_KEY, result.token);
      onAuthenticated(result.token);
    } catch {
      setError('Contrasena incorrecta.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-login-wrap">
      <form className="adm-login" onSubmit={submit}>
        <div className="adm-brand">
          <span className="adm-mark">J</span>
          <div>
            <small>Jenny</small>
          </div>
        </div>
        <h1>Panel de administracion</h1>
        <p>Gestiona tu catalogo y tus pedidos.</p>

        <div className="adm-field">
          <label htmlFor="adm-password">Contrasena</label>
          <input
            id="adm-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        {error && <p className="adm-error">{error}</p>}

        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

function Panel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([api.adminProducts(token), api.adminOrders(token)]);
      setProducts(p);
      setOrders(o);
    } catch (e) {
      if (e instanceof Error && e.message.includes('401')) {
        onLogout();
        toast.error('Tu sesion expiro. Vuelve a entrar.');
        return;
      }
      toast.error(e instanceof Error ? e.message : 'No se pudieron cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setDialogOpen(true);
  };

  const pending = orders.filter((o) => o.status === 'Pending').length;
  const openCount = orders.filter((o) => ['Pending', 'Confirmed', 'Preparing', 'Shipped'].includes(o.status)).length;

  if (loading) return <div className="adm-loading">Cargando tu tienda…</div>;

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-brand">
          <span className="adm-mark">J</span>
          <div>
            Panel de administracion
            <small>Jenny</small>
          </div>
        </div>

        <nav className="adm-tabs" role="tablist">
          <button type="button" role="tab" className="adm-tab" aria-selected={tab === 'products'} onClick={() => setTab('products')}>
            Catalogo
          </button>
          <button type="button" role="tab" className="adm-tab" aria-selected={tab === 'orders'} onClick={() => setTab('orders')}>
            Pedidos
            {pending > 0 && <span className="adm-badge">{pending}</span>}
          </button>
        </nav>

        <div className="adm-tools">
          <button type="button" className="adm-btn adm-btn-sm" onClick={() => window.open('/', '_blank')}>
            Ver tienda
          </button>
          <button type="button" className="adm-btn adm-btn-sm" onClick={onLogout}>
            Salir
          </button>
        </div>
      </header>

      <main className="adm-main">
        {tab === 'products' ? (
          <ProductsTab token={token} products={products} onChanged={refresh} onCreate={openNew} onEdit={openEdit} dialogOpen={dialogOpen} />
        ) : (
          <OrdersTab token={token} orders={orders} onChanged={refresh} />
        )}
      </main>

      {dialogOpen && (
        <ProductDialog
          token={token}
          product={editing}
          onClose={() => {
            setDialogOpen(false);
            setEditing(null);
          }}
          onChanged={refresh}
        />
      )}

      {openCount > 0 && tab === 'products' && (
        <p className="adm-hint" style={{ textAlign: 'center', paddingBottom: 30 }}>
          Tienes {openCount} {openCount === 1 ? 'pedido abierto' : 'pedidos abiertos'} sin completar.
        </p>
      )}
    </div>
  );
}

export function AdminApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return (
    <ToastProvider>{token ? <Panel token={token} onLogout={logout} /> : <Login onAuthenticated={setToken} />}</ToastProvider>
  );
}