#!/usr/bin/env python3
"""
Marketplace backend server.
Serves static files + REST API backed by SQLite.
Run: python3 server.py
"""

import json
import os
import socket
import sqlite3
import uuid
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT     = int(os.environ.get('PORT', 3000))
DB_FILE  = os.path.join(os.path.dirname(__file__), 'data', 'marketplace.db')
STATIC   = os.path.dirname(__file__)

# ── Database ──────────────────────────────────────────────────

def init_db():
    os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT DEFAULT '',
                price       REAL NOT NULL,
                quantity    INTEGER NOT NULL,
                category    TEXT DEFAULT '',
                barcode     TEXT UNIQUE NOT NULL,
                created_at  TEXT,
                updated_at  TEXT
            )
        ''')
        conn.commit()

def row_to_dict(row):
    return dict(row) if row else None

def db_get_products():
    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            'SELECT * FROM products ORDER BY created_at DESC'
        ).fetchall()
    return [dict(r) for r in rows]

def db_add_product(data):
    product = {
        'id':          'prod_' + uuid.uuid4().hex[:12],
        'name':        data.get('name', '').strip(),
        'description': data.get('description', '').strip(),
        'price':       float(data.get('price', 0)),
        'quantity':    int(data.get('quantity', 0)),
        'category':    data.get('category', '').strip(),
        'barcode':     data.get('barcode', '').strip(),
        'created_at':  datetime.utcnow().isoformat(),
        'updated_at':  None,
    }
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('''
            INSERT INTO products
            (id, name, description, price, quantity, category, barcode, created_at, updated_at)
            VALUES (:id,:name,:description,:price,:quantity,:category,:barcode,:created_at,:updated_at)
        ''', product)
        conn.commit()
    return product

def db_update_product(product_id, data):
    fields = {k: data[k] for k in ('name','description','price','quantity','category') if k in data}
    fields['price']    = float(fields.get('price', 0))
    fields['quantity'] = int(fields.get('quantity', 0))
    fields['updated_at'] = datetime.utcnow().isoformat()
    fields['id'] = product_id

    with sqlite3.connect(DB_FILE) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute('''
            UPDATE products
            SET name=:name, description=:description, price=:price,
                quantity=:quantity, category=:category, updated_at=:updated_at
            WHERE id=:id
        ''', fields)
        conn.commit()
        row = conn.execute('SELECT * FROM products WHERE id=?', (product_id,)).fetchone()
    return dict(row) if row else None

def db_delete_product(product_id):
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('DELETE FROM products WHERE id=?', (product_id,))
        conn.commit()

# ── HTTP Handler ──────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC, **kwargs)

    # ── CORS helpers ──
    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    # ── Response helpers ──
    def _json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _no_content(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode('utf-8'))

    # ── Routing ──
    def _route(self):
        return urlparse(self.path).path.rstrip('/')

    def do_GET(self):
        if self._route() == '/api/products':
            self._json_response(db_get_products())
        else:
            super().do_GET()

    def do_POST(self):
        if self._route() == '/api/products':
            data = self._read_json()
            if not data.get('barcode') or not data.get('name'):
                self._json_response({'error': 'name and barcode are required'}, 400)
                return
            try:
                product = db_add_product(data)
                self._json_response(product, 201)
            except sqlite3.IntegrityError:
                self._json_response({'error': 'barcode_exists'}, 409)

    def do_PUT(self):
        parts = self._route().split('/')
        if len(parts) == 4 and parts[1] == 'api' and parts[2] == 'products':
            product_id = parts[3]
            data = self._read_json()
            updated = db_update_product(product_id, data)
            if updated:
                self._json_response(updated)
            else:
                self._json_response({'error': 'not_found'}, 404)

    def do_DELETE(self):
        parts = self._route().split('/')
        if len(parts) == 4 and parts[1] == 'api' and parts[2] == 'products':
            db_delete_product(parts[3])
            self._no_content()

    def log_message(self, fmt, *args):
        # Only log API calls, suppress static file noise
        if '/api/' in (args[0] if args else ''):
            print(f"  {self.address_string():>15}  {fmt % args}")

# ── Entry point ───────────────────────────────────────────────

if __name__ == '__main__':
    init_db()

    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        local_ip = '127.0.0.1'

    server = HTTPServer(('0.0.0.0', PORT), Handler)

    bar = '─' * 42
    print(f"\n  🏪  Marketplace Server")
    print(f"  {bar}")
    print(f"  Local    →  http://localhost:{PORT}")
    print(f"  Network  →  http://{local_ip}:{PORT}")
    print(f"  {bar}")
    print(f"  Admin    →  http://{local_ip}:{PORT}/admin.html")
    print(f"  Customer →  http://{local_ip}:{PORT}/customer.html")
    print(f"  {bar}")
    print(f"  Other devices on your network can open the links above.")
    print(f"  Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
