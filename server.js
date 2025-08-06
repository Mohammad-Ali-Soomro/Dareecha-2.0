const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

class BorrowRequest {
    constructor(bookId, borrower, borrowPeriodDays, message = '') {
        this.id = Date.now().toString();
        this.bookId = bookId;
        this.borrower = borrower;
        this.borrowPeriodDays = Math.min(borrowPeriodDays, 30); // Max 30 days
        this.message = message;
        this.status = 'pending'; // pending, approved, denied
        this.createdAt = new Date();
    }
}

// In-memory database (for demo purposes)
let users = [];
let books = [];
let notifications = [];
let borrowRequests = [];
let connectedUsers = new Map(); // Map of userId -> socketId

// Helper function to check due books and send reminders
function checkDueBooks() {
    const now = new Date();
    books.forEach(book => {
        if (book.borrowedBy && book.dueDate) {
            const dueDate = new Date(book.dueDate);
            const timeDiff = dueDate - now;
            const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
            
            // Send reminder if 3 days, 1 day, or overdue
            if (daysDiff === 3 || daysDiff === 1 || daysDiff === 0 || daysDiff < 0) {
                const reminderType = daysDiff < 0 ? 'overdue' : 'reminder';
                const message = daysDiff < 0 
                    ? `⚠️ Book "${book.title}" is ${Math.abs(daysDiff)} day(s) overdue! Please return it immediately.`
                    : `⏰ Reminder: Book "${book.title}" is due in ${daysDiff} day(s). Please prepare to return it.`;
                
                const reminderNotification = {
                    id: Date.now().toString() + Math.random(),
                    type: reminderType,
                    bookTitle: book.title,
                    bookOwner: book.owner,
                    borrower: book.borrowedBy,
                    message: message,
                    recipient: book.borrowedBy,
                    timestamp: new Date(),
                    read: false,
                    dueDate: book.dueDate
                };
                
                notifications.push(reminderNotification);
                
                // Send real-time notification
                const borrowerSocketId = connectedUsers.get(book.borrowedBy);
                if (borrowerSocketId) {
                    io.to(borrowerSocketId).emit('notification', reminderNotification);
                }
                
                // Also notify the owner if book is overdue
                if (daysDiff < 0) {
                    const ownerNotification = {
                        id: Date.now().toString() + Math.random() + 1,
                        type: 'book_overdue',
                        bookTitle: book.title,
                        borrower: book.borrowedBy,
                        message: `📚 Your book "${book.title}" is ${Math.abs(daysDiff)} day(s) overdue with ${book.borrowedBy}.`,
                        recipient: book.owner,
                        timestamp: new Date(),
                        read: false
                    };
                    
                    notifications.push(ownerNotification);
                    
                    const ownerSocketId = connectedUsers.get(book.owner);
                    if (ownerSocketId) {
                        io.to(ownerSocketId).emit('notification', ownerNotification);
                    }
                }
            }
        }
    });
}

// Check for due books every 30 minutes
setInterval(checkDueBooks, 30 * 60 * 1000);
// Also check immediately on startup
setTimeout(checkDueBooks, 5000);

// API Routes
app.post('/api/auth/register', (req, res) => {
  const { username, password, email } = req.body;
  
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  const user = {
    id: Date.now().toString(),
    username,
    password, // In production, hash this
    email,
    createdAt: new Date()
  };
  
  users.push(user);
  res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });
});

app.get('/api/books', (req, res) => {
  res.json(books);
});

app.post('/api/books', (req, res) => {
  const { title, author, genre, description, condition, owner } = req.body;
  
  const book = {
    id: Date.now().toString(),
    title,
    author,
    genre,
    description,
    condition,
    owner,
    borrowedBy: null,
    borrowedDate: null,
    returnDate: null,
    dueDate: null,
    borrowPeriodDays: null,
    createdAt: new Date()
  };
  
  books.push(book);
  
  // Broadcast new book to all connected users
  io.emit('new_book', book);
  
  res.json({ success: true, book });
});

// Submit borrow request (new approval system)
app.post('/api/books/:id/request-borrow', (req, res) => {
  const { id } = req.params;
  const { borrower, borrowPeriodDays, message } = req.body;
  
  const book = books.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  
  if (book.borrowedBy) {
    return res.status(400).json({ error: 'Book already borrowed' });
  }
  
  if (book.owner === borrower) {
    return res.status(400).json({ error: 'Cannot borrow your own book' });
  }
  
  // Validate borrow period (1-30 days)
  const period = Math.min(Math.max(borrowPeriodDays, 1), 30);
  
  const borrowRequest = new BorrowRequest(id, borrower, period, message);
  borrowRequests.push(borrowRequest);
  
  // Create approval notification for book owner
  const approvalNotification = {
    id: Date.now().toString(),
    type: 'borrow_request',
    bookTitle: book.title,
    bookOwner: book.owner,
    borrower: borrower,
    borrowPeriod: period,
    requestMessage: message,
    requestId: borrowRequest.id,
    message: `📖 ${borrower} wants to borrow your book "${book.title}" for ${period} day(s). ${message ? 'Message: ' + message : ''}`,
    recipient: book.owner,
    timestamp: new Date(),
    read: false
  };
  
  notifications.push(approvalNotification);
  
  // Send real-time notification to owner
  const ownerSocketId = connectedUsers.get(book.owner);
  if (ownerSocketId) {
    io.to(ownerSocketId).emit('notification', approvalNotification);
  }
  
  res.json({ success: true, message: 'Borrow request sent for approval' });
});

// Approve or deny borrow request
app.post('/api/borrow-requests/:requestId/respond', (req, res) => {
  const { requestId } = req.params;
  const { response, responder } = req.body; // response: 'approved' or 'denied'
  
  const request = borrowRequests.find(r => r.id === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  
  const book = books.find(b => b.id === request.bookId);
  if (!book || book.owner !== responder) {
    return res.status(401).json({ error: 'Unauthorized to respond to this request' });
  }
  
  request.status = response;
  
  if (response === 'approved') {
    // Update book
    book.borrowedBy = request.borrower;
    book.borrowedDate = new Date();
    book.borrowPeriodDays = request.borrowPeriodDays;
    
    // Calculate due date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + request.borrowPeriodDays);
    book.dueDate = dueDate;
    
    // Notify borrower of approval
    const approvalNotification = {
      id: Date.now().toString(),
      type: 'request_approved',
      bookTitle: book.title,
      bookOwner: book.owner,
      borrower: request.borrower,
      dueDate: dueDate,
      message: `✅ Great! ${book.owner} approved your request to borrow "${book.title}". Due date: ${dueDate.toLocaleDateString()}`,
      recipient: request.borrower,
      timestamp: new Date(),
      read: false
    };
    
    notifications.push(approvalNotification);
    
    // Send notifications
    const borrowerSocketId = connectedUsers.get(request.borrower);
    if (borrowerSocketId) {
      io.to(borrowerSocketId).emit('notification', approvalNotification);
    }
    
    // Broadcast book update
    io.emit('book_updated', book);
    
  } else {
    // Notify borrower of denial
    const denialNotification = {
      id: Date.now().toString(),
      type: 'request_denied',
      bookTitle: book.title,
      bookOwner: book.owner,
      borrower: request.borrower,
      message: `❌ Sorry, ${book.owner} declined your request to borrow "${book.title}".`,
      recipient: request.borrower,
      timestamp: new Date(),
      read: false
    };
    
    notifications.push(denialNotification);
    
    const borrowerSocketId = connectedUsers.get(request.borrower);
    if (borrowerSocketId) {
      io.to(borrowerSocketId).emit('notification', denialNotification);
    }
  }
  
  res.json({ success: true, response });
});

// Get pending borrow requests for a user
app.get('/api/borrow-requests/:username', (req, res) => {
  const { username } = req.params;
  const userRequests = borrowRequests.filter(r => {
    const book = books.find(b => b.id === r.bookId);
    return book && book.owner === username && r.status === 'pending';
  }).map(r => {
    const book = books.find(b => b.id === r.bookId);
    return {
      ...r,
      bookTitle: book.title,
      bookAuthor: book.author
    };
  });
  
  res.json(userRequests);
});

app.post('/api/books/:id/return', (req, res) => {
  const { id } = req.params;
  const { returner } = req.body;
  
  const book = books.find(b => b.id === id);
  if (!book) {
    return res.status(404).json({ error: 'Book not found' });
  }
  
  if (book.borrowedBy !== returner) {
    return res.status(400).json({ error: 'Unauthorized to return this book' });
  }
  
  const previousBorrower = book.borrowedBy;
  book.borrowedBy = null;
  book.returnDate = new Date();
  
  // Create notifications
  const returnNotification = {
    id: Date.now().toString(),
    type: 'return',
    bookTitle: book.title,
    bookOwner: book.owner,
    returner: returner,
    message: `${returner} has returned your book "${book.title}"`,
    recipient: book.owner,
    timestamp: new Date(),
    read: false
  };
  
  const confirmReturnNotification = {
    id: (Date.now() + 1).toString(),
    type: 'return_confirm',
    bookTitle: book.title,
    bookOwner: book.owner,
    returner: returner,
    message: `You have successfully returned "${book.title}" to ${book.owner}`,
    recipient: returner,
    timestamp: new Date(),
    read: false
  };
  
  notifications.push(returnNotification, confirmReturnNotification);
  
  // Send real-time notifications
  const ownerSocketId = connectedUsers.get(book.owner);
  const returnerSocketId = connectedUsers.get(returner);
  
  if (ownerSocketId) {
    io.to(ownerSocketId).emit('notification', returnNotification);
  }
  
  if (returnerSocketId) {
    io.to(returnerSocketId).emit('notification', confirmReturnNotification);
  }
  
  // Broadcast book update to all users
  io.emit('book_updated', book);
  
  res.json({ success: true, book });
});

app.delete('/api/books/:id', (req, res) => {
  const { id } = req.params;
  const { owner } = req.body;
  
  const bookIndex = books.findIndex(b => b.id === id && b.owner === owner);
  if (bookIndex === -1) {
    return res.status(404).json({ error: 'Book not found or unauthorized' });
  }
  
  const deletedBook = books.splice(bookIndex, 1)[0];
  
  // Broadcast book deletion
  io.emit('book_deleted', { id });
  
  res.json({ success: true, deletedBook });
});

app.get('/api/notifications/:username', (req, res) => {
  const { username } = req.params;
  const userNotifications = notifications.filter(n => n.recipient === username);
  res.json(userNotifications);
});

app.post('/api/notifications/:id/read', (req, res) => {
  const { id } = req.params;
  const notification = notifications.find(n => n.id === id);
  
  if (notification) {
    notification.read = true;
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Notification not found' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle user identification
  socket.on('user_connected', (username) => {
    connectedUsers.set(username, socket.id);
    console.log(`User ${username} connected with socket ${socket.id}`);
    
    // Send unread notifications to the user
    const userNotifications = notifications.filter(n => n.recipient === username && !n.read);
    userNotifications.forEach(notification => {
      socket.emit('notification', notification);
    });
  });
  
  // Handle typing indicators (optional feature)
  socket.on('typing', (data) => {
    socket.broadcast.emit('user_typing', data);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove user from connected users
    for (let [username, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        connectedUsers.delete(username);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 GIKI Virtual Library Server running on port ${PORT}`);
  console.log(`📚 Access the library at: http://localhost:${PORT}`);
});
