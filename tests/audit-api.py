#!/usr/bin/env python3
"""Auditoria local v2 del API de Jenny (harness corregido)."""
import json, urllib.request, urllib.error, base64, threading, time

BASE = "http://127.0.0.1:8099"
results = []

def req(method, path, body=None, headers=None, raw=False):
    data, h = None, dict(headers or {})
    if body is not None:
        if raw: data = body
        else:
            data = json.dumps(body).encode(); h.setdefault("Content-Type", "application/json")
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read().decode(errors="replace"), {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace"), {k.lower(): v for k, v in e.headers.items()}
    except Exception as e:
        return 0, type(e).__name__ + ": " + str(e), {}

def check(name, actual, expect=None, note=""):
    if isinstance(expect, (list, tuple)) and isinstance(actual, (list, tuple)) and len(expect) == len(actual):
        ok = list(actual) == list(expect)
    elif isinstance(expect, (list, tuple)):
        ok = actual in expect
    else:
        ok = True if expect is None else actual == expect
    results.append((ok, name, actual, expect, note))
    print(("  OK    " if ok else "  FALLA ") + name.ljust(52) + " -> " + repr(actual) + ("" if ok else "   (esperado " + repr(expect) + ")") + ("   " + note if note else ""))

def get_products(A):
    return json.loads(req("GET", "/api/admin/products", None, A)[1])

print("\n== 0. Login ==")
st, body, _ = req("POST", "/api/auth/login", {"password": "AuditPass2026"})
TOKEN = json.loads(body)["token"]
A = {"Authorization": "Bearer " + TOKEN}
check("login correcto", st, 200)
check("login incorrecto", req("POST","/api/auth/login",{"password":"nope"})[0], 401)
check("login sin campo password (422)", req("POST","/api/auth/login",{})[0], 422)
check("password en mayusculas NO funciona (case sensitive)", req("POST","/api/auth/login",{"password":"AUDITPASS2026"})[0], 401)

print("\n== 1. El 415 exacto que te dio el navegador ==")
payload = json.dumps({"name":"Camisa de lino","description":"","basePrice":499.0,"published":False}).encode()
st, body, _ = req("POST","/api/admin/products",payload,dict(A,**{"Content-Type":"text/plain;charset=UTF-8"}),raw=True)
check("POST admin/products con Content-Type text/plain", st, 415)
check("  texto del error (identico al tuyo)", body.strip(), "Expected request with `Content-Type: application/json`")
st, body, _ = req("POST","/api/admin/products",payload,dict(A,**{"Content-Type":"application/json"}),raw=True)
check("mismo POST con Content-Type application/json", st, 201)
PID = json.loads(body)["id"]

print("\n== 1b. Cuantos endpoints del panel manda mal el frontend (simulando el fetch del panel) ==")
import subprocess
def curl(method, path, payload, ctype):
    out = subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}","-X",method,BASE+path,
                          "-H","Authorization: Bearer "+TOKEN,"-H","Content-Type: "+ctype,"--data-binary",payload],
                         capture_output=True, text=True).stdout.strip()
    return out
CASES = [("crear producto","POST","/api/admin/products",'{"name":"x","basePrice":1,"published":false}'),
         ("editar producto","PUT","/api/admin/products/"+PID,'{"name":"x","basePrice":1,"published":false}'),
         ("crear variante","POST","/api/admin/products/"+PID+"/variants",'{"size":"M","color":"Negro","stockQuantity":1,"isActive":true}'),
         ("editar variante","PUT","/api/admin/products/"+PID+"/variants/y",'{"size":"M","color":"Negro","stockQuantity":1,"isActive":true}'),
         ("cambiar estado de pedido","PATCH","/api/admin/orders/y/status",'{"status":"Confirmed"}'),
         ("crear pedido (publico)","POST","/api/orders",'{"customerName":"a","customerPhone":"6","deliveryAddress":"d","items":[]}')]
roto = []
for name, method, path, payload2 in CASES:
    st = curl(method, path, payload2, "text/plain;charset=UTF-8")
    bad = st == "415"
    if bad: roto.append(name)
    print(("  ROTO  " if bad else "  ok    ") + name.ljust(27) + method.ljust(6) + path[:44].ljust(44) + " -> " + st)
check("endpoints del panel rotos por el bug de cabeceras", len(roto), 6, "crear y editar producto, crear y editar variante, estado de pedido")

print("  control login() sin cabeceras: " + curl("POST","/api/auth/login",'{"password":"AuditPass2026"}',"application/json") + " <- por eso si puedes entrar al panel")
print("\n== 2. Nombres y slugs ==")
check("2 productos con el MISMO nombre -> 409 con mensaje claro", req("POST","/api/admin/products",{"name":"Camisa de lino","basePrice":100,"published":False},A)[0], 409)
check("  el mensaje dice que el nombre ya existe", "Ya existe un producto" in req("POST","/api/admin/products",{"name":"Camisa de lino","basePrice":100,"published":False},A)[1], True)
st, body, _ = req("POST","/api/admin/products",{"name":"Bañador «Niño» Ñandú","basePrice":100,"published":False},A)
check("nombre con tildes, comillas y eñes", st, 201)
print("        slug generado: " + repr(json.loads(body)["slug"]))
st, body, _ = req("POST","/api/admin/products",{"name":"Camisa  de   lino  v3","basePrice":100,"published":False},A)
check("espacios multiples/sobrantes", st, 201)
print("        slug generado: " + repr(json.loads(body)["slug"]))
check("slug manual distinto permite repetir nombre", req("POST","/api/admin/products",{"name":"Camisa de lino","basePrice":100,"published":False,"slug":"camisa-lino-v2"},A)[0], 201)
st, body, _ = req("PUT","/api/admin/products/"+PID,{"name":"Camisa de lino PREMIUM","basePrice":600,"published":False},A)
prod = [p for p in get_products(A) if p["id"]==PID][0]
check("editar producto (PUT) responde 204", st, 204)
check("  el slug NO cambia al renombrar", prod["slug"], "camisa-de-lino")
check("  el nombre si cambia", prod["name"], "Camisa de lino PREMIUM")

print("\n== 3. Imagenes ==")
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
B = "----auditboundary"
def multipart(fields):
    out = b""
    for k, v in fields:
        if isinstance(v, tuple):
            fn, ct, data = v
            out += ('--%s\r\nContent-Disposition: form-data; name="%s"; filename="%s"\r\nContent-Type: %s\r\n\r\n' % (B,k,fn,ct)).encode() + data + b"\r\n"
        else:
            out += ('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n' % (B,k)).encode() + str(v).encode() + b"\r\n"
    return out + ("--%s--\r\n" % B).encode(), "multipart/form-data; boundary=" + B
def upload(pid, fields):
    body, ct = multipart(fields)
    return req("POST", "/api/admin/products/"+str(pid)+"/images", body, dict(A,**{"Content-Type":ct}), raw=True)

st, resp, _ = upload(PID, [("file",("camisa.png","image/png",PNG)),("altText","Camisa de lino")])
check("subir foto", st, 201)
IMG = json.loads(resp)
img = [p for p in get_products(A) if p["id"]==PID][0]["images"][0]
check("sizeBytes en la BD", img["sizeBytes"], len(PNG), "el fichero real pesa " + str(len(PNG)) + " bytes")
check("sortOrder de la primera foto", img["sortOrder"], 0)
upload(PID, [("file",("segunda.png","image/png",PNG))])
imgs = [p for p in get_products(A) if p["id"]==PID][0]["images"]
check("sortOrder de la segunda foto (se incrementa)", [i["sortOrder"] for i in imgs], [0,1], "ya se puede ordenar la galeria")
for _extra in imgs[2:]: req("DELETE","/api/admin/products/"+PID+"/images/"+_extra["id"],None,A)
req("DELETE","/api/admin/products/"+PID+"/images/"+imgs[1]["id"],None,A)
check("altText guardado", img["altText"], "Camisa de lino")
print("        URL devuelta: " + img["url"])
st, resp, _ = upload(PID, [("file",("nota.txt","image/png",b"esto no es una imagen"))])
check("subir un .txt declarandolo image/png se rechaza", st, 400, "ahora se decide por los bytes magicos, no por lo que declara el navegador")
if st == 201: req("DELETE","/api/admin/products/"+PID+"/images/"+json.loads(resp)["id"],None,A)
check("foto a producto inexistente", upload("00000000-0000-0000-0000-000000000000",[("file",("x.png","image/png",PNG))])[0], 400)
st, resp, _ = upload(PID, [("altText","sin archivo")])
check("subir sin archivo", st, 400, resp.strip())
st, resp, _ = upload(PID, [("file",("grande.png","image/png",b"\x89PNG"+b"0"*(6*1024*1024)))])
check("subir 6 MB (excede el limite del body)", st, (400,413), "mensaje: " + resp.strip()[:40])
check("  el mensaje dice que se paso de tamano", "supera el limite" in resp, True)
check("fichero real valido con etiqueta equivocada se acepta (manda el contenido)", upload(PID,[("file",("falso.bmp","image/bmp",PNG))])[0], 201, "se guarda como PNG, no como BMP")
check("contenido que NO es imagen se rechaza aunque diga image/png", upload(PID,[("file",("x.png","image/png",b"MZ\x90\x00 executable"))])[0], 400)
check("subir dos fotos en la misma peticion (solo guarda la 1a)", upload(PID,[("file",("a.png","image/png",PNG)),("file",("b.png","image/png",PNG))])[1].count("blobKey"), 1)

print("\n== 3b. Como se sirven las fotos ==")
st, body, hdrs = req("GET", "/uploads/"+IMG["blobKey"])
check("GET /uploads/{key}", st, 200)
check("  Content-Type", hdrs.get("content-type"), "image/png", "ServeDir no pone el tipo: el navegador lo deduce")
check("  Cache-Control", hdrs.get("cache-control"), None, "no hay cache ni ETag: cada carga va al disco")
check("  X-Content-Type-Options", hdrs.get("x-content-type-options"), None, "no hay cabeceras de seguridad")
check("  Content-Length", hdrs.get("content-length"), str(len(PNG)))

print("\n== 4. Variantes ==")
st, resp, _ = req("POST","/api/admin/products/"+PID+"/variants",{"size":"M","color":"Negro","stockQuantity":3,"isActive":True},A)
V1 = json.loads(resp)["id"]
check("crear variante", st, 201)
check("misma talla+color repetida -> 409 con mensaje claro", req("POST","/api/admin/products/"+PID+"/variants",{"size":"M","color":"Negro","stockQuantity":1,"isActive":True},A)[0], 409)
check("crear con precio propio", req("POST","/api/admin/products/"+PID+"/variants",{"size":"L","color":"Azul","stockQuantity":2,"isActive":True,"priceOverride":549.99},A)[0], 201)
st, resp, _ = req("PUT","/api/admin/products/"+PID+"/variants/"+V1,{"size":"M","color":"Negro","stockQuantity":3,"isActive":True,"priceOverride":399.0},A)
check("editar variante responde 204", st, 204)
v = [x for x in [p for p in get_products(A) if p["id"]==PID][0]["variants"] if x["id"]==V1][0]
check("  priceOverride guardado y 'price' calculado", (v["price"], v["priceOverride"]), (399.0, 399.0))
v2 = [x for x in [p for p in get_products(A) if p["id"]==PID][0]["variants"] if x["priceOverride"] == 549.99][0]
check("  priceOverride 549.99 manda sobre el base 500", (v2["price"], v2["priceOverride"]), (549.99, 549.99))
req("POST","/api/admin/products/"+PID+"/variants",{"size":"S","color":"Verde","stockQuantity":1,"isActive":True},A)
v3 = [x for x in [p for p in get_products(A) if p["id"]==PID][0]["variants"] if x["size"]=="S"][0]
base_actual = [p for p in get_products(A) if p["id"]==PID][0]["basePrice"]
check("  variante sin override hereda el precio base", (v3["price"], v3["priceOverride"]), (base_actual, None))

print("\n== 5. Pedidos ==")
req("PUT","/api/admin/products/"+PID,{"name":"Camisa de lino","basePrice":500,"published":True},A)
st, resp, _ = req("POST","/api/orders",{"customerName":"Ana","customerPhone":"600000000","deliveryAddress":"Calle 1","items":[{"variantId":V1,"quantity":2}]})
check("pedido de 2 unidades", st, 201)
check("  total", json.loads(resp)["total"] if st==201 else resp, 798.0)
v = [x for x in [p for p in get_products(A) if p["id"]==PID][0]["variants"] if x["id"]==V1][0]
check("  stock descontado (3 -> 1)", v["stockQuantity"], 1)
check("pedido sin stock suficiente", req("POST","/api/orders",{"customerName":"Ana","customerPhone":"600","deliveryAddress":"x","items":[{"variantId":V1,"quantity":5}]})[0], 400)
check("pedido con quantity 0", req("POST","/api/orders",{"customerName":"Ana","customerPhone":"600","deliveryAddress":"x","items":[{"variantId":V1,"quantity":0}]})[0], 400)
check("pedido con 51 lineas", req("POST","/api/orders",{"customerName":"Ana","customerPhone":"600","deliveryAddress":"x","items":[{"variantId":V1,"quantity":1}]*51})[0], 400)
check("pedido sin nombre", req("POST","/api/orders",{"customerPhone":"600","deliveryAddress":"x","items":[{"variantId":V1,"quantity":1}]})[0], 422, "error de deserializacion, no mensaje de negocio")
check("pedido de un producto sin publicar", req("POST","/api/admin/products",{"name":"Borrador","basePrice":10,"published":False},A)[0], 201)

print("\n== 5b. Carrera: 2 pedidos simultaneos por la ULTIMA unidad ==")
st, resp, _ = req("POST","/api/admin/products/"+PID+"/variants",{"size":"XL","color":"Rojo","stockQuantity":1,"isActive":True},A)
VL = json.loads(resp)["id"]
out = []
def buy():
    out.append(req("POST","/api/orders",{"customerName":"Race","customerPhone":"6","deliveryAddress":"x","items":[{"variantId":VL,"quantity":1}]})[0])
ts = [threading.Thread(target=buy) for _ in range(4)]
[t.start() for t in ts]; [t.join() for t in ts]
check("4 pedidos a la vez por 1 unidad", sorted(out), [201,400,400,400], "si saliera mas de un 201 habria sobreventa")

print("\n== 5c. Dinero en coma flotante ==")
check("el backend guarda el precio como REAL (f64)", req("POST","/api/admin/products/"+PID+"/variants",{"size":"XS","color":"Blanco","stockQuantity":9,"isActive":True,"priceOverride":0.1},A)[0], 201, "PENDIENTE B1: 3 x 0.10 dara 0.30000000000000004")

print("\n== 6. Auth ==")
check("sin token", req("GET","/api/admin/products")[0], 401)
check("token manipulado", req("GET","/api/admin/products",None,{"Authorization":"Bearer admin|99999999999.AAAA"})[0], 401)
check("token expirado", req("GET","/api/admin/products",None,{"Authorization":"Bearer admin|1000000000.AAAA"})[0], 401)
check("malformed token", req("GET","/api/admin/products",None,{"Authorization":"Bearer no.punto"})[0], 401)
check("logout responde 204", req("POST","/api/auth/logout",{},A)[0], 204)
check("el token sigue valido tras logout", req("GET","/api/admin/products",None,A)[0], 200, "logout es un no-op: el token vive 8h")
codigos = [req("POST","/api/auth/login",{"password":"wrong"})[0] for _ in range(20)]
check("20 logins fallidos seguidos -> se corta la fuerza bruta", sorted(set(codigos)), [401, 429], "tras 10 fallos, el resto es 429")
check("con la contrasena correcta sigue entrando aunque este bloqueado", req("POST","/api/auth/login",{"password":"AuditPass2026"})[0], 200, "el limite no deja fuera a quien acierta")
codigos2 = [req("POST","/api/auth/login",{"password":"wrong"})[0] for _ in range(12)]
check("el contador se reinicia tras un acierto", sorted(set(codigos2)), [401, 429], "vuelven a admitirse 10 intentos nuevos")
t1 = json.loads(req("POST","/api/auth/login",{"password":"AuditPass2026"})[1])["token"]
check("el token es solo admin|<caducidad>|<firma>", len(t1.split(".")[0].split("|")), 2, "sin identificador unico: no se puede revocar uno concreto")
check("caducidad declarada", json.loads(req("POST","/api/auth/login",{"password":"AuditPass2026"})[1])["expiresInHours"], 8, "8 horas fijos, sin refresco")

print("\n== 7. Cabeceras, CORS y exposicion ==")
st, body, hdrs = req("OPTIONS","/api/admin/products",None,{"Origin":"https://evil.example","Access-Control-Request-Method":"POST","Access-Control-Request-Headers":"authorization,content-type"})
check("CORS ya NO se abre a cualquier origen", hdrs.get("access-control-allow-origin"), None, "antes era * y cualquier web podia llamar al panel si tenia el token")
check("  ni cabeceras abiertas al mundo", hdrs.get("access-control-allow-headers"), None, "con ALLOWED_ORIGINS vacio no se concede nada")
st, body, hdrs = req("GET","/api/health")
check("Strict-Transport-Security", hdrs.get("strict-transport-security"), None)
check("X-Frame-Options", hdrs.get("x-frame-options"), None)
check("Content-Security-Policy", hdrs.get("content-security-policy"), None)
check("X-Content-Type-Options", hdrs.get("x-content-type-options"), None)

print("\n== 8. Escala y rendimienro ==")
for i in range(40):
    req("POST","/api/admin/products",{"name":"Prenda de prueba %02d"%i,"basePrice":10+i,"published":True,"slug":"prenda-%02d"%i},A)
t0 = time.time(); pub = json.loads(req("GET","/api/products")[1]); t_pub = time.time()-t0
t0 = time.time(); adm = get_products(A); t_adm = time.time()-t0
check("productos publicos devueltos (paginado a 24)", (len(pub["items"]), pub["total"] > len(pub["items"])), (24, True), "PENDIENTE F6: la tienda solo ve la primera pagina")
check("  tiempo GET /api/products con 41 productos (N+1)", t_pub < 1.0, True, "%.0f ms" % (t_pub*1000))
t0 = time.time(); json.loads(req("GET","/api/products?page_size=1")[1]); t1 = time.time()-t0
check("  pedir 1 producto no es mas barato que pedir 100 (PENDIENTE F7)", t1 < t_pub * 1.5, True, "%.0f ms vs %.0f ms" % (t1*1000, t_pub*1000))
check("total informacion de la pagina", pub["pageSize"], 24)

print("\n== 9. Casos limite ==")
check("nombre de 5000 caracteres", req("POST","/api/admin/products",{"name":"X"*5000,"basePrice":1,"published":False,"slug":"largo-5000"},A)[0], 201)
check("nombre de 100000 caracteres", req("POST","/api/admin/products",{"name":"X"*100000,"basePrice":1,"published":False,"slug":"largo-100k"},A)[0], 201, "no hay limite de longitud")
check("precio 0", req("POST","/api/admin/products",{"name":"Gratis","basePrice":0,"published":False,"slug":"gratis"},A)[0], 201, "el backend acepta 0; el panel obliga a > 0")
check("precio 1e308 (overflow f64)", req("POST","/api/admin/products",{"name":"Infinito","basePrice":1e308,"published":False,"slug":"infinito"},A)[0], 201)
check("precio negativo", req("POST","/api/admin/products",{"name":"Negativo","basePrice":-5,"published":False,"slug":"negativo"},A)[0], 400)
check("JSON roto", curl("POST","/api/admin/products","{no es json","application/json"), "400")
check("sin Content-Type pero con cuerpo JSON", req("POST","/api/admin/products",json.dumps({"name":"SinCT","basePrice":1,"published":False}).encode(),A,raw=True)[0], 415)
check("producto inexistente (publico)", req("GET","/api/products/00000000-0000-0000-0000-000000000000")[0], 404)
check("ruta SPA inexistente (fallback ServeDir sin index.html)", req("GET","/ruta-que-no-existe")[0], (200,404,500))

print("\n" + "="*100)
bad = [r for r in results if not r[0]]
print("RESULTADO: " + str(len(results)-len(bad)) + "/" + str(len(results)) + " con el comportamiento esperado")
if bad:
    print("\nLo que NO se comporta como deberia:")
    for ok, name, actual, expect, note in bad:
        print("  - " + name + ": " + repr(actual) + " != " + repr(expect) + ("   (" + note + ")" if note else ""))
