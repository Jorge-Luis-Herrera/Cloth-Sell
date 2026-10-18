use axum::{
    extract::{ConnectInfo, DefaultBodyLimit, Multipart, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    routing::{delete, get, patch, post, put},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::{sqlite::SqlitePoolOptions, FromRow, Row, SqlitePool};
use std::{collections::HashMap, env, net::SocketAddr, path::PathBuf, sync::{Arc, Mutex}};
use subtle::ConstantTimeEq;
use tower::ServiceBuilder;
use tower_http::{cors::{Any, CorsLayer}, services::ServeDir, set_header::SetResponseHeaderLayer, trace::TraceLayer};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;
const MAX_UPLOAD: usize = 5 * 1024 * 1024;

#[derive(Clone)]
struct AppState { db: SqlitePool, uploads: PathBuf, admin_hash: String, signing_key: String, throttle: LoginThrottle }

/// Frena la fuerza bruta contra `/api/auth/login`. Antes no habia limite: se podia probar
/// contraseñas indefinidamente desde cualquier IP. Solo cuenta los intentos FALLIDOS y se
/// olvida a los 15 minutos, para que un error de tecleo no deje fuera al panel.
#[derive(Clone)]
struct LoginThrottle { failed: Arc<Mutex<HashMap<String, (u32, i64)>>> }

const MAX_FAILED: u32 = 10;
const WINDOW_SECONDS: i64 = 15 * 60;

impl LoginThrottle {
    fn new() -> Self { Self { failed: Arc::new(Mutex::new(HashMap::new())) } }

    fn blocked(&self, key: &str) -> bool {
        let Ok(mut map) = self.failed.lock() else { return false };
        let now = Utc::now().timestamp();
        let entry = map.entry(key.to_string()).or_insert((0, now));
        if now - entry.1 > WINDOW_SECONDS { *entry = (0, now); }
        entry.0 >= MAX_FAILED
    }

    fn register_failure(&self, key: &str) {
        let Ok(mut map) = self.failed.lock() else { return };
        let now = Utc::now().timestamp();
        let entry = map.entry(key.to_string()).or_insert((0, now));
        if now - entry.1 > WINDOW_SECONDS { *entry = (0, now); }
        entry.0 += 1;
    }

    fn clear(&self, key: &str) { let Ok(mut map) = self.failed.lock() else { return }; map.remove(key); }
}

#[derive(Serialize)]
struct ErrorBody { request: String }
fn bad(message: &str) -> (StatusCode, Json<ErrorBody>) { (StatusCode::BAD_REQUEST, Json(ErrorBody { request: message.into() })) }
fn conflict(message: String) -> (StatusCode, Json<ErrorBody>) { (StatusCode::CONFLICT, Json(ErrorBody { request: message })) }
/// SQLite no distingue dos faltas de la misma columna UNIQUE, asi que el mensaje concreto
/// (que nombre o que talla esta repetida) lo pone quien llama.
fn is_unique(err: &sqlx::Error) -> bool { matches!(err, sqlx::Error::Database(e) if e.is_unique_violation()) }
fn now() -> String { Utc::now().to_rfc3339() }
/// El dinero se guarda en centimos enteros. En coma flotante, 3 x 0.10 daba 0.30000000000000004 y
/// ese numero se guardaba en el pedido. En centimos la suma es exacta siempre.
fn to_cents(value: f64) -> i64 { if value.is_finite() { (value * 100.0).round() as i64 } else { 0 } }
fn from_cents(cents: i64) -> f64 { cents as f64 / 100.0 }
fn env_or(name: &str, default: &str) -> String { env::var(name).unwrap_or_else(|_| default.into()) }

/// Origenes de los que se acepta CORS. Por defecto, solo el propio sitio: la tienda y el panel
/// se sirven desde el mismo dominio, asi que no hace falta abrirlo a nadie. `CorsLayer::permissive()`
/// dejaba que cualquier web llamara al panel si CONSEguia el token.
///
/// `ALLOWED_ORIGINS` acepta una lista separada por comas para los casos en que el panel se
/// sirva desde otro dominio (por ejemplo `http://localhost:5173` durante el desarrollo con Vite).
fn allowed_origins() -> Vec<HeaderValue> {
    match env::var("ALLOWED_ORIGINS") {
        Ok(value) if !value.trim().is_empty() => value.split(',').filter_map(|o| HeaderValue::from_str(o.trim()).ok()).collect(),
        _ => Vec::new(),
    }
}

/// Cabeceras de seguridad basicas. Sin esto, el panel se puede embeber en un iframe de otro
/// sitio y los ficheros de /uploads se sirven sin `nosniff`.
/// Cabeceras de seguridad basicas. Sin ellas, el panel se puede embeber en un iframe de otro
/// sitio y los ficheros de /uploads se sirven sin `nosniff`. `if_not_present` respeta lo que
/// ya ponga el servidor de ficheros estaticos.
fn security_header(name: header::HeaderName, value: &'static str) -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::if_not_present(name, HeaderValue::from_static(value))
}

#[derive(Serialize, FromRow)]
struct ProductRow { id: String, slug: String, name: String, description: String, /// El precio se guarda en centimos; el decimal solo existe al serializar.
    base_price_cents: i64, published: bool, created_at: String, updated_at: String }
#[derive(Serialize, FromRow)]
struct VariantRow { id: String, product_id: String, size: String, color: String, sku: Option<String>, price_override_cents: Option<i64>, stock_quantity: i64, is_active: bool }
#[derive(Serialize, FromRow)]
struct ImageRow { id: String, product_id: String, blob_key: String, content_type: String, size_bytes: i64, sort_order: i64, alt_text: String }
#[derive(Serialize)]
struct VariantView { id: String, size: String, color: String, sku: Option<String>, price: f64, /// Precio especifico de esta talla, o null si hereda el precio base del producto.
/// Se expone para que el panel de administracion pueda distinguir "mismo precio"
/// de "precio propio" al editar; sin esto, reabrir el editor borraria el override.
#[serde(rename = "priceOverride")] price_override: Option<f64>, #[serde(rename = "stockQuantity")] stock_quantity: i64, #[serde(rename = "isActive")] is_active: bool }
#[derive(Serialize)]
struct ImageView { id: String, url: String, #[serde(rename = "contentType")] content_type: String, #[serde(rename = "sizeBytes")] size_bytes: i64, #[serde(rename = "sortOrder")] sort_order: i64, #[serde(rename = "altText")] alt_text: String }
#[derive(Serialize)]
struct ProductView { id: String, slug: String, name: String, description: String, #[serde(rename = "basePrice")] base_price: f64, published: bool, #[serde(rename = "createdAt")] created_at: String, #[serde(rename = "updatedAt")] updated_at: String, variants: Vec<VariantView>, images: Vec<ImageView> }

async fn product_view(state: &AppState, product: ProductRow, base: &str) -> Result<ProductView, sqlx::Error> {
    product_views(state, vec![product], base).await?.into_iter().next().ok_or(sqlx::Error::RowNotFound)
}

/// Convierte varios productos en una sola pasada. Antes se llamaba a `product_view` en bucle y eso
/// hacia 2 consultas por producto: con 24 productos eran 48 consultas en cada peticion de la tienda.
/// Ahora son 2 consultas en total, con un `IN (...)` por tabla.
async fn product_views(state: &AppState, products: Vec<ProductRow>, base: &str) -> Result<Vec<ProductView>, sqlx::Error> {
    if products.is_empty() { return Ok(Vec::new()) }
    let ids: Vec<String> = products.iter().map(|p| p.id.clone()).collect();
    let lista = placeholders(ids.len());
    let sql_variantes = format!("SELECT id, product_id, size, color, sku, price_override_cents, stock_quantity, is_active FROM product_variants WHERE product_id IN ({lista}) ORDER BY product_id, size, color");
    let sql_imagenes = format!("SELECT id, product_id, blob_key, content_type, size_bytes, sort_order, alt_text FROM product_images WHERE product_id IN ({lista}) ORDER BY product_id, sort_order");

    let mut consulta_variantes = sqlx::query_as::<_, VariantRow>(&sql_variantes);
    for id in &ids { consulta_variantes = consulta_variantes.bind(id); }
    let mut variantes: HashMap<String, Vec<VariantView>> = HashMap::new();
    for fila in consulta_variantes.fetch_all(&state.db).await? {
        let precio_base = products.iter().find(|p| p.id == fila.product_id).map(|p| p.base_price_cents).unwrap_or(0);
        variantes.entry(fila.product_id.clone()).or_default().push(VariantView {
            id: fila.id, size: fila.size, color: fila.color, sku: fila.sku, price: from_cents(fila.price_override_cents.unwrap_or(precio_base)),
            price_override: fila.price_override_cents.map(from_cents), stock_quantity: fila.stock_quantity, is_active: fila.is_active });
    }

    let mut consulta_imagenes = sqlx::query_as::<_, ImageRow>(&sql_imagenes);
    for id in &ids { consulta_imagenes = consulta_imagenes.bind(id); }
    let mut imagenes: HashMap<String, Vec<ImageView>> = HashMap::new();
    for fila in consulta_imagenes.fetch_all(&state.db).await? {
        imagenes.entry(fila.product_id.clone()).or_default().push(ImageView {
            id: fila.id, url: format!("{base}/uploads/{}", fila.blob_key), content_type: fila.content_type,
            size_bytes: fila.size_bytes, sort_order: fila.sort_order, alt_text: fila.alt_text });
    }

    Ok(products.into_iter().map(|product| {
        let id = product.id.clone();
        ProductView {
            id: id.clone(), slug: product.slug, name: product.name, description: product.description, base_price: from_cents(product.base_price_cents),
            published: product.published, created_at: product.created_at, updated_at: product.updated_at,
            variants: variantes.remove(&id).unwrap_or_default(),
            images: imagenes.remove(&id).unwrap_or_default() }
    }).collect())
}

/// Marcadores `?` para un `IN (...)` con el numero de elementos pedido. SQLite tiene un limite
/// de parametros por sentencia, asi que se piden paginas de 24 o 60 y el limite no se acerca.
fn placeholders(n: usize) -> String { std::iter::repeat("?").take(n).collect::<Vec<_>>().join(", ") }

#[derive(Deserialize)] struct LoginRequest { password: String }
fn valid_password(candidate: &str, encoded: &str) -> bool {
    let parts: Vec<_> = encoded.split('$').collect();
    if parts.len() != 4 || parts[0] != "pbkdf2" { return false; }
    let iterations = match parts[1].parse::<u32>() { Ok(v) => v, Err(_) => return false };
    let salt = match B64.decode(parts[2]) { Ok(v) => v, Err(_) => return false };
    let expected = match B64.decode(parts[3]) { Ok(v) => v, Err(_) => return false };
    let mut actual = vec![0; expected.len()];
    pbkdf2_hmac::<Sha256>(candidate.as_bytes(), &salt, iterations, &mut actual);
    actual.ct_eq(&expected).into()
}
fn token(state: &AppState) -> String {
    let expiry = Utc::now().timestamp() + 8 * 60 * 60;
    let payload = format!("admin|{expiry}");
    let mut mac = HmacSha256::new_from_slice(state.signing_key.as_bytes()).expect("valid HMAC key");
    mac.update(payload.as_bytes());
    format!("{}.{},", payload, B64.encode(mac.finalize().into_bytes())).trim_end_matches(',').into()
}
fn is_admin(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(value) = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) else { return false };
    let Some(raw) = value.strip_prefix("Bearer ").or_else(|| value.strip_prefix("bearer ")) else { return false };
    let Some((payload, signature)) = raw.split_once('.') else { return false };
    let mut parts = payload.split('|');
    if parts.next() != Some("admin") { return false; }
    let Ok(expiry) = parts.next().unwrap_or_default().parse::<i64>() else { return false };
    if parts.next().is_some() || expiry <= Utc::now().timestamp() { return false; }
    let Ok(expected) = B64.decode(signature) else { return false };
    let mut mac = HmacSha256::new_from_slice(state.signing_key.as_bytes()).expect("valid HMAC key");
    mac.update(payload.as_bytes());
    mac.verify_slice(&expected).is_ok()
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    match sqlx::query("SELECT 1").execute(&state.db).await { Ok(_) => (StatusCode::OK, Json(serde_json::json!({"status":"ok","database":"sqlite"}))), Err(_) => (StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({"status":"unavailable"}))) }
}
async fn login(State(state): State<AppState>, ConnectInfo(client): ConnectInfo<SocketAddr>, Json(req): Json<LoginRequest>) -> impl IntoResponse {
    let key = client.ip().to_string();
    // El limite corta la fuerza bruta pero NO bloquea a quien acierta: primero se valida la
    // contrasena y, si es correcta, se limpia el contador. Asi un tecleo de mas no deja fuera
    // al panel, mientras que probar contrasenas distintas acaba topando siempre con 429.
    if valid_password(&req.password, &state.admin_hash) {
        state.throttle.clear(&key);
        return (StatusCode::OK, Json(serde_json::json!({"token": token(&state), "expiresInHours": 8})));
    }
    if state.throttle.blocked(&key) {
        return (StatusCode::TOO_MANY_REQUESTS, Json(serde_json::json!({"error": format!("Demasiados intentos fallidos desde esta IP. Prueba en {} minutos.", WINDOW_SECONDS / 60)})));
    }
    state.throttle.register_failure(&key);
    (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Invalid credentials"})))
}
async fn logout() -> StatusCode { StatusCode::NO_CONTENT }

#[derive(Deserialize)] struct ProductQuery { search: Option<String>, size: Option<String>, color: Option<String>, page: Option<i64>, page_size: Option<i64> }

/// Filtros de catalogo expresados en SQL. Antes se leia el catalogo entero, se filtraba en Rust
/// y se paginaba en memoria: el coste crecia con el numero de productos y pedir 1 producto era
/// tan caro como pedirlos todos. Ahora el filtro y el paginado ocurren en la base de datos.
const CATALOGO_WHERE: &str = "p.published = 1 \
    AND (? IS NULL OR lower(p.name) LIKE '%' || lower(?) || '%' OR lower(p.description) LIKE '%' || lower(?) || '%') \
    AND (? IS NULL OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND v.stock_quantity > 0 AND v.size = ?)) \
    AND (? IS NULL OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active = 1 AND v.stock_quantity > 0 AND v.color = ?))";

async fn list_products(State(state): State<AppState>, headers: HeaderMap, Query(query): Query<ProductQuery>) -> Result<Json<serde_json::Value>, StatusCode> {
    let buscar = query.search.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let talla = query.size.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let color = query.color.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let total: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM products p WHERE {CATALOGO_WHERE}"))
        .bind(buscar).bind(buscar).bind(buscar).bind(talla).bind(talla).bind(color).bind(color)
        .fetch_one(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let page = query.page.unwrap_or(1).clamp(1, 10_000);
    let page_size = query.page_size.unwrap_or(24).clamp(1, 60);
    let filas = sqlx::query_as::<_, ProductRow>(&format!(
        "SELECT p.id, p.slug, p.name, p.description, p.base_price_cents, p.published, p.created_at, p.updated_at FROM products p WHERE {CATALOGO_WHERE} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?"))
        .bind(buscar).bind(buscar).bind(buscar).bind(talla).bind(talla).bind(color).bind(color)
        .bind(page_size).bind((page - 1) * page_size)
        .fetch_all(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let base = format!("{}://{}", env_or("PUBLIC_SCHEME", "http"), headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost"));
    let items = product_views(&state, filas, &base).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(serde_json::json!({"items": items, "total": total, "page": page, "pageSize": page_size, "hasMore": page * page_size < total})))
}
async fn get_product(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<impl IntoResponse, StatusCode> { let product = sqlx::query_as::<_, ProductRow>("SELECT id, slug, name, description, base_price_cents, published, created_at, updated_at FROM products WHERE id = ? AND published = 1").bind(id).fetch_optional(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?; let Some(product) = product else { return Ok(StatusCode::NOT_FOUND.into_response()) }; let base = format!("{}://{}", env_or("PUBLIC_SCHEME", "http"), headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost")); Ok(Json(product_view(&state, product, &base).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?).into_response()) }

#[derive(Deserialize)] struct OrderLine { #[serde(rename="variantId")] variant_id: String, quantity: i64 }
#[derive(Deserialize)] struct CreateOrder { #[serde(rename="customerName")] customer_name: String, #[serde(rename="customerPhone")] customer_phone: String, #[serde(rename="deliveryAddress")] delivery_address: String, notes: Option<String>, items: Vec<OrderLine> }
async fn create_order(State(state): State<AppState>, Json(req): Json<CreateOrder>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> {
    if req.customer_name.trim().is_empty() || req.customer_phone.trim().is_empty() || req.delivery_address.trim().is_empty() || req.items.is_empty() || req.items.len() > 50 { return Err(bad("Customer details and 1-50 items are required.")); }
    let mut tx = state.db.begin().await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; let order_id = Uuid::new_v4().to_string(); let created = now(); let mut total_cents = 0_i64; let mut lines = Vec::new();
    for item in req.items { if !(1..=20).contains(&item.quantity) { return Err(bad("Quantity must be between 1 and 20.")); } let row = sqlx::query_as::<_, (String, String, String, i64, Option<i64>, i64)>("SELECT v.id, v.product_id, p.name, p.base_price_cents, v.price_override_cents, v.stock_quantity FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.is_active=1 AND p.published=1").bind(&item.variant_id).fetch_optional(&mut *tx).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; let Some((variant_id, product_id, product_name, base, override_price, stock)) = row else { return Err(bad("A selected variant is unavailable or out of stock.")); }; if stock < item.quantity { return Err(bad("A selected variant is unavailable or out of stock.")); } let details = sqlx::query_as::<_, (String, String)>("SELECT size, color FROM product_variants WHERE id=?").bind(&variant_id).fetch_one(&mut *tx).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; // El total se multiplica en centimos: en coma flotante 3 x 0.10 no daba 0.30 exacto.
    let price_cents = override_price.unwrap_or(base); let line_total_cents = price_cents * item.quantity; total_cents += line_total_cents; sqlx::query("UPDATE product_variants SET stock_quantity=stock_quantity-? WHERE id=?").bind(item.quantity).bind(&variant_id).execute(&mut *tx).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; lines.push((product_id, variant_id, product_name, details.0, details.1, price_cents, item.quantity, line_total_cents)); }
    sqlx::query("INSERT INTO orders (id,status,customer_name,customer_phone,delivery_address,notes,total_cents,created_at,updated_at) VALUES (?, 'Pending', ?, ?, ?, ?, ?, ?, ?)").bind(&order_id).bind(req.customer_name.trim()).bind(req.customer_phone.trim()).bind(req.delivery_address.trim()).bind(req.notes.as_deref().map(str::trim)).bind(total_cents).bind(&created).bind(&created).execute(&mut *tx).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; for (product_id, variant_id, name, size, color, price, quantity, line_total) in lines { sqlx::query("INSERT INTO order_items (id,order_id,product_id,variant_id,product_name_snapshot,size_snapshot,color_snapshot,unit_price_cents,quantity,line_total_cents) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(&order_id).bind(product_id).bind(variant_id).bind(name).bind(size).bind(color).bind(price).bind(quantity).bind(line_total).execute(&mut *tx).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; } tx.commit().await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Database error") })?; Ok((StatusCode::CREATED, Json(serde_json::json!({"id": order_id, "status":"Pending", "total": from_cents(total_cents), "createdAt": created}))))
}

#[derive(Deserialize)] struct ProductInput { name: String, description: Option<String>, slug: Option<String>, #[serde(rename="basePrice")] base_price: f64, published: bool }
#[derive(Deserialize)] struct VariantInput { size: String, color: String, sku: Option<String>, #[serde(rename="priceOverride")] price_override: Option<f64>, #[serde(rename="stockQuantity")] stock_quantity: i64, #[serde(rename="isActive")] is_active: bool }
/// Convierte un nombre en un slug utilizable en una URL: sin tildes, sin simbolos y sin guiones
/// repetidos. Antes solo hacia `to_lowercase` + `join("-")`, asi que "Bañador «Niño» Ñandú" se
/// guardaba tal cual y el slug no era valido ni bonito: `bañador-«niño»-ñandú`.
fn slugify(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut pending_dash = false;
    for ch in value.trim().to_lowercase().chars() {
        let ch = match ch {
            'ñ' => 'n',
            'á' | 'à' | 'ä' | 'â' | 'ã' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ç' => 'c',
            other => other,
        };
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() { out.push('-'); }
            pending_dash = false;
            out.push(ch);
        } else {
            pending_dash = true;
        }
    }
    out
}

/// Detecta el tipo real de la imagen por sus primeros bytes. El `Content-Type` que manda el
/// cliente no sirve: un `.txt` renombrado a `.png` llega como `image/png` y se guardaba igual.
fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) { Some("image/png") }
    else if bytes.starts_with(&[0xff, 0xd8, 0xff]) { Some("image/jpeg") }
    else if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" { Some("image/webp") }
    else { None }
}

/// Lado maximo y megapixeles totales admitidos. Sin esto se puede subir un PNG de 20000 px:
/// pesa poco en disco pero el navegador y el movil del cliente se atascan al pintarla.
const MAX_SIDE: u32 = 12_000;
const MAX_PIXELS: u64 = 40_000_000;

/// Lee ancho y alto de la cabecera de la imagen. Solo PNG y JPEG: son los formatos con la
/// cabecera en posición fija, y no merece la pena añadir una dependencia de imagen solo por esto.
/// Si el formato no se reconoce devuelve None y el tamaño se controla solo por peso.
fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() > 24 && bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
        let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
        return Some((width, height));
    }
    if bytes.len() > 4 && bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        let mut i = 2;
        while i + 9 < bytes.len() {
            if bytes[i] != 0xff { i += 1; continue; }
            let marker = bytes[i + 1];
            // SOF0..SOF15, saltando los marcadores que no son "start of frame".
            if (0xc0..=0xcf).contains(&marker) && !matches!(marker, 0xc4 | 0xc8 | 0xcc) {
                let height = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
                let width = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]) as u32;
                return Some((width, height));
            }
            let length = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
            if length < 2 { return None; }
            i += 2 + length;
        }
    }
    None
}

/// Traduce un fallo de multipart a una respuesta util. Antes todo acababa en un 400
/// "Could not read image", incluso cuando lo que habia pasado era que la foto era demasiado grande:
/// el cliente recibia un motivo equivocado y no tenia forma de saber que corregir.
fn multipart_error(err: &axum::extract::multipart::MultipartError) -> (StatusCode, Json<ErrorBody>) {
    if err.status() == StatusCode::PAYLOAD_TOO_LARGE {
        return (StatusCode::PAYLOAD_TOO_LARGE, Json(ErrorBody { request: format!("La imagen supera el limite de {} MB.", MAX_UPLOAD / 1024 / 1024) }));
    }
    bad("No se pudo leer la subida. Comprueba que sea un fichero JPG, PNG o WebP.")
}
async fn admin_products(State(state): State<AppState>, headers: HeaderMap) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state, &headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } let products = sqlx::query_as::<_, ProductRow>("SELECT id, slug, name, description, base_price_cents, published, created_at, updated_at FROM products ORDER BY created_at DESC").fetch_all(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?; let base = format!("{}://{}", env_or("PUBLIC_SCHEME", "http"), headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost")); let mut result = Vec::new(); for p in products { result.push(product_view(&state,p,&base).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?); } Ok(Json(result).into_response()) }
async fn create_product(State(state): State<AppState>, headers: HeaderMap, Json(req): Json<ProductInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } if req.name.trim().is_empty() || req.base_price < 0.0 { return Err(bad("Name and a non-negative price are required.")); } let id=Uuid::new_v4().to_string(); let timestamp=now(); let slug=req.slug.as_deref().map(slugify).filter(|s|!s.is_empty()).unwrap_or_else(||slugify(&req.name)); sqlx::query("INSERT INTO products (id,slug,name,description,base_price_cents,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(&id).bind(&slug).bind(req.name.trim()).bind(req.description.unwrap_or_default().trim()).bind(to_cents(req.base_price)).bind(req.published).bind(&timestamp).bind(&timestamp).execute(&state.db).await.map_err(|e| if is_unique(&e) { conflict(format!("Ya existe un producto con el nombre \"{}\" (identificador \"{}\"). Usa otro nombre o indica un identificador distinto.", req.name.trim(), slug)) } else { tracing::error!(error = %e, "no se pudo crear el producto"); bad("Could not create product") })?; Ok((StatusCode::CREATED, Json(serde_json::json!({"id":id,"slug":slug,"name":req.name,"basePrice":from_cents(to_cents(req.base_price)),"published":req.published,"createdAt":timestamp,"updatedAt":timestamp,"variants":[],"images":[]}))).into_response()) }
async fn update_product(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<ProductInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } let result=sqlx::query("UPDATE products SET slug=COALESCE(NULLIF(?,''),slug),name=?,description=?,base_price_cents=?,published=?,updated_at=? WHERE id=?").bind(req.slug.as_deref().map(slugify).unwrap_or_default()).bind(req.name.trim()).bind(req.description.unwrap_or_default().trim()).bind(to_cents(req.base_price)).bind(req.published).bind(now()).bind(&id).execute(&state.db).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not update product") })?; if result.rows_affected()==0 { return Ok(StatusCode::NOT_FOUND.into_response()) } Ok(StatusCode::NO_CONTENT.into_response()) }
async fn delete_product(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<StatusCode, StatusCode> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED) } let result=sqlx::query("DELETE FROM products WHERE id=?").bind(id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND} else {StatusCode::NO_CONTENT}) }
async fn save_variant(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<VariantInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } // El panel puede quedar apuntando a un producto que ya no existe (se borro en otra sesion o
    // la lista esta desactualizada): responder 404 con mensaje claro y no un 400 criptico.
    let producto_existe = sqlx::query("SELECT 1 FROM products WHERE id = ?").bind(&id).fetch_optional(&state.db).await.map_err(|_| bad("Could not create variant"))?.is_some(); if !producto_existe { return Err((StatusCode::NOT_FOUND, Json(ErrorBody { request: "El producto ya no existe o la lista del panel esta desactualizada. Refresca la pagina (F5) e intentalo de nuevo.".into() }))) } if req.size.trim().is_empty() || req.color.trim().is_empty() || req.stock_quantity<0 { return Err(bad("Size, color and non-negative stock are required.")); } let variant_id=Uuid::new_v4().to_string(); let result=sqlx::query("INSERT INTO product_variants (id,product_id,size,color,sku,price_override_cents,stock_quantity,is_active) VALUES (?,?,?,?,?,?,?,?)").bind(&variant_id).bind(&id).bind(req.size.trim()).bind(req.color.trim()).bind(req.sku).bind(req.price_override.map(to_cents)).bind(req.stock_quantity).bind(req.is_active).execute(&state.db).await.map_err(|e| if is_unique(&e) { conflict(format!("La talla {} / {} ya existe en este producto.", req.size.trim(), req.color.trim())) } else { tracing::error!(error = %e, "no se pudo crear la variante"); bad("Could not create variant") })?; if result.rows_affected()==0 {return Ok(StatusCode::NOT_FOUND.into_response())}; Ok((StatusCode::CREATED,Json(serde_json::json!({"id":variant_id,"productId":id}))).into_response()) }
async fn update_variant(State(state): State<AppState>, headers: HeaderMap, Path((id,variant_id)): Path<(String,String)>, Json(req): Json<VariantInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let result=sqlx::query("UPDATE product_variants SET size=?,color=?,sku=?,price_override_cents=?,stock_quantity=?,is_active=? WHERE id=? AND product_id=?").bind(req.size.trim()).bind(req.color.trim()).bind(req.sku).bind(req.price_override.map(to_cents)).bind(req.stock_quantity).bind(req.is_active).bind(variant_id).bind(id).execute(&state.db).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not update variant") })?; Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND} else {StatusCode::NO_CONTENT}.into_response()) }
async fn delete_variant(State(state): State<AppState>, headers: HeaderMap, Path((id,variant_id)): Path<(String,String)>) -> Result<StatusCode, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED)} let result=sqlx::query("DELETE FROM product_variants WHERE id=? AND product_id=?").bind(variant_id).bind(id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND}else{StatusCode::NO_CONTENT}) }

async fn upload_image(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, mut multipart: Multipart) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> {
    if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())}
    let mut bytes=Vec::new(); let mut alt=String::new();
    while let Some(field)=multipart.next_field().await.map_err(|e| multipart_error(&e))? {
        if field.name()==Some("file") || field.name()==Some("image") {
            bytes=field.bytes().await.map_err(|e| multipart_error(&e))?.to_vec();
        } else if field.name()==Some("altText") {
            alt=field.text().await.unwrap_or_default().trim().to_string();
        }
    }
    if bytes.is_empty() { return Err(bad("No se recibio ningun fichero. El campo debe llamarse \"file\".")) }
    if bytes.len()>MAX_UPLOAD { return Err((StatusCode::PAYLOAD_TOO_LARGE, Json(ErrorBody { request: format!("La imagen supera el limite de {} MB.", MAX_UPLOAD / 1024 / 1024) }))) }
    // El tipo se decide por los bytes, no por lo que declara el navegador.
    let Some(content_type)=sniff_image(&bytes) else { return Err(bad("El fichero no es una imagen JPG, PNG o WebP valida.")) };
    if let Some((width,height))=image_dimensions(&bytes) {
        if width > MAX_SIDE || height > MAX_SIDE || u64::from(width) * u64::from(height) > MAX_PIXELS {
            return Err(bad(&format!("La imagen es de {}x{} px. El maximo son {} px de lado y {} megapixeles. Bajala de tamano antes de subirla.", width, height, MAX_SIDE, MAX_PIXELS / 1_000_000)));
        }
    }
    let extension=match content_type { "image/jpeg"=>"jpg", "image/png"=>"png", _=>"webp" };
    let size_bytes=bytes.len() as i64;
    let key=format!("{}.{extension}",Uuid::new_v4());
    tokio::fs::create_dir_all(&state.uploads).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not store image") })?;
    tokio::fs::write(state.uploads.join(&key),bytes).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not store image") })?;
    let image_id=Uuid::new_v4().to_string();
    // sort_order = numero de fotos que ya tiene el producto, para que la ultima subida quede al final
    // y no compitan todas por el mismo sitio.
    let siguiente: i64 = sqlx::query("SELECT COALESCE(MAX(sort_order) + 1, 0) FROM product_images WHERE product_id = ?")
        .bind(&id).fetch_one(&state.db).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not save image") })?.get(0);
    sqlx::query("INSERT INTO product_images (id,product_id,blob_key,content_type,size_bytes,sort_order,alt_text) VALUES (?,?,?,?,?,?,?)")
        .bind(&image_id).bind(&id).bind(&key).bind(content_type).bind(size_bytes).bind(siguiente).bind(alt)
        .execute(&state.db).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not save image") })?;
    Ok((StatusCode::CREATED,Json(serde_json::json!({"id":image_id,"blobKey":key,"contentType":content_type,"sizeBytes":size_bytes,"sortOrder":siguiente}))).into_response()) }

#[derive(Deserialize)] struct ReorderImages { ids: Vec<String> }
/// Reordena la galeria: las fotos llegan en el orden que se quieren y cada una toma su posicion.
/// La primera es la que se usa de portada. Se exige que la lista sea exactamente la del producto,
/// porque si no se dejarian huecos en sort_order y la portada quedaria unpredictible.
async fn reorder_images(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<ReorderImages>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> {
    if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())}
    if req.ids.is_empty() || req.ids.len() > 30 { return Err(bad("La galeria admite entre 1 y 30 fotos.")) }
    let actuales: Vec<String> = sqlx::query("SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order")
        .bind(&id).fetch_all(&state.db).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not reorder images") })?.into_iter().map(|r| r.get(0)).collect();
    let mut a=actuales.clone(); let mut b=req.ids.clone(); a.sort(); b.sort();
    if a != b { return Err(bad("La lista de fotos no coincide con las del producto. Recarga el producto y vuelve a intentarlo.")) }
    let mut tx=state.db.begin().await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not reorder images") })?;
    for (posicion,image_id) in req.ids.iter().enumerate() {
        sqlx::query("UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?").bind(posicion as i64).bind(image_id).bind(&id)
            .execute(&mut *tx).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not reorder images") })?;
    }
    tx.commit().await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not reorder images") })?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

#[derive(Deserialize)] struct AltInput { #[serde(rename="altText")] alt_text: String }
/// Cambia el texto alternativo de una foto. Es lo que lee un lector de pantalla cuando la
/// imagen no carga, asi que merece la pena poder corregirlo sin borrarla y volver a subirla.
async fn update_image(State(state): State<AppState>, headers: HeaderMap, Path((id,image_id)): Path<(String,String)>, Json(req): Json<AltInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> {
    if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())}
    if req.alt_text.chars().count() > 200 { return Err(bad("El texto alternativo no puede pasar de 200 caracteres.")) }
    let result=sqlx::query("UPDATE product_images SET alt_text = ? WHERE id = ? AND product_id = ?").bind(req.alt_text.trim()).bind(image_id).bind(&id)
        .execute(&state.db).await.map_err(|e| { tracing::error!(error = %e, "operacion fallida"); bad("Could not update image") })?;
    Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND} else {StatusCode::NO_CONTENT}.into_response())
}

#[derive(Deserialize)] struct StatusInput { status: String }
async fn order_items(state: &AppState, order_id: &str) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let rows = sqlx::query("SELECT product_name_snapshot, size_snapshot, color_snapshot, unit_price_cents, quantity, line_total_cents FROM order_items WHERE order_id = ? ORDER BY rowid")
        .bind(order_id).fetch_all(&state.db).await?;
    Ok(rows.iter().map(|r| serde_json::json!({
        "name": r.get::<String,_>("product_name_snapshot"),
        "size": r.get::<String,_>("size_snapshot"),
        "color": r.get::<String,_>("color_snapshot"),
        "unitPrice": from_cents(r.get::<i64,_>("unit_price_cents")),
        "quantity": r.get::<i64,_>("quantity"),
        "lineTotal": from_cents(r.get::<i64,_>("line_total_cents")),
    })).collect())
}

async fn admin_orders(State(state): State<AppState>, headers: HeaderMap) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let orders=sqlx::query("SELECT id,status,customer_name,customer_phone,delivery_address,notes,total_cents,created_at,updated_at FROM orders ORDER BY created_at DESC").fetch_all(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; let mut result=Vec::new(); for r in &orders { let id=r.get::<String,_>("id"); let items=order_items(&state,&id).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; result.push(serde_json::json!({"id":id,"status":r.get::<String,_>("status"),"customerName":r.get::<String,_>("customer_name"),"customerPhone":r.get::<String,_>("customer_phone"),"deliveryAddress":r.get::<String,_>("delivery_address"),"notes":r.get::<Option<String>,_>("notes"),"total":from_cents(r.get::<i64,_>("total_cents")),"createdAt":r.get::<String,_>("created_at"),"updatedAt":r.get::<String,_>("updated_at"),"items":items})); } Ok(Json(result).into_response()) }

/// Borra un pedido y sus lineas. Los articulos quedan en el historico del
/// pedido borrado, pero no se reponen al stock: los snapshots ya son
/// historicos y reponer automaticamente seria una decision de negocio, no
/// una operacion de borrado.
async fn delete_order(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let result=sqlx::query("DELETE FROM orders WHERE id = ?").bind(&id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0{StatusCode::NOT_FOUND}else{StatusCode::NO_CONTENT}.into_response()) }

/// Quita una foto del producto y borra tambien el fichero del disco, para no
/// dejar uploads huerfanos acumulandose.
async fn delete_image(State(state): State<AppState>, headers: HeaderMap, Path((id, image_id)): Path<(String, String)>) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let blob=sqlx::query("SELECT blob_key FROM product_images WHERE id = ? AND product_id = ?").bind(&image_id).bind(&id).fetch_optional(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; let Some(row)=blob else {return Ok(StatusCode::NOT_FOUND.into_response())}; let result=sqlx::query("DELETE FROM product_images WHERE id = ? AND product_id = ?").bind(&image_id).bind(&id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; if result.rows_affected()>0 { let key=row.get::<String,_>("blob_key"); let _=tokio::fs::remove_file(state.uploads.join(&key)).await; } Ok(StatusCode::NO_CONTENT.into_response()) }
async fn update_status(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<StatusInput>) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let allowed=["Pending","Confirmed","Preparing","Shipped","Delivered","Cancelled"]; if !allowed.iter().any(|x|x.eq_ignore_ascii_case(&req.status)){return Ok(bad("Invalid order status.").into_response())} let status=allowed.iter().find(|x|x.eq_ignore_ascii_case(&req.status)).unwrap(); let result=sqlx::query("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(status).bind(now()).bind(id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0{StatusCode::NOT_FOUND}else{StatusCode::NO_CONTENT}.into_response()) }

/// Aplica las migraciones de `migrations/` pendientes y marca las aplicadas en `_sqlx_migrations`.
/// Antes el esquema se creaba con `CREATE TABLE IF NOT EXISTS` en cada arranque: eso no versiona
/// nada, asi que cualquier cambio de columna futuro habia que hacerlo a mano sobre la base.
/// Las migraciones son idempotentes y se aplican dentro de una transaccion.
async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> { tracing_subscriber::fmt().with_env_filter(env_or("RUST_LOG","info")).init(); let database_url=env_or("DATABASE_URL","sqlite://.local-dev/data/jenny.db?mode=rwc"); if let Some(path)=database_url.strip_prefix("sqlite://").and_then(|p|p.split('?').next()) { if path!="jenny.db" { if let Some(parent)=std::path::Path::new(path).parent(){tokio::fs::create_dir_all(parent).await?;} } } let db=SqlitePoolOptions::new().max_connections(5).connect(&database_url).await?; init_db(&db).await?; let uploads=PathBuf::from(env_or("UPLOADS_DIR","uploads")); tokio::fs::create_dir_all(&uploads).await?; let state=AppState{db,uploads: uploads.clone(),admin_hash:env::var("ADMIN_PASSWORD_HASH").expect("ADMIN_PASSWORD_HASH is required"),signing_key:env::var("AUTH_SIGNING_KEY").expect("AUTH_SIGNING_KEY is required"),throttle:LoginThrottle::new()};
    // La carpeta del frontend se busca junto al ejecutable y no en el directorio de trabajo:
    // con `ServeDir::new("Frontend/dist")`, arrancar el binario desde otro sitio dejaba
    // la tienda y el panel sin servir, sin ningun error visible.
    let frontend_dir=env::var("FRONTEND_DIR").map(PathBuf::from).unwrap_or_else(|_| {
        std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.join("Frontend/dist")))
            .unwrap_or_else(|| PathBuf::from("Frontend/dist"))
    });
    let cors=if allowed_origins().is_empty() { CorsLayer::new() } else { CorsLayer::new().allow_origin(allowed_origins()).allow_methods(Any).allow_headers(Any) };
    let app=Router::new().route("/api/health",get(health)).route("/api/auth/login",post(login)).route("/api/auth/logout",post(logout)).route("/api/products",get(list_products)).route("/api/products/:id",get(get_product)).route("/api/orders",post(create_order)).route("/api/admin/products",get(admin_products).post(create_product)).route("/api/admin/products/:id",put(update_product).delete(delete_product)).route("/api/admin/products/:id/variants",post(save_variant)).route("/api/admin/products/:id/variants/:variant_id",put(update_variant).delete(delete_variant)).route("/api/admin/products/:id/images",post(upload_image).patch(reorder_images)).route("/api/admin/products/:id/images/:image_id",delete(delete_image).patch(update_image)).route("/api/admin/orders",get(admin_orders)).route("/api/admin/orders/:id",delete(delete_order)).route("/api/admin/orders/:id/status",patch(update_status)).nest_service("/uploads",ServiceBuilder::new().layer(SetResponseHeaderLayer::overriding(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=31536000, immutable"))).service(ServeDir::new(&uploads))).fallback_service(ServeDir::new(&frontend_dir)).layer(DefaultBodyLimit::max(6*1024*1024)).layer(cors).layer(security_header(header::X_CONTENT_TYPE_OPTIONS, "nosniff")).layer(security_header(header::X_FRAME_OPTIONS, "SAMEORIGIN")).layer(security_header(header::REFERRER_POLICY, "strict-origin-when-cross-origin")).layer(security_header(header::STRICT_TRANSPORT_SECURITY, "max-age=31536000; includeSubDomains")).layer(TraceLayer::new_for_http()).with_state(state); let port=env_or("PORT","8080").parse::<u16>()?; let addr=SocketAddr::from(([0,0,0,0],port)); tracing::info!(%addr,"Jenny Rust API listening"); axum::serve(tokio::net::TcpListener::bind(addr).await?,app.into_make_service_with_connect_info::<SocketAddr>()).await?; Ok(()) }
