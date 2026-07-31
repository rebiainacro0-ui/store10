const bcrypt = require('bcryptjs');
const { exec, getPool } = require('./pg');

async function initPgSchema() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS wilayas (
      id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      shipping_price NUMERIC(12,2) DEFAULT 0, free_shipping_min NUMERIC(12,2) DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS communes (
      id SERIAL PRIMARY KEY, wilaya_code TEXT NOT NULL,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      shipping_price NUMERIC(12,2) DEFAULT 0,
      free_shipping_min NUMERIC(12,2) DEFAULT NULL,
      shipping_price_office NUMERIC(12,2) DEFAULT NULL,
      FOREIGN KEY (wilaya_code) REFERENCES wilayas(code)
    );
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description_ar TEXT, description_fr TEXT, description_en TEXT,
      image_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description_ar TEXT, description_fr TEXT, description_en TEXT,
      benefits_ar TEXT, benefits_fr TEXT, benefits_en TEXT,
      specifications_ar TEXT, specifications_fr TEXT, specifications_en TEXT,
      how_to_use_ar TEXT, how_to_use_fr TEXT, how_to_use_en TEXT,
      price NUMERIC(12,2) NOT NULL, compare_price NUMERIC(12,2), cost_price NUMERIC(12,2),
      image_url TEXT, video_url TEXT,
      category_id INTEGER, stock INTEGER DEFAULT 0,
      featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
      show_shipping INTEGER DEFAULT 1, show_price INTEGER DEFAULT 1,
      content_bottom TEXT,
      meta_title_ar TEXT, meta_title_fr TEXT, meta_title_en TEXT,
      meta_description_ar TEXT, meta_description_fr TEXT, meta_description_en TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS product_faqs (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      question_ar TEXT NOT NULL, question_fr TEXT NOT NULL, question_en TEXT NOT NULL,
      answer_ar TEXT NOT NULL, answer_fr TEXT NOT NULL, answer_en TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      email TEXT, full_name TEXT NOT NULL,
      phone TEXT NOT NULL, phone2 TEXT,
      wilaya_code TEXT, commune_id INTEGER,
      delivery_address TEXT, delivery_type TEXT DEFAULT 'home',
      notes TEXT, password TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (wilaya_code) REFERENCES wilayas(code),
      FOREIGN KEY (commune_id) REFERENCES communes(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE, customer_id INTEGER,
      full_name TEXT NOT NULL, phone TEXT NOT NULL, phone2 TEXT,
      wilaya_code TEXT NOT NULL, commune_id INTEGER,
      delivery_address TEXT NOT NULL, delivery_type TEXT DEFAULT 'home',
      notes TEXT, payment_method TEXT DEFAULT 'cod',
      subtotal NUMERIC(12,2) NOT NULL, shipping NUMERIC(12,2) DEFAULT 0,
      discount NUMERIC(12,2) DEFAULT 0, coupon_code TEXT,
      total NUMERIC(12,2) NOT NULL, status TEXT DEFAULT 'pending',
      delivery_company TEXT, tracking_url TEXT, admin_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (wilaya_code) REFERENCES wilayas(code),
      FOREIGN KEY (commune_id) REFERENCES communes(id)
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL, product_id INTEGER,
      product_name_ar TEXT NOT NULL, product_name_fr TEXT NOT NULL, product_name_en TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL, quantity INTEGER NOT NULL, total NUMERIC(12,2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS cart (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL, product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL, role TEXT DEFAULT 'admin',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL, customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT, approved INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS coupons (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE, type TEXT NOT NULL DEFAULT 'percentage',
      value NUMERIC(12,2) NOT NULL, min_order NUMERIC(12,2) DEFAULT 0,
      max_uses INTEGER, used_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1, expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS flash_sales (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL, discount_percent INTEGER NOT NULL,
      start_date TIMESTAMPTZ NOT NULL, end_date TIMESTAMPTZ NOT NULL,
      max_quantity INTEGER, sold_count INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS pages (
      id SERIAL PRIMARY KEY,
      title_ar TEXT NOT NULL, title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content_ar TEXT, content_fr TEXT, content_en TEXT,
      meta_title TEXT, meta_description TEXT,
      published INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS blog_posts (
      id SERIAL PRIMARY KEY,
      title_ar TEXT NOT NULL, title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content_ar TEXT, content_fr TEXT, content_en TEXT,
      image_url TEXT, published INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_status_history (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL, status TEXT NOT NULL,
      note TEXT, created_by INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
    CREATE TABLE IF NOT EXISTS product_options (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL, name_ar TEXT NOT NULL, name_fr TEXT NOT NULL, name_en TEXT NOT NULL,
      type TEXT DEFAULT 'radio', required INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS product_option_values (
      id SERIAL PRIMARY KEY,
      option_id INTEGER NOT NULL, value_ar TEXT NOT NULL, value_fr TEXT NOT NULL, value_en TEXT NOT NULL,
      price_adjustment NUMERIC(12,2) DEFAULT 0, sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (option_id) REFERENCES product_options(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS order_item_options (
      id SERIAL PRIMARY KEY,
      order_item_id INTEGER NOT NULL, option_name TEXT NOT NULL, value_name TEXT NOT NULL,
      price_adjustment NUMERIC(12,2) DEFAULT 0,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS shipping_zones (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL, description TEXT,
      free_shipping_min NUMERIC(12,2) DEFAULT NULL,
      free_shipping_active INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS product_offers (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'bogo',
      min_qty INTEGER NOT NULL DEFAULT 2,
      free_qty INTEGER DEFAULT 0,
      discount_percent NUMERIC(12,2) DEFAULT 0,
      offer_label_ar TEXT, offer_label_fr TEXT, offer_label_en TEXT,
      active INTEGER DEFAULT 1,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS product_bottom_images (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL, image_url TEXT NOT NULL, sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS delivery_apis (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL, api_url TEXT NOT NULL, api_key TEXT NOT NULL,
      active INTEGER DEFAULT 1, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS recently_viewed (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL, product_id INTEGER NOT NULL,
      viewed_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS page_views (
      id SERIAL PRIMARY KEY,
      session_id TEXT, page TEXT NOT NULL,
      viewed_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const userCount = await pool.query('SELECT COUNT(*)::int as count FROM users');
  if (userCount.rows[0].count === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    await pool.query('INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)', ['admin', 'admin@store.com', hash, 'admin']);
    await seedWilayasPg(pool);
  }
}

async function seedWilayasPg(pool) {
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
  for (const row of data) {
    await pool.query('INSERT INTO wilayas (code, name_ar, name_fr, name_en) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING', row);
  }
}

module.exports = { initPgSchema };
