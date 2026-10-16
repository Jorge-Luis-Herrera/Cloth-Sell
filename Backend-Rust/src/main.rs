use axum::{
    extract::{DefaultBodyLimit, Multipart, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, patch, post, put},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chrono::Utc;
use hmac::{Hmac, Mac};
use pbkdf2::pbkdf2_hmac;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use sqlx::{sqlite::SqlitePoolOptions, FromRow, Row, SqlitePool};
use std::{env, net::SocketAddr, path::PathBuf};
use subtle::ConstantTimeEq;
use tower_http::{cors::CorsLayer, services::ServeDir, trace::TraceLayer};
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;
const MAX_UPLOAD: usize = 5 * 1024 * 1024;

#[derive(Clone)]
struct AppState { db: SqlitePool, uploads: PathBuf, admin_hash: String, signing_key: String }

#[derive(Serialize)]
struct ErrorBody { request: String }
fn bad(message: &str) -> (StatusCode, Json<ErrorBody>) { (StatusCode::BAD_REQUEST, Json(ErrorBody { request: message.into() })) }
fn now() -> String { Utc::now().to_rfc3339() }
fn env_or(name: &str, default: &str) -> String { env::var(name).unwrap_or_else(|_| default.into()) }

#[derive(Serialize, FromRow)]
struct ProductRow { id: String, slug: String, name: String, description: String, base_price: f64, published: bool, created_at: String, updated_at: String }
#[derive(Serialize, FromRow)]
struct VariantRow { id: String, product_id: String, size: String, color: String, sku: Option<String>, price_override: Option<f64>, stock_quantity: i64, is_active: bool }
#[derive(Serialize, FromRow)]
struct ImageRow { id: String, product_id: String, blob_key: String, content_type: String, size_bytes: i64, sort_order: i64, alt_text: String }
#[derive(Serialize)]
struct VariantView { id: String, size: String, color: String, sku: Option<String>, price: f64, #[serde(rename = "stockQuantity")] stock_quantity: i64, #[serde(rename = "isActive")] is_active: bool }
#[derive(Serialize)]
struct ImageView { id: String, url: String, #[serde(rename = "contentType")] content_type: String, #[serde(rename = "sizeBytes")] size_bytes: i64, #[serde(rename = "sortOrder")] sort_order: i64, #[serde(rename = "altText")] alt_text: String }
#[derive(Serialize)]
struct ProductView { id: String, slug: String, name: String, description: String, #[serde(rename = "basePrice")] base_price: f64, published: bool, #[serde(rename = "createdAt")] created_at: String, #[serde(rename = "updatedAt")] updated_at: String, variants: Vec<VariantView>, images: Vec<ImageView> }

async fn product_view(state: &AppState, product: ProductRow, base: &str) -> Result<ProductView, sqlx::Error> {
    let variants = sqlx::query_as::<_, VariantRow>("SELECT id, product_id, size, color, sku, price_override, stock_quantity, is_active FROM product_variants WHERE product_id = ? ORDER BY size, color")
        .bind(&product.id).fetch_all(&state.db).await?;
    let images = sqlx::query_as::<_, ImageRow>("SELECT id, product_id, blob_key, content_type, size_bytes, sort_order, alt_text FROM product_images WHERE product_id = ? ORDER BY sort_order")
        .bind(&product.id).fetch_all(&state.db).await?;
    Ok(ProductView { id: product.id, slug: product.slug, name: product.name, description: product.description, base_price: product.base_price, published: product.published, created_at: product.created_at, updated_at: product.updated_at,
        variants: variants.into_iter().map(|v| VariantView { id: v.id, size: v.size, color: v.color, sku: v.sku, price: v.price_override.unwrap_or(product.base_price), stock_quantity: v.stock_quantity, is_active: v.is_active }).collect(),
        images: images.into_iter().map(|i| ImageView { id: i.id, url: format!("{base}/uploads/{}", i.blob_key), content_type: i.content_type, size_bytes: i.size_bytes, sort_order: i.sort_order, alt_text: i.alt_text }).collect() })
}

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
async fn login(State(state): State<AppState>, Json(req): Json<LoginRequest>) -> impl IntoResponse {
    if valid_password(&req.password, &state.admin_hash) { (StatusCode::OK, Json(serde_json::json!({"token": token(&state), "expiresInHours": 8}))) } else { (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"Invalid credentials"}))) }
}
async fn logout() -> StatusCode { StatusCode::NO_CONTENT }

#[derive(Deserialize)] struct ProductQuery { search: Option<String>, size: Option<String>, color: Option<String>, page: Option<i64>, page_size: Option<i64> }
async fn list_products(State(state): State<AppState>, headers: HeaderMap, Query(query): Query<ProductQuery>) -> Result<Json<serde_json::Value>, StatusCode> {
    let all = sqlx::query_as::<_, ProductRow>("SELECT id, slug, name, description, base_price, published, created_at, updated_at FROM products WHERE published = 1 ORDER BY created_at DESC").fetch_all(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let mut filtered = Vec::new();
    for product in all { let hay = format!("{} {}", product.name.to_lowercase(), product.description.to_lowercase()); if query.search.as_ref().is_some_and(|s| !hay.contains(&s.to_lowercase())) { continue; } let variants = sqlx::query_as::<_, VariantRow>("SELECT id, product_id, size, color, sku, price_override, stock_quantity, is_active FROM product_variants WHERE product_id = ? AND is_active = 1 AND stock_quantity > 0").bind(&product.id).fetch_all(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?; if query.size.as_ref().is_some_and(|s| !variants.iter().any(|v| &v.size == s)) || query.color.as_ref().is_some_and(|s| !variants.iter().any(|v| &v.color == s)) { continue; } filtered.push(product); }
    let total = filtered.len() as i64; let page = query.page.unwrap_or(1).clamp(1, 10000); let size = query.page_size.unwrap_or(24).clamp(1, 100); let start = ((page - 1) * size) as usize; let items = if start >= filtered.len() { vec![] } else { filtered.into_iter().skip(start).take(size as usize).collect() }; let base = format!("{}://{}", env_or("PUBLIC_SCHEME", "http"), headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost")); let mut views = Vec::new(); for p in items { views.push(product_view(&state, p, &base).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?); } Ok(Json(serde_json::json!({"items": views, "total": total, "page": page, "pageSize": size})))
}
async fn get_product(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<impl IntoResponse, StatusCode> { let product = sqlx::query_as::<_, ProductRow>("SELECT id, slug, name, description, base_price, published, created_at, updated_at FROM products WHERE id = ? AND published = 1").bind(id).fetch_optional(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?; let Some(product) = product else { return Ok(StatusCode::NOT_FOUND.into_response()) }; let base = format!("{}://{}", env_or("PUBLIC_SCHEME", "http"), headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost")); Ok(Json(product_view(&state, product, &base).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?).into_response()) }

#[derive(Deserialize)] struct OrderLine { #[serde(rename="variantId")] variant_id: String, quantity: i64 }
#[derive(Deserialize)] struct CreateOrder { #[serde(rename="customerName")] customer_name: String, #[serde(rename="customerPhone")] customer_phone: String, #[serde(rename="deliveryAddress")] delivery_address: String, notes: Option<String>, items: Vec<OrderLine> }
async fn create_order(State(state): State<AppState>, Json(req): Json<CreateOrder>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> {
    if req.customer_name.trim().is_empty() || req.customer_phone.trim().is_empty() || req.delivery_address.trim().is_empty() || req.items.is_empty() || req.items.len() > 50 { return Err(bad("Customer details and 1-50 items are required.")); }
    let mut tx = state.db.begin().await.map_err(|_| bad("Database error"))?; let order_id = Uuid::new_v4().to_string(); let created = now(); let mut total = 0.0; let mut lines = Vec::new();
    for item in req.items { if !(1..=20).contains(&item.quantity) { return Err(bad("Quantity must be between 1 and 20.")); } let row = sqlx::query_as::<_, (String, String, String, f64, Option<f64>, i64)>("SELECT v.id, v.product_id, p.name, p.base_price, v.price_override, v.stock_quantity FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.is_active=1 AND p.published=1").bind(&item.variant_id).fetch_optional(&mut *tx).await.map_err(|_| bad("Database error"))?; let Some((variant_id, product_id, product_name, base, override_price, stock)) = row else { return Err(bad("A selected variant is unavailable or out of stock.")); }; if stock < item.quantity { return Err(bad("A selected variant is unavailable or out of stock.")); } let details = sqlx::query_as::<_, (String, String)>("SELECT size, color FROM product_variants WHERE id=?").bind(&variant_id).fetch_one(&mut *tx).await.map_err(|_| bad("Database error"))?; let price = override_price.unwrap_or(base); let line_total = price * item.quantity as f64; total += line_total; sqlx::query("UPDATE product_variants SET stock_quantity=stock_quantity-? WHERE id=?").bind(item.quantity).bind(&variant_id).execute(&mut *tx).await.map_err(|_| bad("Database error"))?; lines.push((product_id, variant_id, product_name, details.0, details.1, price, item.quantity, line_total)); }
    sqlx::query("INSERT INTO orders (id,status,customer_name,customer_phone,delivery_address,notes,total,created_at,updated_at) VALUES (?, 'Pending', ?, ?, ?, ?, ?, ?, ?)").bind(&order_id).bind(req.customer_name.trim()).bind(req.customer_phone.trim()).bind(req.delivery_address.trim()).bind(req.notes.as_deref().map(str::trim)).bind(total).bind(&created).bind(&created).execute(&mut *tx).await.map_err(|_| bad("Database error"))?; for (product_id, variant_id, name, size, color, price, quantity, line_total) in lines { sqlx::query("INSERT INTO order_items (id,order_id,product_id,variant_id,product_name_snapshot,size_snapshot,color_snapshot,unit_price,quantity,line_total) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(Uuid::new_v4().to_string()).bind(&order_id).bind(product_id).bind(variant_id).bind(name).bind(size).bind(color).bind(price).bind(quantity).bind(line_total).execute(&mut *tx).await.map_err(|_| bad("Database error"))?; } tx.commit().await.map_err(|_| bad("Database error"))?; Ok((StatusCode::CREATED, Json(serde_json::json!({"id": order_id, "status":"Pending", "total": total, "createdAt": created}))))
}

#[derive(Deserialize)] struct ProductInput { name: String, description: Option<String>, slug: Option<String>, #[serde(rename="basePrice")] base_price: f64, published: bool }
#[derive(Deserialize)] struct VariantInput { size: String, color: String, sku: Option<String>, #[serde(rename="priceOverride")] price_override: Option<f64>, #[serde(rename="stockQuantity")] stock_quantity: i64, #[serde(rename="isActive")] is_active: bool }
fn slugify(value: &str) -> String { value.trim().to_lowercase().split_whitespace().collect::<Vec<_>>().join("-").replace('/', "-") }
async fn admin_products(State(state): State<AppState>, headers: HeaderMap) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state, &headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } let products = sqlx::query_as::<_, ProductRow>("SELECT id, slug, name, description, base_price, published, created_at, updated_at FROM products ORDER BY created_at DESC").fetch_all(&state.db).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?; let base = format!("{}://{}", env_or("PUBLIC_SCHEME", "http"), headers.get("host").and_then(|v| v.to_str().ok()).unwrap_or("localhost")); let mut result = Vec::new(); for p in products { result.push(product_view(&state,p,&base).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?); } Ok(Json(result).into_response()) }
async fn create_product(State(state): State<AppState>, headers: HeaderMap, Json(req): Json<ProductInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } if req.name.trim().is_empty() || req.base_price < 0.0 { return Err(bad("Name and a non-negative price are required.")); } let id=Uuid::new_v4().to_string(); let timestamp=now(); let slug=req.slug.as_deref().map(slugify).filter(|s|!s.is_empty()).unwrap_or_else(||slugify(&req.name)); sqlx::query("INSERT INTO products (id,slug,name,description,base_price,published,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(&id).bind(&slug).bind(req.name.trim()).bind(req.description.unwrap_or_default().trim()).bind(req.base_price).bind(req.published).bind(&timestamp).bind(&timestamp).execute(&state.db).await.map_err(|_| bad("Could not create product"))?; Ok((StatusCode::CREATED, Json(serde_json::json!({"id":id,"slug":slug,"name":req.name,"basePrice":req.base_price,"published":req.published,"createdAt":timestamp,"updatedAt":timestamp,"variants":[],"images":[]}))).into_response()) }
async fn update_product(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<ProductInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } let result=sqlx::query("UPDATE products SET slug=COALESCE(NULLIF(?,''),slug),name=?,description=?,base_price=?,published=?,updated_at=? WHERE id=?").bind(req.slug.as_deref().map(slugify).unwrap_or_default()).bind(req.name.trim()).bind(req.description.unwrap_or_default().trim()).bind(req.base_price).bind(req.published).bind(now()).bind(&id).execute(&state.db).await.map_err(|_|bad("Could not update product"))?; if result.rows_affected()==0 { return Ok(StatusCode::NOT_FOUND.into_response()) } Ok(StatusCode::OK.into_response()) }
async fn delete_product(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<StatusCode, StatusCode> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED) } let result=sqlx::query("DELETE FROM products WHERE id=?").bind(id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND} else {StatusCode::NO_CONTENT}) }
async fn save_variant(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<VariantInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers) { return Ok(StatusCode::UNAUTHORIZED.into_response()) } if req.size.trim().is_empty() || req.color.trim().is_empty() || req.stock_quantity<0 { return Err(bad("Size, color and non-negative stock are required.")); } let variant_id=Uuid::new_v4().to_string(); let result=sqlx::query("INSERT INTO product_variants (id,product_id,size,color,sku,price_override,stock_quantity,is_active) VALUES (?,?,?,?,?,?,?,?)").bind(&variant_id).bind(&id).bind(req.size.trim()).bind(req.color.trim()).bind(req.sku).bind(req.price_override).bind(req.stock_quantity).bind(req.is_active).execute(&state.db).await.map_err(|_|bad("Could not create variant"))?; if result.rows_affected()==0 {return Ok(StatusCode::NOT_FOUND.into_response())}; Ok((StatusCode::CREATED,Json(serde_json::json!({"id":variant_id,"productId":id}))).into_response()) }
async fn update_variant(State(state): State<AppState>, headers: HeaderMap, Path((id,variant_id)): Path<(String,String)>, Json(req): Json<VariantInput>) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let result=sqlx::query("UPDATE product_variants SET size=?,color=?,sku=?,price_override=?,stock_quantity=?,is_active=? WHERE id=? AND product_id=?").bind(req.size.trim()).bind(req.color.trim()).bind(req.sku).bind(req.price_override).bind(req.stock_quantity).bind(req.is_active).bind(variant_id).bind(id).execute(&state.db).await.map_err(|_|bad("Could not update variant"))?; Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND} else {StatusCode::OK}.into_response()) }
async fn delete_variant(State(state): State<AppState>, headers: HeaderMap, Path((id,variant_id)): Path<(String,String)>) -> Result<StatusCode, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED)} let result=sqlx::query("DELETE FROM product_variants WHERE id=? AND product_id=?").bind(variant_id).bind(id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0 {StatusCode::NOT_FOUND}else{StatusCode::NO_CONTENT}) }

async fn upload_image(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, mut multipart: Multipart) -> Result<impl IntoResponse, (StatusCode, Json<ErrorBody>)> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let mut bytes=Vec::new(); let mut content_type="application/octet-stream".to_string(); let mut alt=String::new(); while let Some(field)=multipart.next_field().await.map_err(|_|bad("Invalid multipart request"))? { if field.name()==Some("file") || field.name()==Some("image") { content_type=field.content_type().unwrap_or("application/octet-stream").to_string(); bytes=field.bytes().await.map_err(|_|bad("Could not read image"))?.to_vec(); } else if field.name()==Some("altText") { alt=field.text().await.unwrap_or_default(); } } if bytes.is_empty() || bytes.len()>MAX_UPLOAD || !matches!(content_type.as_str(),"image/jpeg"|"image/png"|"image/webp") {return Err(bad("Only JPEG, PNG and WebP images up to 5 MB are accepted."))} let key=format!("{}{}",Uuid::new_v4(),match content_type.as_str(){"image/jpeg"=>".jpg","image/png"=>".png",_=>".webp"}); tokio::fs::create_dir_all(&state.uploads).await.map_err(|_|bad("Could not store image"))?; tokio::fs::write(state.uploads.join(&key),bytes).await.map_err(|_|bad("Could not store image"))?; let image_id=Uuid::new_v4().to_string(); sqlx::query("INSERT INTO product_images (id,product_id,blob_key,content_type,size_bytes,sort_order,alt_text) VALUES (?,?,?,?,?,?,?)").bind(&image_id).bind(id).bind(&key).bind(&content_type).bind(0_i64).bind(0_i64).bind(alt).execute(&state.db).await.map_err(|_|bad("Could not save image"))?; Ok((StatusCode::CREATED,Json(serde_json::json!({"id":image_id,"blobKey":key}))).into_response()) }

#[derive(Deserialize)] struct StatusInput { status: String }
async fn admin_orders(State(state): State<AppState>, headers: HeaderMap) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let orders=sqlx::query("SELECT id,status,customer_name,customer_phone,delivery_address,notes,total,created_at,updated_at FROM orders ORDER BY created_at DESC").fetch_all(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; let result: Vec<_>=orders.iter().map(|r|serde_json::json!({"id":r.get::<String,_>("id"),"status":r.get::<String,_>("status"),"customerName":r.get::<String,_>("customer_name"),"customerPhone":r.get::<String,_>("customer_phone"),"deliveryAddress":r.get::<String,_>("delivery_address"),"notes":r.get::<Option<String>,_>("notes"),"total":r.get::<f64,_>("total"),"createdAt":r.get::<String,_>("created_at"),"updatedAt":r.get::<String,_>("updated_at")})).collect(); Ok(Json(result).into_response()) }
async fn update_status(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<StatusInput>) -> Result<impl IntoResponse, StatusCode> { if !is_admin(&state,&headers){return Ok(StatusCode::UNAUTHORIZED.into_response())} let allowed=["Pending","Confirmed","Preparing","Shipped","Delivered","Cancelled"]; if !allowed.iter().any(|x|x.eq_ignore_ascii_case(&req.status)){return Ok(bad("Invalid order status.").into_response())} let status=allowed.iter().find(|x|x.eq_ignore_ascii_case(&req.status)).unwrap(); let result=sqlx::query("UPDATE orders SET status=?,updated_at=? WHERE id=?").bind(status).bind(now()).bind(id).execute(&state.db).await.map_err(|_|StatusCode::INTERNAL_SERVER_ERROR)?; Ok(if result.rows_affected()==0{StatusCode::NOT_FOUND}else{StatusCode::OK}.into_response()) }

async fn init_db(pool: &SqlitePool) -> Result<(), sqlx::Error> { for sql in [
"CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', base_price REAL NOT NULL, published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS product_variants (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, size TEXT NOT NULL, color TEXT NOT NULL, sku TEXT, price_override REAL, stock_quantity INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, UNIQUE(product_id,size,color))",
"CREATE TABLE IF NOT EXISTS product_images (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, blob_key TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, alt_text TEXT NOT NULL DEFAULT '')",
"CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, status TEXT NOT NULL, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, delivery_address TEXT NOT NULL, notes TEXT, total REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id TEXT NOT NULL, variant_id TEXT NOT NULL, product_name_snapshot TEXT NOT NULL, size_snapshot TEXT NOT NULL, color_snapshot TEXT NOT NULL, unit_price REAL NOT NULL, quantity INTEGER NOT NULL, line_total REAL NOT NULL)",
].iter(){sqlx::query(sql).execute(pool).await?;} Ok(()) }

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> { tracing_subscriber::fmt().with_env_filter(env_or("RUST_LOG","info")).init(); let database_url=env_or("DATABASE_URL","sqlite://.local-dev/data/jenny.db?mode=rwc"); if let Some(path)=database_url.strip_prefix("sqlite://").and_then(|p|p.split('?').next()) { if path!="jenny.db" { if let Some(parent)=std::path::Path::new(path).parent(){tokio::fs::create_dir_all(parent).await?;} } } let db=SqlitePoolOptions::new().max_connections(5).connect(&database_url).await?; init_db(&db).await?; let uploads=PathBuf::from(env_or("UPLOADS_DIR","uploads")); tokio::fs::create_dir_all(&uploads).await?; let state=AppState{db,uploads: uploads.clone(),admin_hash:env::var("ADMIN_PASSWORD_HASH").expect("ADMIN_PASSWORD_HASH is required"),signing_key:env::var("AUTH_SIGNING_KEY").expect("AUTH_SIGNING_KEY is required")}; let app=Router::new().route("/api/health",get(health)).route("/api/auth/login",post(login)).route("/api/auth/logout",post(logout)).route("/api/products",get(list_products)).route("/api/products/:id",get(get_product)).route("/api/orders",post(create_order)).route("/api/admin/products",get(admin_products).post(create_product)).route("/api/admin/products/:id",put(update_product).delete(delete_product)).route("/api/admin/products/:id/variants",post(save_variant)).route("/api/admin/products/:id/variants/:variant_id",put(update_variant).delete(delete_variant)).route("/api/admin/products/:id/images",post(upload_image)).route("/api/admin/orders",get(admin_orders)).route("/api/admin/orders/:id/status",patch(update_status)).nest_service("/uploads",ServeDir::new(&uploads)).fallback_service(ServeDir::new("Frontend/dist")).layer(DefaultBodyLimit::max(6*1024*1024)).layer(CorsLayer::permissive()).layer(TraceLayer::new_for_http()).with_state(state); let port=env_or("PORT","8080").parse::<u16>()?; let addr=SocketAddr::from(([0,0,0,0],port)); tracing::info!(%addr,"Jenny Rust API listening"); axum::serve(tokio::net::TcpListener::bind(addr).await?,app).await?; Ok(()) }
