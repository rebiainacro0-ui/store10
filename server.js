const express = require('express');
const session = require('express-session');
const path = require('path');
const layouts = require('express-ejs-layouts');
const { getDb } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3000;

getDb();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(layouts);
app.set('layout', 'layout');

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'dz-store-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
  if (!req.session.id) req.session.id = require('uuid').v4();
  if (!req.session.lang) req.session.lang = 'ar';
  if (!req.session.currency) req.session.currency = 'DZD';
  next();
});

app.use((req, res, next) => {
  const db = getDb();
  const settings = {};
  const rows = db.prepare('SELECT key, value FROM settings').all();
  rows.forEach(r => settings[r.key] = r.value);
  res.locals.settings = settings;
  res.locals.lang = req.session.lang || 'ar';
  res.locals.currency = req.session.currency || 'DZD';
  res.locals.cartCount = getCartCount(req);
  next();
});

const storeRoutes = require('./routes/store');
const adminRoutes = require('./routes/admin');

app.use('/', storeRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404', { title: 'الصفحة غير موجودة', title_fr: 'Page non trouvée', title_en: 'Page Not Found' });
});

function getCartCount(req) {
  const db = getDb();
  const row = db.prepare('SELECT SUM(quantity) as count FROM cart WHERE session_id = ?').get(req.session.id);
  return row && row.count ? row.count : 0;
}

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`store10 running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin`);
    console.log(`Login: admin / admin123`);
  });
}

module.exports = app;