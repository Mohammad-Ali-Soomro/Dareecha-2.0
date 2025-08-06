# GIKI Virtual Library

A comprehensive book sharing platform designed for GIKI University students, enabling peer-to-peer book lending and borrowing with real-time notifications and robust authentication.

## Features

### 🔐 Authentication & Security
- JWT-based authentication system
- Microsoft OAuth integration for university accounts
- Secure password hashing with bcryptjs
- Rate limiting and security headers
- Session management

### 📚 Book Management
- Add books with detailed metadata (title, author, genre, ISBN, condition)
- Advanced search functionality across multiple fields
- Book availability tracking
- Personal library management

### 🤝 Borrowing System
- Request-based borrowing with customizable periods (1-4 weeks)
- Real-time notifications via Socket.IO
- Track borrowed vs. lent books
- Borrowing history and analytics

### 👤 User Dashboard
- Personal profile with library statistics
- Track books added, borrowed, and returned
- Manage active borrowing requests
- View borrowing history

## Tech Stack

### Backend
- **Node.js** with Express.js framework
- **PostgreSQL** - Primary database
- **MongoDB** - Secondary database support
- **Socket.IO** - Real-time notifications
- **Passport.js** - Authentication middleware

### Frontend
- **HTML5/CSS3/JavaScript** (Vanilla)
- **Font Awesome** icons
- **Google Fonts** (Amiri, Cormorant Garamond, Reem Kufi)
- Responsive modal-based UI

### Security & Utilities
- **Helmet** - Security headers
- **CORS** - Cross-origin resource sharing
- **Morgan** - HTTP request logging
- **dotenv** - Environment configuration

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd giki-virtual-library
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your database credentials and configuration
```

4. Set up the database
```bash
npm run setup-db
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

### Legacy Server
```bash
npm run legacy
```

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run setup-db` - Initialize database
- `npm run legacy` - Run legacy server version
- `npm test` - Run tests (to be implemented)

## Project Structure

```
giki-virtual-library/
├── server-database.js    # Main server with database integration
├── server.js            # Legacy server
├── setup-database.js    # Database initialization
├── index.html          # Frontend application
├── styles.css          # Application styles
├── package.json        # Project configuration
└── README.md          # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### NPM Installation Error: "file argument must be of type string"

If you encounter the error `npm error code ERR_INVALID_ARG_TYPE` with message "The 'file' argument must be of type string. Received undefined", this is typically caused by the `bcrypt` package requiring native compilation.

**Solution Applied:**
- Replaced `bcrypt` with `bcryptjs` (pure JavaScript implementation)
- Updated all dependencies to latest compatible versions
- Cleared npm cache and reinstalled dependencies

**If you still encounter issues:**
1. Clear npm cache: `npm cache clean --force`
2. Delete `node_modules` and `package-lock.json`
3. Run `npm install` again
4. Ensure you have the latest Node.js version (16.0.0 or higher)

### Database Connection Issues

If you see database connection errors:
1. Ensure PostgreSQL is installed and running
2. Update database credentials in `.env` file
3. Create the database: `createdb giki_library`
4. Run database setup: `npm run setup-db`

### Microsoft OAuth Setup

For authentication to work:
1. Register your app at [Azure Portal](https://portal.azure.com/)
2. Get Client ID and Client Secret
3. Update `.env` file with your OAuth credentials
4. Set redirect URI to `http://localhost:3000/auth/microsoft/callback`

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please contact the development team or create an issue in the repository.
