/**
 * Сервер приложения "Семейный бюджет"
 * Express + SQLite + JWT
 * Запуск: npm install && npm start
 */

const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'family-budget-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Обслуживание статики из dist/
app.use(express.static(path.join(__dirname, '..', 'dist')));

// ==========================================
// DATABASE SETUP
// ==========================================
const dbDir = path.join(__dirname, 'data');
if (!require('fs').existsSync(dbDir)) require('fs').mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'budget.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    login TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS family_members (
    family_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (family_id, user_id),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    balance REAL DEFAULT 0,
    is_shared INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3b82f6',
    icon TEXT DEFAULT '📁',
    parent_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    date TEXT NOT NULL,
    category_id TEXT,
    account_id TEXT,
    payment_method TEXT DEFAULT 'CASHLESS',
    note TEXT DEFAULT '',
    has_receipt INTEGER DEFAULT 0,
    receipt_url TEXT,
    created_by_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category_id TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    period TEXT NOT NULL DEFAULT 'monthly',
    scope TEXT NOT NULL DEFAULT 'family',
    start_date TEXT NOT NULL,
    end_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS recurring_rules (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    category_id TEXT,
    account_id TEXT,
    payment_method TEXT DEFAULT 'CASHLESS',
    frequency TEXT NOT NULL DEFAULT 'monthly',
    next_run TEXT,
    is_active INTEGER DEFAULT 1,
    created_by_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS family_members_display (
    id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    avatar TEXT DEFAULT '👤',
    color TEXT DEFAULT '#3b82f6',
    joined_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
  );
`);

// Создание супер-админа если его нет
const superAdmin = db.prepare('SELECT id FROM users WHERE role = ?').get('SUPER_ADMIN');
if (!superAdmin) {
  const hash = bcrypt.hashSync('1968', 10);
  db.prepare(`INSERT INTO users (id, login, password, name, email, role) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('super-admin-001', 'admin', hash, 'Супер Администратор', 'admin@system.local', 'SUPER_ADMIN');
}

// Создание демо-данных
const demoUser = db.prepare('SELECT id FROM users WHERE login = ?').get('demo');
if (!demoUser) {
  const hash = bcrypt.hashSync('demo', 10);
  db.prepare(`INSERT INTO users (id, login, password, name, email, role) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('demo-user-001', 'demo', hash, 'Демо Пользователь', 'demo@example.com', 'FAMILY_ADMIN');
  
  db.prepare(`INSERT INTO families (id, name, owner_id) VALUES (?, ?, ?)`)
    .run('demo-family-001', 'Демо Семья', 'demo-user-001');
  
  db.prepare(`INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)`)
    .run('demo-family-001', 'demo-user-001', 'FAMILY_ADMIN');

  db.prepare(`INSERT INTO family_members_display (id, family_id, user_id, name, email, role, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('fmd-demo-001', 'demo-family-001', 'demo-user-001', 'Демо Пользователь', 'demo@example.com', 'FAMILY_ADMIN', '👨', '#3b82f6');

  // Демо счета
  db.prepare(`INSERT INTO accounts (id, family_id, name, type, currency, balance, is_shared) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('acc-demo-001', 'demo-family-001', 'Наличные', 'CASH', 'RUB', 15000, 1);
  db.prepare(`INSERT INTO accounts (id, family_id, name, type, currency, balance, is_shared) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run('acc-demo-002', 'demo-family-001', 'Основная карта', 'DEBIT', 'RUB', 85000, 1);

  // Демо категории
  const demoCategories = [
    ['cat-demo-001', 'Продукты', 'EXPENSE', '#22c55e', '🛒'],
    ['cat-demo-002', 'Транспорт', 'EXPENSE', '#f59e0b', '🚗'],
    ['cat-demo-003', 'Развлечения', 'EXPENSE', '#8b5cf6', '🎬'],
    ['cat-demo-004', 'Зарплата', 'INCOME', '#22c55e', '💼'],
    ['cat-demo-005', 'Коммунальные', 'EXPENSE', '#ef4444', '🏠'],
    ['cat-demo-006', 'Здоровье', 'EXPENSE', '#ec4899', '💊'],
  ];
  demoCategories.forEach(([id, name, type, color, icon]) => {
    db.prepare(`INSERT INTO categories (id, family_id, name, type, color, icon) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, 'demo-family-001', name, type, color, icon);
  });

  // Демо транзакции
  const now = new Date();
  for (let i = 0; i < 20; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.floor(Math.random() * 30));
    const isIncome = Math.random() > 0.7;
    db.prepare(`INSERT INTO transactions (id, family_id, type, amount, currency, date, category_id, account_id, payment_method, note, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        uuidv4(),
        'demo-family-001',
        isIncome ? 'INCOME' : 'EXPENSE',
        Math.floor(Math.random() * 5000) + 100,
        'RUB',
        d.toISOString(),
        isIncome ? 'cat-demo-004' : demoCategories[Math.floor(Math.random() * 3) + (Math.random() > 0.5 ? 0 : 1)][0],
        Math.random() > 0.5 ? 'acc-demo-001' : 'acc-demo-002',
        Math.random() > 0.5 ? 'CASH' : 'CASHLESS',
        '',
        'demo-user-001'
      );
  }
}

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

function familyAccess(req, res, next) {
  const familyId = req.params.familyId || req.body.familyId || req.query.familyId;
  if (!familyId) return res.status(400).json({ error: 'familyId обязателен' });
  
  const membership = db.prepare(
    'SELECT 1 FROM family_members WHERE family_id = ? AND user_id = ?'
  ).get(familyId, req.user.id);
  
  const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
  
  if (!membership && !isSuperAdmin) {
    return res.status(403).json({ error: 'Нет доступа к этой семье' });
  }
  
  req.familyId = familyId;
  next();
}

// ==========================================
// AUTH ROUTES
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) return res.status(400).json({ error: 'Заполните логин и пароль' });
  
  const user = db.prepare('SELECT * FROM users WHERE login = ? OR email = ?').get(login, login);
  if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });
  
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  
  const families = db.prepare(
    'SELECT f.id, f.name FROM families f JOIN family_members fm ON f.id = fm.family_id WHERE fm.user_id = ?'
  ).all(user.id);
  
  const token = jwt.sign(
    { id: user.id, login: user.login, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  
  res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      role: user.role,
      familyIds: families.map(f => f.id),
    },
    families,
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, familyName } = req.body;
  if (!name || !email || !password || !familyName) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (password.length < 4) return res.status(400).json({ error: 'Пароль минимум 4 символа' });
  
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR login = ?').get(email, email);
  if (existing) return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
  
  const userId = uuidv4();
  const familyId = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  
  const insertUser = db.transaction(() => {
    db.prepare(`INSERT INTO users (id, login, password, name, email, role) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(userId, email, hash, name, email, 'FAMILY_ADMIN');
    
    db.prepare(`INSERT INTO families (id, name, owner_id) VALUES (?, ?, ?)`)
      .run(familyId, familyName, userId);
    
    db.prepare(`INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)`)
      .run(familyId, userId, 'FAMILY_ADMIN');
    
    db.prepare(`INSERT INTO family_members_display (id, family_id, user_id, name, email, role, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), familyId, userId, name, email, 'FAMILY_ADMIN', '👨', '#3b82f6');
  });
  insertUser();
  
  const token = jwt.sign(
    { id: userId, login: email, role: 'FAMILY_ADMIN', name, email },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  
  res.json({
    token,
    user: { id: userId, login: email, name, email, role: 'FAMILY_ADMIN', familyIds: [familyId] },
    families: [{ id: familyId, name: familyName }],
  });
});

app.post('/api/auth/join-family', (req, res) => {
  const { code, name, email, password } = req.body;
  if (!code || !name || !email || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  
  try {
    const inviteData = JSON.parse(Buffer.from(code, 'base64').toString());
    if (inviteData.type !== 'family-invite') return res.status(400).json({ error: 'Неверный код' });
    
    const family = db.prepare('SELECT * FROM families WHERE id = ?').get(inviteData.familyId);
    if (!family) return res.status(404).json({ error: 'Семья не найдена' });
    
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email уже занят' });
    
    const userId = uuidv4();
    const hash = bcrypt.hashSync(password, 10);
    
    const joinFamily = db.transaction(() => {
      db.prepare(`INSERT INTO users (id, login, password, name, email, role) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(userId, email, hash, name, email, 'USER');
      
      db.prepare(`INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)`)
        .run(family.id, userId, 'USER');
      
      db.prepare(`INSERT INTO family_members_display (id, family_id, user_id, name, email, role, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), family.id, userId, name, email, 'USER', '👤', '#06b6d4');
    });
    joinFamily();
    
    const families = db.prepare(
      'SELECT f.id, f.name FROM families f JOIN family_members fm ON f.id = fm.family_id WHERE fm.user_id = ?'
    ).all(userId);
    
    const token = jwt.sign(
      { id: userId, login: email, role: 'USER', name, email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      token,
      user: { id: userId, login: email, name, email, role: 'USER', familyIds: families.map(f => f.id) },
      families,
    });
  } catch (e) {
    return res.status(400).json({ error: 'Неверный код приглашения' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, login, name, email, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  
  const families = db.prepare(
    'SELECT f.id, f.name, f.owner_id FROM families f JOIN family_members fm ON f.id = fm.family_id WHERE fm.user_id = ?'
  ).all(user.id);
  
  res.json({
    user: { ...user, familyIds: families.map(f => f.id) },
    families,
  });
});

// ==========================================
// FAMILY ROUTES
// ==========================================
app.get('/api/families/:familyId', authMiddleware, familyAccess, (req, res) => {
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.familyId);
  if (!family) return res.status(404).json({ error: 'Семья не найдена' });
  
  const members = db.prepare(
    'SELECT fmd.*, fm.role as member_role FROM family_members_display fmd JOIN family_members fm ON fmd.family_id = fm.family_id AND fmd.user_id = fm.user_id WHERE fmd.family_id = ?'
  ).all(req.familyId);
  
  res.json({ ...family, members });
});

app.post('/api/families/:familyId/invite-code', authMiddleware, familyAccess, (req, res) => {
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.familyId);
  if (!family) return res.status(404).json({ error: 'Семья не найдена' });
  
  const code = Buffer.from(JSON.stringify({
    type: 'family-invite',
    version: '1.0',
    familyId: family.id,
    familyName: family.name,
    timestamp: new Date().toISOString(),
  })).toString('base64');
  
  res.json({ code });
});

app.post('/api/families/:familyId/members', authMiddleware, familyAccess, (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Заполните все поля' });
  
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(400).json({ error: 'Email уже занят' });
  
  const userId = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const memberRole = role || 'USER';
  
  const addMember = db.transaction(() => {
    db.prepare(`INSERT INTO users (id, login, password, name, email, role) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(userId, email, hash, name, email, memberRole);
    
    db.prepare(`INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, ?)`)
      .run(req.familyId, userId, memberRole);
    
    const avatars = ['👨', '👩', '👦', '👧', '🧑', '👴', '👵'];
    const colors = ['#3b82f6', '#ec4899', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4'];
    
    db.prepare(`INSERT INTO family_members_display (id, family_id, user_id, name, email, role, avatar, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.familyId, userId, name, email, memberRole,
        avatars[Math.floor(Math.random() * avatars.length)],
        colors[Math.floor(Math.random() * colors.length)]);
  });
  addMember();
  
  res.json({ userId, message: 'Участник добавлен', login: email, password });
});

app.delete('/api/families/:familyId/members/:userId', authMiddleware, familyAccess, (req, res) => {
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.familyId);
  if (family.owner_id === req.params.userId) {
    return res.status(400).json({ error: 'Нельзя удалить владельца семьи' });
  }
  
  const removeMember = db.transaction(() => {
    db.prepare('DELETE FROM family_members WHERE family_id = ? AND user_id = ?').run(req.familyId, req.params.userId);
    db.prepare('DELETE FROM family_members_display WHERE family_id = ? AND user_id = ?').run(req.familyId, req.params.userId);
  });
  removeMember();
  
  res.json({ success: true });
});

// ==========================================
// ACCOUNTS ROUTES
// ==========================================
app.get('/api/families/:familyId/accounts', authMiddleware, familyAccess, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE family_id = ?').all(req.familyId);
  res.json(accounts);
});

app.post('/api/families/:familyId/accounts', authMiddleware, familyAccess, (req, res) => {
  const { name, type, currency, balance, isShared } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO accounts (id, family_id, name, type, currency, balance, is_shared) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.familyId, name, type, currency || 'RUB', balance || 0, isShared ? 1 : 0);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  res.json(account);
});

app.put('/api/families/:familyId/accounts/:id', authMiddleware, familyAccess, (req, res) => {
  const { name, type, currency, balance, isShared } = req.body;
  db.prepare(`UPDATE accounts SET name=?, type=?, currency=?, balance=?, is_shared=? WHERE id=? AND family_id=?`)
    .run(name, type, currency, balance, isShared ? 1 : 0, req.params.id, req.familyId);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  res.json(account);
});

app.delete('/api/families/:familyId/accounts/:id', authMiddleware, familyAccess, (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ==========================================
// CATEGORIES ROUTES
// ==========================================
app.get('/api/families/:familyId/categories', authMiddleware, familyAccess, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE family_id = ?').all(req.familyId);
  res.json(categories);
});

app.post('/api/families/:familyId/categories', authMiddleware, familyAccess, (req, res) => {
  const { name, type, color, icon, parentId } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO categories (id, family_id, name, type, color, icon, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.familyId, name, type, color || '#3b82f6', icon || '📁', parentId || null);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.json(category);
});

app.put('/api/families/:familyId/categories/:id', authMiddleware, familyAccess, (req, res) => {
  const { name, type, color, icon, parentId } = req.body;
  db.prepare(`UPDATE categories SET name=?, type=?, color=?, icon=?, parent_id=? WHERE id=? AND family_id=?`)
    .run(name, type, color, icon, parentId || null, req.params.id, req.familyId);
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  res.json(category);
});

app.delete('/api/families/:familyId/categories/:id', authMiddleware, familyAccess, (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ==========================================
// TRANSACTIONS ROUTES
// ==========================================
app.get('/api/families/:familyId/transactions', authMiddleware, familyAccess, (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions WHERE family_id = ? ORDER BY date DESC').all(req.familyId);
  res.json(transactions);
});

app.post('/api/families/:familyId/transactions', authMiddleware, familyAccess, (req, res) => {
  const { type, amount, currency, date, categoryId, accountId, paymentMethod, note, hasReceipt, receiptUrl } = req.body;
  const id = uuidv4();
  
  db.prepare(`INSERT INTO transactions (id, family_id, type, amount, currency, date, category_id, account_id, payment_method, note, has_receipt, receipt_url, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.familyId, type, amount, currency || 'RUB', date, categoryId || null, accountId || null, paymentMethod || 'CASHLESS', note || '', hasReceipt ? 1 : 0, receiptUrl || null, req.user.id);
  
  // Обновить баланс счёта
  if (accountId) {
    const delta = type === 'INCOME' ? amount : -amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, accountId);
  }
  
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  res.json(tx);
});

app.put('/api/families/:familyId/transactions/:id', authMiddleware, familyAccess, (req, res) => {
  const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  const { type, amount, currency, date, categoryId, accountId, paymentMethod, note, hasReceipt, receiptUrl } = req.body;
  
  // Откатить старый баланс
  if (old && old.account_id) {
    const oldDelta = old.type === 'INCOME' ? -old.amount : old.amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(oldDelta, old.account_id);
  }
  
  db.prepare(`UPDATE transactions SET type=?, amount=?, currency=?, date=?, category_id=?, account_id=?, payment_method=?, note=?, has_receipt=?, receipt_url=? WHERE id=? AND family_id=?`)
    .run(type, amount, currency, date, categoryId || null, accountId || null, paymentMethod || 'CASHLESS', note || '', hasReceipt ? 1 : 0, receiptUrl || null, req.params.id, req.familyId);
  
  // Применить новый баланс
  if (accountId) {
    const delta = type === 'INCOME' ? amount : -amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, accountId);
  }
  
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  res.json(tx);
});

app.delete('/api/families/:familyId/transactions/:id', authMiddleware, familyAccess, (req, res) => {
  const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (old && old.account_id) {
    const delta = old.type === 'INCOME' ? -old.amount : old.amount;
    db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(delta, old.account_id);
  }
  db.prepare('DELETE FROM transactions WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ==========================================
// BUDGETS ROUTES
// ==========================================
app.get('/api/families/:familyId/budgets', authMiddleware, familyAccess, (req, res) => {
  const budgets = db.prepare('SELECT * FROM budgets WHERE family_id = ?').all(req.familyId);
  res.json(budgets);
});

app.post('/api/families/:familyId/budgets', authMiddleware, familyAccess, (req, res) => {
  const { name, categoryId, amount, currency, period, scope, startDate, endDate } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO budgets (id, family_id, name, category_id, amount, currency, period, scope, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.familyId, name, categoryId || null, amount, currency || 'RUB', period || 'monthly', scope || 'family', startDate, endDate || null);
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(id);
  res.json(budget);
});

app.put('/api/families/:familyId/budgets/:id', authMiddleware, familyAccess, (req, res) => {
  const { name, categoryId, amount, currency, period, scope, startDate, endDate } = req.body;
  db.prepare(`UPDATE budgets SET name=?, category_id=?, amount=?, currency=?, period=?, scope=?, start_date=?, end_date=? WHERE id=? AND family_id=?`)
    .run(name, categoryId || null, amount, currency, period, scope, startDate, endDate || null, req.params.id, req.familyId);
  const budget = db.prepare('SELECT * FROM budgets WHERE id = ?').get(req.params.id);
  res.json(budget);
});

app.delete('/api/families/:familyId/budgets/:id', authMiddleware, familyAccess, (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ==========================================
// RECURRING RULES ROUTES
// ==========================================
app.get('/api/families/:familyId/recurring', authMiddleware, familyAccess, (req, res) => {
  const rules = db.prepare('SELECT * FROM recurring_rules WHERE family_id = ?').all(req.familyId);
  res.json(rules);
});

app.post('/api/families/:familyId/recurring', authMiddleware, familyAccess, (req, res) => {
  const { name, type, amount, currency, categoryId, accountId, paymentMethod, frequency, nextRun } = req.body;
  const id = uuidv4();
  db.prepare(`INSERT INTO recurring_rules (id, family_id, name, type, amount, currency, category_id, account_id, payment_method, frequency, next_run, created_by_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, req.familyId, name, type, amount, currency || 'RUB', categoryId || null, accountId || null, paymentMethod || 'CASHLESS', frequency || 'monthly', nextRun || null, req.user.id);
  const rule = db.prepare('SELECT * FROM recurring_rules WHERE id = ?').get(id);
  res.json(rule);
});

app.delete('/api/families/:familyId/recurring/:id', authMiddleware, familyAccess, (req, res) => {
  db.prepare('DELETE FROM recurring_rules WHERE id = ? AND family_id = ?').run(req.params.id, req.familyId);
  res.json({ success: true });
});

// ==========================================
// FAMILY DATA BULK (для начальной загрузки)
// ==========================================
app.get('/api/families/:familyId/data', authMiddleware, familyAccess, (req, res) => {
  const family = db.prepare('SELECT * FROM families WHERE id = ?').get(req.familyId);
  const members = db.prepare(
    'SELECT fmd.*, fm.role as member_role FROM family_members_display fmd JOIN family_members fm ON fmd.family_id = fm.family_id AND fmd.user_id = fm.user_id WHERE fmd.family_id = ?'
  ).all(req.familyId);
  const accounts = db.prepare('SELECT * FROM accounts WHERE family_id = ?').all(req.familyId);
  const categories = db.prepare('SELECT * FROM categories WHERE family_id = ?').all(req.familyId);
  const transactions = db.prepare('SELECT * FROM transactions WHERE family_id = ? ORDER BY date DESC').all(req.familyId);
  const budgets = db.prepare('SELECT * FROM budgets WHERE family_id = ?').all(req.familyId);
  const recurring = db.prepare('SELECT * FROM recurring_rules WHERE family_id = ?').all(req.familyId);
  
  res.json({ family: { ...family, members }, accounts, categories, transactions, budgets, recurring });
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'sqlite'
  });
});

// ==========================================
// ADMIN ROUTES
// ==========================================
app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Доступ запрещён' });
  const users = db.prepare('SELECT id, login, name, email, role, created_at FROM users').all();
  res.json(users);
});

app.get('/api/admin/families', authMiddleware, (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Доступ запрещён' });
  const families = db.prepare('SELECT * FROM families').all();
  res.json(families);
});

app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Доступ запрещён' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Нельзя удалить себя' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/families/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Доступ запрещён' });
  db.prepare('DELETE FROM families WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==========================================
// SPA FALLBACK
// ==========================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

// ==========================================
// START
// ==========================================
app.listen(PORT, () => {
  console.log(`\n🏠 Сервер "Семейный бюджет" запущен`);
  console.log(`📡 API: http://localhost:${PORT}/api`);
  console.log(`🌐 Frontend: http://localhost:${PORT}`);
  console.log(`\n📋 Демо-доступ: demo / demo`);
  console.log(`🔑 Админ: admin / 1968\n`);
});
