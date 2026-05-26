// ── Barcode helpers ──────────────────────────────────────────

function generateBarcodeValue() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'MKT-';
  for (let i = 0; i < 9; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function renderBarcodeSVG(svgEl, value) {
  try {
    JsBarcode(svgEl, value, {
      format: 'CODE128', width: 2, height: 60,
      displayValue: true, fontSize: 13, margin: 10, background: 'transparent'
    });
    return true;
  } catch { return false; }
}

// ── Toast / feedback ──────────────────────────────────────────

function showToast(message, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function stockBadge(qty) {
  if (qty <= 0) return `<span class="product-stock out">Out of stock</span>`;
  if (qty <= 5) return `<span class="product-stock low">Low: ${qty}</span>`;
  return             `<span class="product-stock">In stock: ${qty}</span>`;
}

// ── Product list ──────────────────────────────────────────────

async function renderProductList(filter = '') {
  const list = document.getElementById('product-list');
  list.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>Loading…</p></div>`;

  let products;
  try {
    products = await DB.getProducts();
  } catch {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚠️</div><p>Cannot reach server</p>
      <small>Make sure server.py is running.</small></div>`;
    return;
  }

  const q = filter.toLowerCase();
  const filtered = q
    ? products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q))
    : products;

  document.getElementById('product-count').textContent = filtered.length;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">📦</div>
      <p>${products.length === 0 ? 'No products yet' : 'No results found'}</p>
      <small>${products.length === 0 ? 'Use the form to register your first product.' : 'Try a different search term.'}</small>
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(p => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-card-header">
        <h3>${esc(p.name)}</h3>
        <div class="product-card-actions">
          <button class="btn-icon" title="Edit" onclick="openEdit('${p.id}')">✏️</button>
          <button class="btn-icon danger" title="Delete" onclick="deleteProduct('${p.id}')">🗑️</button>
        </div>
      </div>
      ${p.category ? `<span class="product-category-tag">${esc(p.category)}</span>` : ''}
      ${p.description ? `<p class="product-description">${esc(p.description)}</p>` : ''}
      <div class="product-meta">
        <span class="product-price">$${parseFloat(p.price).toFixed(2)}</span>
        ${stockBadge(p.quantity)}
      </div>
      <div class="product-barcode-section">
        <svg id="bc-${p.id}"></svg>
        <button class="btn btn-sm btn-secondary" onclick="printBarcode('${p.id}')">🖨 Print Barcode</button>
      </div>
    </div>
  `).join('');

  filtered.forEach(p => {
    const svg = document.getElementById(`bc-${p.id}`);
    if (svg) {
      try {
        JsBarcode(svg, p.barcode, {
          format: 'CODE128', width: 1.6, height: 50,
          displayValue: true, fontSize: 11, margin: 8, background: 'transparent'
        });
      } catch { /* invalid barcode value */ }
    }
  });
}

// ── Delete ────────────────────────────────────────────────────

async function deleteProduct(id) {
  let products;
  try { products = await DB.getProducts(); } catch { return; }

  const product = products.find(p => p.id === id);
  if (!product || !confirm(`Delete "${product.name}"? This cannot be undone.`)) return;

  try {
    await DB.deleteProduct(id);
    await renderProductList(document.getElementById('search').value);
    showToast('Product deleted.', 'error');
  } catch {
    showToast('Failed to delete product.', 'error');
  }
}

// ── Edit modal ────────────────────────────────────────────────

let editingId = null;

async function openEdit(id) {
  let products;
  try { products = await DB.getProducts(); } catch { return; }

  const p = products.find(p => p.id === id);
  if (!p) return;
  editingId = id;

  document.getElementById('edit-name').value        = p.name;
  document.getElementById('edit-description').value = p.description || '';
  document.getElementById('edit-price').value       = p.price;
  document.getElementById('edit-quantity').value    = p.quantity;
  document.getElementById('edit-category').value   = p.category || '';
  document.getElementById('edit-barcode-display').textContent = p.barcode;

  document.getElementById('edit-modal').classList.add('open');
}

function closeEdit() {
  document.getElementById('edit-modal').classList.remove('open');
  editingId = null;
}

// ── Print barcode ─────────────────────────────────────────────

async function printBarcode(id) {
  let products;
  try { products = await DB.getProducts(); } catch { return; }
  const p = products.find(p => p.id === id);
  if (!p) return;

  const win = window.open('', '_blank', 'width=500,height=400');
  win.document.write(`<!DOCTYPE html>
<html><head>
  <title>Barcode — ${esc(p.name)}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
  <style>
    body { font-family:sans-serif; display:flex; flex-direction:column; align-items:center;
           justify-content:center; min-height:100vh; margin:0; padding:20px; }
    h2 { margin-bottom:4px; font-size:18px; }
    .price { color:#4f46e5; font-size:16px; font-weight:700; margin-bottom:16px; }
    @media print { button { display:none; } }
  </style>
</head>
<body>
  <h2>${esc(p.name)}</h2>
  <p class="price">$${parseFloat(p.price).toFixed(2)}</p>
  <svg id="pb"></svg>
  <button onclick="window.print()" style="margin-top:12px;padding:8px 20px;cursor:pointer">Print</button>
  <script>
    JsBarcode('#pb','${p.barcode}',{format:'CODE128',width:2.5,height:90,displayValue:true,fontSize:16,margin:12});
    window.onload = () => window.print();
  <\/script>
</body></html>`);
  win.document.close();
}

// ── Add product form ──────────────────────────────────────────

function initAddForm() {
  const form    = document.getElementById('product-form');
  const bInput  = document.getElementById('barcode');
  const prevBox = document.getElementById('barcode-preview-box');
  const prevSvg = document.getElementById('barcode-preview-svg');

  function updatePreview() {
    const val = bInput.value.trim();
    if (val.length >= 4) {
      const ok = renderBarcodeSVG(prevSvg, val);
      prevBox.style.display = ok ? 'flex' : 'none';
      document.getElementById('barcode-preview-value').textContent = val;
    } else {
      prevBox.style.display = 'none';
    }
  }

  document.getElementById('generate-barcode').addEventListener('click', () => {
    bInput.value = generateBarcodeValue();
    updatePreview();
  });

  bInput.addEventListener('input', updatePreview);

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const barcode = bInput.value.trim();
    if (!barcode || barcode.length < 4) {
      showToast('Barcode must be at least 4 characters.', 'error'); return;
    }

    const submitBtn = form.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      await DB.addProduct({
        name:        document.getElementById('name').value.trim(),
        description: document.getElementById('description').value.trim(),
        price:       parseFloat(document.getElementById('price').value),
        quantity:    parseInt(document.getElementById('quantity').value),
        category:    document.getElementById('category').value.trim(),
        barcode
      });

      form.reset();
      prevBox.style.display = 'none';
      await renderProductList(document.getElementById('search').value);
      showToast('Product registered successfully!');
    } catch (err) {
      if (err.message === 'barcode_exists') {
        showToast('This barcode is already used by another product.', 'error');
      } else {
        showToast('Failed to register product. Is the server running?', 'error');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '＋ Register Product';
    }
  });
}

// ── Init ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Guard: redirect to login if session is missing or expired
  const allowed = await Auth.guardPage();
  if (!allowed) return;

  // Inject auth token into the DB layer for write operations
  DB.setToken(Auth.getToken());

  initAddForm();
  renderProductList();

  document.getElementById('search').addEventListener('input', e =>
    renderProductList(e.target.value)
  );

  document.getElementById('edit-form').addEventListener('submit', async e => {
    e.preventDefault();
    if (!editingId) return;

    const submitBtn = e.target.querySelector('[type=submit]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    try {
      await DB.updateProduct(editingId, {
        name:        document.getElementById('edit-name').value.trim(),
        description: document.getElementById('edit-description').value.trim(),
        price:       parseFloat(document.getElementById('edit-price').value),
        quantity:    parseInt(document.getElementById('edit-quantity').value),
        category:    document.getElementById('edit-category').value.trim()
      });
      closeEdit();
      await renderProductList(document.getElementById('search').value);
      showToast('Product updated!');
    } catch {
      showToast('Failed to save changes.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
  });

  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeEdit();
  });

  // Poll for stock changes every 4 seconds (customers checking out)
  setInterval(() => {
    // Skip refresh while admin is editing to avoid losing focus
    if (!editingId) {
      renderProductList(document.getElementById('search').value);
    }
  }, 4000);
});
