const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Simple file-based database
const DB_FILE = './database.json';

// Initialize database
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [],
            books: [],
            borrowRequests: [],
            notifications: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        console.log('✅ Database file created');
    }
}

// Database helper functions
function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error);
        return { users: [], books: [], borrowRequests: [], notifications: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing database:', error);
        return false;
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'giki-library-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Authentication middleware
function authenticateUser(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        const db = readDB();
        const user = db.users.find(u => u.id === decoded.userId);
        
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Simple login endpoint (for testing without OAuth)
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }
        
        const db = readDB();
        let user = db.users.find(u => u.email === email);
        
        if (!user) {
            // Create new user for demo purposes
            const hashedPassword = await bcrypt.hash(password, 10);
            user = {
                id: Date.now(),
                email: email,
                name: email.split('@')[0],
                password: hashedPassword,
                registrationNumber: 'DEMO-' + Date.now(),
                department: 'Computer Science',
                createdAt: new Date().toISOString()
            };
            
            db.users.push(user);
            writeDB(db);
        } else {
            // Verify password
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        }
        
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                registrationNumber: user.registrationNumber,
                department: user.department
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get all books
app.get('/api/books', (req, res) => {
    try {
        const db = readDB();
        const books = db.books.filter(book => book.isAvailable).map(book => {
            const owner = db.users.find(u => u.id === book.ownerId);
            return {
                ...book,
                ownerName: owner?.name || 'Unknown',
                ownerEmail: owner?.email || 'Unknown'
            };
        });
        res.json(books);
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

// Add a book
app.post('/api/books', authenticateUser, (req, res) => {
    try {
        const { title, author, description, category, condition } = req.body;
        
        if (!title || !author) {
            return res.status(400).json({ error: 'Title and author are required' });
        }
        
        const db = readDB();
        const newBook = {
            id: Date.now(),
            title,
            author,
            description: description || '',
            category: category || 'General',
            condition: condition || 'Good',
            ownerId: req.user.id,
            isAvailable: true,
            createdAt: new Date().toISOString()
        };
        
        db.books.push(newBook);
        writeDB(db);
        
        res.status(201).json(newBook);
    } catch (error) {
        console.error('Error adding book:', error);
        res.status(500).json({ error: 'Failed to add book' });
    }
});

// Get user's books
app.get('/api/my-books', authenticateUser, (req, res) => {
    try {
        const db = readDB();
        const userBooks = db.books.filter(book => book.ownerId === req.user.id);
        res.json(userBooks);
    } catch (error) {
        console.error('Error fetching user books:', error);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

// Initialize database and start server
initDatabase();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 GIKI Virtual Library Server running on port ${PORT}`);
    console.log(`📚 Landing Page: http://localhost:${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`💾 Database: Simple JSON file (${DB_FILE})`);
    console.log('');
    console.log('🔑 Demo Login:');
    console.log('   Email: demo@giki.edu.pk');
    console.log('   Password: demo123');
    console.log('');
    console.log('✅ Server ready for connections!');
});

// Socket.IO for real-time features
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});
