const API = '/api/products';

const DB = {
  _token: null,

  setToken(token) { this._token = token; },

  _authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  },

  // ── Public (no auth) ──────────────────────────────────────
  async getProducts() {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to load products');
    return res.json();
  },

  async findByBarcode(barcode) {
    const products = await this.getProducts();
    return products.find(p => p.barcode === barcode) || null;
  },

  // ── Admin-only (require auth token) ───────────────────────
  async addProduct(product) {
    const res = await fetch(API, {
      method:  'POST',
      headers: this._authHeaders(),
      body:    JSON.stringify(product)
    });
    if (res.status === 401) throw new Error('unauthorized');
    if (res.status === 409) throw new Error('barcode_exists');
    if (!res.ok)            throw new Error('Failed to add product');
    return res.json();
  },

  async updateProduct(id, updates) {
    const res = await fetch(`${API}/${id}`, {
      method:  'PUT',
      headers: this._authHeaders(),
      body:    JSON.stringify(updates)
    });
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok)            throw new Error('Failed to update product');
    return res.json();
  },

  async deleteProduct(id) {
    const res = await fetch(`${API}/${id}`, {
      method:  'DELETE',
      headers: this._authHeaders()
    });
    if (res.status === 401) throw new Error('unauthorized');
    if (!res.ok)            throw new Error('Failed to delete product');
  },

  async barcodeExists(barcode, excludeId = null) {
    const products = await this.getProducts();
    return products.some(p => p.barcode === barcode && p.id !== excludeId);
  }
};
