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

// ─── Middleware ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ─── Database ─────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Auto-create tables on startup
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
        drink_preference VARCHAR(20) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS menus (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        available BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        menu_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
        order_date DATE NOT NULL DEFAULT CURRENT_DATE,
        drink_preference VARCHAR(20),
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
        order_date DATE NOT NULL,
        drink_preference VARCHAR(20),
        status VARCHAR(20),
        action VARCHAR(50),
        action_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Migrations
    await pool.query(`ALTER TABLE menus ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE menus DROP COLUMN IF EXISTS menu_date;`);
    console.log('✅ Base de données initialisée');
  } catch (err) {
    console.error('❌ Erreur initialisation DB:', err.message);
  }
}
initDB();

// ─── JWT Secret ───────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'fC!9xKmP2vL7nQwR4tY6uI0eA3sDgHjZ5bN8cXoE1foodchoose2024secure';

// ─── Email Transporter ────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

async function sendCredentialsEmail(email, firstName, lastName, employeeId, password) {
  if (!process.env.MAIL_USER) return; // Skip if not configured
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM || `"FoodChoose" <${process.env.MAIL_USER}>`,
      to: email,
      subject: '🍽️ Vos identifiants FoodChoose',
      html: `
        <div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; padding: 40px; background: #FFF8F3; border-radius: 12px;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #E85A2A; font-size: 32px; margin: 0;">🍽️ FoodChoose</h1>
            <p style="color: #8B6554; margin: 8px 0 0;">Plateforme de choix de repas</p>
          </div>
          <h2 style="color: #2C1810;">Bonjour ${firstName} ${lastName},</h2>
          <p style="color: #4A3728; line-height: 1.6;">Votre compte FoodChoose a été créé. Voici vos identifiants de connexion :</p>
          <div style="background: #2C1810; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="color: #F9C74F; margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Identifiant</p>
            <p style="color: #FFF8F3; font-size: 24px; font-weight: bold; margin: 0 0 20px; font-family: monospace;">${employeeId}</p>
            <p style="color: #F9C74F; margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Mot de passe</p>
            <p style="color: #FFF8F3; font-size: 24px; font-weight: bold; margin: 0; font-family: monospace;">${password}</p>
          </div>
          <p style="color: #8B6554; font-size: 13px; border-top: 1px solid #F0E6DE; padding-top: 16px; margin-top: 24px;">
            Pour des raisons de sécurité, nous vous recommandons de conserver ces informations confidentielles.
          </p>
        </div>
      `
    });
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

// ─── Auth Middleware ───────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    next();
  });
}

// ─── Helper: Date locale ──────────────────────────────────────────
function todayDate() {
  return new Date().toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════

// POST /api/auth/login
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
    if (result.rows.length === 0) return res.status(401).json({ error: 'Identifiants incorrects' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = jwt.sign({
      id: user.id,
      employeeId: user.employee_id,
      role: 'employee',
      name: `${user.first_name} ${user.last_name}`
    }, JWT_SECRET, { expiresIn: '8h' });

    res.json({ token, role: 'employee', name: `${user.first_name} ${user.last_name}`, employeeId: user.employee_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════

// GET /api/admin/employees
app.get('/api/admin/employees', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, employee_id, first_name, last_name, email, drink_preference, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/employees
app.post('/api/admin/employees', adminMiddleware, async (req, res) => {
  const { firstName, lastName, email, employeeId } = req.body;
  if (!firstName || !lastName || !email || !employeeId) return res.status(400).json({ error: 'Champs requis' });

  const defaultPassword = process.env.DEFAULT_EMPLOYEE_PASSWORD;
  try {
    const hash = await bcrypt.hash(defaultPassword, 10);
    const result = await pool.query(
      'INSERT INTO users (employee_id, first_name, last_name, email, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, employee_id, first_name, last_name, email',
      [employeeId.trim(), firstName.trim(), lastName.trim(), email.trim(), hash]
    );
    const newUser = result.rows[0];
    // Send email with credentials
    await sendCredentialsEmail(email, firstName, lastName, employeeId, defaultPassword);
    res.status(201).json({ ...newUser, message: 'Compte créé avec succès' });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: "L'identifiant ou l'email existe déjà" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/employees/:id
app.delete('/api/admin/employees/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Employé supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/menus
app.get('/api/admin/menus', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM menus ORDER BY created_at');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/menus
app.post('/api/admin/menus', adminMiddleware, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom du menu requis' });
  try {
    const result = await pool.query(
      'INSERT INTO menus (name, description, available) VALUES ($1, $2, TRUE) RETURNING *',
      [name.trim(), description?.trim() || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/menus/:id/availability — activer/désactiver un menu
app.patch('/api/admin/menus/:id/availability', adminMiddleware, async (req, res) => {
  const { available } = req.body;
  try {
    const result = await pool.query(
      'UPDATE menus SET available = $1 WHERE id = $2 RETURNING *',
      [available, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Menu non trouvé' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/menus/:id
app.delete('/api/admin/menus/:id', adminMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM menus WHERE id = $1', [req.params.id]);
    res.json({ message: 'Menu supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/orders  — all orders for a given date
app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || todayDate();
  try {
    const result = await pool.query(`
      SELECT o.id, o.order_date, o.drink_preference, o.status, o.updated_at,
             u.employee_id, u.first_name, u.last_name, u.email,
             m.name AS menu_name, m.description AS menu_description
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN menus m ON o.menu_id = m.id
      WHERE o.order_date = $1
      ORDER BY o.updated_at DESC
    `, [targetDate]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/preferences  — drink preference stats
app.get('/api/admin/preferences', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT drink_preference, COUNT(*) as count
      FROM users
      WHERE drink_preference IS NOT NULL
      GROUP BY drink_preference
    `);
    const stats = { lipton: 0, nescafe: 0, both: 0 };
    result.rows.forEach(r => {
      if (r.drink_preference in stats) stats[r.drink_preference] = parseInt(r.count);
    });
    // Also today's orders preferences
    const todayPrefs = await pool.query(`
      SELECT drink_preference, COUNT(*) as count
      FROM orders
      WHERE order_date = $1 AND drink_preference IS NOT NULL
      GROUP BY drink_preference
    `, [todayDate()]);
    const todayStats = { lipton: 0, nescafe: 0, both: 0 };
    todayPrefs.rows.forEach(r => {
      if (r.drink_preference in todayStats) todayStats[r.drink_preference] = parseInt(r.count);
    });
    res.json({ global: stats, today: todayStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/orders/validate — validate all pending orders for today
app.post('/api/admin/orders/validate', adminMiddleware, async (req, res) => {
  const { date } = req.body;
  const targetDate = date || todayDate();
  try {
    const result = await pool.query(
      "UPDATE orders SET status = 'validated', updated_at = NOW() WHERE order_date = $1 AND status = 'pending' RETURNING *",
      [targetDate]
    );
    // Log to history
    for (const order of result.rows) {
      const userRes = await pool.query('SELECT first_name, last_name, employee_id FROM users WHERE id = $1', [order.user_id]);
      const menuRes = await pool.query('SELECT name FROM menus WHERE id = $1', [order.menu_id]);
      if (userRes.rows.length && menuRes.rows.length) {
        await pool.query(
          'INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, order_date, status, action) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [order.user_id, userRes.rows[0].employee_id, `${userRes.rows[0].first_name} ${userRes.rows[0].last_name}`,
           menuRes.rows[0].name, order.order_date, 'validated', 'validated']
        );
      }
    }
    res.json({ validated: result.rowCount, message: `${result.rowCount} commande(s) validée(s)` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/export-pdf — export validated orders as PDF
app.get('/api/admin/export-pdf', adminMiddleware, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || todayDate();
  try {
    const result = await pool.query(`
      SELECT o.order_date, o.drink_preference, o.status,
             u.employee_id, u.first_name, u.last_name,
             m.name AS menu_name
      FROM orders o
      JOIN users u ON o.user_id = u.id
      JOIN menus m ON o.menu_id = m.id
      WHERE o.order_date = $1
      ORDER BY u.last_name, u.first_name
    `, [targetDate]);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="commandes_${targetDate}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 120).fill('#E85A2A');
    doc.fillColor('#FFF8F3').fontSize(28).font('Helvetica-Bold').text('🍽 FoodChoose', 50, 35);
    doc.fontSize(14).font('Helvetica').text(`Rapport des commandes — ${new Date(targetDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, 50, 70);
    doc.fontSize(11).text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 50, 92);

    doc.moveDown(4);

    // Summary
    const validated = result.rows.filter(r => r.status === 'validated').length;
    const pending = result.rows.filter(r => r.status === 'pending').length;

    doc.fillColor('#2C1810').fontSize(13).font('Helvetica-Bold').text('RÉSUMÉ', 50, 145);
    doc.moveTo(50, 163).lineTo(doc.page.width - 50, 163).lineWidth(2).strokeColor('#E85A2A').stroke();
    doc.fontSize(11).font('Helvetica').fillColor('#4A3728');
    doc.text(`Total des commandes : ${result.rows.length}`, 50, 172);
    doc.text(`Validées : ${validated}`, 50, 188);
    doc.text(`En attente : ${pending}`, 50, 204);

    // Drink preferences
    const liptonCount = result.rows.filter(r => r.drink_preference === 'lipton').length;
    const nescafeCount = result.rows.filter(r => r.drink_preference === 'nescafe').length;
    const bothCount = result.rows.filter(r => r.drink_preference === 'both').length;
    doc.text(`Préférences boissons — Lipton: ${liptonCount} | Nescafé: ${nescafeCount} | Les deux: ${bothCount}`, 50, 220);

    // Table header
    let y = 260;
    doc.fillColor('#2C1810').fontSize(13).font('Helvetica-Bold').text('DÉTAIL DES COMMANDES', 50, y);
    y += 20;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).lineWidth(2).strokeColor('#E85A2A').stroke();
    y += 12;

    // Column headers
    doc.rect(50, y, doc.page.width - 100, 22).fill('#2C1810');
    doc.fillColor('#FFF8F3').fontSize(9).font('Helvetica-Bold');
    doc.text('EMPLOYÉ', 58, y + 6);
    doc.text('ID', 200, y + 6);
    doc.text('MENU', 260, y + 6);
    doc.text('BOISSON', 400, y + 6);
    doc.text('STATUT', 490, y + 6);
    y += 30;

    // Rows
    result.rows.forEach((row, i) => {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = 50;
      }
      if (i % 2 === 0) {
        doc.rect(50, y - 4, doc.page.width - 100, 20).fill('#FFF8F3');
      }
      doc.fillColor('#2C1810').fontSize(9).font('Helvetica');
      doc.text(`${row.last_name} ${row.first_name}`, 58, y);
      doc.text(row.employee_id, 200, y);
      doc.text(row.menu_name.substring(0, 25), 260, y);
      const drinkLabel = row.drink_preference === 'lipton' ? 'Lipton' : row.drink_preference === 'nescafe' ? 'Nescafé' : row.drink_preference === 'both' ? 'Les deux' : '-';
      doc.text(drinkLabel, 400, y);
      const statusLabel = row.status === 'validated' ? '✓ Validé' : '⏳ En attente';
      doc.fillColor(row.status === 'validated' ? '#27ae60' : '#E85A2A').text(statusLabel, 490, y);
      doc.fillColor('#2C1810');
      y += 22;
    });

    if (result.rows.length === 0) {
      doc.fillColor('#8B6554').fontSize(12).font('Helvetica-Oblique').text('Aucune commande pour cette date.', 50, y);
    }

    // Footer
    doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#2C1810');
    doc.fillColor('#8B6554').fontSize(9).text('FoodChoose — Plateforme de gestion des repas', 50, doc.page.height - 25);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/history
app.get('/api/admin/history', adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM order_history ORDER BY action_timestamp DESC LIMIT 200'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const empCount = await pool.query('SELECT COUNT(*) FROM users');
    const todayOrders = await pool.query("SELECT COUNT(*) FROM orders WHERE order_date = $1", [todayDate()]);
    const todayMenus = await pool.query("SELECT COUNT(*) FROM menus WHERE available = TRUE");
    const pendingOrders = await pool.query("SELECT COUNT(*) FROM orders WHERE order_date = $1 AND status = 'pending'", [todayDate()]);
    res.json({
      employees: parseInt(empCount.rows[0].count),
      todayOrders: parseInt(todayOrders.rows[0].count),
      todayMenus: parseInt(todayMenus.rows[0].count),
      pendingOrders: parseInt(pendingOrders.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
//  EMPLOYEE ROUTES
// ═══════════════════════════════════════════════════════════════════

// GET /api/employee/menus — all available menus
app.get('/api/employee/menus', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM menus WHERE available = TRUE ORDER BY created_at'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employee/order — get current order for today
app.get('/api/employee/order', authMiddleware, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || todayDate();
  try {
    const result = await pool.query(`
      SELECT o.*, m.name AS menu_name, m.description AS menu_description
      FROM orders o
      JOIN menus m ON o.menu_id = m.id
      WHERE o.user_id = $1 AND o.order_date = $2
    `, [req.user.id, targetDate]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employee/order — create order
app.post('/api/employee/order', authMiddleware, async (req, res) => {
  const { menuId, orderDate } = req.body;
  if (!menuId) return res.status(400).json({ error: 'Menu requis' });
  const date = orderDate || todayDate();
  try {
    const menuRes = await pool.query('SELECT * FROM menus WHERE id = $1 AND available = TRUE', [menuId]);
    if (!menuRes.rows.length) return res.status(404).json({ error: 'Menu non trouvé ou indisponible' });

    const result = await pool.query(
      'INSERT INTO orders (user_id, menu_id, order_date) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, menuId, date]
    );
    await pool.query(
      'INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, order_date, status, action) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, req.user.employeeId, req.user.name, menuRes.rows[0].name, date, 'pending', 'created']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Vous avez déjà une commande pour ce jour' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employee/order/:id — update order
app.put('/api/employee/order/:id', authMiddleware, async (req, res) => {
  const { menuId } = req.body;
  try {
    const existing = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Commande non trouvée' });
    if (existing.rows[0].status === 'validated') return res.status(400).json({ error: 'La commande est déjà validée' });

    const menuRes = await pool.query('SELECT name FROM menus WHERE id = $1', [menuId]);
    const result = await pool.query(
      'UPDATE orders SET menu_id = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING *',
      [menuId, req.params.id, req.user.id]
    );
    await pool.query(
      'INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, order_date, status, action) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, req.user.employeeId, req.user.name, menuRes.rows[0]?.name || '', existing.rows[0].order_date, 'pending', 'updated']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employee/order/:id — delete order
app.delete('/api/employee/order/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await pool.query('SELECT o.*, m.name AS menu_name FROM orders o JOIN menus m ON o.menu_id = m.id WHERE o.id = $1 AND o.user_id = $2', [req.params.id, req.user.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Commande non trouvée' });
    if (existing.rows[0].status === 'validated') return res.status(400).json({ error: 'Impossible de supprimer une commande validée' });

    await pool.query('DELETE FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    // History
    await pool.query(
      'INSERT INTO order_history (user_id, employee_id, employee_name, menu_name, order_date, status, action) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, req.user.employeeId, req.user.name, existing.rows[0].menu_name, existing.rows[0].order_date, 'deleted', 'deleted']
    );
    res.json({ message: 'Commande supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employee/history
app.get('/api/employee/history', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM order_history WHERE user_id = $1 ORDER BY action_timestamp DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employee/history — clear history
app.delete('/api/employee/history', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM order_history WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Historique effacé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employee/history/:id — delete single history entry
app.delete('/api/employee/history/:id', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM order_history WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Entrée supprimée' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employee/profile
app.get('/api/employee/profile', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, employee_id, first_name, last_name, email, drink_preference, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employee/change-password
app.put('/api/employee/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs requis' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères' });
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    res.json({ message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employee/preference
app.put('/api/employee/preference', authMiddleware, async (req, res) => {
  const { drinkPreference } = req.body;
  try {
    await pool.query('UPDATE users SET drink_preference = $1 WHERE id = $2', [drinkPreference, req.user.id]);
    res.json({ message: 'Préférence mise à jour' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── SPA fallback ─────────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../public/admin/index.html')));
app.get('/employee', (req, res) => res.sendFile(path.join(__dirname, '../public/employee/index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));

// ─── Start ────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  const server = app.listen(PORT, () => console.log(`🍽️  FoodChoose running on http://localhost:${PORT}`));
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Le port ${PORT} est déjà utilisé. Arrêtez le processus existant puis relancez.`);
    } else {
      console.error('❌ Erreur serveur:', err.message);
    }
    process.exit(1);
  });
}

module.exports = app;
