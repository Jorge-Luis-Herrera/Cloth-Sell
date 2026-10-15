from pathlib import Path
from textwrap import wrap

OUTPUT = Path(__file__).with_name("Cloth-Sell-API-Endpoints.pdf")
PAGE_W, PAGE_H = 595, 842
MARGIN = 48

sections = [
    ("Public API", [
        ("GET", "/api/health", "Checks API availability and SQLite connectivity."),
        ("GET", "/api/products", "Lists published products. Query: search, size, color, page, pageSize."),
        ("GET", "/api/products/{id}", "Returns the public detail of a published product."),
        ("POST", "/api/orders", "Creates an order and decreases stock transactionally."),
    ]),
    ("Authentication", [
        ("POST", "/api/auth/login", "Authenticates the administrator and returns a bearer token."),
        ("POST", "/api/auth/logout", "Ends the client session. Send the token from the client."),
    ]),
    ("Admin - Products", [
        ("GET", "/api/admin/products", "Lists all products, variants and images."),
        ("POST", "/api/admin/products", "Creates a clothing product."),
        ("PUT", "/api/admin/products/{id}", "Updates product data and publication status."),
        ("DELETE", "/api/admin/products/{id}", "Deletes a product."),
    ]),
    ("Admin - Variants and images", [
        ("POST", "/api/admin/products/{id}/variants", "Creates a size/color variant with SKU and stock."),
        ("PUT", "/api/admin/products/{id}/variants/{variantId}", "Updates a variant and its stock."),
        ("DELETE", "/api/admin/products/{id}/variants/{variantId}", "Deletes a variant."),
        ("POST", "/api/admin/products/{id}/images", "Uploads a JPEG, PNG or WebP image as multipart file."),
        ("DELETE", "/api/admin/products/{id}/images/{imageId}", "Deletes a product image."),
    ]),
    ("Admin - Orders", [
        ("GET", "/api/admin/orders", "Lists orders. Optional query: status."),
        ("GET", "/api/admin/orders/{id}", "Returns one order with its item snapshots."),
        ("PATCH", "/api/admin/orders/{id}/status", "Changes the order status."),
    ]),
]


def esc(value):
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_page(title, subtitle, rows, page_number, total_pages):
    commands = []
    def text(x, y, value, size=10, color=(0.12, 0.16, 0.20), font="F1"):
        commands.append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg /{font} {size} Tf {x} {y} Td ({esc(value)}) Tj 0 -{size} Td")
    def rect(x, y, w, h, fill):
        commands.append(f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg {x} {y} {w} {h} re f")

    rect(0, 0, PAGE_W, PAGE_H, (0.98, 0.97, 0.94))
    rect(0, PAGE_H - 120, PAGE_W, 120, (0.08, 0.16, 0.20))
    text(MARGIN, PAGE_H - 60, "CLOTH-SELL", 12, (0.83, 0.72, 0.46), "F2")
    text(MARGIN, PAGE_H - 88, title, 24, (1, 1, 1), "F2")
    text(MARGIN, PAGE_H - 142, subtitle, 9, (0.25, 0.30, 0.32))

    y = PAGE_H - 180
    for method, path, description in rows:
        h = 58
        rect(MARGIN, y - h + 8, PAGE_W - 2 * MARGIN, h, (1, 1, 1))
        method_color = {"GET": (0.12, 0.42, 0.34), "POST": (0.16, 0.32, 0.52), "PUT": (0.55, 0.35, 0.10), "PATCH": (0.45, 0.25, 0.50), "DELETE": (0.55, 0.17, 0.15)}[method]
        rect(MARGIN + 12, y - 24, 55, 20, method_color)
        text(MARGIN + 22, y - 18, method, 8, (1, 1, 1), "F2")
        text(MARGIN + 82, y - 16, path, 10, (0.08, 0.16, 0.20), "F2")
        lines = wrap(description, 82)
        text(MARGIN + 82, y - 34, lines[0], 8, (0.30, 0.34, 0.35))
        if len(lines) > 1:
            text(MARGIN + 82, y - 45, lines[1], 8, (0.30, 0.34, 0.35))
        y -= h + 12

    text(MARGIN, 34, f"Cloth-Sell API  |  Page {page_number} of {total_pages}", 8, (0.35, 0.38, 0.38))
    return "\n".join(commands)


def build_pdf():
    pages = []
    cover = []
    def t(x, y, value, size=10, color=(0.12, 0.16, 0.20), font="F1"):
        cover.append(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg /{font} {size} Tf {x} {y} Td ({esc(value)}) Tj 0 -{size} Td")
    def r(x, y, w, h, fill):
        cover.append(f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg {x} {y} {w} {h} re f")
    r(0, 0, PAGE_W, PAGE_H, (0.98, 0.97, 0.94))
    r(0, PAGE_H - 260, PAGE_W, 260, (0.08, 0.16, 0.20))
    t(MARGIN, PAGE_H - 82, "CLOTH-SELL", 14, (0.83, 0.72, 0.46), "F2")
    t(MARGIN, PAGE_H - 142, "API ENDPOINTS", 31, (1, 1, 1), "F2")
    t(MARGIN, PAGE_H - 184, "Technical reference for the clothing commerce API", 11, (0.78, 0.83, 0.83))
    t(MARGIN, 500, "PROJECT LINKS", 10, (0.08, 0.16, 0.20), "F2")
    t(MARGIN, 468, "GitHub: github.com/Jorge-Luis-Herrera/Cloth-Sell", 11)
    t(MARGIN, 438, "Azure URL: jenny-clothing-20261014.azurewebsites.net", 11)
    r(MARGIN, 355, PAGE_W - 2 * MARGIN, 54, (0.92, 0.86, 0.70))
    t(MARGIN + 16, 386, "DEPLOYMENT STATUS", 9, (0.25, 0.20, 0.10), "F2")
    t(MARGIN + 16, 366, "The Azure URL is reserved, but the application image is not deployed yet.", 9, (0.25, 0.20, 0.10))
    t(MARGIN, 300, "Authentication: admin endpoints require Authorization: Bearer <token>", 10)
    t(MARGIN, 274, "Image uploads: JPEG, PNG or WebP; maximum 5 MB; server-side validation.", 10)
    t(MARGIN, 248, "Version documented: 9e9398d", 10)
    t(MARGIN, 34, "Cloth-Sell API  |  Prepared 2026-10-15", 8, (0.35, 0.38, 0.38))
    pages.append("\n".join(cover))

    flat_pages = []
    for section, entries in sections:
        flat_pages.append((section, entries))
    total = len(flat_pages) + 1
    for index, (section, entries) in enumerate(flat_pages, start=2):
        pages.append(make_page(section, "ASP.NET Core 8 REST API | JSON responses | GUID resources", entries, index, total))

    objects = []
    def add(obj):
        objects.append(obj)
        return len(objects)
    catalog = add(None)
    pages_obj = add(None)
    font_regular = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    font_bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_refs = []
    for content in pages:
        stream = content + "\n"
        content_ref = add(f"<< /Length {len(stream.encode('latin-1'))} >>\nstream\n{stream}\nendstream")
        page_refs.append(add(f"<< /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] /Resources << /Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >> >> /Contents {content_ref} 0 R >>"))
    objects[pages_obj - 1] = f"<< /Type /Pages /Kids [{' '.join(str(x) + ' 0 R' for x in page_refs)}] /Count {len(page_refs)} >>"
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {pages_obj} 0 R >>"
    pdf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n{obj}\nendobj\n".encode("latin-1"))
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n".encode())
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(objects)+1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    OUTPUT.write_bytes(pdf)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
