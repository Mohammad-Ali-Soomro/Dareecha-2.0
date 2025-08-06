// Landing Page JavaScript for GIKI Virtual Library

// Particle Configuration
const particleConfig = {
    particles: {
        number: {
            value: 80,
            density: {
                enable: true,
                value_area: 800
            }
        },
        color: {
            value: ["#d4af37", "#cd7f32", "#800020"]
        },
        shape: {
            type: "circle",
            stroke: {
                width: 0,
                color: "#000000"
            }
        },
        opacity: {
            value: 0.5,
            random: false,
            anim: {
                enable: false,
                speed: 1,
                opacity_min: 0.1,
                sync: false
            }
        },
        size: {
            value: 3,
            random: true,
            anim: {
                enable: false,
                speed: 40,
                size_min: 0.1,
                sync: false
            }
        },
        line_linked: {
            enable: true,
            distance: 150,
            color: "#d4af37",
            opacity: 0.4,
            width: 1
        },
        move: {
            enable: true,
            speed: 2,
            direction: "none",
            random: false,
            straight: false,
            out_mode: "out",
            bounce: false,
            attract: {
                enable: false,
                rotateX: 600,
                rotateY: 1200
            }
        }
    },
    interactivity: {
        detect_on: "canvas",
        events: {
            onhover: {
                enable: true,
                mode: "repulse"
            },
            onclick: {
                enable: true,
                mode: "push"
            },
            resize: true
        },
        modes: {
            grab: {
                distance: 400,
                line_linked: {
                    opacity: 1
                }
            },
            bubble: {
                distance: 400,
                size: 40,
                duration: 2,
                opacity: 8,
                speed: 3
            },
            repulse: {
                distance: 200,
                duration: 0.4
            },
            push: {
                particles_nb: 4
            },
            remove: {
                particles_nb: 2
            }
        }
    },
    retina_detect: true
};

// Literary quotes for the carousel
const literaryQuotes = [
    {
        text: "A room without books is like a body without a soul.",
        author: "Cicero"
    },
    {
        text: "The only thing you absolutely have to know is the location of the library.",
        author: "Albert Einstein"
    },
    {
        text: "Libraries store the energy that fuels the imagination.",
        author: "Sidney Sheldon"
    },
    {
        text: "A library is not a luxury but one of the necessities of life.",
        author: "Henry Ward Beecher"
    },
    {
        text: "I have always imagined that paradise will be a kind of library.",
        author: "Jorge Luis Borges"
    }
];

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', function() {
    initializeParticles();
    initializeQuoteCarousel();
    initializeScrollEffects();
    initializeNavigation();
    initializeAnimations();
    initializeBookInteractions();
    initializeTypewriter();
});

// Initialize Particles.js
function initializeParticles() {
    if (typeof particlesJS !== 'undefined') {
        particlesJS("particles-js", particleConfig);
    } else {
        console.log('Particles.js not loaded, continuing without particles');
    }
}

// Quote Carousel
function initializeQuoteCarousel() {
    const quoteContainer = document.querySelector('.quote-carousel');
    if (!quoteContainer) return;

    let currentQuote = 0;
    
    // Create quote elements
    literaryQuotes.forEach((quote, index) => {
        const quoteElement = document.createElement('div');
        quoteElement.classList.add('quote');
        if (index === 0) quoteElement.classList.add('active');
        
        quoteElement.innerHTML = `
            <p>"${quote.text}"</p>
            <cite>— ${quote.author}</cite>
        `;
        
        quoteContainer.appendChild(quoteElement);
    });

    // Auto-rotate quotes
    setInterval(() => {
        const quotes = document.querySelectorAll('.quote');
        quotes[currentQuote].classList.remove('active');
        currentQuote = (currentQuote + 1) % quotes.length;
        quotes[currentQuote].classList.add('active');
    }, 4000);
}

// Smooth Scroll and Navigation Effects
function initializeScrollEffects() {
    const header = document.querySelector('.landing-header');
    const scrollIndicator = document.querySelector('.scroll-indicator');
    
    // Header scroll effect
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * -0.5;
        
        // Header background opacity
        if (header) {
            if (scrolled > 100) {
                header.style.background = 'rgba(244, 242, 232, 0.98)';
                header.style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
            } else {
                header.style.background = 'rgba(244, 242, 232, 0.95)';
                header.style.boxShadow = 'none';
            }
        }
        
        // Hide scroll indicator after scrolling
        if (scrollIndicator && scrolled > 200) {
            scrollIndicator.style.opacity = '0';
            scrollIndicator.style.pointerEvents = 'none';
        } else if (scrollIndicator) {
            scrollIndicator.style.opacity = '1';
            scrollIndicator.style.pointerEvents = 'auto';
        }
    });
    
    // Scroll indicator click
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const aboutSection = document.querySelector('.about-section');
            if (aboutSection) {
                aboutSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

// Navigation functionality
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    const ctaButtons = document.querySelectorAll('.cta-btn, .primary-btn, .secondary-btn, .cta-primary');
    
    // Smooth scroll for navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                targetSection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // CTA button actions (Microsoft OAuth buttons handle authentication automatically)
}

// Intersection Observer for animations
function initializeAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                
                // Add stagger effect for feature cards
                if (entry.target.classList.contains('feature-card')) {
                    const cards = document.querySelectorAll('.feature-card');
                    cards.forEach((card, index) => {
                        setTimeout(() => {
                            card.style.opacity = '1';
                            card.style.transform = 'translateY(0)';
                        }, index * 200);
                    });
                }
            }
        });
    }, observerOptions);
    
    // Observe elements for scroll animations
    const animateElements = document.querySelectorAll('.feature-card, .elegant-text');
    animateElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });
}

// Book Stack Interactions
function initializeBookInteractions() {
    const books = document.querySelectorAll('.book');
    const bookTitles = [
        "Classical Literature",
        "Modern Poetry",
        "Philosophy",
        "Science & Tech"
    ];
    
    books.forEach((book, index) => {
        // Add book titles
        const spine = book.querySelector('.book-spine');
        if (spine && bookTitles[index]) {
            spine.textContent = bookTitles[index];
        }
        
        // Book hover effects
        book.addEventListener('mouseenter', () => {
            book.style.transform = `${book.style.transform.replace(/translateY\([^)]*\)/, '')} translateY(-15px) scale(1.05)`;
            book.style.zIndex = '10';
            
            // Add glow effect
            book.style.filter = 'brightness(1.1) drop-shadow(0 0 20px rgba(212, 175, 55, 0.6))';
        });
        
        book.addEventListener('mouseleave', () => {
            book.style.transform = book.style.transform.replace(/translateY\([^)]*\) scale\([^)]*\)/, '');
            book.style.zIndex = '';
            book.style.filter = '';
        });
        
        // Book click effect
        book.addEventListener('click', () => {
            createBookClickEffect(book);
        });
    });
}

// Create book click effect
function createBookClickEffect(book) {
    // Create floating pages effect
    for (let i = 0; i < 5; i++) {
        const page = document.createElement('div');
        page.innerHTML = '📄';
        page.style.position = 'absolute';
        page.style.pointerEvents = 'none';
        page.style.zIndex = '1000';
        page.style.fontSize = '1.5rem';
        
        const rect = book.getBoundingClientRect();
        page.style.left = rect.left + rect.width / 2 + 'px';
        page.style.top = rect.top + rect.height / 2 + 'px';
        
        document.body.appendChild(page);
        
        // Animate page
        const angle = (i * 72) * Math.PI / 180; // 360/5 degrees apart
        const distance = 100 + Math.random() * 50;
        const endX = Math.cos(angle) * distance;
        const endY = Math.sin(angle) * distance;
        
        page.animate([
            { 
                transform: 'translate(-50%, -50%) scale(0) rotate(0deg)',
                opacity: 1 
            },
            { 
                transform: `translate(calc(-50% + ${endX}px), calc(-50% + ${endY}px)) scale(1) rotate(${Math.random() * 360}deg)`,
                opacity: 0 
            }
        ], {
            duration: 1000 + Math.random() * 500,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }).onfinish = () => {
            page.remove();
        };
    }
    
    // Book shake animation
    book.animate([
        { transform: book.style.transform },
        { transform: book.style.transform + ' rotate(5deg)' },
        { transform: book.style.transform + ' rotate(-5deg)' },
        { transform: book.style.transform + ' rotate(2deg)' },
        { transform: book.style.transform }
    ], {
        duration: 500,
        easing: 'ease-in-out'
    });
}

// Typewriter effect for hero title (optional enhancement)
function initializeTypewriter() {
    const titleLines = document.querySelectorAll('.title-line');
    
    titleLines.forEach((line, index) => {
        const text = line.textContent;
        line.textContent = '';
        line.style.opacity = '1';
        
        // Typewriter effect with delay
        setTimeout(() => {
            let i = 0;
            const typeInterval = setInterval(() => {
                if (i < text.length) {
                    line.textContent += text.charAt(i);
                    i++;
                } else {
                    clearInterval(typeInterval);
                }
            }, 100);
        }, index * 1000 + 500);
    });
}

// Stats counter animation
function initializeStatsCounter() {
    const stats = document.querySelectorAll('.stat-number');
    const statsValues = [1000, 50, 24]; // Books, Students, Hours
    
    const observerOptions = {
        threshold: 0.5
    };
    
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const stat = entry.target;
                const finalValue = parseInt(stat.textContent.replace(/\D/g, ''));
                
                animateCounter(stat, 0, finalValue, 2000);
                statsObserver.unobserve(stat);
            }
        });
    }, observerOptions);
    
    stats.forEach(stat => {
        statsObserver.observe(stat);
    });
}

// Counter animation helper
function animateCounter(element, start, end, duration) {
    const startTime = Date.now();
    const originalText = element.textContent;
    const suffix = originalText.replace(/[\d,]/g, '');
    
    function updateCounter() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(start + (end - start) * easeOutQuart);
        
        element.textContent = current.toLocaleString() + suffix;
        
        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        }
    }
    
    requestAnimationFrame(updateCounter);
}

// Floating elements animation
function createFloatingElements() {
    const floatingContainer = document.querySelector('.floating-pages');
    if (!floatingContainer) return;
    
    const symbols = ['📚', '📖', '📜', '✒️', '🖋️'];
    
    setInterval(() => {
        if (Math.random() > 0.3) return; // 30% chance to create element
        
        const element = document.createElement('div');
        element.textContent = symbols[Math.floor(Math.random() * symbols.length)];
        element.style.position = 'absolute';
        element.style.fontSize = '2rem';
        element.style.opacity = '0';
        element.style.pointerEvents = 'none';
        element.style.zIndex = '5';
        
        // Random starting position
        element.style.left = Math.random() * 100 + '%';
        element.style.top = '110%';
        
        floatingContainer.appendChild(element);
        
        // Animate upward
        element.animate([
            { 
                transform: 'translateY(0) rotate(0deg)', 
                opacity: 0.7 
            },
            { 
                transform: 'translateY(-200px) rotate(360deg)', 
                opacity: 0 
            }
        ], {
            duration: 3000 + Math.random() * 2000,
            easing: 'linear'
        }).onfinish = () => {
            element.remove();
        };
    }, 2000);
}

// Parallax effect for hero section
function initializeParallax() {
    const heroSection = document.querySelector('.hero');
    const bookStack = document.querySelector('.book-stack');
    
    if (!heroSection || !bookStack) return;
    
    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        const rate = scrolled * -0.5;
        
        // Parallax effect for book stack
        bookStack.style.transform = `translateY(${rate}px)`;
    });
}

// Add loading animation
function addLoadingAnimation() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    
    hero.style.opacity = '0';
    
    window.addEventListener('load', () => {
        hero.style.transition = 'opacity 1s ease-in-out';
        hero.style.opacity = '1';
    });
}

// Initialize all effects when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize stats counter
    setTimeout(initializeStatsCounter, 1000);
    
    // Initialize floating elements
    setTimeout(createFloatingElements, 2000);
    
    // Initialize parallax
    initializeParallax();
    
    // Add loading animation
    addLoadingAnimation();
});

// Error handling for particles.js
window.addEventListener('error', (e) => {
    if (e.message.includes('particlesJS')) {
        console.log('Particles.js failed to load, continuing without particle effects');
    }
});

// Global functions for HTML onclick handlers
function scrollToFeatures() {
    const featuresSection = document.querySelector('.features-section');
    if (featuresSection) {
        featuresSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Export functions for potential external use
window.landingPageFunctions = {
    initializeParticles,
    initializeQuoteCarousel,
    createBookClickEffect,
    animateCounter,
    scrollToFeatures
};

// Make function globally available
window.scrollToFeatures = scrollToFeatures;
