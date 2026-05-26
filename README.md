# 🏪 Smart Marketplace

A browser-based point-of-sale system with an **Admin panel** for product management and a **Customer storefront** for barcode scanning and cart management. All data is stored in a SQLite database served by a Python backend, so both pages work across multiple devices on the same network.

---

## Features

### Admin Panel (`/admin.html`)
- Register products with name, category, description, price, and stock quantity
- Auto-generate CODE128 barcodes or enter custom ones, with a live preview
- View all products in a searchable, filterable grid
- Edit product details (price, stock, category, description)
- Delete products
- Print barcodes — opens a print-ready page for each product

### Customer Storefront (`/customer.html`)
- **Scanner tab** — camera barcode scanner (CODE128, EAN-13, EAN-8, UPC, QR, Code39, ITF)
- **Browse tab** — full product catalog with category filter pills and live search
  - Products show current in-cart quantity with inline +/− controls
  - Out-of-stock items are visually dimmed and blocked from adding
  - Low-stock warning when fewer than 5 units remain
- Cart with per-item quantity controls, line totals, and grand total
- Manual barcode entry as a fallback when camera is unavailable

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3 — standard library only (`http.server`, `sqlite3`, `json`) |
| Database | SQLite (file: `data/marketplace.db`) |
| Frontend | Vanilla HTML + CSS + JavaScript (no framework, no build step) |
| Barcode generation | [JsBarcode](https://github.com/lindell/JsBarcode) via CDN |
| Barcode scanning | [html5-qrcode](https://github.com/mebjas/html5-qrcode) via CDN |

No `npm install`, no `pip install`. Just Python 3.

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/ttuuccoozzii/smart-marketplace.git
cd smart-marketplace
```

### 2. Start the server

```bash
python3 server.py
```

Output:

```
  🏪  Marketplace Server
  ──────────────────────────────────────────
  Local    →  http://localhost:3000
  Network  →  http://192.168.x.x:3000
  ──────────────────────────────────────────
  Admin    →  http://192.168.x.x:3000/admin.html
  Customer →  http://192.168.x.x:3000/customer.html
```

### 3. Open in browser

| Page | URL |
|---|---|
| Landing | `http://localhost:3000` |
| Admin | `http://localhost:3000/admin.html` |
| Customer | `http://localhost:3000/customer.html` |

Any device on the same Wi-Fi network can open the **Network** URLs above.

> **Camera scanning requires HTTPS or localhost.** On a local network the browser may block camera access on the customer device. If that happens, use the manual barcode entry field or serve behind a reverse proxy with a TLS certificate.

---

## Project Structure

```
smart-marketplace/
├── server.py          # Python HTTP server + REST API + SQLite
├── index.html         # Landing page (links to admin / customer)
├── admin.html         # Admin panel
├── customer.html      # Customer storefront
├── css/
│   └── styles.css     # All shared styles
├── js/
│   ├── db.js          # Data layer — async fetch() calls to the API
│   ├── admin.js       # Admin UI logic (product form, list, edit modal, print)
│   └── customer.js    # Customer UI logic (scanner, cart, catalog)
└── data/
    └── marketplace.db # SQLite database (auto-created on first run)
```

---

## REST API

The server exposes a simple REST API at `/api/products`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | Return all products (JSON array) |
| `POST` | `/api/products` | Create a new product |
| `PUT` | `/api/products/:id` | Update an existing product |
| `DELETE` | `/api/products/:id` | Delete a product |

### Product schema

```json
{
  "id":          "prod_abc123",
  "name":        "Wireless Headphones",
  "description": "Noise-cancelling over-ear headphones",
  "price":       49.99,
  "quantity":    20,
  "category":    "Electronics",
  "barcode":     "MKT-AB3X7YZ12",
  "created_at":  "2026-05-25T22:00:00",
  "updated_at":  null
}
```

### Error responses

| Status | Meaning |
|---|---|
| `400` | Missing required fields (`name`, `barcode`) |
| `404` | Product ID not found |
| `409` | Barcode already in use by another product |

---

## How It Works

```
┌─────────────┐        HTTP/REST        ┌──────────────────┐
│  Admin page │ ──────────────────────► │                  │
│ (any device)│ ◄────────────────────── │   server.py      │
└─────────────┘                         │  (port 3000)     │
                                        │                  │
┌──────────────┐       HTTP/REST        │  SQLite DB       │
│Customer page │ ──────────────────────►│  marketplace.db  │
│ (any device) │ ◄────────────────────── │                  │
└──────────────┘                        └──────────────────┘
```

- **Product data** lives in SQLite on the server — shared across all devices.
- **Cart data** lives in the customer's browser `sessionStorage` — per-session, private.
- The server also serves all static files (HTML, CSS, JS), so no separate web server is needed.

---

## Barcode Flow

1. Admin registers a product → assigns a `CODE128` barcode (auto-generated or custom)
2. Admin prints the barcode label from the product card
3. Customer scans the label with their device camera **or** types the code manually
4. The app looks up the barcode via `GET /api/products`, finds the product, and adds it to the cart

---

## Roadmap

- [ ] Checkout process (order creation, receipt)
- [ ] Customer authentication
- [ ] Order history
- [ ] Stock decrement on checkout
- [ ] HTTPS / local TLS for camera access on non-localhost devices
