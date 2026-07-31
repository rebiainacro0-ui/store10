const express = require('express');
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'vvutzrcx',
  api_key: process.env.CLOUDINARY_API_KEY || '158794841931429',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'Yx_7L_-EaPfnlQ1Y32udSXkwEIE'
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: { folder: 'dz-store', allowed_formats: ['jpg','jpeg','png','gif','webp'] }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/admin');
  res.render('admin/login', { title: 'تسجيل الدخول', title_fr: 'Connexion', title_en: 'Admin Login', error: null, layout: false });
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    return res.redirect('/admin');
  }
  res.render('admin/login', { title: 'تسجيل الدخول', title_fr: 'Connexion', title_en: 'Admin Login', error: 'Invalid credentials', layout: false });
});

router.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/admin/login'); });

router.use((req, res, next) => {
  res.locals.layout = 'admin/layout';
  res.locals.path = req.path;
  res.locals.session = req.session;
  next();
});

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total),0) as t FROM orders').get().t;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const ordersToday = db.prepare("SELECT COUNT(*) as c FROM orders WHERE date(created_at) = ?").get(today).c;
  const revenueToday = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM orders WHERE date(created_at) = ?").get(today).t;
  const lowStock = db.prepare("SELECT COUNT(*) as c FROM products WHERE stock > 0 AND stock < 10").get().c;
  const outOfStock = db.prepare("SELECT COUNT(*) as c FROM products WHERE stock = 0").get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c;
  const recentOrders = db.prepare('SELECT o.*, w.name_ar as wilaya FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code ORDER BY o.created_at DESC LIMIT 10').all();
  const bestSellers = db.prepare(`SELECT p.name_ar, p.name_fr, SUM(oi.quantity) as total_sold FROM order_items oi JOIN products p ON oi.product_id = p.id GROUP BY oi.product_id ORDER BY total_sold DESC LIMIT 5`).all();
  res.render('admin/dashboard', { title: 'Dashboard', totalOrders, totalRevenue, totalProducts, totalCustomers, ordersToday, revenueToday, lowStock, outOfStock, pendingOrders, recentOrders, bestSellers });
});

router.get('/products', requireAuth, (req, res) => {
  const db = getDb();
  const products = db.prepare(`SELECT p.*, c.name_ar as cat_ar, c.name_fr as cat_fr, (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi WHERE oi.product_id = p.id) as total_sold FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC`).all();
  res.render('admin/products', { title: 'Products', products });
});

router.get('/products/new', requireAuth, (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories ORDER BY name_fr').all();
  res.render('admin/product-form', { title: 'New Product', product: null, categories, options: [], offers: [], bottomImages: [], images: [] });
});

router.get('/products/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.redirect('/admin/products');
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order').all(product.id);
  const faqs = db.prepare('SELECT * FROM product_faqs WHERE product_id = ? ORDER BY sort_order').all(product.id);
  const categories = db.prepare('SELECT * FROM categories ORDER BY name_fr').all();
  const options = db.prepare('SELECT * FROM product_options WHERE product_id = ? ORDER BY sort_order').all(product.id);
  options.forEach(function(o){
    o.values = db.prepare('SELECT * FROM product_option_values WHERE option_id = ? ORDER BY sort_order').all(o.id);
  });
  const offers = db.prepare('SELECT * FROM product_offers WHERE product_id = ? ORDER BY id').all(product.id);
  const bottomImages = db.prepare('SELECT * FROM product_bottom_images WHERE product_id = ? ORDER BY sort_order').all(product.id);
  res.render('admin/product-form', { title: 'Edit Product', product, images, faqs, categories, options, offers, bottomImages });
});

router.post('/products/save', requireAuth, upload.single('image_file'), (req, res) => {
  const db = getDb();
  const { id, name_ar, name_fr, name_en, slug, description_ar, description_fr, description_en, content_bottom, price, compare_price, cost_price, category_id, stock, featured, active, show_shipping, show_price } = req.body;
  const langName = name_ar || name_fr || name_en || '';
  const langDesc = description_ar || description_fr || description_en || '';
  const slugVal = slug || langName.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  let image_url = req.body.image_url || '';
  if (req.file) image_url = req.file.path;
  var ss = show_shipping ? 1 : 0;
  var sp = show_price ? 1 : 0;
  var cb = content_bottom || null;
  if (id) {
    if (image_url) {
      db.prepare(`UPDATE products SET name_ar=?,name_fr=?,name_en=?,slug=?,description_ar=?,description_fr=?,description_en=?,content_bottom=?,price=?,compare_price=?,cost_price=?,category_id=?,stock=?,image_url=?,featured=?,active=?,show_shipping=?,show_price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(langName, langName, langName, slugVal, langDesc, langDesc, langDesc, cb, parseFloat(price), compare_price ? parseFloat(compare_price) : null, cost_price ? parseFloat(cost_price) : null, parseInt(category_id) || null, parseInt(stock) || 0, image_url, featured ? 1 : 0, active ? 1 : 0, ss, sp, id);
    } else {
      db.prepare(`UPDATE products SET name_ar=?,name_fr=?,name_en=?,slug=?,description_ar=?,description_fr=?,description_en=?,content_bottom=?,price=?,compare_price=?,cost_price=?,category_id=?,stock=?,featured=?,active=?,show_shipping=?,show_price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(langName, langName, langName, slugVal, langDesc, langDesc, langDesc, cb, parseFloat(price), compare_price ? parseFloat(compare_price) : null, cost_price ? parseFloat(cost_price) : null, parseInt(category_id) || null, parseInt(stock) || 0, featured ? 1 : 0, active ? 1 : 0, ss, sp, id);
    }
  } else {
    db.prepare(`INSERT INTO products (name_ar,name_fr,name_en,slug,description_ar,description_fr,description_en,content_bottom,price,compare_price,cost_price,category_id,stock,image_url,featured,active,show_shipping,show_price) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(langName, langName, langName, slugVal, langDesc, langDesc, langDesc, cb, parseFloat(price), compare_price ? parseFloat(compare_price) : null, cost_price ? parseFloat(cost_price) : null, parseInt(category_id) || null, parseInt(stock) || 0, image_url, featured ? 1 : 0, active ? 1 : 0, ss, sp);
  }
  var pid = id || db.prepare('SELECT last_insert_rowid() as x').get().x;
  var existingOpts = db.prepare('SELECT id FROM product_options WHERE product_id = ?').all(pid);
  db.prepare('DELETE FROM product_option_values WHERE option_id IN (SELECT id FROM product_options WHERE product_id = ?)').run(pid);
  db.prepare('DELETE FROM product_options WHERE product_id = ?').run(pid);
  var opts = req.body.options;
  if (opts && Array.isArray(opts)) {
    opts.forEach(function(o, oi){
      if (!o.name_ar && !o.name_fr) return;
      var optNameAr = o.name_ar || o.name_fr || '';
      var optNameFr = o.name_fr || o.name_ar || '';
      db.prepare('INSERT INTO product_options (product_id, name_ar, name_fr, name_en, type, required, sort_order) VALUES (?,?,?,?,?,?,?)')
        .run(pid, optNameAr, optNameFr, optNameFr, o.type || 'radio', o.required ? 1 : 0, oi);
      var optId = db.prepare('SELECT last_insert_rowid() as x').get().x;
      var vals = o.values;
      if (vals && Array.isArray(vals)) {
        vals.forEach(function(v, vi){
          if (!v.value_ar && !v.value_fr) return;
          var vAr = v.value_ar || v.value_fr || '';
          var vFr = v.value_fr || v.value_ar || '';
          db.prepare('INSERT INTO product_option_values (option_id, value_ar, value_fr, value_en, price_adjustment, sort_order) VALUES (?,?,?,?,?,?)')
            .run(optId, vAr, vFr, vFr, parseFloat(v.price_adjustment) || 0, vi);
        });
      }
    });
  }
  db.prepare('DELETE FROM product_offers WHERE product_id = ?').run(pid);
  var offers = req.body.offers;
  if (offers && Array.isArray(offers)) {
    offers.forEach(function(of){
      if (!of.type || !of.min_qty) return;
      db.prepare('INSERT INTO product_offers (product_id, type, min_qty, free_qty, discount_percent, offer_label_ar, offer_label_fr, offer_label_en, active) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(pid, of.type, parseInt(of.min_qty) || 2, parseInt(of.free_qty) || 0, parseFloat(of.discount_percent) || 0, of.offer_label_ar || null, of.offer_label_fr || null, of.offer_label_fr || null, of.active ? 1 : 0);
    });
  }
  var prodImgs = req.body.product_images_json;
  if (prodImgs) {
    try {
      var pUrls = JSON.parse(prodImgs);
      if (Array.isArray(pUrls)) {
        var firstImg = pUrls.length > 0 ? pUrls[0] : '';
        db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(firstImg, pid);
        db.prepare('DELETE FROM product_images WHERE product_id = ?').run(pid);
        pUrls.forEach(function(url, i){
          if (url) db.prepare('INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)').run(pid, url, i);
        });
      }
    } catch(e) {}
  }
  db.prepare('DELETE FROM product_bottom_images WHERE product_id = ?').run(pid);
  var bottomImgs = req.body.bottom_images_json;
  if (bottomImgs) {
    try {
      var urls = JSON.parse(bottomImgs);
      if (Array.isArray(urls)) {
        urls.forEach(function(url, i){
          if (url) db.prepare('INSERT INTO product_bottom_images (product_id, image_url, sort_order) VALUES (?,?,?)').run(pid, url, i);
        });
      }
    } catch(e) {}
  }
  res.redirect('/admin/products');
});

router.post('/upload-image', requireAuth, upload.single('image_file'), (req, res) => {
  if (req.file) return res.json({ url: req.file.path });
  res.json({ error: 'Upload failed' });
});

router.post('/products/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.redirect('/admin/products');
});

router.get('/orders', requireAuth, (req, res) => {
  const db = getDb();
  const { status, wilaya } = req.query;
  let sql = 'SELECT o.*, w.name_ar as wilaya_ar, w.name_fr as wilaya_fr FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (wilaya) { sql += ' AND o.wilaya_code = ?'; params.push(wilaya); }
  sql += ' ORDER BY o.created_at DESC';
  const orders = db.prepare(sql).all(...params);
  const wilayas = db.prepare('SELECT * FROM wilayas ORDER BY name_fr').all();
  res.render('admin/orders', { title: 'Orders', orders, wilayas, currentStatus: status, currentWilaya: wilaya });
});

router.get('/orders/export', requireAuth, (req, res) => {
  const db = getDb();
  const orders = db.prepare('SELECT o.*, w.name_fr as wilaya FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code ORDER BY o.created_at DESC').all();
  let csv = 'Numéro,Nom,Téléphone,Wilaya,Adresse,Total,Paiement,Statut,Date\n';
  for (const o of orders) {
    csv += `"${o.order_number}","${o.full_name}","${o.phone}","${o.wilaya || ''}","${o.delivery_address}",${o.total},"${o.payment_method}","${o.status}","${o.created_at}"\n`;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
  res.send('\uFEFF' + csv);
});

router.get('/orders/print/:id', requireAuth, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT o.*, w.name_ar as wilaya_ar, w.name_fr as wilaya_fr, c.name_ar as commune_ar, c.name_fr as commune_fr FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code LEFT JOIN communes c ON o.commune_id = c.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.render('admin/order-print', { title: 'Print', order, items, layout: false });
});

router.get('/orders/invoice/:id', requireAuth, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT o.*, w.name_fr as wilaya FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code WHERE o.id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.render('admin/invoice', { title: 'Invoice', order, items, layout: false });
});

router.get('/orders/:id', requireAuth, (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT o.*, w.name_ar as wilaya_ar, w.name_fr as wilaya_fr, w.name_en as wilaya_en, c.name_ar as commune_ar, c.name_fr as commune_fr FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code LEFT JOIN communes c ON o.commune_id = c.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  items.forEach(function(item){
    item.options = db.prepare('SELECT * FROM order_item_options WHERE order_item_id = ?').all(item.id);
  });
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  res.render('admin/order-detail', { title: `Order ${order.order_number}`, order, items, history });
});

router.post('/orders/:id/status', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { status, delivery_company, tracking_url, admin_notes } = req.body;
  db.prepare("UPDATE orders SET status = ?, delivery_company = ?, tracking_url = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, delivery_company || null, tracking_url || null, admin_notes || null, req.params.id);
  db.prepare('INSERT INTO order_status_history (order_id, status, note, created_by) VALUES (?, ?, ?, ?)').run(req.params.id, status, admin_notes || null, req.session.userId);
  res.redirect(`/admin/orders/${req.params.id}`);
});

router.get('/customers', requireAuth, (req, res) => {
  const db = getDb();
  const customers = db.prepare(`SELECT c.*, w.name_fr as wilaya, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count, (SELECT COALESCE(SUM(total),0) FROM orders WHERE customer_id = c.id) as total_spent FROM customers c LEFT JOIN wilayas w ON c.wilaya_code = w.code ORDER BY c.created_at DESC`).all();
  res.render('admin/customers', { title: 'Customers', customers });
});

router.get('/categories', requireAuth, (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT cat.*, (SELECT COUNT(*) FROM products WHERE category_id = cat.id) as product_count FROM categories cat ORDER BY cat.name_fr').all();
  res.render('admin/categories', { title: 'Categories', categories });
});

router.post('/categories/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, name_ar, name_fr, name_en, slug, description_ar, description_fr, description_en } = req.body;
  const slugVal = slug || name_fr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (id) {
    db.prepare('UPDATE categories SET name_ar=?,name_fr=?,name_en=?,slug=?,description_ar=?,description_fr=?,description_en=? WHERE id=?').run(name_ar, name_fr, name_en, slugVal, description_ar, description_fr, description_en, id);
  } else {
    db.prepare('INSERT INTO categories (name_ar,name_fr,name_en,slug,description_ar,description_fr,description_en) VALUES (?,?,?,?,?,?,?)').run(name_ar, name_fr, name_en, slugVal, description_ar, description_fr, description_en);
  }
  res.redirect('/admin/categories');
});

router.post('/categories/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.redirect('/admin/categories');
});

router.get('/shipping', requireAuth, (req, res) => {
  const db = getDb();
  const wilayas = db.prepare(`SELECT w.*, (SELECT COUNT(*) FROM communes WHERE wilaya_code = w.code) as commune_count FROM wilayas w ORDER BY w.code`).all();
  const zones = db.prepare('SELECT * FROM shipping_zones ORDER BY name').all();
  res.render('admin/shipping', { title: 'Shipping', wilayas, zones });
});

router.get('/shipping/wilaya/:code', requireAuth, (req, res) => {
  const db = getDb();
  const wilaya = db.prepare('SELECT * FROM wilayas WHERE code = ?').get(req.params.code);
  const communes = db.prepare('SELECT * FROM communes WHERE wilaya_code = ? ORDER BY name_fr').all(req.params.code);
  res.render('admin/wilaya-communes', { title: wilaya ? wilaya.name_fr : 'Wilaya', wilaya, communes });
});

router.post('/shipping/wilaya/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { code, shipping_price, free_shipping_min, shipping_price_office } = req.body;
  db.prepare('UPDATE wilayas SET shipping_price = ?, free_shipping_min = ?, shipping_price_office = ? WHERE code = ?').run(parseFloat(shipping_price) || 0, free_shipping_min ? parseFloat(free_shipping_min) : null, shipping_price_office !== '' ? parseFloat(shipping_price_office) : null, code);
  const referer = req.get('Referer') || '';
  if (referer.includes('/wilaya/')) res.redirect('/admin/shipping/wilaya/' + code);
  else res.redirect('/admin/shipping');
});

router.post('/shipping/commune/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, wilaya_code, name_ar, name_fr, name_en, shipping_price, shipping_price_office, free_shipping_min, active } = req.body;
  if (id) {
    db.prepare('UPDATE communes SET name_ar=?,name_fr=?,name_en=?,shipping_price=?,shipping_price_office=?,free_shipping_min=?,active=? WHERE id=?')
      .run(name_ar, name_fr, name_en, parseFloat(shipping_price) || 0, shipping_price_office !== '' ? parseFloat(shipping_price_office) : null, free_shipping_min ? parseFloat(free_shipping_min) : null, active ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO communes (wilaya_code,name_ar,name_fr,name_en,shipping_price,shipping_price_office,free_shipping_min,active) VALUES (?,?,?,?,?,?,?,?)')
      .run(wilaya_code, name_ar, name_fr, name_en, parseFloat(shipping_price) || 0, shipping_price_office !== '' ? parseFloat(shipping_price_office) : null, free_shipping_min ? parseFloat(free_shipping_min) : null, active ? 1 : 0);
  }
  res.redirect('/admin/shipping/wilaya/' + wilaya_code);
});

router.post('/shipping/commune/delete/:id', requireAuth, (req, res) => {
  const db = getDb();
  const commune = db.prepare('SELECT wilaya_code FROM communes WHERE id = ?').get(req.params.id);
  if (commune) { db.prepare('DELETE FROM communes WHERE id = ?').run(req.params.id); res.redirect('/admin/shipping/wilaya/' + commune.wilaya_code); }
  else res.redirect('/admin/shipping');
});

router.post('/shipping/commune/bulk-price', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { wilaya_code, shipping_price, shipping_price_office, free_shipping_min } = req.body;
  if (shipping_price !== '') db.prepare('UPDATE communes SET shipping_price = ? WHERE wilaya_code = ?').run(parseFloat(shipping_price) || 0, wilaya_code);
  if (shipping_price_office !== '') db.prepare('UPDATE communes SET shipping_price_office = ? WHERE wilaya_code = ?').run(parseFloat(shipping_price_office), wilaya_code);
  if (free_shipping_min !== '') db.prepare('UPDATE communes SET free_shipping_min = ? WHERE wilaya_code = ?').run(free_shipping_min ? parseFloat(free_shipping_min) : null, wilaya_code);
  res.redirect('/admin/shipping/wilaya/' + wilaya_code);
});

router.get('/shipping/commune/export/:wilayaCode', requireAuth, (req, res) => {
  const db = getDb();
  const communes = db.prepare('SELECT * FROM communes WHERE wilaya_code = ? ORDER BY name_fr').all(req.params.wilayaCode);
  let csv = 'name_ar,name_fr,name_en,shipping_price,shipping_price_office,free_shipping_min,active\n';
  for (const c of communes) csv += `"${c.name_ar}","${c.name_fr}","${c.name_en}",${c.shipping_price},${c.shipping_price_office || ''},${c.free_shipping_min || ''},${c.active}\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=communes-' + req.params.wilayaCode + '.csv');
  res.send('\uFEFF' + csv);
});

router.post('/shipping/commune/import/:wilayaCode', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const lines = (req.body.csv_data || '').split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim());
  const nAr = headers.indexOf('name_ar'), nFr = headers.indexOf('name_fr'), nEn = headers.indexOf('name_en');
  const nSp = headers.indexOf('shipping_price'), nOf = headers.indexOf('shipping_price_office'), nFs = headers.indexOf('free_shipping_min'), nAc = headers.indexOf('active');
  const insert = db.prepare('INSERT OR REPLACE INTO communes (wilaya_code,name_ar,name_fr,name_en,shipping_price,shipping_price_office,free_shipping_min,active) VALUES (?,?,?,?,?,?,?,?)');
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g,'').trim());
    if (cols.length < 3) continue;
    insert.run(req.params.wilayaCode, cols[nAr] || '', cols[nFr] || '', cols[nEn] || '', parseFloat(cols[nSp]) || 0, nOf >= 0 && cols[nOf] !== '' ? parseFloat(cols[nOf]) : null, cols[nFs] ? parseFloat(cols[nFs]) : null, nAc >= 0 ? (parseInt(cols[nAc]) || 1) : 1);
  }
  res.redirect('/admin/shipping/wilaya/' + req.params.wilayaCode);
});

router.get('/shipping/zones', requireAuth, (req, res) => {
  const db = getDb();
  const zones = db.prepare('SELECT * FROM shipping_zones ORDER BY name').all();
  res.render('admin/shipping-zones', { title: 'Shipping Zones', zones });
});

router.post('/shipping/zones/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, name, description, free_shipping_min, free_shipping_active, active } = req.body;
  if (id) {
    db.prepare('UPDATE shipping_zones SET name=?,description=?,free_shipping_min=?,free_shipping_active=?,active=? WHERE id=?')
      .run(name, description || null, free_shipping_min ? parseFloat(free_shipping_min) : null, free_shipping_active ? 1 : 0, active ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO shipping_zones (name,description,free_shipping_min,free_shipping_active,active) VALUES (?,?,?,?,?)')
      .run(name, description || null, free_shipping_min ? parseFloat(free_shipping_min) : null, free_shipping_active ? 1 : 0, active ? 1 : 0);
  }
  res.redirect('/admin/shipping/zones');
});

router.post('/shipping/zones/duplicate/:id', requireAuth, (req, res) => {
  const db = getDb();
  const zone = db.prepare('SELECT * FROM shipping_zones WHERE id = ?').get(req.params.id);
  if (zone) db.prepare('INSERT INTO shipping_zones (name,description,free_shipping_min,free_shipping_active,active) VALUES (?,?,?,?,?)')
    .run(zone.name + ' (copy)', zone.description, zone.free_shipping_min, zone.free_shipping_active, zone.active);
  res.redirect('/admin/shipping/zones');
});

router.post('/shipping/zones/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM shipping_zones WHERE id = ?').run(req.params.id);
  res.redirect('/admin/shipping/zones');
});

router.get('/reviews', requireAuth, (req, res) => {
  const db = getDb();
  const reviews = db.prepare('SELECT r.*, p.name_fr as product_name FROM reviews r JOIN products p ON r.product_id = p.id ORDER BY r.created_at DESC').all();
  res.render('admin/reviews', { title: 'Reviews', reviews });
});

router.post('/reviews/toggle/:id', requireAuth, (req, res) => {
  const db = getDb();
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE reviews SET approved = ? WHERE id = ?').run(review.approved ? 0 : 1, req.params.id);
  res.redirect('/admin/reviews');
});

router.post('/reviews/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.redirect('/admin/reviews');
});

router.get('/coupons', requireAuth, (req, res) => {
  const db = getDb();
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.render('admin/coupons', { title: 'Coupons', coupons });
});

router.post('/coupons/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, code, type, value, min_order, max_uses, expires_at, active } = req.body;
  if (id) {
    db.prepare('UPDATE coupons SET code=?,type=?,value=?,min_order=?,max_uses=?,expires_at=?,active=? WHERE id=?').run(code, type, parseFloat(value), parseFloat(min_order) || 0, max_uses ? parseInt(max_uses) : null, expires_at || null, active ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO coupons (code,type,value,min_order,max_uses,expires_at,active) VALUES (?,?,?,?,?,?,?)').run(code, type, parseFloat(value), parseFloat(min_order) || 0, max_uses ? parseInt(max_uses) : null, expires_at || null, active ? 1 : 0);
  }
  res.redirect('/admin/coupons');
});

router.post('/coupons/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
  res.redirect('/admin/coupons');
});

router.get('/flash-sales', requireAuth, (req, res) => {
  const db = getDb();
  const sales = db.prepare('SELECT fs.*, p.name_fr as product_name, p.image_url FROM flash_sales fs JOIN products p ON fs.product_id = p.id ORDER BY fs.created_at DESC').all();
  const products = db.prepare('SELECT id, name_fr, price FROM products WHERE active = 1').all();
  res.render('admin/flash-sales', { title: 'Flash Sales', sales, products });
});

router.post('/flash-sales/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, product_id, discount_percent, start_date, end_date, max_quantity, active } = req.body;
  if (id) {
    db.prepare('UPDATE flash_sales SET product_id=?,discount_percent=?,start_date=?,end_date=?,max_quantity=?,active=? WHERE id=?').run(product_id, parseInt(discount_percent), start_date, end_date, max_quantity ? parseInt(max_quantity) : null, active ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO flash_sales (product_id,discount_percent,start_date,end_date,max_quantity,active) VALUES (?,?,?,?,?,?)').run(product_id, parseInt(discount_percent), start_date, end_date, max_quantity ? parseInt(max_quantity) : null, active ? 1 : 0);
  }
  res.redirect('/admin/flash-sales');
});

router.post('/flash-sales/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM flash_sales WHERE id = ?').run(req.params.id);
  res.redirect('/admin/flash-sales');
});

router.get('/pages', requireAuth, (req, res) => {
  const db = getDb();
  const pages = db.prepare('SELECT * FROM pages ORDER BY created_at DESC').all();
  res.render('admin/pages', { title: 'Pages', pages });
});

router.get('/pages/new', requireAuth, (req, res) => {
  res.render('admin/page-form', { title: 'New Page', page: null });
});

router.get('/pages/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const page = db.prepare('SELECT * FROM pages WHERE id = ?').get(req.params.id);
  if (!page) return res.redirect('/admin/pages');
  res.render('admin/page-form', { title: 'Edit Page', page });
});

router.post('/pages/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, title_ar, title_fr, title_en, slug, content_ar, content_fr, content_en, meta_title, meta_description, published } = req.body;
  const slugVal = slug || title_fr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (id) {
    db.prepare('UPDATE pages SET title_ar=?,title_fr=?,title_en=?,slug=?,content_ar=?,content_fr=?,content_en=?,meta_title=?,meta_description=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(title_ar, title_fr, title_en, slugVal, content_ar, content_fr, content_en, meta_title, meta_description, published ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO pages (title_ar,title_fr,title_en,slug,content_ar,content_fr,content_en,meta_title,meta_description,published) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(title_ar, title_fr, title_en, slugVal, content_ar, content_fr, content_en, meta_title, meta_description, published ? 1 : 0);
  }
  res.redirect('/admin/pages');
});

router.post('/pages/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM pages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/pages');
});

router.get('/blog', requireAuth, (req, res) => {
  const db = getDb();
  const posts = db.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC').all();
  res.render('admin/blog-posts', { title: 'Blog', posts });
});

router.get('/blog/new', requireAuth, (req, res) => {
  res.render('admin/blog-form', { title: 'New Post', post: null });
});

router.get('/blog/:id/edit', requireAuth, (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) return res.redirect('/admin/blog');
  res.render('admin/blog-form', { title: 'Edit Post', post });
});

router.post('/blog/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, title_ar, title_fr, title_en, slug, content_ar, content_fr, content_en, published } = req.body;
  const slugVal = slug || title_fr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (id) {
    db.prepare('UPDATE blog_posts SET title_ar=?,title_fr=?,title_en=?,slug=?,content_ar=?,content_fr=?,content_en=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(title_ar, title_fr, title_en, slugVal, content_ar, content_fr, content_en, published ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO blog_posts (title_ar,title_fr,title_en,slug,content_ar,content_fr,content_en,published) VALUES (?,?,?,?,?,?,?,?)')
      .run(title_ar, title_fr, title_en, slugVal, content_ar, content_fr, content_en, published ? 1 : 0);
  }
  res.redirect('/admin/blog');
});

router.post('/blog/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  res.redirect('/admin/blog');
});

router.get('/settings', requireAuth, (req, res) => {
  const db = getDb();
  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(r => settings[r.key] = r.value);
  const adminUser = db.prepare('SELECT id, username FROM users WHERE id = 1').get();
  res.render('admin/settings', { title: 'Settings', settings, adminUser });
});

router.post('/settings/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  for (const [key, value] of Object.entries(req.body)) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
  res.redirect('/admin/settings');
});

router.post('/update-account', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { username, password } = req.body;
  if (username) {
    if (password) {
      const hash = require('bcryptjs').hashSync(password, 10);
      db.prepare('UPDATE users SET username = ?, password = ? WHERE id = 1').run(username, hash);
    } else {
      db.prepare('UPDATE users SET username = ? WHERE id = 1').run(username);
    }
  }
  res.redirect('/admin/settings');
});

router.get('/inventory', requireAuth, (req, res) => {
  const db = getDb();
  const products = db.prepare('SELECT id, name_ar, name_fr, name_en, stock, price, cost_price, image_url FROM products WHERE stock <= 10 ORDER BY stock ASC').all();
  res.render('admin/inventory', { title: 'Inventory', products });
});

router.get('/delivery-apis', requireAuth, (req, res) => {
  const db = getDb();
  const apis = db.prepare('SELECT * FROM delivery_apis ORDER BY name').all();
  res.render('admin/delivery-apis', { title: 'Delivery APIs', apis });
});

router.post('/delivery-apis/save', requireAuth, express.urlencoded({ extended: true }), (req, res) => {
  const db = getDb();
  const { id, name, api_url, api_key, active } = req.body;
  if (id) {
    db.prepare('UPDATE delivery_apis SET name=?, api_url=?, api_key=?, active=? WHERE id=?').run(name, api_url, api_key, active ? 1 : 0, id);
  } else {
    db.prepare('INSERT INTO delivery_apis (name, api_url, api_key, active) VALUES (?,?,?,?)').run(name, api_url, api_key, active ? 1 : 0);
  }
  res.redirect('/admin/delivery-apis');
});

router.post('/delivery-apis/delete/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM delivery_apis WHERE id = ?').run(req.params.id);
  res.redirect('/admin/delivery-apis');
});

router.post('/orders/:id/send-to-courier', requireAuth, express.urlencoded({ extended: true }), async (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  const api = db.prepare('SELECT * FROM delivery_apis WHERE active = 1 LIMIT 1').get();
  if (!api) { req.flash && req.flash('error', 'No active delivery API'); return res.redirect('/admin/orders/'+order.id); }
  try {
    var fetch = globalThis.fetch || require('node-fetch');
    const payload = { order_number: order.order_number, full_name: order.full_name, phone: order.phone, delivery_address: order.delivery_address, wilaya_code: order.wilaya_code, commune_id: order.commune_id, total: order.total };
    const resp = await fetch(api.api_url, { method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+api.api_key }, body: JSON.stringify(payload) });
    const data = await resp.json();
    if (data.tracking_number || data.id) {
      db.prepare('UPDATE orders SET delivery_company=?, tracking_url=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(api.name, data.tracking_url || '', 'shipped', order.id);
      db.prepare('INSERT INTO order_status_history (order_id, status, note) VALUES (?,?,?)').run(order.id, 'shipped', 'Sent to '+api.name);
    }
  } catch(e) { console.error('Courier API error:', e); }
  res.redirect('/admin/orders/'+order.id);
});

module.exports = router;