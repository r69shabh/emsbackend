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
    verified INTEGER
);

-- Basic Events table
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    end_date TEXT,
    location TEXT,
    venue_map TEXT,
    organizer_id TEXT,
    category TEXT NOT NULL,
    capacity INTEGER,
    ticket_price REAL,
    is_virtual INTEGER,
    virtual_link TEXT,
    registration_deadline TEXT,
    status TEXT,
    banner_image TEXT,
    created_at TEXT,
    updated_at TEXT
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

-- Basic Registrations table
CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    user_id TEXT,
    status TEXT NOT NULL,
    registration_time TEXT,
    payment_status TEXT,
    payment_id TEXT,
    ticket_type TEXT,
    amount_paid REAL,
    qr_code TEXT,
    check_in_time TEXT,
    feedback_submitted INTEGER
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
