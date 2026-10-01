require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Database setup
const db = new Database(process.env.DB_PATH || './data/finance.db');
db.pragma('journal_mode = WAL');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    balance REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    category_id TEXT,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    description TEXT,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );
`);

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    db.prepare('INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)')
      .run(userId, email, hashedPassword, name);

    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: userId, email, name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

// Accounts routes
app.get('/api/accounts', authenticateToken, (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json(accounts);
});

app.post('/api/accounts', authenticateToken, (req, res) => {
  try {
    const { name, type, currency, balance } = req.body;
    const accountId = crypto.randomUUID();

    db.prepare('INSERT INTO accounts (id, user_id, name, type, currency, balance) VALUES (?, ?, ?, ?, ?, ?)')
      .run(accountId, req.user.id, name, type, currency || 'RUB', balance || 0);

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/accounts/:id', authenticateToken, (req, res) => {
  try {
    const { name, type, currency, balance } = req.body;
    
    db.prepare('UPDATE accounts SET name = ?, type = ?, currency = ?, balance = ? WHERE id = ? AND user_id = ?')
      .run(name, type, currency, balance, req.params.id, req.user.id);

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/accounts/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Categories routes
app.get('/api/categories', authenticateToken, (req, res) => {
  const categories = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY name')
    .all(req.user.id);
  res.json(categories);
});

app.post('/api/categories', authenticateToken, (req, res) => {
  try {
    const { name, type, icon, color } = req.body;
    const categoryId = crypto.randomUUID();

    db.prepare('INSERT INTO categories (id, user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?, ?)')
      .run(categoryId, req.user.id, name, type, icon, color);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', authenticateToken, (req, res) => {
  try {
    const { name, type, icon, color } = req.body;
    
    db.prepare('UPDATE categories SET name = ?, type = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?')
      .run(name, type, icon, color, req.params.id, req.user.id);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    res.json(category);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transactions routes
app.get('/api/transactions', authenticateToken, (req, res) => {
  const transactions = db.prepare(`
    SELECT t.*, a.name as account_name, c.name as category_name, c.icon as category_icon
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ?
    ORDER BY t.date DESC, t.created_at DESC
  `).all(req.user.id);
  res.json(transactions);
});

app.post('/api/transactions', authenticateToken, (req, res) => {
  try {
    const { account_id, category_id, type, amount, currency, description, date } = req.body;
    const transactionId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO transactions (id, user_id, account_id, category_id, type, amount, currency, description, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(transactionId, req.user.id, account_id, category_id, type, amount, currency || 'RUB', description, date);

    // Update account balance
    if (type === 'income') {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, account_id);
    } else {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, account_id);
    }

    const transaction = db.prepare(`
      SELECT t.*, a.name as account_name, c.name as category_name, c.icon as category_icon
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `).get(transactionId);
    
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  try {
    const { account_id, category_id, type, amount, currency, description, date } = req.body;
    
    // Get old transaction to revert balance
    const oldTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    
    if (oldTx) {
      // Revert old balance
      if (oldTx.type === 'income') {
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(oldTx.amount, oldTx.account_id);
      } else {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(oldTx.amount, oldTx.account_id);
      }
    }

    db.prepare(`
      UPDATE transactions
      SET account_id = ?, category_id = ?, type = ?, amount = ?, currency = ?, description = ?, date = ?
      WHERE id = ? AND user_id = ?
    `).run(account_id, category_id, type, amount, currency, description, date, req.params.id, req.user.id);

    // Apply new balance
    if (type === 'income') {
      db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(amount, account_id);
    } else {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, account_id);
    }

    const transaction = db.prepare(`
      SELECT t.*, a.name as account_name, c.name as category_name, c.icon as category_icon
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `).get(req.params.id);
    
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  try {
    // Get transaction to revert balance
    const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    
    if (transaction) {
      // Revert balance
      if (transaction.type === 'income') {
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(transaction.amount, transaction.account_id);
      } else {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE id = ?').run(transaction.amount, transaction.account_id);
      }
    }

    db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary route
app.get('/api/summary', authenticateToken, (req, res) => {
  const { period = 'month' } = req.query;
  
  let dateFilter = '';
  const now = new Date();
  
  if (period === 'week') {
    const weekAgo = new Date(now.setDate(now.getDate() - 7));
    dateFilter = `AND date >= '${weekAgo.toISOString()}'`;
  } else if (period === 'month') {
    const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
    dateFilter = `AND date >= '${monthAgo.toISOString()}'`;
  } else if (period === 'year') {
    const yearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
    dateFilter = `AND date >= '${yearAgo.toISOString()}'`;
  }

  const income = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE user_id = ? AND type = 'income' ${dateFilter}
  `).get(req.user.id);

  const expense = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total
    FROM transactions
    WHERE user_id = ? AND type = 'expense' ${dateFilter}
  `).get(req.user.id);

  const balance = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total
    FROM accounts
    WHERE user_id = ?
  `).get(req.user.id);

  res.json({
    income: income.total,
    expense: expense.total,
    balance: balance.total,
    period
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('../frontend/dist'));
  app.get('*', (req, res) => {
    res.sendFile(__dirname + '/../frontend/dist/index.html');
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
