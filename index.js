// /workspace/server/index.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// File uploads
const upload = multer({ dest: uploadsDir });

// Middleware
app.use(cors({
    origin: '*', // Allows requests from ANY origin (like your phone). Safe for development.
    // For production, you would replace '*' with your app's specific URL.
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// DB setup
const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS designs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_type TEXT NOT NULL, -- 'tshirt' | 'pants'
            color TEXT NOT NULL,
            style TEXT,              -- optional style variant name
            text_overlay TEXT,       -- custom text
            image_url TEXT,          -- uploaded image URL
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);
});

// Helpers
function generateToken(user) {
    return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Routes
app.get('/', (_req, res) => res.json({ status: 'ok' }));

app.post('/auth/signup', async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const passwordHash = await bcrypt.hash(password, 10);
    db.run(
        'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
        [name, email.toLowerCase(), passwordHash],
        function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ error: 'Email already registered' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            db.get('SELECT id, name, email FROM users WHERE id = ?', [this.lastID], (err2, row) => {
                if (err2 || !row) return res.status(500).json({ error: 'Database error' });
                const token = generateToken(row);
                return res.json({ token, user: row });
            });
        }
    );
});

app.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
    db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
        const token = generateToken(user);
        return res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
    });
});

app.get('/me', auth, (req, res) => {
    db.get('SELECT id, name, email FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'User not found' });
        return res.json({ user: row });
    });
});

app.post('/upload', auth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `/uploads/${req.file.filename}`;
    return res.json({ url });
});

app.post('/designs', auth, (req, res) => {
    const { itemType, color, style, text, imageUrl } = req.body || {};
    if (!itemType || !color) return res.status(400).json({ error: 'Missing itemType or color' });
    db.run(
        `INSERT INTO designs (user_id, item_type, color, style, text_overlay, image_url)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [req.user.id, itemType, color, style || null, text || null, imageUrl || null],
        function (err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            db.get('SELECT * FROM designs WHERE id = ?', [this.lastID], (err2, row) => {
                if (err2 || !row) return res.status(500).json({ error: 'Database error' });
                return res.json({ design: row });
            });
        }
    );
});

app.get('/designs', auth, (req, res) => {
    db.all('SELECT * FROM designs WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        return res.json({ designs: rows || [] });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});