const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Database Configuration with fallback
let pool;
let useInMemoryDB = false;

async function initializeDatabaseConnection() {
    try {
        const { Pool } = require('pg');
        pool = new Pool({
            user: process.env.DB_USER || 'postgres',
            host: process.env.DB_HOST || 'localhost',
            database: process.env.DB_NAME || 'giki_library',
            password: process.env.DB_PASSWORD || 'password',
            port: process.env.DB_PORT || 5432,
        });
        
        // Test the connection
        try {
            await pool.query('SELECT NOW()');
            console.log('✅ PostgreSQL connected successfully');
        } catch (err) {
            console.log('⚠️  PostgreSQL connection failed, using in-memory database for development');
            console.log('   To use PostgreSQL, please:');
            console.log('   1. Install PostgreSQL');
            console.log('   2. Create a database named "giki_library"');
            console.log('   3. Set up environment variables in .env file');
            console.log('   4. Run: npm run setup-db');
            useInMemoryDB = true;
        }
    } catch (error) {
        console.log('⚠️  PostgreSQL not available, using in-memory database for development');
        useInMemoryDB = true;
    }
}

// In-memory database for development
const inMemoryDB = {
    users: [],
    books: [],
    borrowRequests: [],
    notifications: [],
    nextUserId: 1,
    nextBookId: 1,
    nextRequestId: 1,
    nextNotificationId: 1
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'giki-library-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

// Microsoft Outlook OAuth Strategy
passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID || 'demo-client-id',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || 'demo-client-secret',
    callbackURL: process.env.MICROSOFT_CALLBACK_URL || 'http://localhost:3000/auth/microsoft/callback',
    scope: ['user.read']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        
        // Check if email belongs to GIKI domain
        if (!email.endsWith('@giki.edu.pk') && !email.endsWith('@student.giki.edu.pk')) {
            return done(null, false, { message: 'Only GIKI students and staff are allowed' });
        }

        if (useInMemoryDB) {
            // In-memory database logic
            let user = inMemoryDB.users.find(u => u.email === email);
            
            if (!user) {
                // Create new user
                user = {
                    id: inMemoryDB.nextUserId++,
                    email: email,
                    name: profile.displayName,
                    profile_picture: profile.photos[0]?.value || null,
                    registration_number: extractRegistrationNumber(email),
                    department: extractDepartment(email),
                    created_at: new Date(),
                    last_login: new Date(),
                    is_active: true
                };
                inMemoryDB.users.push(user);
            } else {
                // Update existing user info
                user.name = profile.displayName;
                user.profile_picture = profile.photos[0]?.value || null;
                user.last_login = new Date();
            }
            
            return done(null, user);
        } else {
            // PostgreSQL logic
            let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
            
            if (user.rows.length === 0) {
                // Create new user
                const newUser = await pool.query(
                    'INSERT INTO users (email, name, profile_picture, registration_number, department) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                    [
                        email,
                        profile.displayName,
                        profile.photos[0]?.value || null,
                        extractRegistrationNumber(email),
                        extractDepartment(email)
                    ]
                );
                user = newUser;
            } else {
                // Update existing user info
                await pool.query(
                    'UPDATE users SET name = $1, profile_picture = $2, last_login = CURRENT_TIMESTAMP WHERE email = $3',
                    [profile.displayName, profile.photos[0]?.value || null, email]
                );
            }
            
            return done(null, user.rows[0]);
        }
    } catch (error) {
        console.error('Authentication error:', error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        if (useInMemoryDB) {
            const user = inMemoryDB.users.find(u => u.id === parseInt(id));
            done(null, user);
        } else {
            const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
            done(null, user.rows[0]);
        }
    } catch (error) {
        done(error, null);
    }
});

// Helper functions
function extractRegistrationNumber(email) {
    const match = email.match(/(\d{4}-[A-Z]+-\d+)/i);
    return match ? match[1] : null;
}

function extractDepartment(email) {
    const departmentMap = {
        'cs': 'Computer Science',
        'ee': 'Electrical Engineering',
        'me': 'Mechanical Engineering',
        'ce': 'Civil Engineering',
        'ch': 'Chemical Engineering',
        'ms': 'Management Sciences',
        'math': 'Mathematics',
        'phy': 'Physics',
        'chem': 'Chemistry'
    };
    
    const match = email.match(/\d{4}-([A-Z]+)-\d+/i);
    if (match) {
        const dept = match[1].toLowerCase();
        return departmentMap[dept] || 'Unknown';
    }
    return 'Unknown';
}

// Authentication middleware
const authenticateUser = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Authentication required' });
};

// Database initialization
async function initializeDatabase() {
    try {
        if (useInMemoryDB) {
            console.log('📝 Initializing in-memory database for development...');
            // Add some sample data for development
            inMemoryDB.users.push({
                id: 1,
                email: 'demo@giki.edu.pk',
                name: 'Demo User',
                profile_picture: null,
                registration_number: '2020-CS-001',
                department: 'Computer Science',
                created_at: new Date(),
                last_login: new Date(),
                is_active: true
            });
            
            inMemoryDB.books.push({
                id: 1,
                title: 'Introduction to Computer Science',
                author: 'John Doe',
                description: 'A comprehensive guide to computer science fundamentals',
                category: 'Computer Science',
                condition: 'Good',
                owner_id: 1,
                is_available: true,
                borrower_id: null,
                borrowed_date: null,
                due_date: null,
                return_date: null,
                borrow_period_days: null,
                created_at: new Date(),
                updated_at: new Date()
            });
            
            console.log('✅ In-memory database initialized with sample data');
            return;
        }

        // PostgreSQL initialization
        // Create users table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                profile_picture VARCHAR(500),
                registration_number VARCHAR(50),
                department VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT true
            )
        `);

        // Create books table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS books (
                id SERIAL PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                author VARCHAR(255) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                condition VARCHAR(50) DEFAULT 'Good',
                owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                is_available BOOLEAN DEFAULT true,
                borrower_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                borrowed_date TIMESTAMP,
                due_date TIMESTAMP,
                return_date TIMESTAMP,
                borrow_period_days INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create borrow_requests table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS borrow_requests (
                id SERIAL PRIMARY KEY,
                book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
                requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending',
                borrow_period_days INTEGER NOT NULL,
                message TEXT,
                owner_response TEXT,
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                responded_at TIMESTAMP,
                UNIQUE(book_id, requester_id, status)
            )
        `);

        // Create notifications table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                data JSONB,
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create indexes for better performance
        await pool.query('CREATE INDEX IF NOT EXISTS idx_books_owner_id ON books(owner_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_books_borrower_id ON books(borrower_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_books_available ON books(is_available)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_borrow_requests_status ON borrow_requests(status)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, is_read)');

        console.log('✅ PostgreSQL database initialized successfully');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
        if (!useInMemoryDB) {
            console.log('🔄 Falling back to in-memory database...');
            useInMemoryDB = true;
            await initializeDatabase(); // Recursive call with in-memory mode
        }
    }
}

// Routes

// Landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'landing.html'));
});

// Authentication routes
app.get('/auth/microsoft', passport.authenticate('microsoft', {
    scope: ['user.read']
}));

app.get('/auth/microsoft/callback', 
    passport.authenticate('microsoft', { failureRedirect: '/login-failed' }),
    (req, res) => {
        res.redirect('/dashboard');
    }
);

// Demo login for development (when Microsoft OAuth is not configured)
app.get('/auth/demo', (req, res) => {
    if (useInMemoryDB) {
        // Create a demo user session
        const demoUser = inMemoryDB.users.find(u => u.email === 'demo@giki.edu.pk');
        if (demoUser) {
            req.login(demoUser, (err) => {
                if (err) {
                    return res.redirect('/login-failed');
                }
                res.redirect('/dashboard');
            });
        } else {
            res.redirect('/login-failed');
        }
    } else {
        res.redirect('/auth/microsoft');
    }
});

app.get('/login-failed', (req, res) => {
    res.send(`
        <html>
        <body style="font-family: Arial; text-align: center; margin-top: 100px;">
            <h2>Login Failed</h2>
            <p>Only GIKI students and staff can access this library.</p>
            <p>Please use your GIKI email address.</p>
            <a href="/" style="color: #d4af37; text-decoration: none; font-weight: bold;">← Back to Home</a>
        </body>
        </html>
    `);
});

app.get('/dashboard', authenticateUser, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// API Routes

// Get current user
app.get('/api/user', authenticateUser, (req, res) => {
    res.json({
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        profile_picture: req.user.profile_picture,
        registration_number: req.user.registration_number,
        department: req.user.department
    });
});

// Get all available books (excluding user's own books)
app.get('/api/books', authenticateUser, async (req, res) => {
    try {
        if (useInMemoryDB) {
            const books = inMemoryDB.books.filter(book => 
                book.owner_id !== req.user.id && book.is_available
            ).map(book => {
                const owner = inMemoryDB.users.find(u => u.id === book.owner_id);
                return {
                    ...book,
                    owner_name: owner ? owner.name : 'Unknown',
                    owner_email: owner ? owner.email : 'unknown@giki.edu.pk',
                    owner_reg_no: owner ? owner.registration_number : 'Unknown'
                };
            });
            res.json(books);
        } else {
            const result = await pool.query(`
                SELECT b.*, u.name as owner_name, u.email as owner_email, u.registration_number as owner_reg_no
                FROM books b
                JOIN users u ON b.owner_id = u.id
                WHERE b.owner_id != $1 AND b.is_available = true
                ORDER BY b.created_at DESC
            `, [req.user.id]);
            
            res.json(result.rows);
        }
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ error: 'Failed to fetch books' });
    }
});

// Get user's own books
app.get('/api/my-books', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, 
                   CASE WHEN b.borrower_id IS NOT NULL THEN 
                       (SELECT name FROM users WHERE id = b.borrower_id)
                   END as borrower_name
            FROM books b
            WHERE b.owner_id = $1
            ORDER BY b.created_at DESC
        `, [req.user.id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user books:', error);
        res.status(500).json({ error: 'Failed to fetch user books' });
    }
});

// Get user's borrowed books
app.get('/api/borrowed-books', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT b.*, u.name as owner_name, u.email as owner_email
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.borrower_id = $1
            ORDER BY b.borrowed_date DESC
        `, [req.user.id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching borrowed books:', error);
        res.status(500).json({ error: 'Failed to fetch borrowed books' });
    }
});

// Add a new book
app.post('/api/books', authenticateUser, async (req, res) => {
    try {
        const { title, author, description, category, condition } = req.body;
        
        if (!title || !author) {
            return res.status(400).json({ error: 'Title and author are required' });
        }
        
        const result = await pool.query(`
            INSERT INTO books (title, author, description, category, condition, owner_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [title, author, description, category, condition || 'Good', req.user.id]);
        
        const newBook = result.rows[0];
        
        // Broadcast new book to all connected clients except the owner
        io.emit('new_book', {
            ...newBook,
            owner_name: req.user.name,
            owner_email: req.user.email,
            owner_reg_no: req.user.registration_number
        });
        
        res.json(newBook);
    } catch (error) {
        console.error('Error adding book:', error);
        res.status(500).json({ error: 'Failed to add book' });
    }
});

// Request to borrow a book
app.post('/api/books/:id/request-borrow', authenticateUser, async (req, res) => {
    try {
        const bookId = req.params.id;
        const { borrowPeriodDays, message } = req.body;
        
        if (!borrowPeriodDays || borrowPeriodDays < 1 || borrowPeriodDays > 30) {
            return res.status(400).json({ error: 'Borrow period must be between 1 and 30 days' });
        }
        
        // Check if book exists and is available
        const bookResult = await pool.query(
            'SELECT * FROM books WHERE id = $1 AND is_available = true',
            [bookId]
        );
        
        if (bookResult.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found or not available' });
        }
        
        const book = bookResult.rows[0];
        
        if (book.owner_id === req.user.id) {
            return res.status(400).json({ error: 'You cannot borrow your own book' });
        }
        
        // Check if there's already a pending request
        const existingRequest = await pool.query(
            'SELECT * FROM borrow_requests WHERE book_id = $1 AND requester_id = $2 AND status = $3',
            [bookId, req.user.id, 'pending']
        );
        
        if (existingRequest.rows.length > 0) {
            return res.status(400).json({ error: 'You already have a pending request for this book' });
        }
        
        // Create borrow request
        const requestResult = await pool.query(`
            INSERT INTO borrow_requests (book_id, requester_id, owner_id, borrow_period_days, message)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [bookId, req.user.id, book.owner_id, borrowPeriodDays, message]);
        
        const borrowRequest = requestResult.rows[0];
        
        // Create notification for book owner
        await pool.query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            book.owner_id,
            'borrow_request',
            'New Borrow Request',
            `${req.user.name} wants to borrow "${book.title}" for ${borrowPeriodDays} days`,
            JSON.stringify({
                request_id: borrowRequest.id,
                book_id: bookId,
                requester_name: req.user.name,
                requester_email: req.user.email
            })
        ]);
        
        // Emit notification to book owner
        io.emit('notification', {
            userId: book.owner_id,
            type: 'borrow_request',
            title: 'New Borrow Request',
            message: `${req.user.name} wants to borrow "${book.title}" for ${borrowPeriodDays} days`,
            data: borrowRequest
        });
        
        res.json({ message: 'Borrow request sent successfully', request: borrowRequest });
    } catch (error) {
        console.error('Error creating borrow request:', error);
        res.status(500).json({ error: 'Failed to create borrow request' });
    }
});

// Get borrow requests for user's books
app.get('/api/borrow-requests/:username', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT br.*, b.title, b.author, u.name as requester_name, u.email as requester_email
            FROM borrow_requests br
            JOIN books b ON br.book_id = b.id
            JOIN users u ON br.requester_id = u.id
            WHERE br.owner_id = $1 AND br.status = 'pending'
            ORDER BY br.requested_at DESC
        `, [req.user.id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching borrow requests:', error);
        res.status(500).json({ error: 'Failed to fetch borrow requests' });
    }
});

// Respond to borrow request
app.post('/api/borrow-requests/:requestId/respond', authenticateUser, async (req, res) => {
    try {
        const requestId = req.params.requestId;
        const { action, response } = req.body; // action: 'approve' or 'deny'
        
        if (!['approve', 'deny'].includes(action)) {
            return res.status(400).json({ error: 'Invalid action' });
        }
        
        // Get the borrow request
        const requestResult = await pool.query(`
            SELECT br.*, b.title, u.name as requester_name
            FROM borrow_requests br
            JOIN books b ON br.book_id = b.id
            JOIN users u ON br.requester_id = u.id
            WHERE br.id = $1 AND br.owner_id = $2 AND br.status = 'pending'
        `, [requestId, req.user.id]);
        
        if (requestResult.rows.length === 0) {
            return res.status(404).json({ error: 'Borrow request not found' });
        }
        
        const borrowRequest = requestResult.rows[0];
        const newStatus = action === 'approve' ? 'approved' : 'denied';
        
        // Update borrow request
        await pool.query(`
            UPDATE borrow_requests 
            SET status = $1, owner_response = $2, responded_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [newStatus, response, requestId]);
        
        let notificationMessage = '';
        
        if (action === 'approve') {
            // Update book status
            const borrowDate = new Date();
            const dueDate = new Date(borrowDate.getTime() + borrowRequest.borrow_period_days * 24 * 60 * 60 * 1000);
            
            await pool.query(`
                UPDATE books 
                SET is_available = false, borrower_id = $1, borrowed_date = $2, due_date = $3, borrow_period_days = $4
                WHERE id = $5
            `, [borrowRequest.requester_id, borrowDate, dueDate, borrowRequest.borrow_period_days, borrowRequest.book_id]);
            
            notificationMessage = `Your request to borrow "${borrowRequest.title}" has been approved!`;
            
            // Broadcast book update
            io.emit('book_borrowed', {
                bookId: borrowRequest.book_id,
                borrowerId: borrowRequest.requester_id,
                dueDate: dueDate.toISOString()
            });
        } else {
            notificationMessage = `Your request to borrow "${borrowRequest.title}" has been denied.`;
        }
        
        // Create notification for requester
        await pool.query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            borrowRequest.requester_id,
            `request_${newStatus}`,
            `Request ${action === 'approve' ? 'Approved' : 'Denied'}`,
            notificationMessage,
            JSON.stringify({ book_title: borrowRequest.title, owner_response: response })
        ]);
        
        // Emit notification
        io.emit('notification', {
            userId: borrowRequest.requester_id,
            type: `request_${newStatus}`,
            title: `Request ${action === 'approve' ? 'Approved' : 'Denied'}`,
            message: notificationMessage
        });
        
        res.json({ message: `Request ${action}d successfully` });
    } catch (error) {
        console.error('Error responding to borrow request:', error);
        res.status(500).json({ error: 'Failed to respond to request' });
    }
});

// Return a book
app.post('/api/books/:id/return', authenticateUser, async (req, res) => {
    try {
        const bookId = req.params.id;
        
        // Verify the book is borrowed by the current user
        const bookResult = await pool.query(`
            SELECT b.*, u.name as owner_name
            FROM books b
            JOIN users u ON b.owner_id = u.id
            WHERE b.id = $1 AND b.borrower_id = $2
        `, [bookId, req.user.id]);
        
        if (bookResult.rows.length === 0) {
            return res.status(404).json({ error: 'Book not found or not borrowed by you' });
        }
        
        const book = bookResult.rows[0];
        
        // Update book status
        await pool.query(`
            UPDATE books 
            SET is_available = true, borrower_id = NULL, borrowed_date = NULL, due_date = NULL, return_date = CURRENT_TIMESTAMP
            WHERE id = $1
        `, [bookId]);
        
        // Create notification for book owner
        await pool.query(`
            INSERT INTO notifications (user_id, type, title, message, data)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            book.owner_id,
            'book_returned',
            'Book Returned',
            `${req.user.name} has returned "${book.title}"`,
            JSON.stringify({ book_id: bookId, borrower_name: req.user.name })
        ]);
        
        // Emit notifications
        io.emit('book_returned', { bookId: bookId, borrowerName: req.user.name });
        io.emit('notification', {
            userId: book.owner_id,
            type: 'book_returned',
            title: 'Book Returned',
            message: `${req.user.name} has returned "${book.title}"`
        });
        
        res.json({ message: 'Book returned successfully' });
    } catch (error) {
        console.error('Error returning book:', error);
        res.status(500).json({ error: 'Failed to return book' });
    }
});

// Get user notifications
app.get('/api/notifications', authenticateUser, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM notifications
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 50
        `, [req.user.id]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateUser, async (req, res) => {
    try {
        await pool.query(`
            UPDATE notifications 
            SET is_read = true 
            WHERE id = $1 AND user_id = $2
        `, [req.params.id, req.user.id]);
        
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join_user_room', (userId) => {
        socket.join(`user_${userId}`);
        console.log(`User ${userId} joined their room`);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Reminder system for overdue books
setInterval(async () => {
    try {
        const now = new Date();
        const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        // Check for books due in 3 days
        const booksThreeDays = await pool.query(`
            SELECT b.*, u.name as borrower_name, u.email as borrower_email, o.name as owner_name
            FROM books b
            JOIN users u ON b.borrower_id = u.id
            JOIN users o ON b.owner_id = o.id
            WHERE b.due_date BETWEEN $1 AND $2 AND b.is_available = false
        `, [now, threeDaysFromNow]);
        
        for (const book of booksThreeDays.rows) {
            // Check if reminder already sent today
            const existingReminder = await pool.query(`
                SELECT * FROM notifications
                WHERE user_id = $1 AND type = 'due_reminder_3days' AND data->>'book_id' = $2
                AND created_at > CURRENT_DATE
            `, [book.borrower_id, book.id.toString()]);
            
            if (existingReminder.rows.length === 0) {
                await pool.query(`
                    INSERT INTO notifications (user_id, type, title, message, data)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    book.borrower_id,
                    'due_reminder_3days',
                    'Book Due Soon',
                    `"${book.title}" is due in 3 days. Please return it on time.`,
                    JSON.stringify({ book_id: book.id, due_date: book.due_date })
                ]);
                
                io.emit('notification', {
                    userId: book.borrower_id,
                    type: 'due_reminder_3days',
                    title: 'Book Due Soon',
                    message: `"${book.title}" is due in 3 days. Please return it on time.`
                });
            }
        }
        
        // Check for overdue books
        const overdueBooks = await pool.query(`
            SELECT b.*, u.name as borrower_name, u.email as borrower_email, o.name as owner_name
            FROM books b
            JOIN users u ON b.borrower_id = u.id
            JOIN users o ON b.owner_id = o.id
            WHERE b.due_date < $1 AND b.is_available = false
        `, [now]);
        
        for (const book of overdueBooks.rows) {
            // Notify borrower
            const borrowerReminder = await pool.query(`
                SELECT * FROM notifications
                WHERE user_id = $1 AND type = 'overdue' AND data->>'book_id' = $2
                AND created_at > CURRENT_DATE
            `, [book.borrower_id, book.id.toString()]);
            
            if (borrowerReminder.rows.length === 0) {
                await pool.query(`
                    INSERT INTO notifications (user_id, type, title, message, data)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    book.borrower_id,
                    'overdue',
                    'Book Overdue',
                    `"${book.title}" is overdue. Please return it immediately.`,
                    JSON.stringify({ book_id: book.id, due_date: book.due_date })
                ]);
                
                io.emit('notification', {
                    userId: book.borrower_id,
                    type: 'overdue',
                    title: 'Book Overdue',
                    message: `"${book.title}" is overdue. Please return it immediately.`
                });
            }
            
            // Notify owner
            const ownerReminder = await pool.query(`
                SELECT * FROM notifications
                WHERE user_id = $1 AND type = 'borrower_overdue' AND data->>'book_id' = $2
                AND created_at > CURRENT_DATE
            `, [book.owner_id, book.id.toString()]);
            
            if (ownerReminder.rows.length === 0) {
                await pool.query(`
                    INSERT INTO notifications (user_id, type, title, message, data)
                    VALUES ($1, $2, $3, $4, $5)
                `, [
                    book.owner_id,
                    'borrower_overdue',
                    'Borrowed Book Overdue',
                    `${book.borrower_name} has not returned "${book.title}" on time.`,
                    JSON.stringify({ book_id: book.id, borrower_name: book.borrower_name, due_date: book.due_date })
                ]);
                
                io.emit('notification', {
                    userId: book.owner_id,
                    type: 'borrower_overdue',
                    title: 'Borrowed Book Overdue',
                    message: `${book.borrower_name} has not returned "${book.title}" on time.`
                });
            }
        }
        
    } catch (error) {
        console.error('Error in reminder system:', error);
    }
}, 30 * 60 * 1000); // Check every 30 minutes

// Initialize database and start server
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        await initializeDatabaseConnection();
        await initializeDatabase();
        
        server.listen(PORT, () => {
            console.log('🚀 GIKI Virtual Library Server is running!');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌐 Landing Page: http://localhost:${PORT}`);
            console.log(`📚 Dashboard: http://localhost:${PORT}/dashboard`);
            console.log(`🔑 Demo Login: http://localhost:${PORT}/auth/demo`);
            
            if (useInMemoryDB) {
                console.log('💡 Using in-memory database for development');
                console.log('   To use PostgreSQL, set up your database and environment variables');
            } else {
                console.log('✅ Connected to PostgreSQL database');
            }
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = { app, server, io, pool };
