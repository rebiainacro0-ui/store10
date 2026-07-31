const express = require('express');
const { getDb } = require('../db/schema');
const router = express.Router();

function t(row, field, lang) {
  const key = field + '_' + lang;
  return row[key] || row[field + '_ar'] || row[field + '_fr'] || '';
}
function getShippingPrice(wilaya, commune, deliveryType, subtotal) {
  var price = 0;
  if (deliveryType === 'office') {
    if (commune && commune.shipping_price_office > 0) price = commune.shipping_price_office;
    else if (wilaya && wilaya.shipping_price_office > 0) price = wilaya.shipping_price_office;
  }
  if (price === 0) {
    if (commune && commune.shipping_price > 0) price = commune.shipping_price;
    else price = wilaya ? wilaya.shipping_price : 0;
  }
  var freeMin = null;
  if (deliveryType === 'office') {
    if (commune && commune.shipping_price_office > 0 && commune.free_shipping_min) freeMin = commune.free_shipping_min;
    else if (wilaya && wilaya.shipping_price_office > 0 && wilaya.free_shipping_min) freeMin = wilaya.free_shipping_min;
  }
  if (!freeMin && commune && commune.shipping_price > 0 && commune.free_shipping_min) freeMin = commune.free_shipping_min;
  if (!freeMin && wilaya && wilaya.free_shipping_min) freeMin = wilaya.free_shipping_min;
  if (freeMin && subtotal >= freeMin) price = 0;
  return price;
}

router.get('/', (req, res) => {
  const db = getDb();
  const lang = req.session.lang || 'ar';
  const featured = db.prepare('SELECT * FROM products WHERE featured = 1 AND active = 1 ORDER BY created_at DESC LIMIT 8').all();
  const categories = db.prepare('SELECT * FROM categories ORDER BY created_at DESC').all();
  const flashSales = db.prepare(`SELECT fs.*, p.* FROM flash_sales fs JOIN products p ON fs.product_id = p.id
    WHERE fs.active = 1 AND datetime(fs.end_date) > datetime('now') AND datetime(fs.start_date) <= datetime('now')`).all();
  const topRated = db.prepare(`SELECT p.*, COALESCE(AVG(r.rating),0) as avg_rating, COUNT(r.id) as review_count
    FROM products p LEFT JOIN reviews r ON r.product_id = p.id AND r.approved = 1
    WHERE p.active = 1 GROUP BY p.id ORDER BY avg_rating DESC LIMIT 4`).all();
  res.render('index', {
    title: t({title_ar:'الرئيسية',title_fr:'Accueil',title_en:'Home'},'title',lang),
    featured, categories, flashSales, topRated
  });
});

router.get('/change-lang/:lang', (req, res) => {
  if (['ar','fr','en'].includes(req.params.lang)) req.session.lang = req.params.lang;
  res.redirect(req.get('Referer') || '/');
});

router.get('/products', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const category = req.query.category; const search = req.query.search;
  let products, categories;
  categories = db.prepare('SELECT * FROM categories ORDER BY name_' + lang).all();
  let sql = 'SELECT p.*, c.name_ar as cat_ar, c.name_fr as cat_fr, c.name_en as cat_en FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.active = 1';
  const params = [];
  if (category) { sql += ' AND c.slug = ?'; params.push(category); }
  if (search) { sql += ' AND (p.name_ar LIKE ? OR p.name_fr LIKE ? OR p.name_en LIKE ?)'; params.push('%'+search+'%','%'+search+'%','%'+search+'%'); }
  sql += ' ORDER BY p.created_at DESC';
  products = db.prepare(sql).all(...params);
  res.render('products', { title: t({title_ar:'المنتجات',title_fr:'Produits',title_en:'Products'},'title',lang), products, categories, selectedCategory: category, search });
});

router.get('/products/:slug', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const product = db.prepare('SELECT p.*, c.name_ar as cat_ar, c.name_fr as cat_fr, c.name_en as cat_en FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ? AND p.active = 1').get(req.params.slug);
  if (!product) return res.redirect('/products');
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order').all(product.id);
  const faqs = db.prepare('SELECT * FROM product_faqs WHERE product_id = ? ORDER BY sort_order').all(product.id);
  const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC').all(product.id);
  const related = db.prepare('SELECT * FROM products WHERE category_id = ? AND id != ? AND active = 1 LIMIT 4').all(product.category_id, product.id);
  const flashSale = db.prepare(`SELECT * FROM flash_sales WHERE product_id = ? AND active = 1
    AND datetime(end_date) > datetime('now') AND datetime(start_date) <= datetime('now')`).get(product.id);

  db.prepare('DELETE FROM recently_viewed WHERE session_id = ? AND product_id = ?').run(req.session.id, product.id);
  db.prepare('INSERT INTO recently_viewed (session_id, product_id) VALUES (?, ?)').run(req.session.id, product.id);
  db.prepare('DELETE FROM recently_viewed WHERE session_id = ? AND id NOT IN (SELECT id FROM recently_viewed WHERE session_id = ? ORDER BY viewed_at DESC LIMIT 10)').run(req.session.id, req.session.id);

  const recentlyViewed = db.prepare(`SELECT p.* FROM recently_viewed rv JOIN products p ON rv.product_id = p.id
    WHERE rv.session_id = ? AND p.id != ? ORDER BY rv.viewed_at DESC LIMIT 4`).all(req.session.id, product.id);

  const wilayas = db.prepare('SELECT * FROM wilayas ORDER BY name_' + lang).all();
  var options = db.prepare('SELECT * FROM product_options WHERE product_id = ? ORDER BY sort_order').all(product.id);
  options.forEach(function(o){
    o.values = db.prepare('SELECT * FROM product_option_values WHERE option_id = ? ORDER BY sort_order').all(o.id);
  });
  var offers = db.prepare('SELECT * FROM product_offers WHERE product_id = ? AND active = 1').all(product.id);
  var bottomImages = db.prepare('SELECT * FROM product_bottom_images WHERE product_id = ? ORDER BY sort_order').all(product.id);
  res.render('product', { title: t(product,'name',lang), product, images, faqs, reviews, related, recentlyViewed, flashSale, wilayas, options, offers, bottomImages });
});

router.get('/cart', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const items = db.prepare(`SELECT c.id, c.quantity, p.id as product_id, p.name_ar, p.name_fr, p.name_en, p.price, p.compare_price, p.image_url, p.slug, p.stock FROM cart c JOIN products p ON c.product_id = p.id WHERE c.session_id = ?`).all(req.session.id);
  const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const coupons = db.prepare("SELECT * FROM coupons WHERE active = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))").all();
  res.render('cart', { title: t({title_ar:'سلة التسوق',title_fr:'Panier',title_en:'Cart'},'title',lang), items, subtotal, coupons, error: req.query.error || null, success: req.query.success || null });
});

router.post('/cart/add', (req, res) => {
  const db = getDb();
  const { product_id, quantity } = req.body;
  const qty = parseInt(quantity) || 1;
  const existing = db.prepare('SELECT * FROM cart WHERE session_id = ? AND product_id = ?').get(req.session.id, product_id);
  if (existing) {
    db.prepare('UPDATE cart SET quantity = quantity + ? WHERE id = ?').run(qty, existing.id);
  } else {
    db.prepare('INSERT INTO cart (session_id, product_id, quantity) VALUES (?, ?, ?)').run(req.session.id, product_id, qty);
  }
  res.redirect('/cart');
});

router.post('/cart/update', (req, res) => {
  const db = getDb();
  const { id, quantity } = req.body;
  if (parseInt(quantity) < 1) {
    db.prepare('DELETE FROM cart WHERE id = ? AND session_id = ?').run(id, req.session.id);
  } else {
    db.prepare('UPDATE cart SET quantity = ? WHERE id = ? AND session_id = ?').run(parseInt(quantity), id, req.session.id);
  }
  res.redirect('/cart');
});

router.post('/cart/remove', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM cart WHERE id = ? AND session_id = ?').run(req.body.id, req.session.id);
  res.redirect(req.get('Referer') || '/cart');
});

router.post('/cart/apply-coupon', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const { code } = req.body;
  const coupon = db.prepare("SELECT * FROM coupons WHERE code = ? AND active = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now')) AND (max_uses IS NULL OR used_count < max_uses)").get(code);
  if (!coupon) return res.redirect('/cart?error=' + encodeURIComponent(t({title_ar:'كود غير صالح',title_fr:'Code invalide',title_en:'Invalid code'},'title',lang)));
  req.session.coupon = coupon;
  res.redirect('/cart?success=' + encodeURIComponent(t({title_ar:'تم تطبيق الكود',title_fr:'Code appliqué',title_en:'Coupon applied'},'title',lang)));
});

router.post('/buy-now', (req, res) => {
  const db = getDb();
  const { product_id, quantity } = req.body;
  const qty = parseInt(quantity) || 1;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(product_id);
  if (!product) return res.redirect('/products');
  db.prepare('DELETE FROM cart WHERE session_id = ?').run(req.session.id);
  db.prepare('INSERT INTO cart (session_id, product_id, quantity) VALUES (?, ?, ?)').run(req.session.id, product_id, qty);
  res.redirect('/checkout');
});

router.get('/checkout', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const items = db.prepare('SELECT c.*, p.name_ar, p.name_fr, p.name_en, p.price, p.compare_price, p.image_url, p.slug FROM cart c JOIN products p ON c.product_id = p.id WHERE c.session_id = ?').all(req.session.id);
  if (items.length === 0) return res.redirect('/products');
  const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const wilayas = db.prepare('SELECT * FROM wilayas ORDER BY name_' + lang).all();
  const product = items.length === 1 ? items[0] : null;
  res.render('checkout', { title: t({title_ar:'إتمام الطلب',title_fr:'Commander',title_en:'Checkout'},'title',lang), items, subtotal, wilayas, product });
});

router.get('/api/communes/:wilayaCode', (req, res) => {
  const db = getDb();
  const communes = db.prepare('SELECT * FROM communes WHERE wilaya_code = ? AND active = 1 ORDER BY name_fr').all(req.params.wilayaCode);
  res.json(communes);
});

router.get('/api/shipping/:wilayaCode', (req, res) => {
  const db = getDb();
  const wilaya = db.prepare('SELECT * FROM wilayas WHERE code = ?').get(req.params.wilayaCode);
  res.json({ shipping_price: wilaya ? wilaya.shipping_price : 0, shipping_price_office: wilaya ? wilaya.shipping_price_office : 0, free_shipping_min: wilaya ? wilaya.free_shipping_min : null });
});

router.get('/api/commune-shipping/:communeId', (req, res) => {
  const db = getDb();
  const commune = db.prepare('SELECT * FROM communes WHERE id = ?').get(req.params.communeId);
  if (!commune) return res.json({ shipping_price: 0, shipping_price_office: 0, free_shipping_min: null });
  const wilaya = db.prepare('SELECT * FROM wilayas WHERE code = ?').get(commune.wilaya_code);
  res.json({ shipping_price: commune.shipping_price > 0 ? commune.shipping_price : (wilaya ? wilaya.shipping_price : 0), shipping_price_office: commune.shipping_price_office > 0 ? commune.shipping_price_office : (wilaya ? wilaya.shipping_price_office || 0 : 0), free_shipping_min: commune.free_shipping_min || (wilaya ? wilaya.free_shipping_min : null) });
});

router.post('/checkout', (req, res) => {
  const db = getDb();
  const lang = req.session.lang || 'ar';
  const { full_name, phone, wilaya_code, commune_id, delivery_type, delivery_address } = req.body;
  const items = db.prepare('SELECT c.*, p.name_ar, p.name_fr, p.name_en, p.price FROM cart c JOIN products p ON c.product_id = p.id WHERE c.session_id = ?').all(req.session.id);
  if (items.length === 0) return res.redirect('/products');

  const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const wilaya = db.prepare('SELECT * FROM wilayas WHERE code = ?').get(wilaya_code);
  const commune = commune_id ? db.prepare('SELECT * FROM communes WHERE id = ?').get(commune_id) : null;
  const shipping = getShippingPrice(wilaya, commune, delivery_type || 'home', subtotal);

  let discount = 0;
  if (req.session.coupon) {
    const coupon = req.session.coupon;
    if (subtotal >= coupon.min_order) {
      if (coupon.type === 'percentage') discount = subtotal * (coupon.value / 100);
      else discount = coupon.value;
      if (discount > subtotal) discount = subtotal;
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);
    }
  }

  const total = parseFloat((subtotal + shipping - discount).toFixed(2));
  const orderNum = 'DZ-' + Date.now().toString(36).toUpperCase();

  const customer = db.prepare('INSERT INTO customers (full_name, phone, wilaya_code, commune_id, delivery_address) VALUES (?, ?, ?, ?, ?)').run(full_name, phone, wilaya_code, commune_id || null, delivery_address);

  const result = db.prepare(`INSERT INTO orders (order_number, customer_id, full_name, phone, wilaya_code, commune_id, delivery_address, payment_method, subtotal, shipping, discount, coupon_code, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(orderNum, customer.lastInsertRowid, full_name, phone, wilaya_code, commune_id || null, delivery_address, 'cod', subtotal, shipping, discount, req.session.coupon ? req.session.coupon.code : null, total, 'pending');

  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name_ar, product_name_fr, product_name_en, price, quantity, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const item of items) {
    insertItem.run(result.lastInsertRowid, item.product_id, item.name_ar, item.name_fr, item.name_en, item.price, item.quantity, item.price * item.quantity);
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.product_id);
  }

  db.prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(result.lastInsertRowid, 'pending');
  db.prepare('DELETE FROM cart WHERE session_id = ?').run(req.session.id);
  delete req.session.coupon;
  res.redirect(`/order/${orderNum}`);
});

router.post('/product-order', (req, res) => {
  const db = getDb();
  const lang = req.session.lang || 'ar';
  const { product_id, quantity, full_name, phone, wilaya_code, commune_id, delivery_type, delivery_address } = req.body;
  const qty = parseInt(quantity) || 1;
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(product_id);
  if (!product) return res.redirect('/products');
  var optionAdjust = 0;
  var selOpts = req.body.options;
  if (selOpts && typeof selOpts === 'object') {
    Object.keys(selOpts).forEach(function(oid){
      var vid = selOpts[oid];
      if (!vid) return;
      var row = db.prepare('SELECT price_adjustment FROM product_option_values WHERE id = ?').get(vid);
      if (row) optionAdjust += row.price_adjustment;
    });
  }
  var unitPrice = product.price + optionAdjust;
  const subtotal = unitPrice * qty;
  const wilaya = db.prepare('SELECT * FROM wilayas WHERE code = ?').get(wilaya_code);
  const commune = commune_id ? db.prepare('SELECT * FROM communes WHERE id = ?').get(commune_id) : null;
  var shipping = getShippingPrice(wilaya, commune, delivery_type || 'home', subtotal);
  var discount = 0;
  var isFreeShip = false;
  var activeOffers = db.prepare('SELECT * FROM product_offers WHERE product_id = ? AND active = 1').all(product.id);
  activeOffers.forEach(function(of){
    if (qty >= of.min_qty) {
      if (of.type === 'bogo' && of.free_qty > 0) {
        var freeItems = Math.floor(qty / of.min_qty) * of.free_qty;
        discount += (subtotal / qty) * freeItems;
      }
      if (of.type === 'percent' && of.discount_percent > 0) {
        discount += subtotal * (of.discount_percent / 100);
      }
      if (of.type === 'free_shipping') {
        shipping = 0;
        isFreeShip = true;
      }
    }
  });
  discount = parseFloat(discount.toFixed(2));
  const total = parseFloat((subtotal - discount + shipping).toFixed(2));
  const orderNum = 'DZ-' + Date.now().toString(36).toUpperCase();

  const delType = delivery_type || 'home';
  const customer = db.prepare('INSERT INTO customers (full_name, phone, wilaya_code, commune_id, delivery_address, delivery_type) VALUES (?, ?, ?, ?, ?, ?)').run(full_name, phone, wilaya_code, commune_id || null, delivery_address, delType);

  const result = db.prepare(`INSERT INTO orders (order_number, customer_id, full_name, phone, wilaya_code, commune_id, delivery_address, delivery_type, payment_method, subtotal, shipping, discount, total, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(orderNum, customer.lastInsertRowid, full_name, phone, wilaya_code, commune_id || null, delivery_address, delType, 'cod', subtotal, shipping, discount, total, 'pending');

  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, product_name_ar, product_name_fr, product_name_en, price, quantity, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  insertItem.run(result.lastInsertRowid, product.id, product.name_ar, product.name_fr, product.name_en, unitPrice, qty, subtotal);
  var orderItemId = db.prepare('SELECT last_insert_rowid() as x').get().x;
  var selOpts = req.body.options;
  if (selOpts && typeof selOpts === 'object') {
    var optKeys = Object.keys(selOpts);
    optKeys.forEach(function(optId){
      var valId = selOpts[optId];
      if (!valId) return;
      var row = db.prepare('SELECT pov.*, po.name_ar as oname_ar, po.name_fr as oname_fr, po.name_en as oname_en FROM product_option_values pov JOIN product_options po ON pov.option_id = po.id WHERE pov.id = ?').get(valId);
      if (row) {
        var oname = row.oname_ar || row.oname_fr || row.oname_en;
        var vname = row.value_ar || row.value_fr || row.value_en;
        db.prepare('INSERT INTO order_item_options (order_item_id, option_name, value_name, price_adjustment) VALUES (?,?,?,?)').run(orderItemId, oname, vname, row.price_adjustment);
      }
    });
  }
  db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, product.id);

  db.prepare('INSERT INTO order_status_history (order_id, status) VALUES (?, ?)').run(result.lastInsertRowid, 'pending');
  res.redirect(`/order/${orderNum}`);
});

router.get('/order/:orderNumber', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const order = db.prepare('SELECT o.*, w.name_ar as wilaya_ar, w.name_fr as wilaya_fr, w.name_en as wilaya_en, c.name_ar as commune_ar, c.name_fr as commune_fr, c.name_en as commune_en FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code LEFT JOIN communes c ON o.commune_id = c.id WHERE o.order_number = ?').get(req.params.orderNumber);
  if (!order) return res.redirect('/');
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  items.forEach(function(item){
    item.options = db.prepare('SELECT * FROM order_item_options WHERE order_item_id = ?').all(item.id);
  });
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  res.render('order-confirmation', { title: t({title_ar:'تم تأكيد الطلب',title_fr:'Commande confirmée',title_en:'Order Confirmed'},'title',lang), order, items, history });
});

router.get('/track-order', (req, res) => {
  const lang = req.session.lang || 'ar';
  const order = null;
  res.render('track-order', { title: t({title_ar:'تتبع الطلب',title_fr:'Suivi de commande',title_en:'Track Order'},'title',lang), order });
});

router.post('/track-order', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const order = db.prepare('SELECT o.*, w.name_ar as wilaya_ar, w.name_fr as wilaya_fr, w.name_en as wilaya_en FROM orders o LEFT JOIN wilayas w ON o.wilaya_code = w.code WHERE o.order_number = ? AND o.phone = ?').get(req.body.order_number, req.body.phone);
  if (!order) return res.render('track-order', { title: t({title_ar:'تتبع الطلب',title_fr:'Suivi de commande',title_en:'Track Order'},'title',lang), order: null, error: 'لم يتم العثور على الطلب' });
  const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC').all(order.id);
  res.render('track-order', { title: t({title_ar:'تتبع الطلب',title_fr:'Suivi de commande',title_en:'Track Order'},'title',lang), order, history });
});

router.get('/page/:slug', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const page = db.prepare('SELECT * FROM pages WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!page) return res.redirect('/');
  res.render('page', { title: t(page,'title',lang), page });
});

router.get('/blog', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const posts = db.prepare('SELECT * FROM blog_posts WHERE published = 1 ORDER BY created_at DESC').all();
  res.render('blog', { title: t({title_ar:'المدونة',title_fr:'Blog',title_en:'Blog'},'title',lang), posts });
});

router.get('/blog/:slug', (req, res) => {
  const db = getDb(); const lang = req.session.lang || 'ar';
  const post = db.prepare('SELECT * FROM blog_posts WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!post) return res.redirect('/blog');
  res.render('blog-post', { title: t(post,'title',lang), post });
});

router.get('/contact', (req, res) => {
  const lang = req.session.lang || 'ar';
  res.render('contact', { title: t({title_ar:'اتصل بنا',title_fr:'Contact',title_en:'Contact Us'},'title',lang) });
});

router.post('/contact', (req, res) => {
  const lang = req.session.lang || 'ar';
  res.render('contact', { title: t({title_ar:'اتصل بنا',title_fr:'Contact',title_en:'Contact Us'},'title',lang), success: 'تم استلام رسالتنا' });
});

module.exports = router;