const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'store.db');
let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wilayas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      shipping_price REAL DEFAULT 0, free_shipping_min REAL DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS communes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, wilaya_code TEXT NOT NULL,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      FOREIGN KEY (wilaya_code) REFERENCES wilayas(code)
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description_ar TEXT, description_fr TEXT, description_en TEXT,
      image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description_ar TEXT, description_fr TEXT, description_en TEXT,
      benefits_ar TEXT, benefits_fr TEXT, benefits_en TEXT,
      specifications_ar TEXT, specifications_fr TEXT, specifications_en TEXT,
      how_to_use_ar TEXT, how_to_use_fr TEXT, how_to_use_en TEXT,
      price REAL NOT NULL, compare_price REAL, cost_price REAL,
      image_url TEXT, video_url TEXT,
      category_id INTEGER, stock INTEGER DEFAULT 0,
      featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      meta_title_ar TEXT, meta_title_fr TEXT, meta_title_en TEXT,
      meta_description_ar TEXT, meta_description_fr TEXT, meta_description_en TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS product_faqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      question_ar TEXT NOT NULL, question_fr TEXT NOT NULL, question_en TEXT NOT NULL,
      answer_ar TEXT NOT NULL, answer_fr TEXT NOT NULL, answer_en TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT, full_name TEXT NOT NULL,
      phone TEXT NOT NULL, phone2 TEXT,
      wilaya_code TEXT, commune_id INTEGER,
      delivery_address TEXT, delivery_type TEXT DEFAULT 'home',
      notes TEXT, password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wilaya_code) REFERENCES wilayas(code),
      FOREIGN KEY (commune_id) REFERENCES communes(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE, customer_id INTEGER,
      full_name TEXT NOT NULL, phone TEXT NOT NULL, phone2 TEXT,
      wilaya_code TEXT NOT NULL, commune_id INTEGER,
      delivery_address TEXT NOT NULL, delivery_type TEXT DEFAULT 'home',
      notes TEXT, payment_method TEXT DEFAULT 'cod',
      subtotal REAL NOT NULL, shipping REAL DEFAULT 0,
      discount REAL DEFAULT 0, coupon_code TEXT,
      total REAL NOT NULL, status TEXT DEFAULT 'pending',
      delivery_company TEXT, tracking_url TEXT, admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (wilaya_code) REFERENCES wilayas(code),
      FOREIGN KEY (commune_id) REFERENCES communes(id)
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL, product_id INTEGER,
      product_name_ar TEXT NOT NULL, product_name_fr TEXT NOT NULL, product_name_en TEXT NOT NULL,
      price REAL NOT NULL, quantity INTEGER NOT NULL, total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS cart (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL, product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT, approved INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'percentage',
      value REAL NOT NULL, min_order REAL DEFAULT 0,
      max_uses INTEGER, used_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1, expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS flash_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, discount_percent INTEGER NOT NULL,
      start_date DATETIME NOT NULL, end_date DATETIME NOT NULL,
      max_quantity INTEGER, sold_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ar TEXT NOT NULL, title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content_ar TEXT, content_fr TEXT, content_en TEXT,
      meta_title TEXT, meta_description TEXT,
      published INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ar TEXT NOT NULL, title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content_ar TEXT, content_fr TEXT, content_en TEXT,
      image_url TEXT, published INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL, status TEXT NOT NULL,
      note TEXT, created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
    CREATE TABLE IF NOT EXISTS recently_viewed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL, product_id INTEGER NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT, page TEXT NOT NULL,
      viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  runMigrations();

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@store.com', hash, 'admin');
    seedWilayas();
  }
}

function runMigrations() {
  const pCols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
  if (!pCols.includes('show_shipping')) db.exec('ALTER TABLE products ADD COLUMN show_shipping INTEGER DEFAULT 1');
  if (!pCols.includes('show_price')) db.exec('ALTER TABLE products ADD COLUMN show_price INTEGER DEFAULT 1');
  if (!pCols.includes('content_bottom')) db.exec('ALTER TABLE products ADD COLUMN content_bottom TEXT DEFAULT NULL');
  db.exec(`CREATE TABLE IF NOT EXISTS product_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL, name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
    type TEXT DEFAULT 'radio', required INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS product_option_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_id INTEGER NOT NULL, value_ar TEXT NOT NULL, value_fr TEXT NOT NULL, value_en TEXT NOT NULL,
    price_adjustment REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (option_id) REFERENCES product_options(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS order_item_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_item_id INTEGER NOT NULL, option_name TEXT NOT NULL, value_name TEXT NOT NULL, price_adjustment REAL DEFAULT 0,
    FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
  )`);
  const cols = db.prepare("PRAGMA table_info(communes)").all().map(c => c.name);
  if (!cols.includes('active')) db.exec('ALTER TABLE communes ADD COLUMN active INTEGER DEFAULT 1');
  if (!cols.includes('shipping_price')) db.exec('ALTER TABLE communes ADD COLUMN shipping_price REAL DEFAULT 0');
  if (!cols.includes('free_shipping_min')) db.exec('ALTER TABLE communes ADD COLUMN free_shipping_min REAL DEFAULT NULL');
  if (!cols.includes('shipping_price_office')) db.exec('ALTER TABLE communes ADD COLUMN shipping_price_office REAL DEFAULT NULL');
  const wCols = db.prepare("PRAGMA table_info(wilayas)").all().map(c => c.name);
  if (!wCols.includes('shipping_price_office')) db.exec('ALTER TABLE wilayas ADD COLUMN shipping_price_office REAL DEFAULT NULL');
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, description TEXT,
    free_shipping_min REAL DEFAULT NULL,
    free_shipping_active INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  const zCols = db.prepare("PRAGMA table_info(shipping_zones)").all().map(c => c.name);
  if (!zCols.includes('active')) db.exec('ALTER TABLE shipping_zones ADD COLUMN active INTEGER DEFAULT 1');
  db.exec(`CREATE TABLE IF NOT EXISTS product_offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'bogo',
    min_qty INTEGER NOT NULL DEFAULT 2,
    free_qty INTEGER DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    offer_label_ar TEXT, offer_label_fr TEXT, offer_label_en TEXT,
    active INTEGER DEFAULT 1,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS product_bottom_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS delivery_apis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, api_url TEXT NOT NULL, api_key TEXT NOT NULL,
    active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
}

function seedWilayas() {
  const data = [
    ['01','أدرار','Adrar','Adrar'],['02','الشلف','Chlef','Chlef'],['03','الأغواط','Laghouat','Laghouat'],
    ['04','أم البواقي','Oum El Bouaghi','Oum El Bouaghi'],['05','باتنة','Batna','Batna'],
    ['06','بجاية','Béjaïa','Béjaïa'],['07','بسكرة','Biskra','Biskra'],['08','بشار','Béchar','Béchar'],
    ['09','البليدة','Blida','Blida'],['10','البويرة','Bouira','Bouira'],
    ['11','تمنراست','Tamanrasset','Tamanrasset'],['12','تبسة','Tébessa','Tébessa'],
    ['13','تلمسان','Tlemcen','Tlemcen'],['14','تيارت','Tiaret','Tiaret'],
    ['15','تيزي وزو','Tizi Ouzou','Tizi Ouzou'],['16','الجزائر','Alger','Algiers'],
    ['17','الجلفة','Djelfa','Djelfa'],['18','جيجل','Jijel','Jijel'],['19','سطيف','Sétif','Sétif'],
    ['20','سعيدة','Saïda','Saïda'],['21','سكيكدة','Skikda','Skikda'],
    ['22','سيدي بلعباس','Sidi Bel Abbès','Sidi Bel Abbès'],['23','عنابة','Annaba','Annaba'],
    ['24','قالمة','Guelma','Guelma'],['25','قسنطينة','Constantine','Constantine'],
    ['26','المدية','Médéa','Médéa'],['27','مستغانم','Mostaganem','Mostaganem'],
    ['28','المسيلة','M\'Sila','M\'Sila'],['29','معسكر','Mascara','Mascara'],
    ['30','ورقلة','Ouargla','Ouargla'],['31','وهران','Oran','Oran'],
    ['32','البيض','El Bayadh','El Bayadh'],['33','اليزي','Illizi','Illizi'],
    ['34','برج بوعريريج','Bordj Bou Arréridj','Bordj Bou Arréridj'],
    ['35','بومرداس','Boumerdès','Boumerdès'],['36','الطارف','El Tarf','El Tarf'],
    ['37','تندوف','Tindouf','Tindouf'],['38','تيسمسيلت','Tissemsilt','Tissemsilt'],
    ['39','الوادي','El Oued','El Oued'],['40','خنشلة','Khenchela','Khenchela'],
    ['41','سوق أهراس','Souk Ahras','Souk Ahras'],['42','تيبازة','Tipaza','Tipaza'],
    ['43','ميلة','Mila','Mila'],['44','عين الدفلى','Aïn Defla','Aïn Defla'],
    ['45','النعامة','Naâma','Naâma'],['46','عين تموشنت','Aïn Témouchent','Aïn Témouchent'],
    ['47','غرداية','Ghardaïa','Ghardaïa'],['48','غليزان','Relizane','Relizane'],
    ['49','المغير','El M\'ghair','El M\'ghair'],['50','المنيعة','El Menia','El Menia'],
    ['51','أولاد جلال','Ouled Djellal','Ouled Djellal'],
    ['52','برج باجي مختار','Bordj Baji Mokhtar','Bordj Baji Mokhtar'],
    ['53','بني عباس','Béni Abbès','Béni Abbès'],['54','تيميمون','Timimoun','Timimoun'],
    ['55','تقرت','Touggourt','Touggourt'],['56','جانت','Djanet','Djanet'],
    ['57','عين صالح','In Salah','In Salah'],['58','عين قزام','In Guezzam','In Guezzam']
  ];
  const w = db.prepare('INSERT OR IGNORE INTO wilayas (code, name_ar, name_fr, name_en) VALUES (?, ?, ?, ?)');
  for (const row of data) w.run(row[0], row[1], row[2], row[3]);
}

module.exports = { getDb };