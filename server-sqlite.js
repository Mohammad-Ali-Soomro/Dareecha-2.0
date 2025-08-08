
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const session = require('express-session');
let SQLiteStoreFactory;
try { SQLiteStoreFactory = require('connect-sqlite3')(session); } catch (e) { console.warn('connect-sqlite3 not found, using MemoryStore for sessions'); }
const passport = require('passport');
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// SQLite setup with JSON fallback
let sqlite3, db;
let USE_JSON_DB = false;
const DB_FILE = path.join(__dirname, 'data.sqlite');
try {
  sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database(DB_FILE);
} catch (e) {
  console.warn('sqlite3 module not found, falling back to JSON DB (database.json)');
  USE_JSON_DB = true;
}

const JSON_DB_FILE = path.join(__dirname, 'database.json');
function readJSON() {
  if (!fs.existsSync(JSON_DB_FILE)) {
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify({ users: [], books: [], borrow_requests: [], notifications: [], seq: { user: 1, book: 1, request: 1, notification: 1 } }, null, 2));
  }
  return JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf8'));
}
function writeJSON(data) { fs.writeFileSync(JSON_DB_FILE, JSON.stringify(data, null, 2)); }

function run(dbInst, sql, params = []) {
  if (!USE_JSON_DB) {
    return new Promise((resolve, reject) => {
      dbInst.run(sql, params, function (err) { if (err) return reject(err); resolve(this); });
    });
  }
  // JSON fallback operations
  const store = readJSON();
  const lower = sql.toLowerCase();
  if (lower.startsWith('insert into users')) {
    const [email, name, provider, provider_id, picture] = params;
    const id = store.seq.user++;
    store.users.push({ id, email, name, provider, provider_id, picture, created_at: new Date().toISOString(), last_login: new Date().toISOString(), is_active: 1 });
    writeJSON(store);
    return Promise.resolve({ lastID: id, changes: 1 });
  }
  if (lower.startsWith('update users set last_login')) {
    const [id] = params;
    const u = store.users.find(u => u.id === id);
    if (u) u.last_login = new Date().toISOString();
    writeJSON(store);
    return Promise.resolve({ changes: u ? 1 : 0 });
  }
  if (lower.startsWith('insert into books')) {
    const [title, author, category, description, condition, owner_id] = params;
    const id = store.seq.book++;
    store.books.push({ id, title, author, category, description, condition, owner_id, borrowed_by: null, borrowed_date: null, due_date: null, return_date: null, is_available: 1, created_at: new Date().toISOString() });
    writeJSON(store);
    return Promise.resolve({ lastID: id, changes: 1 });
  }
  if (lower.startsWith('insert into borrow_requests')) {
    const [book_id, borrower_id, owner_id, borrow_period_days, message] = params;
    const id = store.seq.request++;
    store.borrow_requests.push({ id, book_id, borrower_id, owner_id, borrow_period_days, message, status: 'pending', created_at: new Date().toISOString() });
    writeJSON(store);
    return Promise.resolve({ lastID: id, changes: 1 });
  }
  if (lower.startsWith('update borrow_requests set status')) {
    const [status, id] = params;
    const r = store.borrow_requests.find(r => r.id === id);
    if (r) r.status = status;
    writeJSON(store);
    return Promise.resolve({ changes: r ? 1 : 0 });
  }
  if (lower.startsWith('update books set is_available = 0')) {
    const [borrower_id, borrowed_date, due_date, id] = params;
    const b = store.books.find(b => b.id === id);
    if (b) { b.is_available = 0; b.borrowed_by = borrower_id; b.borrowed_date = borrowed_date; b.due_date = due_date; }
    writeJSON(store);
    return Promise.resolve({ changes: b ? 1 : 0 });
  }
  if (lower.startsWith('update books set is_available = 1')) {
    const [id] = params;
    const b = store.books.find(b => b.id === id);
    if (b) { b.is_available = 1; b.borrowed_by = null; b.borrowed_date = null; b.due_date = null; b.return_date = new Date().toISOString(); }
    writeJSON(store);
    return Promise.resolve({ changes: b ? 1 : 0 });
  }
  if (lower.startsWith('delete from books where id =')) {
    const [id] = params;
    const before = store.books.length;
    store.books = store.books.filter(b => b.id !== id);
    writeJSON(store);
    return Promise.resolve({ changes: before - store.books.length });
  }
  if (lower.startsWith('insert into notifications')) {
    const [user_id, type, message, metadata] = params.length === 4 ? params : [params[0], params[1], params[2], null];
    const id = store.seq.notification++;
    store.notifications.push({ id, user_id, type, message, metadata, created_at: new Date().toISOString(), is_read: 0 });
    writeJSON(store);
    return Promise.resolve({ lastID: id, changes: 1 });
  }
  return Promise.resolve({});
}

function all(dbInst, sql, params = []) {
  if (!USE_JSON_DB) {
    return new Promise((resolve, reject) => {
      dbInst.all(sql, params, function (err, rows) { if (err) return reject(err); resolve(rows); });
    });
  }
  const store = readJSON();
  const lower = sql.toLowerCase();
  if (lower.includes('from books b join users u on u.id = b.owner_id where b.is_available = 1')) {
    return Promise.resolve(store.books.filter(b => b.is_available === 1).map(b => ({
      ...b, ownerName: (store.users.find(u => u.id === b.owner_id) || {}).name,
      ownerEmail: (store.users.find(u => u.id === b.owner_id) || {}).email
    })));
  }
  if (lower.includes('from borrow_requests where owner_id =') && lower.includes("status = 'pending'")) {
    const [ownerId] = params;
    return Promise.resolve(store.borrow_requests.filter(r => r.owner_id === ownerId && r.status === 'pending'));
  }
  if (lower.startsWith('select * from notifications where user_id =')) {
    const [userId] = params;
    return Promise.resolve(store.notifications.filter(n => n.user_id === userId).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at)));
  }
  return Promise.resolve([]);
}

function get(dbInst, sql, params = []) {
  if (!USE_JSON_DB) {
    return new Promise((resolve, reject) => {
      dbInst.get(sql, params, function (err, row) { if (err) return reject(err); resolve(row); });
    });
  }
  const store = readJSON();
  const lower = sql.toLowerCase();
  if (lower.startsWith('select * from users where email =')) {
    const [email] = params;
    return Promise.resolve(store.users.find(u => u.email === email));
  }
  if (lower.startsWith('select * from users where id =')) {
    const [id] = params; return Promise.resolve(store.users.find(u => u.id === id));
  }
  if (lower.startsWith('select last_insert_rowid() as id')) {
    // Approximate by returning last sequence for any table (used right after inserts)
    return Promise.resolve({ id: Math.max(store.seq.user-1, store.seq.book-1, store.seq.request-1, store.seq.notification-1) });
  }
  if (lower.includes('from books b join users u on u.id = b.owner_id where b.id =')) {
    const [id] = params; const b = store.books.find(b => b.id === id);
    if (!b) return Promise.resolve(undefined);
    const u = store.users.find(u => u.id === b.owner_id) || {};
    return Promise.resolve({ ...b, ownerName: u.name, ownerEmail: u.email });
  }
  if (lower.startsWith('select * from books where id =')) {
    const [id] = params; return Promise.resolve(store.books.find(b => b.id === id));
  }
  if (lower.startsWith('select owner_id, title from books where id =')) {
    const [id] = params; const b = store.books.find(b => b.id === id); if (!b) return Promise.resolve(undefined);
    return Promise.resolve({ owner_id: b.owner_id, title: b.title });
  }
  if (lower.startsWith('select title from books where id =')) {
    const [id] = params; const b = store.books.find(b => b.id === id); if (!b) return Promise.resolve(undefined);
    return Promise.resolve({ title: b.title });
  }
  if (lower.startsWith('select * from borrow_requests where id =')) {
    const [id] = params; return Promise.resolve(store.borrow_requests.find(r => r.id === id));
  }
  return Promise.resolve(undefined);
}

async function initSchema() {
  if (USE_JSON_DB) return; // JSON mode needs no schema
  await run(db, `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    provider TEXT,
    provider_id TEXT,
    picture TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1
  );`);
  await run(db, `CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    category TEXT,
    description TEXT,
    condition TEXT,
    owner_id INTEGER NOT NULL,
    borrowed_by INTEGER,
    borrowed_date TEXT,
    due_date TEXT,
    return_date TEXT,
    is_available INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(owner_id) REFERENCES users(id),
    FOREIGN KEY(borrowed_by) REFERENCES users(id)
  );`);
  await run(db, `CREATE TABLE IF NOT EXISTS borrow_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    borrower_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    borrow_period_days INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(book_id) REFERENCES books(id),
    FOREIGN KEY(borrower_id) REFERENCES users(id),
    FOREIGN KEY(owner_id) REFERENCES users(id)
  );`);
  await run(db, `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    is_read INTEGER DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// Security & utils
app.use(helmet());
app.use(morgan('dev'));
const limiter = rateLimit({ windowMs: 60 * 1000, max: 300 });
app.use(limiter);

// Static & JSON
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Sessions backed by SQLite (or MemoryStore fallback)
app.use(session({
  store: SQLiteStoreFactory ? new SQLiteStoreFactory({ db: 'sessions.sqlite', dir: __dirname }) : undefined,
  secret: process.env.SESSION_SECRET || 'giki-library-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Passport Microsoft OAuth
app.use(passport.initialize());
app.use(passport.session());

passport.use(new MicrosoftStrategy({
  clientID: process.env.MICROSOFT_CLIENT_ID || 'demo-client-id',
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'demo-client-secret',
  callbackURL: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/auth/microsoft/callback',
  scope: ['user.read', 'openid', 'email', 'profile']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) return done(null, false, { message: 'Email not available from Microsoft' });

    const allowed = /@(student\.)?giki\.edu\.pk$/i.test(email);
    if (!allowed) return done(null, false, { message: 'Only GIKI emails allowed' });

    let user = await get(db, 'SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      const name = profile.displayName || email.split('@')[0];
      const result = await run(db, 'INSERT INTO users (email, name, provider, provider_id, picture) VALUES (?,?,?,?,?)', [
        email, name, 'microsoft', profile.id, profile.photos?.[0]?.value || null
      ]);
      user = await get(db, 'SELECT * FROM users WHERE id = ?', [result.lastID]);
    } else {
      await run(db, 'UPDATE users SET last_login = datetime("now") WHERE id = ?', [user.id]);
    }
    return done(null, { id: user.id, email: user.email, name: user.name });
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await get(db, 'SELECT id, email, name FROM users WHERE id = ?', [id]);
    done(null, user);
  } catch (e) { done(e); }
});

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// Socket registry
const connectedUsers = new Map(); // userId -> socketId
io.on('connection', (socket) => {
  socket.on('register_user', (userId) => {
    connectedUsers.set(userId, socket.id);
  });
  socket.on('disconnect', () => {
    for (const [uid, sid] of connectedUsers) {
      if (sid === socket.id) connectedUsers.delete(uid);
    }
  });
});

function emitToUser(userId, event, payload) {
  const sid = connectedUsers.get(userId);
  if (sid) io.to(sid).emit(event, payload);
}

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'landing.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// OAuth routes
app.get('/auth/microsoft', passport.authenticate('microsoft'));
app.get('/auth/microsoft/callback', passport.authenticate('microsoft', {
  failureRedirect: '/?auth=failed'
}), (req, res) => {
  res.redirect('/dashboard');
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.json(null);
  res.json(req.user);
});

app.post('/api/logout', (req, res) => {
  req.logout(() => {
    req.session.destroy(() => res.json({ success: true }));
  });
});

// Dev login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const mail = String(email).toLowerCase();
    const allowed = /@(student\.)?giki\.edu\.pk$/i.test(mail);
    if (!allowed) return res.status(403).json({ error: 'Only GIKI emails allowed' });

    let user = await get(db, 'SELECT * FROM users WHERE email = ?', [mail]);
    if (!user) {
      const name = mail.split('@')[0];
      const result = await run(db, 'INSERT INTO users (email, name, provider) VALUES (?,?,?)', [mail, name, 'demo']);
      user = await get(db, 'SELECT * FROM users WHERE id = ?', [result.lastID]);
    }

    // Establish session
    req.login({ id: user.id, email: user.email, name: user.name }, (err) => {
      if (err) return res.status(500).json({ error: 'Session error' });
      return res.json({
        token: null, // session-based
        user: { id: user.id, email: user.email, name: user.name }
      });
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Books APIs
app.get('/api/books', async (req, res) => {
  try {
    const rows = await all(db, `SELECT b.*, u.name as ownerName, u.email as ownerEmail
      FROM books b JOIN users u ON u.id = b.owner_id WHERE b.is_available = 1`);
    res.json(rows.map(r => ({
      id: r.id,
      title: r.title,
      author: r.author,
      genre: r.category,
      description: r.description,
      condition: r.condition,
      owner: r.ownerName,
      ownerEmail: r.ownerEmail,
      borrowedBy: r.borrowed_by || null,
      borrowedDate: r.borrowed_date || null,
      dueDate: r.due_date || null,
      returnDate: r.return_date || null
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

app.post('/api/books', ensureAuth, async (req, res) => {
  try {
    const { title, author, category, description, condition } = req.body;
    if (!title || !author) return res.status(400).json({ error: 'Title and author required' });

    await run(db, `INSERT INTO books (title, author, category, description, condition, owner_id)
      VALUES (?,?,?,?,?,?)`, [title, author, category || 'General', description || '', condition || 'Good', req.user.id]);
    const book = await get(db, 'SELECT last_insert_rowid() as id');

    const created = await get(db, `SELECT b.*, u.name as ownerName, u.email as ownerEmail
      FROM books b JOIN users u ON u.id = b.owner_id WHERE b.id = ?`, [book.id]);

    io.emit('new_book', {
      id: created.id,
      title: created.title,
      author: created.author,
      genre: created.category,
      description: created.description,
      condition: created.condition,
      owner: created.ownerName
    });

    res.status(201).json({ id: created.id, ...created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to add book' });
  }
});

// Request borrow
app.post('/api/books/:id/request-borrow', ensureAuth, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const { borrowPeriodDays = 14, message = '' } = req.body;
    const book = await get(db, 'SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (!book.is_available) return res.status(400).json({ error: 'Book not available' });

    // Get owner
    const owner = await get(db, 'SELECT id, name FROM users WHERE id = ?', [book.owner_id]);
    await run(db, `INSERT INTO borrow_requests (book_id, borrower_id, owner_id, borrow_period_days, message) VALUES (?,?,?,?,?)`,[
      bookId, req.user.id, owner.id, borrowPeriodDays, message
    ]);
    const reqRow = await get(db, 'SELECT last_insert_rowid() as id');

    // Notify owner
    const noteMsg = `${req.user.name} requested to borrow ${book.title} for ${borrowPeriodDays} days.`;
    await run(db, `INSERT INTO notifications (user_id, type, message, metadata) VALUES (?,?,?,?)`, [
      owner.id, 'borrow_request', noteMsg, JSON.stringify({ requestId: reqRow.id, bookId })
    ]);
    emitToUser(owner.id, 'notification', { type: 'borrow_request', message: noteMsg, requestId: reqRow.id, timestamp: Date.now() });

    res.json({ success: true, requestId: reqRow.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create borrow request' });
  }
});

// Respond to borrow request
app.post('/api/borrow-requests/:requestId/respond', ensureAuth, async (req, res) => {
  try {
    const requestId = parseInt(req.params.requestId, 10);
    const { response } = req.body; // 'approved' | 'denied'
    const br = await get(db, 'SELECT * FROM borrow_requests WHERE id = ?', [requestId]);
    if (!br) return res.status(404).json({ error: 'Request not found' });
    if (br.owner_id !== req.user.id) return res.status(403).json({ error: 'Only owner can respond' });

    await run(db, 'UPDATE borrow_requests SET status = ? WHERE id = ?', [response, requestId]);

    if (response === 'approved') {
      const now = new Date();
      const due = new Date(now);
      due.setDate(now.getDate() + br.borrow_period_days);
      await run(db, `UPDATE books SET is_available = 0, borrowed_by = ?, borrowed_date = ?, due_date = ? WHERE id = ?`, [
        br.borrower_id, now.toISOString(), due.toISOString(), br.book_id
      ]);

      const book = await get(db, 'SELECT * FROM books WHERE id = ?', [br.book_id]);
      const noteMsg = `Your request for ${book.title} was approved.`;
      await run(db, `INSERT INTO notifications (user_id, type, message) VALUES (?,?,?)`, [
        br.borrower_id, 'request_approved', noteMsg
      ]);
      emitToUser(br.borrower_id, 'notification', { type: 'request_approved', message: noteMsg, timestamp: Date.now() });
      io.emit('book_updated', {
        id: book.id,
        title: book.title,
        author: book.author,
        genre: book.category,
        description: book.description,
        condition: book.condition,
        owner: (await get(db, 'SELECT name FROM users WHERE id = ?', [book.owner_id]))?.name,
        borrowedBy: br.borrower_id,
        borrowedDate: book.borrowed_date,
        dueDate: book.due_date,
        returnDate: book.return_date
      });
    } else {
      const book = await get(db, 'SELECT title FROM books WHERE id = ?', [br.book_id]);
      const noteMsg = `Your request for ${book.title} was denied.`;
      await run(db, `INSERT INTO notifications (user_id, type, message) VALUES (?,?,?)`, [
        br.borrower_id, 'request_denied', noteMsg
      ]);
      emitToUser(br.borrower_id, 'notification', { type: 'request_denied', message: noteMsg, timestamp: Date.now() });
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to respond to request' });
  }
});

// Return a book
app.post('/api/books/:id/return', ensureAuth, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const book = await get(db, 'SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.borrowed_by !== req.user.id) return res.status(403).json({ error: 'Not borrower' });

    await run(db, `UPDATE books SET is_available = 1, borrowed_by = NULL, borrowed_date = NULL, due_date = NULL, return_date = datetime('now') WHERE id = ?`, [bookId]);

    const owner = await get(db, 'SELECT owner_id, title FROM books WHERE id = ?', [bookId]);
    const noteMsg = `${req.user.name} has returned ${owner.title}.`;
    await run(db, `INSERT INTO notifications (user_id, type, message) VALUES (?,?,?)`, [
      owner.owner_id, 'return_confirm', noteMsg
    ]);
    emitToUser(owner.owner_id, 'notification', { type: 'return_confirm', message: noteMsg, timestamp: Date.now() });

    const updated = await get(db, 'SELECT * FROM books WHERE id = ?', [bookId]);
    io.emit('book_updated', {
      id: updated.id,
      title: updated.title,
      author: updated.author,
      genre: updated.category,
      description: updated.description,
      condition: updated.condition,
      owner: (await get(db, 'SELECT name FROM users WHERE id = ?', [updated.owner_id]))?.name,
      borrowedBy: updated.borrowed_by || null,
      borrowedDate: updated.borrowed_date || null,
      dueDate: updated.due_date || null,
      returnDate: updated.return_date || null
    });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to return book' });
  }
});

// Delete a book
app.delete('/api/books/:id', ensureAuth, async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    const book = await get(db, 'SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) return res.status(404).json({ error: 'Book not found' });
    if (book.owner_id !== req.user.id) return res.status(403).json({ error: 'Only owner can delete' });

    await run(db, 'DELETE FROM books WHERE id = ?', [bookId]);
    io.emit('book_deleted', { id: bookId });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// Pending requests for a user
app.get('/api/borrow-requests/:userId', ensureAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (userId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const rows = await all(db, `SELECT * FROM borrow_requests WHERE owner_id = ? AND status = 'pending'`, [userId]);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// Notifications
app.get('/api/notifications', ensureAuth, async (req, res) => {
  try {
    const rows = await all(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

app.post('/api/notifications/:id/read', ensureAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await run(db, 'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// Health
app.get('/health', (req, res) => res.json({ ok: true }));

(async () => {
  try {
    await initSchema();
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`🚀 GIKI Virtual Library (SQLite) running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.error('Failed to initialize database', e);
    process.exit(1);
  }
})();
