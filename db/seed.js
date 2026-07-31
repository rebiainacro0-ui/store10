const { getDb } = require('./schema');
const bcrypt = require('bcryptjs');

const db = getDb();

db.exec('PRAGMA foreign_keys = OFF; DELETE FROM order_items; DELETE FROM orders; DELETE FROM order_status_history; DELETE FROM cart; DELETE FROM products; DELETE FROM product_images; DELETE FROM product_faqs; DELETE FROM categories; DELETE FROM customers; DELETE FROM reviews; DELETE FROM coupons; DELETE FROM flash_sales; DELETE FROM users; DELETE FROM sqlite_sequence; PRAGMA foreign_keys = ON;');

const hash = bcrypt.hashSync('admin123', 10);
db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@store.com', hash, 'admin');

const categories = [
  { name_ar: 'إلكترونيات', name_fr: 'Électronique', name_en: 'Electronics', slug: 'electronics', desc_ar: 'أجهزة واكسسوارات تقنية', desc_fr: 'Gadgets et accessoires tech', desc_en: 'Gadgets and tech accessories' },
  { name_ar: 'ملابس', name_fr: 'Vêtements', name_en: 'Clothing', slug: 'clothing', desc_ar: 'أزياء للرجال والنساء', desc_fr: 'Mode pour hommes et femmes', desc_en: 'Fashion for men and women' },
  { name_ar: 'المنزل والحديقة', name_fr: 'Maison & Jardin', name_en: 'Home & Garden', slug: 'home-garden', desc_ar: 'كل ما تحتاجه لمنزلك', desc_fr: 'Tout pour votre maison', desc_en: 'Everything for your home' },
  { name_ar: 'رياضة', name_fr: 'Sports', name_en: 'Sports', slug: 'sports', desc_ar: 'معدات رياضية', desc_fr: 'Équipement sportif', desc_en: 'Sports equipment' },
  { name_ar: 'الصحة والجمال', name_fr: 'Santé & Beauté', name_en: 'Health & Beauty', slug: 'health-beauty', desc_ar: 'منتجات العناية', desc_fr: 'Produits de soin', desc_en: 'Care products' },
];
const insCat = db.prepare('INSERT INTO categories (name_ar, name_fr, name_en, slug, description_ar, description_fr, description_en) VALUES (?,?,?,?,?,?,?)');
categories.forEach(c => insCat.run(c.name_ar, c.name_fr, c.name_en, c.slug, c.desc_ar, c.desc_fr, c.desc_en));

const products = [
  { name_ar:'سماعات لاسلكية', name_fr:'Casque sans fil Pro', name_en:'Wireless Headphones Pro', slug:'casque-sans-fil-pro', desc_ar:'سماعات مانعة للضوضاء ببطارية 30 ساعة', desc_fr:'Casque anti-bruit avec batterie 30h', desc_en:'Noise-cancelling headphones with 30h battery', price:5499, compare_price:6999, cat:1, stock:50, feat:1 },
  { name_ar:'ساعة ذكية', name_fr:'Montre connectée X', name_en:'Smart Watch Series X', slug:'montre-connectee-x', desc_ar:'ساعة ذكية مع GPS وشاشة AMOLED', desc_fr:'Montre connectée avec GPS et écran AMOLED', desc_en:'Smart watch with GPS and AMOLED display', price:8999, compare_price:10999, cat:1, stock:30, feat:1 },
  { name_ar:'سماعة بلوتوث', name_fr:'Enceinte Bluetooth', name_en:'Bluetooth Speaker', slug:'enceinte-bluetooth', desc_ar:'سماعة محمولة مقاومة للماء', desc_fr:'Enceinte portable waterproof', desc_en:'Portable waterproof speaker', price:2499, compare_price:null, cat:1, stock:100, feat:0 },
  { name_ar:'سترة جينز', name_fr:'Veste en jean', name_en:'Denim Jacket', slug:'veste-jean', desc_ar:'سترة جينز كلاسيكية من قطن ممتاز', desc_fr:'Veste en jean classique en coton premium', desc_en:'Classic denim jacket in premium cotton', price:3499, compare_price:4500, cat:2, stock:45, feat:1 },
  { name_ar:'حذاء رياضي', name_fr:'Chaussures de sport', name_en:'Running Shoes', slug:'chaussures-sport', desc_ar:'حذاء جري خفيف الوزن', desc_fr:'Chaussures de course légères', desc_en:'Lightweight running shoes', price:4999, compare_price:5999, cat:2, stock:35, feat:1 },
  { name_ar:'طقم طبخ', name_fr:'Set de cuisine', name_en:'Cookware Set', slug:'set-cuisine', desc_ar:'طقم طبخ احترافي 10 قطع', desc_fr:'Set de cuisine professionnel 10 pièces', desc_en:'10-piece professional cookware set', price:8999, compare_price:11999, cat:3, stock:20, feat:1 },
  { name_ar:'حقيبة ظهر', name_fr:'Sac à dos', name_en:'Backpack', slug:'sac-a-dos', desc_ar:'حقيبة ظهر متينة ومريحة', desc_fr:'Sac à dos durable et confortable', desc_en:'Durable and comfortable backpack', price:2999, compare_price:null, cat:4, stock:60, feat:0 },
  { name_ar:'كريم ترطيب', name_fr:'Crème hydratante', name_en:'Moisturizing Cream', slug:'creme-hydratante', desc_ar:'كريم ترطيب طبيعي للبشرة', desc_fr:'Crème hydratante naturelle', desc_en:'Natural moisturizing cream', price:1299, compare_price:1799, cat:5, stock:80, feat:0 },
];
const insProd = db.prepare('INSERT INTO products (name_ar, name_fr, name_en, slug, description_ar, description_fr, description_en, price, compare_price, category_id, stock, featured) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
products.forEach(p => insProd.run(p.name_ar, p.name_fr, p.name_en, p.slug, p.desc_ar, p.desc_fr, p.desc_en, p.price, p.compare_price, p.cat, p.stock, p.feat));

console.log('Database seeded successfully!');
console.log('Admin login: admin / admin123');
console.log('Store: http://localhost:3000');
console.log('Admin: http://localhost:3000/admin');