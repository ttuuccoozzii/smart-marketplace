const API = '/api/products';

const DB = {
  async getProducts() {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to load products');
    return res.json();
  },

  async addProduct(product) {
    const res = await fetch(API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(product)
    });
    if (res.status === 409) throw new Error('barcode_exists');
    if (!res.ok)            throw new Error('Failed to add product');
    return res.json();
  },

  async updateProduct(id, updates) {
    const res = await fetch(`${API}/${id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update product');
    return res.json();
  },

  async deleteProduct(id) {
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete product');
  },

  async findByBarcode(barcode) {
    const products = await this.getProducts();
    return products.find(p => p.barcode === barcode) || null;
  },

  async barcodeExists(barcode, excludeId = null) {
    const products = await this.getProducts();
    return products.some(p => p.barcode === barcode && p.id !== excludeId);
  }
};
