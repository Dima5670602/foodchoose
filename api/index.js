require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, '../public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'fC!9xKmP2vL7nQwR4tY6uI0eA3sDgHjZ5bN8cXoE1foodchoose2024secure';

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(100) UNIQUE NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'employee',
        phone_number VARCHAR(30),
        company_name VARCHAR(255),
        company_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS menus (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        available BOOLEAN DEFAULT TRUE,
        image_url TEXT,
        price DECIMAL(10,2),
        delivery_time VARCHAR(50),
        day_of_week VARCHAR(20) DEFAULT 'tous',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS beverages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        price DECIMAL(10,2),
        image_url TEXT,
        available BOOLEAN DEFAULT TRUE,
        day_of_week VARCHAR(20) DEFAULT 'tous',
        delivery_time VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        menu_id INTEGER REFERENCES menus(id) ON DELETE SET NULL,
        beverage_id INTEGER REFERENCES beverages(id) ON DELETE SET NULL,
        order_type VARCHAR(20) DEFAULT 'food',
        order_date DATE NOT NULL DEFAULT CURRENT_DATE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, order_date)
      );
      CREATE TABLE IF NOT EXISTS order_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        employee_id VARCHAR(100),
        employee_name VARCHAR(255),
        menu_name VARCHAR(255),
        beverage_name VARCHAR(255),
        order_type VARCHAR(20),
        order_date DATE NOT NULL,
        status VARCHAR(20),
        action VARCHAR(50),
        action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS ratings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        menu_id INTEGER REFERENCES menus(id) ON DELETE SET NULL,
        beverage_id INTEGER REFERENCES beverages(id) ON DELETE SET NULL,
        food_rating INTEGER CHECK (food_rating BETWEEN 1 AND 5),
        food_comment TEXT DEFAULT '',
        drink_rating INTEGER CHECK (drink_rating BETWEEN 1 AND 5),
        drink_comment TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, order_id)
      );
    `);

    const migs = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(30)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name VARCHAR(255)`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_type VARCHAR(100)`,
      `ALTER TABLE users DROP COLUMN IF EXISTS drink_preference`,
      `ALTER TABLE menus ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE`,
      `ALTER TABLE menus ADD COLUMN IF NOT EXISTS image_url TEXT`,
      `ALTER TABLE menus ADD COLUMN IF NOT EXISTS price DECIMAL(10,2)`,
      `ALTER TABLE menus ADD COLUMN IF NOT EXISTS delivery_time VARCHAR(50)`,
      `ALTER TABLE menus ADD COLUMN IF NOT EXISTS day_of_week VARCHAR(20) DEFAULT 'tous'`,
      `ALTER TABLE menus DROP COLUMN IF EXISTS menu_date`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS beverage_id INTEGER REFERENCES beverages(id) ON DELETE SET NULL`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(20) DEFAULT 'food'`,
      `ALTER TABLE order_history ADD COLUMN IF NOT EXISTS beverage_name VARCHAR(255)`,
      `ALTER TABLE order_history ADD COLUMN IF NOT EXISTS order_type VARCHAR(20)`,
    ];
    for (const sql of migs) {
      try { await pool.query(sql); } catch (_) {}
    }

    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.error('❌ Erreur initialisation DB:', err.message);
  }
}
initDB();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
});

async function sendCredentialsEmail(email, firstName, lastName, employeeId, password) {
  if (!process.env.MAIL_USER) return;
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || `"FoodChoose" <${process.env.MAIL_USER}>`,
      to: email,
      subject: '🍽️ Vos identifiants FoodChoose',
      html: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:40px;background:#FFF8F3;border-radius:12px">
          <h1 style="color:#E85A2A;text-align:center">🍽️ FoodChoose</h1>
          <h2 style="color:#2C1810">Bonjour ${firstName} ${lastName},</h2>
          <p>Votre compte FoodChoose a été créé. Voici vos identifiants :</p>
          <div style="background:#2C1810;border-radius:8px;padding:24px;margin:24px 0;text-align:center">
            <p style="color:#F9C74F;margin:0 0 4px;font-size:12px;text-transform:uppercase">Identifiant</p>
            <p style="color:#FFF8F3;font-size:22px;font-weight:bold;margin:0 0 16px;font-family:monospace">${employeeId}</p>
            <p style="color:#F9C74F;margin:0 0 4px;font-size:12px;text-transform:uppercase">Mot de passe</p>
            <p style="color:#FFF8F3;font-size:22px;font-weight:bold;margin:0;font-family:monospace">${password}</p>
          </div>
          <p style="color:#8B6554;font-size:12px">Conservez ces informations confidentielles.</p>
        </div>`
    });
  } catch (err) { console.error('Email error:', err.message); }
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Token invalide' }); }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    next();
  });
}

function todayDate() { return new Date().toISOString().split('T')[0]; }
function todayDayFr() {
  const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  return days[new Date().getDay()];
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) return res.status(400).json({ error: 'Champs requis' });

  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || '@admin123';

  if (employeeId === adminUser && password === adminPass) {
    const token = jwt.sign({ id: 0, employeeId: 'admin', role: 'admin', name: 'Administrateur' }, JWT_SECRET, { expiresIn: '8h' });
    return res.json({ token, role: 'admin', name: 'Administrateur', employeeId: 'admin' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE employee_id = $1', [employeeId]);
    if (!result.rows.length) return res.status(401).json({ error: 'Identifiants incorrects' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = jwt.sign({ id: user.id, employeeId: user.employee_id, role: 'employee', name: `${user.first_name} ${user.last_name}` }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, role: 'employee', name: `${user.first_name} ${user.last_name}`, employeeId: user.employee_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/register', async (req, res) => {
  const { firstName, lastName, email, password, phoneNumber, companyName, companyType, employeeId } = req.body;
  if (!firstName || !lastName || !email || !password || !employeeId)
    return res.status(400).json({ error: 'Champs requis : prénom, nom, email, identifiant, mot de passe' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe : minimum 6 caractères' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (employee_id, first_name, last_name, email, password_hash, phone_number, company_name, company_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, employee_id, first_name, last_name, email`,
      [employeeId.trim(), firstName.trim(), lastName.trim(), email.trim(), hash,
       phoneNumber?.trim() || null, companyName?.trim() || null, companyType?.trim() || null]
    );
    const newUser = result.rows[0];
    const token = jwt.sign({ id: newUser.id, employeeId: newUser.employee_id, role: 'employee', name: `${newUser.first_name} ${newUser.last_name}` }, JWT_SECRET, { expiresIn: '8h' });
    res.status(201).json({ token, role: 'employee', name: `${newUser.first_name} ${newUser.last_name}`, employeeId: newUser.employee_id });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "L'identifiant ou l'email existe déjà" });
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — USERS
// ═══════════════════════════════════════════════════════════

app.get('/api/admin/employees', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, employee_id, first_name, last_name, email, phone_number, company_name, company_type, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/employees', adminMiddleware, async (req, res) => {
  const { firstName, lastName, email, employeeId, phoneNumber, companyName, companyType } = req.body;
  if (!firstName || !lastName || !email || !employeeId) return res.status(400).json({ error: 'Champs requis' });
  const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD || 'Elimmeka123';
  try {
    const hash = await bcrypt.hash(defaultPassword, 10);
    const result = await pool.query(
      `INSERT INTO users (employee_id, first_name, last_name, email, password_hash, phone_number, company_name, company_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, employee_id, first_name, last_name, email`,
      [employeeId.trim(), firstName.trim(), lastName.trim(), email.trim(), hash,
       phoneNumber?.trim() || null, companyName?.trim() || null, companyType?.trim() || null]
    );
    await sendCredentialsEmail(email, firstName, lastName, employeeId, defaultPassword);
    res.status(201).json({ ...result.rows[0], message: 'Compte créé avec succès' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "L'identifiant ou l'email existe déjà" });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/employees/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — MENUS PLATS
// ═══════════════════════════════════════════════════════════

app.get('/api/admin/menus', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/menus', adminMiddleware, async (req, res) => {
  const { name, description, imageUrl, price, deliveryTime, dayOfWeek } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom du menu requis' });
  try {
    const result = await pool.query(
      `INSERT INTO menus (name, description, available, image_url, price, delivery_time, day_of_week)
       VALUES ($1,$2,TRUE,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), description?.trim() || '', imageUrl || null,
       price ? parseFloat(price) : null, deliveryTime?.trim() || null, dayOfWeek || 'tous']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/menus/:id/availability', adminMiddleware, async (req, res) => {
  const { available } = req.body;
  try {
    const result = await pool.query('UPDATE menus SET available = $1 WHERE id = $2 RETURNING *', [available, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Menu non trouvé' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/menus/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM menus WHERE id = $1', [req.params.id]);
    res.json({ message: 'Menu supprimé' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — MENUS BOISSONS
// ═══════════════════════════════════════════════════════════

app.get('/api/admin/beverages', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM beverages ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/beverages', adminMiddleware, async (req, res) => {
  const { name, description, imageUrl, price, deliveryTime, dayOfWeek } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom de la boisson requis' });
  try {
    const result = await pool.query(
      `INSERT INTO beverages (name, description, price, image_url, available, day_of_week, delivery_time)
       VALUES ($1,$2,$3,$4,TRUE,$5,$6) RETURNING *`,
      [name.trim(), description?.trim() || '', price ? parseFloat(price) : null,
       imageUrl || null, dayOfWeek || 'tous', deliveryTime?.trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/admin/beverages/:id/availability', adminMiddleware, async (req, res) => {
  const { available } = req.body;
  try {
    const result = await pool.query('UPDATE beverages SET available = $1 WHERE id = $2 RETURNING *', [available, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Boisson non trouvée' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/beverages/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM beverages WHERE id = $1', [req.params.id]);
    res.json({ message: 'Boisson supprimée' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — ORDERS
// ═══════════════════════════════════════════════════════════

app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
  const targetDate = req.query.date || todayDate();
  try {
    const result = await pool.query(`
      SELECT o.id, o.order_date, o.order_type, o.status, o.updated_at,
             u.employee_id, u.first_name, u.last_name, u.email,
             u.phone_number, u.company_name, u.company_type,
             m.name AS menu_name, m.price AS menu_price, m.delivery_time AS menu_delivery_time,
             b.name AS beverage_name, b.price AS beverage_price, b.delivery_time AS beverage_delivery_time
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN menus m ON o.menu_id = m.id
      LEFT JOIN beverages b ON o.beverage_id = b.id
      WHERE o.order_date = $1
      ORDER BY o.updated_at DESC
    `, [targetDate]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post('/api/admin/orders/validate', adminMiddleware, async (req, res) => {
  const targetDate = req.body.date || todayDate();
  try {
    const result = await pool.query(
      "UPDATE orders SET status='validated', updated_at=NOW() WHERE order_date=$1 AND status='pending' RETURNING *",
      [targetDate]
    );
    for (const order of result.rows) {
      const userRes = await pool.query('SELECT first_name, last_name, employee_id FROM users WHERE id = $1', [order.user_id]);
      const menuName = order.menu_id ? (await pool.query('SELECT name FROM menus WHERE id=$1', [order.menu_id])).rows[0]?.name : null;
      const bevName = order.beverage_id ? (await pool.query('SELECT name FROM beverages WHERE id=$1', [order.beverage_id])).rows[0]?.name : null;
      if (userRes.rows.length) {
        const u = userRes.rows[0];
        await pool.query(
          `INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, beverage_name, order_type, order_date, status, action)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [order.user_id, u.employee_id, `${u.first_name} ${u.last_name}`, menuName, bevName, order.order_type, order.order_date, 'validated', 'validated']
        );
      }
    }
    res.json({ validated: result.rowCount, message: `${result.rowCount} commande(s) validée(s)` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/export-pdf', adminMiddleware, async (req, res) => {
  const targetDate = req.query.date || todayDate();
  try {
    const result = await pool.query(`
      SELECT o.order_date, o.order_type, o.status,
             u.employee_id, u.first_name, u.last_name,
             m.name AS menu_name, b.name AS beverage_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN menus m ON o.menu_id = m.id
      LEFT JOIN beverages b ON o.beverage_id = b.id
      WHERE o.order_date = $1
      ORDER BY u.last_name, u.first_name
    `, [targetDate]);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="commandes_${targetDate}.pdf"`);
    doc.pipe(res);

    const dateLabel = new Date(targetDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    doc.rect(0, 0, doc.page.width, 120).fill('#E85A2A');
    doc.fillColor('#FFF8F3').fontSize(28).font('Helvetica-Bold').text('FoodChoose', 50, 35);
    doc.fontSize(14).font('Helvetica').text(`Commandes - ${dateLabel}`, 50, 70);
    doc.fontSize(11).text(`Genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}`, 50, 92);

    const validated = result.rows.filter(r => r.status === 'validated').length;
    const pending = result.rows.filter(r => r.status === 'pending').length;

    doc.fillColor('#2C1810').fontSize(13).font('Helvetica-Bold').text('RÉSUMÉ', 50, 145);
    doc.moveTo(50, 163).lineTo(doc.page.width - 50, 163).lineWidth(2).strokeColor('#E85A2A').stroke();
    doc.fontSize(11).font('Helvetica').fillColor('#4A3728');
    doc.text(`Total : ${result.rows.length} | Validées : ${validated} | En attente : ${pending}`, 50, 172);

    let y = 220;
    doc.fillColor('#2C1810').fontSize(13).font('Helvetica-Bold').text('DÉTAIL DES COMMANDES', 50, y); y += 20;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(2).strokeColor('#E85A2A').stroke(); y += 12;

    doc.rect(50, y, doc.page.width - 100, 22).fill('#2C1810');
    doc.fillColor('#FFF8F3').fontSize(9).font('Helvetica-Bold');
    doc.text('EMPLOYÉ', 58, y + 6);
    doc.text('PLAT', 200, y + 6);
    doc.text('BOISSON', 350, y + 6);
    doc.text('STATUT', 470, y + 6);
    y += 30;

    result.rows.forEach((row, i) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      if (i % 2 === 0) doc.rect(50, y - 4, doc.page.width - 100, 20).fill('#FFF8F3');
      doc.fillColor('#2C1810').fontSize(9).font('Helvetica');
      doc.text(`${row.last_name} ${row.first_name}`, 58, y);
      doc.text((row.menu_name || '-').substring(0, 20), 200, y);
      doc.text((row.beverage_name || '-').substring(0, 18), 350, y);
      doc.fillColor(row.status === 'validated' ? '#27ae60' : '#E85A2A').text(row.status === 'validated' ? 'Valide' : 'En attente', 470, y);
      doc.fillColor('#2C1810');
      y += 22;
    });

    if (!result.rows.length) doc.fillColor('#8B6554').fontSize(12).font('Helvetica-Oblique').text('Aucune commande pour cette date.', 50, y);

    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#2C1810');
    doc.fillColor('#8B6554').fontSize(9).text('FoodChoose - Plateforme de gestion des repas', 50, doc.page.height - 25);
    doc.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/history', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM order_history ORDER BY action_timestamp DESC LIMIT 200');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const day = todayDayFr();
    const days = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche','tous'];
    const [empCount, todayOrders, todayMenus, todayBevs, pendingOrders, menusByDay, bevsByDay] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM orders WHERE order_date = $1', [todayDate()]),
      pool.query("SELECT COUNT(*) FROM menus WHERE available=TRUE AND (day_of_week='tous' OR day_of_week=$1)", [day]),
      pool.query("SELECT COUNT(*) FROM beverages WHERE available=TRUE AND (day_of_week='tous' OR day_of_week=$1)", [day]),
      pool.query("SELECT COUNT(*) FROM orders WHERE order_date=$1 AND status='pending'", [todayDate()]),
      pool.query('SELECT day_of_week, COUNT(*) as count FROM menus WHERE available=TRUE GROUP BY day_of_week'),
      pool.query('SELECT day_of_week, COUNT(*) as count FROM beverages WHERE available=TRUE GROUP BY day_of_week')
    ]);
    const weeklyMenus = Object.fromEntries(days.map(d => [d, 0]));
    menusByDay.rows.forEach(r => { if (r.day_of_week in weeklyMenus) weeklyMenus[r.day_of_week] = parseInt(r.count); });
    const weeklyBeverages = Object.fromEntries(days.map(d => [d, 0]));
    bevsByDay.rows.forEach(r => { if (r.day_of_week in weeklyBeverages) weeklyBeverages[r.day_of_week] = parseInt(r.count); });
    res.json({
      employees: parseInt(empCount.rows[0].count),
      todayOrders: parseInt(todayOrders.rows[0].count),
      todayMenus: parseInt(todayMenus.rows[0].count),
      todayBeverages: parseInt(todayBevs.rows[0].count),
      pendingOrders: parseInt(pendingOrders.rows[0].count),
      weeklyMenus,
      weeklyBeverages
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/ratings', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, u.first_name, u.last_name, u.employee_id,
             m.name AS menu_name, b.name AS beverage_name
      FROM ratings r
      JOIN users u ON r.user_id = u.id
      LEFT JOIN menus m ON r.menu_id = m.id
      LEFT JOIN beverages b ON r.beverage_id = b.id
      ORDER BY r.created_at DESC LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  EMPLOYEE — MENUS & BEVERAGES
// ═══════════════════════════════════════════════════════════

app.get('/api/employee/menus', authMiddleware, async (req, res) => {
  try {
    const day = todayDayFr();
    const result = await pool.query(
      "SELECT * FROM menus WHERE available=TRUE AND (day_of_week='tous' OR day_of_week=$1) ORDER BY created_at",
      [day]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/beverages', authMiddleware, async (req, res) => {
  try {
    const day = todayDayFr();
    const result = await pool.query(
      "SELECT * FROM beverages WHERE available=TRUE AND (day_of_week='tous' OR day_of_week=$1) ORDER BY created_at",
      [day]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  EMPLOYEE — ORDERS
// ═══════════════════════════════════════════════════════════

app.get('/api/employee/order', authMiddleware, async (req, res) => {
  const targetDate = req.query.date || todayDate();
  try {
    const result = await pool.query(`
      SELECT o.*,
             m.name AS menu_name, m.description AS menu_description, m.price AS menu_price,
             m.image_url AS menu_image, m.delivery_time AS menu_delivery_time,
             b.name AS beverage_name, b.description AS beverage_description, b.price AS beverage_price,
             b.image_url AS beverage_image, b.delivery_time AS beverage_delivery_time
      FROM orders o
      LEFT JOIN menus m ON o.menu_id = m.id
      LEFT JOIN beverages b ON o.beverage_id = b.id
      WHERE o.user_id = $1 AND o.order_date = $2
    `, [req.user.id, targetDate]);
    res.json(result.rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/order', authMiddleware, async (req, res) => {
  const { menuId, beverageId, orderType, orderDate } = req.body;
  const date = orderDate || todayDate();

  if (!orderType || !['food','drink','both'].includes(orderType))
    return res.status(400).json({ error: 'Type de commande invalide (food, drink, both)' });
  if ((orderType === 'food' || orderType === 'both') && !menuId)
    return res.status(400).json({ error: 'Plat requis' });
  if ((orderType === 'drink' || orderType === 'both') && !beverageId)
    return res.status(400).json({ error: 'Boisson requise' });

  try {
    let menuName = null, bevName = null;
    if (menuId) {
      const mRes = await pool.query('SELECT * FROM menus WHERE id=$1 AND available=TRUE', [menuId]);
      if (!mRes.rows.length) return res.status(404).json({ error: 'Plat non trouvé ou indisponible' });
      menuName = mRes.rows[0].name;
    }
    if (beverageId) {
      const bRes = await pool.query('SELECT * FROM beverages WHERE id=$1 AND available=TRUE', [beverageId]);
      if (!bRes.rows.length) return res.status(404).json({ error: 'Boisson non trouvée ou indisponible' });
      bevName = bRes.rows[0].name;
    }

    const result = await pool.query(
      'INSERT INTO orders (user_id, menu_id, beverage_id, order_type, order_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, menuId || null, beverageId || null, orderType, date]
    );
    await pool.query(
      `INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, beverage_name, order_type, order_date, status, action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.user.id, req.user.employeeId, req.user.name, menuName, bevName, orderType, date, 'pending', 'created']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Vous avez déjà une commande pour ce jour' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/employee/order/:id', authMiddleware, async (req, res) => {
  const { menuId, beverageId, orderType } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Commande non trouvée' });
    if (existing.rows[0].status === 'validated') return res.status(400).json({ error: 'La commande est déjà validée' });

    let menuName = null, bevName = null;
    if (menuId) menuName = (await pool.query('SELECT name FROM menus WHERE id=$1', [menuId])).rows[0]?.name;
    if (beverageId) bevName = (await pool.query('SELECT name FROM beverages WHERE id=$1', [beverageId])).rows[0]?.name;

    const result = await pool.query(
      'UPDATE orders SET menu_id=$1, beverage_id=$2, order_type=$3, updated_at=NOW() WHERE id=$4 AND user_id=$5 RETURNING *',
      [menuId || null, beverageId || null, orderType || existing.rows[0].order_type, req.params.id, req.user.id]
    );
    await pool.query(
      `INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, beverage_name, order_type, order_date, status, action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.user.id, req.user.employeeId, req.user.name, menuName, bevName,
       orderType || existing.rows[0].order_type, existing.rows[0].order_date, 'pending', 'updated']
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/order/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await pool.query(`
      SELECT o.*, m.name AS menu_name, b.name AS beverage_name
      FROM orders o
      LEFT JOIN menus m ON o.menu_id = m.id
      LEFT JOIN beverages b ON o.beverage_id = b.id
      WHERE o.id=$1 AND o.user_id=$2
    `, [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Commande non trouvée' });
    if (existing.rows[0].status === 'validated') return res.status(400).json({ error: 'Impossible de supprimer une commande validée' });

    await pool.query('DELETE FROM orders WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    const o = existing.rows[0];
    await pool.query(
      `INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, beverage_name, order_type, order_date, status, action)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.user.id, req.user.employeeId, req.user.name, o.menu_name, o.beverage_name, o.order_type, o.order_date, 'deleted', 'deleted']
    );
    res.json({ message: 'Commande supprimée' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  EMPLOYEE — HISTORY & PROFILE
// ═══════════════════════════════════════════════════════════

app.get('/api/employee/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM order_history WHERE user_id=$1 ORDER BY action_timestamp DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/history', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM order_history WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'Historique effacé' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employee/history/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM order_history WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ message: 'Entrée supprimée' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, employee_id, first_name, last_name, email, phone_number, company_name, company_type, created_at FROM users WHERE id=$1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/profile', authMiddleware, async (req, res) => {
  const { phoneNumber, companyName, companyType } = req.body;
  try {
    await pool.query(
      'UPDATE users SET phone_number=$1, company_name=$2, company_type=$3 WHERE id=$4',
      [phoneNumber?.trim() || null, companyName?.trim() || null, companyType?.trim() || null, req.user.id]
    );
    res.json({ message: 'Profil mis à jour' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employee/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Minimum 6 caractères' });
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [newHash, req.user.id]);
    res.json({ message: 'Mot de passe modifié' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ═══════════════════════════════════════════════════════════
//  EMPLOYEE — RATINGS
// ═══════════════════════════════════════════════════════════

app.get('/api/employee/ratings', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, m.name AS menu_name, b.name AS beverage_name
      FROM ratings r
      LEFT JOIN menus m ON r.menu_id = m.id
      LEFT JOIN beverages b ON r.beverage_id = b.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/employee/orders/ratable', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.id, o.order_date, o.order_type, o.menu_id, o.beverage_id,
             m.name AS menu_name, m.image_url AS menu_image,
             b.name AS beverage_name, b.image_url AS beverage_image,
             (SELECT id FROM ratings WHERE user_id=$1 AND order_id=o.id) AS rating_id
      FROM orders o
      LEFT JOIN menus m ON o.menu_id = m.id
      LEFT JOIN beverages b ON o.beverage_id = b.id
      WHERE o.user_id=$1 AND o.status='validated'
      ORDER BY o.order_date DESC LIMIT 30
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employee/ratings', authMiddleware, async (req, res) => {
  const { orderId, menuId, beverageId, foodRating, foodComment, drinkRating, drinkComment } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Commande requise' });
  try {
    const orderRes = await pool.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 AND status=$3', [orderId, req.user.id, 'validated']);
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Commande non trouvée ou non validée' });

    const result = await pool.query(`
      INSERT INTO ratings (user_id, order_id, menu_id, beverage_id, food_rating, food_comment, drink_rating, drink_comment)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (user_id, order_id) DO UPDATE
        SET food_rating=$5, food_comment=$6, drink_rating=$7, drink_comment=$8
      RETURNING *
    `, [req.user.id, orderId, menuId || null, beverageId || null,
        foodRating || null, foodComment?.trim() || '', drinkRating || null, drinkComment?.trim() || '']);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════
//  SPA FALLBACK
// ═══════════════════════════════════════════════════════════

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/employee', (req, res) => res.sendFile(path.join(__dirname, '../public/employee/index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const server = app.listen(PORT, () => console.log(`🍽️  FoodChoose running on http://localhost:${PORT}`));
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') console.error(`❌ Le port ${PORT} est déjà utilisé.`);
    else console.error('❌ Erreur serveur:', err.message);
    process.exit(1);
  });
}

module.exports = app;
