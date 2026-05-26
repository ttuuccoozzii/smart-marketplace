#!/usr/bin/env python3
"""
Marketplace backend server.
Serves static files + REST API backed by SQLite.

Environment variables:
  PORT            (default 3000)
  ADMIN_PASSWORD  (default admin123)

Run: python3 server.py
"""

import json
import os
import secrets
import socket
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT           = int(os.environ.get('PORT', 3000))
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
DB_FILE        = os.path.join(os.path.dirname(__file__), 'data', 'marketplace.db')
STATIC         = os.path.dirname(__file__)

# In-memory session store (cleared on server restart)
sessions: set[str] = set()

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
        'created_at':  datetime.now(timezone.utc).isoformat(),
        'updated_at':  None,
    }
    with sqlite3.connect(DB_FILE) as conn:
        conn.execute('''
            INSERT INTO products
            (id,name,description,price,quantity,category,barcode,created_at,updated_at)
            VALUES(:id,:name,:description,:price,:quantity,:category,:barcode,:created_at,:updated_at)
        ''', product)
        conn.commit()
    return product

def db_update_product(product_id, data):
    fields = {
        'name':        data.get('name', '').strip(),
        'description': data.get('description', '').strip(),
        'price':       float(data.get('price', 0)),
        'quantity':    int(data.get('quantity', 0)),
        'category':    data.get('category', '').strip(),
        'updated_at':  datetime.now(timezone.utc).isoformat(),
        'id':          product_id,
    }
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

    # ── Helpers ──
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _no_content(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def _read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length).decode('utf-8')) if length else {}

    def _route(self):
        return urlparse(self.path).path.rstrip('/')

    def _authenticated(self):
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return False
        return auth[7:] in sessions

    def _require_auth(self):
        if not self._authenticated():
            self._json({'error': 'Unauthorized — admin login required'}, 401)
            return False
        return True

    # ── CORS preflight ──
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    # ── GET ──
    def do_GET(self):
        path = self._route()

        if path == '/api/products':
            # Public — customers need to read products
            self._json(db_get_products())

        elif path == '/api/admin/check':
            # Used by admin.js to verify session on page load
            if self._authenticated():
                self._json({'ok': True})
            else:
                self._json({'error': 'Unauthorized'}, 401)

        else:
            super().do_GET()

    # ── POST ──
    def do_POST(self):
        path = self._route()

        if path == '/api/admin/login':
            data = self._read_json()
            if data.get('password') == ADMIN_PASSWORD:
                token = secrets.token_urlsafe(32)
                sessions.add(token)
                self._json({'token': token})
            else:
                self._json({'error': 'Incorrect password'}, 401)

        elif path == '/api/admin/logout':
            auth = self.headers.get('Authorization', '')
            if auth.startswith('Bearer '):
                sessions.discard(auth[7:])
            self._no_content()

        elif path == '/api/products':
            if not self._require_auth(): return
            data = self._read_json()
            if not data.get('barcode') or not data.get('name'):
                self._json({'error': 'name and barcode are required'}, 400)
                return
            try:
                self._json(db_add_product(data), 201)
            except sqlite3.IntegrityError:
                self._json({'error': 'barcode_exists'}, 409)

        else:
            self._json({'error': 'Not found'}, 404)

    # ── PUT ──
    def do_PUT(self):
        parts = self._route().split('/')
        if len(parts) == 4 and parts[2] == 'products':
            if not self._require_auth(): return
            updated = db_update_product(parts[3], self._read_json())
            self._json(updated) if updated else self._json({'error': 'not_found'}, 404)

    # ── DELETE ──
    def do_DELETE(self):
        parts = self._route().split('/')
        if len(parts) == 4 and parts[2] == 'products':
            if not self._require_auth(): return
            db_delete_product(parts[3])
            self._no_content()

    def log_message(self, fmt, *args):
        first = str(args[0]) if args else ''
        if '/api/' in first:
            print(f"  {self.address_string():>15}  {fmt % args}")

# ── Entry point ───────────────────────────────────────────────

if __name__ == '__main__':
    init_db()

    try:
        local_ip = socket.gethostbyname(socket.gethostname())
    except Exception:
        local_ip = '127.0.0.1'

    server = HTTPServer(('0.0.0.0', PORT), Handler)

    bar = '─' * 44
    print(f"\n  🏪  Marketplace Server")
    print(f"  {bar}")
    print(f"  Local    →  http://localhost:{PORT}")
    print(f"  Network  →  http://{local_ip}:{PORT}")
    print(f"  {bar}")
    print(f"  Admin    →  http://{local_ip}:{PORT}/admin-login.html")
    print(f"  Customer →  http://{local_ip}:{PORT}/customer.html")
    print(f"  {bar}")
    print(f"  Admin password: {ADMIN_PASSWORD}")
    print(f"  Change it:  ADMIN_PASSWORD=yourpass python3 server.py")
    print(f"  {bar}")
    print(f"  Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n  Server stopped.')
