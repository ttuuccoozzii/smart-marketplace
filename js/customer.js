// ── Cart state (client-side, per session) ─────────────────────

const Cart = {
  items: [],

  load() {
    try { this.items = JSON.parse(sessionStorage.getItem('cart') || '[]'); }
    catch { this.items = []; }
  },

  save() { sessionStorage.setItem('cart', JSON.stringify(this.items)); },

  add(product) {
    const existing = this.items.find(i => i.barcode === product.barcode);
    if (existing) { existing.qty++; }
    else {
      this.items.push({
        id: product.id, barcode: product.barcode,
        name: product.name, price: product.price,
        category: product.category || '', qty: 1
      });
    }
    this.save(); renderCart(); updateCartBadge();
  },

  setQty(barcode, qty) {
    if (qty <= 0) { this.remove(barcode); return; }
    const item = this.items.find(i => i.barcode === barcode);
    if (item) { item.qty = qty; this.save(); renderCart(); updateCartBadge(); }
  },

  remove(barcode) {
    this.items = this.items.filter(i => i.barcode !== barcode);
    this.save(); renderCart(); updateCartBadge();
  },

  clear() { this.items = []; this.save(); renderCart(); updateCartBadge(); },

  totalItems() { return this.items.reduce((s, i) => s + i.qty, 0); },
  subtotal()   { return this.items.reduce((s, i) => s + i.price * i.qty, 0); }
};

// ── Utilities ─────────────────────────────────────────────────

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Cart rendering ────────────────────────────────────────────

function updateCartBadge() {
  const count = Cart.totalItems();
  ['cart-badge', 'cart-badge-inline'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = count; el.style.display = count > 0 ? 'inline-flex' : 'none'; }
  });
}

function renderCart() {
  const itemsEl    = document.getElementById('cart-items');
  const emptyEl    = document.getElementById('cart-empty');
  const checkoutEl = document.getElementById('checkout-btn');
  const clearEl    = document.getElementById('clear-cart-btn');
  const subtotalEl = document.getElementById('cart-subtotal');
  const totalEl    = document.getElementById('cart-total');

  const subtotal = Cart.subtotal();
  subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  totalEl.textContent    = `$${subtotal.toFixed(2)}`;

  if (Cart.items.length === 0) {
    emptyEl.style.display = 'flex'; itemsEl.innerHTML = '';
    checkoutEl.disabled = true; clearEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  checkoutEl.disabled   = false;
  clearEl.style.display = 'inline-flex';

  itemsEl.innerHTML = Cart.items.map(item => `
    <div class="cart-item">
      <div class="cart-item-top">
        <span class="cart-item-name">${esc(item.name)}</span>
        <span class="cart-item-line-price">$${(item.price * item.qty).toFixed(2)}</span>
      </div>
      <div class="cart-item-bottom">
        <span class="cart-item-unit">$${parseFloat(item.price).toFixed(2)} each</span>
        <div style="display:flex;align-items:center;gap:4px">
          <div class="qty-controls">
            <button class="qty-btn" data-barcode="${item.barcode}" data-delta="-1">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-barcode="${item.barcode}" data-delta="1">+</button>
          </div>
          <button class="remove-item-btn" data-barcode="${item.barcode}" title="Remove">✕</button>
        </div>
      </div>
    </div>
  `).join('');

  itemsEl.querySelectorAll('.qty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = Cart.items.find(i => i.barcode === btn.dataset.barcode);
      if (item) {
        Cart.setQty(btn.dataset.barcode, item.qty + parseInt(btn.dataset.delta));
        if (isBrowseActive()) renderCatalog();
      }
    });
  });

  itemsEl.querySelectorAll('.remove-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Cart.remove(btn.dataset.barcode);
      if (isBrowseActive()) renderCatalog();
    });
  });
}

// ── Scan feedback ─────────────────────────────────────────────

let feedbackTimer = null;

function showScanFeedback(message, type) {
  const el = document.getElementById('scan-feedback');
  el.textContent = message;
  el.className = `scan-feedback ${type}`;
  el.style.display = 'block';
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => { el.style.display = 'none'; }, 3500);
}

// ── Barcode processing (async — hits the server) ──────────────

async function processBarcode(barcode) {
  if (!barcode) return;
  let product;
  try {
    product = await DB.findByBarcode(barcode);
  } catch {
    showScanFeedback('Cannot reach server. Is server.py running?', 'error');
    return;
  }

  if (!product) {
    showScanFeedback(`No product found for: "${barcode}"`, 'error');
    return;
  }
  if (product.quantity <= 0) {
    showScanFeedback(`"${product.name}" is out of stock.`, 'error');
    return;
  }

  Cart.add(product);
  showScanFeedback(`Added: ${product.name} — $${parseFloat(product.price).toFixed(2)}`, 'success');
}

// ── Camera scanner ────────────────────────────────────────────

let html5Qr = null;
let scannerRunning = false;
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 2000;

function onScanSuccess(barcode) {
  const now = Date.now();
  if (now - lastScanTime < SCAN_COOLDOWN_MS) return;
  lastScanTime = now;
  processBarcode(barcode.trim()); // fire-and-forget, async internally
}

async function startScanner() {
  if (scannerRunning) return;
  const startBtn    = document.getElementById('start-scanner');
  const stopBtn     = document.getElementById('stop-scanner');
  const placeholder = document.getElementById('scanner-placeholder');

  try {
    html5Qr = new Html5Qrcode('scanner-view', {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,   Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,    Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE,  Html5QrcodeSupportedFormats.ITF,
      ],
      verbose: false
    });

    await html5Qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 280, height: 100 }, aspectRatio: 1.333 },
      onScanSuccess, () => {}
    );

    scannerRunning = true;
    placeholder.style.display = 'none';
    startBtn.style.display    = 'none';
    stopBtn.style.display     = 'inline-flex';
  } catch (err) {
    console.error('Scanner error:', err);
    showScanFeedback('Camera unavailable or permission denied. Use manual entry below.', 'error');
  }
}

async function stopScanner() {
  if (!scannerRunning || !html5Qr) return;
  await html5Qr.stop();
  html5Qr = null;
  scannerRunning = false;
  document.getElementById('scanner-view').innerHTML = '';
  document.getElementById('scanner-placeholder').style.display = 'flex';
  document.getElementById('start-scanner').style.display = 'inline-flex';
  document.getElementById('stop-scanner').style.display  = 'none';
}

// ── Tabs ──────────────────────────────────────────────────────

function isBrowseActive() {
  return document.getElementById('tab-browse').classList.contains('active');
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'browse') renderCatalog();
    });
  });
}

// ── Product catalog ───────────────────────────────────────────

let activeCategoryFilter = null;
let catalogDebounce = null;

function setCategoryFilter(cat) {
  activeCategoryFilter = cat;
  renderCatalog();
}

function catalogAdd(barcode) {
  // Lookup from already-rendered data to avoid extra server call
  processBarcode(barcode).then(() => renderCatalog());
}

function catalogQtyChange(barcode, delta) {
  const item = Cart.items.find(i => i.barcode === barcode);
  if (!item) return;
  Cart.setQty(barcode, item.qty + delta);
  renderCatalog();
}

async function renderCatalog() {
  const search = (document.getElementById('catalog-search').value || '').toLowerCase().trim();
  const grid   = document.getElementById('catalog-grid');

  let products;
  try {
    products = await DB.getProducts();
  } catch {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div><p>Cannot reach server</p>
      <small>Make sure server.py is running.</small></div>`;
    return;
  }

  // Category pills
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
  const pillsEl    = document.getElementById('category-pills');

  pillsEl.innerHTML = categories.length === 0 ? '' : [
    `<button class="category-pill ${activeCategoryFilter === null ? 'active' : ''}"
       onclick="setCategoryFilter(null)">All</button>`,
    ...categories.map(cat =>
      `<button class="category-pill ${activeCategoryFilter === cat ? 'active' : ''}"
         onclick="setCategoryFilter('${esc(cat)}')">${esc(cat)}</button>`)
  ].join('');

  // Filter
  let filtered = products;
  if (activeCategoryFilter) filtered = filtered.filter(p => p.category === activeCategoryFilter);
  if (search) filtered = filtered.filter(p =>
    p.name.toLowerCase().includes(search) ||
    (p.description || '').toLowerCase().includes(search) ||
    (p.category || '').toLowerCase().includes(search)
  );

  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📦</div><p>No products available</p>
      <small>Ask the administrator to register products first.</small></div>`;
    return;
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🔍</div><p>No results found</p>
      <small>Try a different search term or category.</small></div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const cartItem   = Cart.items.find(i => i.barcode === p.barcode);
    const inCart     = cartItem ? cartItem.qty : 0;
    const outOfStock = p.quantity <= 0;

    const actionHTML = outOfStock
      ? `<span class="catalog-oos-label">Out of stock</span>`
      : inCart > 0
        ? `<div class="qty-controls">
             <button class="qty-btn" onclick="catalogQtyChange('${p.barcode}', -1)">−</button>
             <span class="qty-value">${inCart}</span>
             <button class="qty-btn" onclick="catalogQtyChange('${p.barcode}', 1)">+</button>
           </div>`
        : `<button class="btn btn-primary btn-sm" onclick="catalogAdd('${p.barcode}')">+ Add</button>`;

    return `
      <div class="catalog-card${outOfStock ? ' out-of-stock' : ''}${inCart > 0 ? ' in-cart' : ''}">
        <div class="catalog-card-body">
          ${p.category ? `<span class="catalog-cat-tag">${esc(p.category)}</span>` : ''}
          <div class="catalog-card-name">${esc(p.name)}</div>
          ${p.description ? `<div class="catalog-card-desc">${esc(p.description)}</div>` : ''}
          ${!outOfStock && p.quantity <= 5 ? `<div class="catalog-low-stock">⚠ Only ${p.quantity} left</div>` : ''}
        </div>
        <div class="catalog-card-footer">
          <span class="catalog-price">$${parseFloat(p.price).toFixed(2)}</span>
          ${actionHTML}
        </div>
      </div>`;
  }).join('');
}

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  Cart.load();
  renderCart();
  updateCartBadge();
  initTabs();

  document.getElementById('start-scanner').addEventListener('click', startScanner);
  document.getElementById('stop-scanner').addEventListener('click', stopScanner);

  // Manual entry
  const manualInput = document.getElementById('manual-barcode');
  function submitManual() {
    const code = manualInput.value.trim();
    if (!code) return;
    processBarcode(code);
    manualInput.value = '';
    manualInput.focus();
  }
  document.getElementById('manual-submit').addEventListener('click', submitManual);
  manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitManual(); });

  // Catalog search with debounce
  document.getElementById('catalog-search').addEventListener('input', () => {
    clearTimeout(catalogDebounce);
    catalogDebounce = setTimeout(renderCatalog, 300);
  });

  // Clear cart
  document.getElementById('clear-cart-btn').addEventListener('click', () => {
    if (confirm('Clear all items from cart?')) {
      Cart.clear();
      if (isBrowseActive()) renderCatalog();
      showToast('Cart cleared.', 'info');
    }
  });

  // Checkout — decrement stock on server, then clear cart
  document.getElementById('checkout-btn').addEventListener('click', async () => {
    if (Cart.items.length === 0) return;

    const btn = document.getElementById('checkout-btn');
    btn.disabled = true;
    btn.textContent = 'Processing…';

    try {
      const res = await fetch('/api/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          items: Cart.items.map(i => ({ barcode: i.barcode, qty: i.qty }))
        })
      });

      if (res.ok) {
        Cart.clear();
        showToast('Purchase complete! Thank you. 🎉', 'success');
        if (isBrowseActive()) renderCatalog();
      } else {
        const data = await res.json();
        showToast(data.error || 'Checkout failed.', 'error');
        btn.disabled = false;
        btn.textContent = 'Proceed to Checkout →';
      }
    } catch {
      showToast('Cannot reach server.', 'error');
      btn.disabled = false;
      btn.textContent = 'Proceed to Checkout →';
    }
  });
});
