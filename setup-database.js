const { Pool } = require('pg');
require('dotenv').config();

// Create admin pool to create database
const adminPool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres', // Connect to default postgres database
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

// Main database pool
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'giki_library',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

async function setupDatabase() {
    try {
        console.log('🚀 Starting GIKI Virtual Library Database Setup...');
        
        // Create database if it doesn't exist
        const dbName = process.env.DB_NAME || 'giki_library';
        
        try {
            await adminPool.query(`CREATE DATABASE "${dbName}"`);
            console.log(`✅ Database "${dbName}" created successfully`);
        } catch (error) {
            if (error.code === '42P04') {
                console.log(`📋 Database "${dbName}" already exists`);
            } else {
                throw error;
            }
        }
        
        // Create tables
        console.log('📝 Creating tables...');
        
        // Users table
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
        console.log('✅ Users table created');

        // Books table
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
        console.log('✅ Books table created');

        // Borrow requests table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS borrow_requests (
                id SERIAL PRIMARY KEY,
                book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
                requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
                borrow_period_days INTEGER NOT NULL CHECK (borrow_period_days BETWEEN 1 AND 30),
                message TEXT,
                owner_response TEXT,
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                responded_at TIMESTAMP
            )
        `);
        
        // Add unique constraint for pending requests
        try {
            await pool.query(`
                ALTER TABLE borrow_requests 
                ADD CONSTRAINT unique_pending_request 
                UNIQUE (book_id, requester_id, status) 
                DEFERRABLE INITIALLY DEFERRED
            `);
        } catch (error) {
            if (error.code !== '42P07') { // Ignore if constraint already exists
                console.log('Warning: Could not add unique constraint:', error.message);
            }
        }
        console.log('✅ Borrow requests table created');

        // Notifications table
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
        console.log('✅ Notifications table created');

        // Create indexes for better performance
        console.log('📊 Creating indexes...');
        
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
            'CREATE INDEX IF NOT EXISTS idx_books_owner_id ON books(owner_id)',
            'CREATE INDEX IF NOT EXISTS idx_books_borrower_id ON books(borrower_id)',
            'CREATE INDEX IF NOT EXISTS idx_books_available ON books(is_available)',
            'CREATE INDEX IF NOT EXISTS idx_books_category ON books(category)',
            'CREATE INDEX IF NOT EXISTS idx_borrow_requests_book_id ON borrow_requests(book_id)',
            'CREATE INDEX IF NOT EXISTS idx_borrow_requests_requester_id ON borrow_requests(requester_id)',
            'CREATE INDEX IF NOT EXISTS idx_borrow_requests_owner_id ON borrow_requests(owner_id)',
            'CREATE INDEX IF NOT EXISTS idx_borrow_requests_status ON borrow_requests(status)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type)',
            'CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)'
        ];

        for (const indexQuery of indexes) {
            await pool.query(indexQuery);
        }
        console.log('✅ Indexes created');

        // Insert sample data for testing
        console.log('📚 Inserting sample data...');
        
        // Sample users (for testing only)
        const sampleUsers = [
            {
                email: '2020-cs-01@student.giki.edu.pk',
                name: 'Ahmad Hassan',
                registration_number: '2020-CS-01',
                department: 'Computer Science'
            },
            {
                email: '2020-ee-15@student.giki.edu.pk',
                name: 'Fatima Khan',
                registration_number: '2020-EE-15',
                department: 'Electrical Engineering'
            },
            {
                email: '2021-ms-08@student.giki.edu.pk',
                name: 'Ali Raza',
                registration_number: '2021-MS-08',
                department: 'Management Sciences'
            }
        ];

        for (const user of sampleUsers) {
            try {
                await pool.query(`
                    INSERT INTO users (email, name, registration_number, department)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (email) DO NOTHING
                `, [user.email, user.name, user.registration_number, user.department]);
            } catch (error) {
                console.log(`User ${user.email} already exists or error:`, error.message);
            }
        }

        // Sample books
        const sampleBooks = [
            {
                title: 'Introduction to Algorithms',
                author: 'Thomas H. Cormen',
                description: 'Comprehensive guide to algorithms and data structures',
                category: 'Computer Science',
                condition: 'Good'
            },
            {
                title: 'Clean Code',
                author: 'Robert C. Martin',
                description: 'A handbook of agile software craftsmanship',
                category: 'Programming',
                condition: 'Excellent'
            },
            {
                title: 'Fundamentals of Electric Circuits',
                author: 'Charles K. Alexander',
                description: 'Comprehensive textbook on electric circuits',
                category: 'Electrical Engineering',
                condition: 'Good'
            },
            {
                title: 'Marketing Management',
                author: 'Philip Kotler',
                description: 'Leading textbook on marketing principles',
                category: 'Business',
                condition: 'Fair'
            },
            {
                title: 'Calculus: Early Transcendentals',
                author: 'James Stewart',
                description: 'Classic calculus textbook',
                category: 'Mathematics',
                condition: 'Good'
            }
        ];

        // Get user IDs for sample books
        const users = await pool.query('SELECT id FROM users LIMIT 3');
        const userIds = users.rows.map(u => u.id);

        for (let i = 0; i < sampleBooks.length; i++) {
            const book = sampleBooks[i];
            const ownerId = userIds[i % userIds.length];
            
            try {
                await pool.query(`
                    INSERT INTO books (title, author, description, category, condition, owner_id)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [book.title, book.author, book.description, book.category, book.condition, ownerId]);
            } catch (error) {
                console.log(`Error inserting book "${book.title}":`, error.message);
            }
        }

        console.log('✅ Sample data inserted');

        // Database statistics
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const bookCount = await pool.query('SELECT COUNT(*) FROM books');
        const requestCount = await pool.query('SELECT COUNT(*) FROM borrow_requests');
        const notificationCount = await pool.query('SELECT COUNT(*) FROM notifications');

        console.log('\n📊 Database Statistics:');
        console.log(`   👥 Users: ${userCount.rows[0].count}`);
        console.log(`   📚 Books: ${bookCount.rows[0].count}`);
        console.log(`   📝 Borrow Requests: ${requestCount.rows[0].count}`);
        console.log(`   🔔 Notifications: ${notificationCount.rows[0].count}`);

        console.log('\n🎉 Database setup completed successfully!');
        console.log('\n📋 Next Steps:');
        console.log('1. Set up Microsoft OAuth credentials in Azure Portal');
        console.log('2. Update your .env file with the OAuth credentials');
        console.log('3. Start the server with: npm start');
        console.log('4. Visit http://localhost:3000 to see the landing page');
        console.log('\n⚠️  Remember to remove sample data in production!');

    } catch (error) {
        console.error('❌ Database setup failed:', error);
        process.exit(1);
    } finally {
        await adminPool.end();
        await pool.end();
    }
}

// Run setup if this file is executed directly
if (require.main === module) {
    setupDatabase();
}

module.exports = { setupDatabase };
