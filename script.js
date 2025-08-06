let currentUser = null;
let socket = null;
let notifications = [];
let currentBorrowBookId = null;

class User {
    constructor(username, password, email = '') {
        this.username = username;
        this.password = password;
        this.email = email;
    }
}

class Book {
    constructor(title, author, genre, description, condition, owner) {
        this.id = Date.now().toString();
        this.title = title;
        this.author = author;
        this.genre = genre;
        this.description = description;
        this.condition = condition;
        this.owner = owner;
        this.borrowedBy = null; 
        this.borrowedDate = null;
        this.returnDate = null;
        this.dueDate = null;
        this.borrowPeriodDays = null;
    }
}

// Database simulation (fallback for offline mode)
const users = JSON.parse(localStorage.getItem('users') || '[]');
let books = JSON.parse(localStorage.getItem('books') || '[]');

// Initialize Socket.IO connection
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        if (currentUser) {
            socket.emit('user_connected', currentUser.username);
        }
    });
    
    socket.on('notification', (notification) => {
        showNotification(notification);
        notifications.push(notification);
        
        // Handle approval notifications specially
        if (notification.type === 'borrow_request') {
            showApprovalIndicator();
        }
    });
    
    socket.on('new_book', (book) => {
        // Check if book already exists to prevent duplicates
        const existingBook = books.find(b => b.id === book.id);
        if (!existingBook) {
            books.push(book);
        }
        renderBooks();
    });
    
    socket.on('book_updated', (updatedBook) => {
        const index = books.findIndex(b => b.id === updatedBook.id);
        if (index !== -1) {
            books[index] = updatedBook;
            renderBooks();
            renderMyBooks();
        }
    });
    
    socket.on('book_deleted', ({ id }) => {
        books = books.filter(b => b.id !== id);
        renderBooks();
        renderMyBooks();
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });
}

// Show notification popup
function showNotification(notification) {
    const notificationEl = document.createElement('div');
    notificationEl.className = `notification ${notification.type}`;
    
    // Handle special approval notifications
    let actionButtons = '';
    if (notification.type === 'borrow_request') {
        actionButtons = `
            <div style="margin-top: 10px;">
                <button class="approve-btn" onclick="respondToRequest('${notification.requestId}', 'approved', this.parentElement.parentElement.parentElement)">Approve</button>
                <button class="deny-btn" onclick="respondToRequest('${notification.requestId}', 'denied', this.parentElement.parentElement.parentElement)">Deny</button>
            </div>
        `;
    }
    
    notificationEl.innerHTML = `
        <div class="notification-header">
            <span class="notification-icon">${getNotificationIcon(notification.type)}</span>
            <span class="notification-title">${getNotificationTitle(notification.type)}</span>
            <button class="close-notification" onclick="this.parentElement.parentElement.remove()">&times;</button>
        </div>
        <div class="notification-message">${notification.message}</div>
        ${actionButtons}
        <div class="notification-time">${new Date(notification.timestamp).toLocaleTimeString()}</div>
    `;
    
    document.body.appendChild(notificationEl);
    
    // Auto remove after 10 seconds for approval requests, 5 for others
    const autoRemoveTime = notification.type === 'borrow_request' ? 10000 : 5000;
    setTimeout(() => {
        if (notificationEl.parentElement) {
            notificationEl.remove();
        }
    }, autoRemoveTime);
    
    // Play notification sound
    playNotificationSound();
}

async function respondToRequest(requestId, response, notificationEl) {
    try {
        const res = await fetch(`/api/borrow-requests/${requestId}/respond`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ response, responder: currentUser.username })
        });

        const data = await res.json();
        if (data.success) {
            notificationEl.remove();
            const message = response === 'approved' ? 'Request approved!' : 'Request denied.';
            alert(message);
        } else {
            alert(data.error || 'Failed to respond to request');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

function getNotificationIcon(type) {
    switch(type) {
        case 'borrow_request': return '📋';
        case 'request_approved': return '✅';
        case 'request_denied': return '❌';
        case 'borrow': return '📖';
        case 'borrow_confirm': return '✅';
        case 'return': return '📚';
        case 'return_confirm': return '✅';
        case 'reminder': return '⏰';
        case 'overdue': return '⚠️';
        case 'book_overdue': return '🚨';
        default: return '📝';
    }
}

function getNotificationTitle(type) {
    switch(type) {
        case 'borrow_request': return 'Borrow Request';
        case 'request_approved': return 'Request Approved';
        case 'request_denied': return 'Request Denied';
        case 'borrow': return 'Book Borrowed';
        case 'borrow_confirm': return 'Borrow Confirmed';
        case 'return': return 'Book Returned';
        case 'return_confirm': return 'Return Confirmed';
        case 'reminder': return 'Return Reminder';
        case 'overdue': return 'Book Overdue';
        case 'book_overdue': return 'Your Book Overdue';
        default: return 'Notification';
    }
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.log('Audio not supported');
    }
}

function showApprovalIndicator() {
    // Add visual indicator for pending approvals in navigation
    const navLinks = document.getElementById('navLinks');
    if (!navLinks.innerHTML.includes('🔔')) {
        const approvalBtn = '<button class="approval-indicator" onclick="loadPendingRequests()">🔔 Approvals</button>';
        navLinks.innerHTML = navLinks.innerHTML.replace('My Profile</a>', 'My Profile</a>' + approvalBtn);
    }
}

// DOM Elements
const sections = {
    auth: document.getElementById('authSection'),
    feed: document.getElementById('feedSection'),
    addBook: document.getElementById('addBookSection'),
    myBooks: document.getElementById('myBooksSection'),
    profile: document.getElementById('profileSection')
};

function showPage(page, param) {
    Object.values(sections).forEach(section => section.style.display = 'none');
    
    switch(page) {
        case 'feed':
            sections.feed.style.display = 'block';
            renderBooks();
            break;
        case 'addBook':
            sections.addBook.style.display = 'block';
            break;
        case 'myBooks':
            sections.myBooks.style.display = 'block';
            renderMyBooks();
            break;
        case 'profile':
            sections.profile.style.display = 'block';
            renderProfile(param);
            break;
        default:
            sections.auth.style.display = 'block';
    }
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

function showLogin() {
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
}

async function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value.trim();

    if (!username || !password) {
        alert('Please fill in all fields');
        return;
    }

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();
        if (data.success) {
            alert('Registration successful! Please login.');
            showLogin();
        } else {
            alert(data.error || 'Registration failed');
        }
    } catch (error) {
        // Fallback to local storage if server is offline
        if (users.some(user => user.username === username)) {
            alert('Student ID or Username already registered!');
            return;
        }
        users.push(new User(username, password, email));
        localStorage.setItem('users', JSON.stringify(users));
        alert('Registration successful (offline mode)! Please login.');
        showLogin();
    }
}

async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: username, password })
        });

        const data = await response.json();
        if (response.ok && data.token) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            localStorage.setItem('authToken', data.token);

            // Initialize socket connection after login
            initializeSocket();

            // Load books from server
            await loadBooks();

            updateNavigation();
            showPage('feed');
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        // Fallback to local storage if server is offline
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user));
            updateNavigation();
            showPage('feed');
        } else {
            alert('Invalid Student ID/Username or Password!');
        }
    }
}

async function addBook() {
    const title = document.getElementById('bookTitle').value.trim();
    const author = document.getElementById('bookAuthor').value.trim();
    const genre = document.getElementById('bookGenre').value.trim();
    const description = document.getElementById('bookDescription').value.trim();
    const condition = document.getElementById('bookCondition').value;

    if (!title || !author || !genre) {
        alert('Please fill in Title, Author, and Genre fields.');
        return;
    }

    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('/api/books', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ title, author, category: genre, description, condition })
        });

        const data = await response.json();
        if (response.ok) {
            await loadBooks();
            renderBooks();
            showPage('feed');
            clearBookForm();
        } else {
            alert(data.error || 'Failed to add book');
        }
    } catch (error) {
        // Fallback to local storage if server is offline
        books.push(new Book(title, author, genre, description, condition, currentUser.username));
        localStorage.setItem('books', JSON.stringify(books));
        showPage('feed');
        clearBookForm();
    }
}

async function loadBooks() {
    try {
        const response = await fetch('/api/books');
        const serverBooks = await response.json();
        books = serverBooks;
    } catch (error) {
        console.log('Using offline books data');
        // Use localStorage books if server is offline
    }
}

function renderBooks() {
    const container = document.getElementById('booksContainer');
    // Filter out the current user's own books from the main feed
    const availableBooks = books.filter(book => book.owner !== currentUser?.username);
    container.innerHTML = availableBooks.map(book => createBookCard(book)).reverse().join('');
}

function createBookCard(book) {
    const isBorrowed = book.borrowedBy !== null;
    const isOwner = book.owner === currentUser?.username;
    let actionButton = '';
    let dueInfo = '';

    if (isBorrowed) {
        if (book.borrowedBy === currentUser.username) {
            actionButton = `<button class="return-btn" onclick="returnBook('${book.id}')">Return Book</button>`;
            
            // Show due date info for current borrower
            if (book.dueDate) {
                const dueDate = new Date(book.dueDate);
                const today = new Date();
                const timeDiff = dueDate - today;
                const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                
                let dueDateClass = '';
                let dueText = '';
                
                if (daysDiff < 0) {
                    dueDateClass = 'overdue';
                    dueText = `⚠️ Overdue by ${Math.abs(daysDiff)} day(s)`;
                } else if (daysDiff <= 3) {
                    dueDateClass = 'due-soon';
                    dueText = `⏰ Due in ${daysDiff} day(s)`;
                } else {
                    dueText = `📅 Due: ${dueDate.toLocaleDateString()}`;
                }
                
                dueInfo = `<div class="book-due-info ${dueDateClass}">${dueText}</div>`;
            }
        } else {
            actionButton = `<button class="borrowed-btn" disabled>Borrowed by ${book.borrowedBy}</button>`;
            if (book.dueDate) {
                const dueDate = new Date(book.dueDate);
                dueInfo = `<div class="book-due-info">Due: ${dueDate.toLocaleDateString()}</div>`;
            }
        }
    } else if (!isOwner) {
        actionButton = `<button class="borrow-btn" onclick="borrowBook('${book.id}')">Request to Borrow</button>`;
    }

    return `
        <div class="book-card">
            <div class="book-info">
                <h3>${book.title}</h3>
                <p>by ${book.author}</p>
                <p>Genre: ${book.genre}</p>
                <p>Condition: ${book.condition}</p>
                <p>Owner: <a href="#" onclick="showPage('profile', '${book.owner}')">${book.owner}</a></p>
                ${book.description ? `<p class="description">${book.description}</p>` : ''}
                ${dueInfo}
            </div>
            <div class="book-actions">
                ${actionButton}
                ${isOwner ? `<button class="delete-btn" onclick="deleteBook('${book.id}')">Delete My Book</button>` : ''}
            </div>
        </div>
    `;
}

function borrowBook(bookId) {
    const book = books.find(b => b.id === bookId);
    if (!book) {
        alert('Book not found');
        return;
    }
    
    currentBorrowBookId = bookId;
    showBorrowModal(book);
}

function showBorrowModal(book) {
    const modal = document.getElementById('borrowModal');
    const bookInfo = document.getElementById('borrowBookInfo');
    const borrowPeriodSelect = document.getElementById('borrowPeriod');
    const customPeriodDiv = document.getElementById('customPeriodDiv');
    
    // Display book information
    bookInfo.innerHTML = `
        <h4>${book.title}</h4>
        <p>by ${book.author}</p>
        <p>Genre: ${book.genre}</p>
        <p>Owner: ${book.owner}</p>
        <p>Condition: ${book.condition}</p>
        ${book.description ? `<p>Description: ${book.description}</p>` : ''}
    `;
    
    // Reset form
    borrowPeriodSelect.value = '14';
    document.getElementById('borrowMessage').value = '';
    customPeriodDiv.style.display = 'none';
    
    // Update expected return date
    updateExpectedReturnDate();
    
    // Show modal
    modal.style.display = 'flex';
    
    // Handle custom period toggle
    borrowPeriodSelect.addEventListener('change', function() {
        if (this.value === 'custom') {
            customPeriodDiv.style.display = 'block';
            document.getElementById('customDays').focus();
        } else {
            customPeriodDiv.style.display = 'none';
        }
        updateExpectedReturnDate();
    });
    
    // Update return date on custom days change
    document.getElementById('customDays').addEventListener('input', updateExpectedReturnDate);
}

function updateExpectedReturnDate() {
    const borrowPeriodSelect = document.getElementById('borrowPeriod');
    const customDays = document.getElementById('customDays');
    const expectedDateSpan = document.getElementById('expectedReturnDate');
    
    let days;
    if (borrowPeriodSelect.value === 'custom') {
        days = parseInt(customDays.value) || 1;
        days = Math.min(Math.max(days, 1), 30); // Ensure 1-30 days
        customDays.value = days;
    } else {
        days = parseInt(borrowPeriodSelect.value);
    }
    
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + days);
    expectedDateSpan.textContent = returnDate.toLocaleDateString();
}

function closeBorrowModal() {
    document.getElementById('borrowModal').style.display = 'none';
    currentBorrowBookId = null;
}

async function submitBorrowRequest() {
    if (!currentBorrowBookId) return;
    
    const borrowPeriodSelect = document.getElementById('borrowPeriod');
    const customDays = document.getElementById('customDays');
    const message = document.getElementById('borrowMessage').value.trim();
    
    let borrowPeriodDays;
    if (borrowPeriodSelect.value === 'custom') {
        borrowPeriodDays = parseInt(customDays.value) || 1;
        borrowPeriodDays = Math.min(Math.max(borrowPeriodDays, 1), 30);
    } else {
        borrowPeriodDays = parseInt(borrowPeriodSelect.value);
    }
    
    try {
        const response = await fetch(`/api/books/${currentBorrowBookId}/request-borrow`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                borrower: currentUser.username, 
                borrowPeriodDays, 
                message 
            })
        });

        const data = await response.json();
        if (data.success) {
            closeBorrowModal();
            alert('Borrow request sent! The owner will be notified and can approve or deny your request.');
        } else {
            alert(data.error || 'Failed to send borrow request');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

async function returnBook(bookId) {
    if (!confirm('Are you sure you want to return this book?')) return;
    
    try {
        const response = await fetch(`/api/books/${bookId}/return`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ returner: currentUser.username })
        });

        const data = await response.json();
        if (data.success) {
            // Book will be updated via Socket.IO
        } else {
            alert(data.error || 'Failed to return book');
        }
    } catch (error) {
        // Fallback to local storage if server is offline
        const book = books.find(b => b.id === bookId);
        book.borrowedBy = null;
        book.returnDate = new Date().toLocaleString();
        localStorage.setItem('books', JSON.stringify(books));
        renderBooks();
        renderMyBooks();
    }
}

async function deleteBook(bookId) {
    if (!confirm('Are you sure you want to permanently delete this book from the library?')) return;

    try {
        const response = await fetch(`/api/books/${bookId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ owner: currentUser.username })
        });

        const data = await response.json();
        if (data.success) {
            // Book will be removed via Socket.IO
        } else {
            alert(data.error || 'Failed to delete book');
        }
    } catch (error) {
        // Fallback to local storage if server is offline
        const index = books.findIndex(b => b.id === bookId);
        books.splice(index, 1);
        localStorage.setItem('books', JSON.stringify(books));
        renderBooks();
    }
}

function renderMyBooks() {
    const borrowedContainer = document.getElementById('borrowedBooks');
    const lentContainer = document.getElementById('lentBooks');

    const myBorrowed = books.filter(b => b.borrowedBy === currentUser.username);
    const myLent = books.filter(b => b.owner === currentUser.username);

    borrowedContainer.innerHTML = myBorrowed.map(book => createBookCard(book)).join('');
    lentContainer.innerHTML = myLent.map(book => createBookCard(book)).join('');
}

function showTab(tabName) {
    document.getElementById('borrowedBooks').style.display = tabName === 'borrowed' ? 'block' : 'none';
    document.getElementById('lentBooks').style.display = tabName === 'lent' ? 'block' : 'none';
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function renderProfile(username) {
    const header = document.getElementById('profileHeader');
    const userBooks = books.filter(b => b.owner === username);
    const borrowedCount = books.filter(b => b.borrowedBy === username).length;
    const returnedCount = books.filter(b => b.owner === username && b.returnDate !== null).length;

    header.innerHTML = `
        <h2>${username}</h2>
        <p>${userBooks.length} Books Added to Library</p>
    `;

    document.getElementById('booksAdded').textContent = userBooks.length;
    document.getElementById('booksBorrowed').textContent = borrowedCount;
    document.getElementById('booksReturned').textContent = returnedCount;

    document.getElementById('userBooks').innerHTML = 
        userBooks.map(book => createBookCard(book)).reverse().join('');
}

function searchBooks() {
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filtered = books.filter(book =>
        book.title.toLowerCase().includes(term) ||
        book.author.toLowerCase().includes(term) ||
        book.genre.toLowerCase().includes(term)
    );
    document.getElementById('booksContainer').innerHTML = 
        filtered.map(book => createBookCard(book)).join('');
}

function updateNavigation() {
    const navLinks = document.getElementById('navLinks');
    const authButtons = document.getElementById('authButtons');
    
    if (currentUser) {
        navLinks.innerHTML = `
            <a href="#" onclick="showPage('feed')">Library Home</a>
            <a href="#" onclick="showPage('myBooks')">My Books</a>
            <a href="#" onclick="showPage('profile', '${currentUser.username}')">My Profile</a>
        `;
        authButtons.innerHTML = `
            <span>Welcome, ${currentUser.username}</span>
            <button onclick="logout()">Logout</button>
        `;
    } else {
        navLinks.innerHTML = '';
        authButtons.innerHTML = `<button onclick="showPage('auth')">Student Login</button>`;
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateNavigation();
    showPage('auth');
}

function clearBookForm() {
    document.getElementById('bookTitle').value = '';
    document.getElementById('bookAuthor').value = '';
    document.getElementById('bookGenre').value = '';
    document.getElementById('bookDescription').value = '';
    document.getElementById('bookISBN').value = '';
}

// Initialize
function init() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        initializeSocket();
        updateNavigation();
        showPage('feed');
    } else {
        showPage('auth');
    }
}

init();
