-- Basic Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT,
    profile_image TEXT,
    phone TEXT,
    company TEXT,
    verified INTEGER,
    status TEXT NOT NULL DEFAULT 'active'
);

-- Update events table
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    category TEXT NOT NULL,
    ticket_price REAL DEFAULT 0,
    is_virtual INTEGER DEFAULT 0,
    registration_deadline TEXT,
    organizer_id TEXT NOT NULL,
    status TEXT DEFAULT 'published',
    created_at TEXT NOT NULL,
    FOREIGN KEY (organizer_id) REFERENCES users(id)
);

-- Basic Event sessions table
CREATE TABLE event_sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    speaker TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    capacity INTEGER,
    type TEXT
);

-- Update Registrations table
CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    user_id TEXT,
    status TEXT NOT NULL,
    registration_time TEXT NOT NULL, -- This is the correct column name
    payment_status TEXT,
    payment_id TEXT,
    ticket_type TEXT,
    amount_paid REAL,
    qr_code TEXT,
    check_in_time TEXT,
    feedback_submitted INTEGER,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Basic Vendor booths table
CREATE TABLE vendor_booths (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    vendor_id TEXT,
    booth_number TEXT,
    location TEXT,
    description TEXT,
    status TEXT,
    setup_time TEXT,
    teardown_time TEXT,
    created_at TEXT
);

-- Basic Vendor products table
CREATE TABLE vendor_products (
    id TEXT PRIMARY KEY,
    booth_id TEXT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    stock_quantity INTEGER,
    category TEXT,
    image_url TEXT,
    created_at TEXT
);

-- Basic Sales transactions table
CREATE TABLE sales_transactions (
    id TEXT PRIMARY KEY,
    booth_id TEXT,
    product_id TEXT,
    buyer_id TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_amount REAL NOT NULL,
    payment_method TEXT,
    status TEXT,
    transaction_time TEXT
);

-- Basic Event feedback table
CREATE TABLE event_feedback (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    user_id TEXT,
    rating INTEGER,
    feedback_text TEXT,
    anonymous INTEGER,
    created_at TEXT
);

-- Basic Vendor ratings table
CREATE TABLE vendor_ratings (
    id TEXT PRIMARY KEY,
    booth_id TEXT,
    user_id TEXT,
    rating INTEGER,
    review_text TEXT,
    created_at TEXT
);

-- Basic Announcements table
CREATE TABLE announcements (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT,
    created_at TEXT,
    created_by TEXT
);
