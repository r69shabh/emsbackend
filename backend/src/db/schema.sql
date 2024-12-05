-- Users table with roles
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'organizer', 'attendee', 'vendor')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    profile_image TEXT,
    phone TEXT,
    company TEXT,
    verified BOOLEAN DEFAULT FALSE
);

-- Events table with enhanced fields
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    end_date DATE,
    location TEXT,
    venue_map TEXT,
    organizer_id TEXT REFERENCES users(id),
    category TEXT CHECK(category IN ('academic', 'cultural', 'sports', 'technical', 'workshop', 'conference')) NOT NULL,
    capacity INTEGER,
    ticket_price DECIMAL(10,2),
    is_virtual BOOLEAN DEFAULT FALSE,
    virtual_link TEXT,
    registration_deadline DATE,
    status TEXT CHECK(status IN ('draft', 'published', 'cancelled', 'completed')) DEFAULT 'draft',
    banner_image TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event sessions for multi-day events
CREATE TABLE IF NOT EXISTS event_sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    speaker TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    location TEXT,
    capacity INTEGER,
    type TEXT CHECK(type IN ('talk', 'workshop', 'panel', 'networking', 'other'))
);

-- Registrations with enhanced tracking
CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    status TEXT CHECK(status IN ('confirmed', 'waitlist', 'cancelled', 'attended')) NOT NULL,
    registration_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payment_status TEXT CHECK(payment_status IN ('pending', 'completed', 'refunded', 'failed')),
    payment_id TEXT,
    ticket_type TEXT CHECK(ticket_type IN ('regular', 'vip', 'student', 'early_bird')),
    amount_paid DECIMAL(10,2),
    qr_code TEXT,
    check_in_time TIMESTAMP,
    feedback_submitted BOOLEAN DEFAULT FALSE
);

-- Vendor booths
CREATE TABLE IF NOT EXISTS vendor_booths (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    vendor_id TEXT REFERENCES users(id),
    booth_number TEXT,
    location TEXT,
    description TEXT,
    status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'active', 'closed')),
    setup_time TIMESTAMP,
    teardown_time TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendor products
CREATE TABLE IF NOT EXISTS vendor_products (
    id TEXT PRIMARY KEY,
    booth_id TEXT REFERENCES vendor_booths(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER,
    category TEXT,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sales transactions
CREATE TABLE IF NOT EXISTS sales_transactions (
    id TEXT PRIMARY KEY,
    booth_id TEXT REFERENCES vendor_booths(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES vendor_products(id),
    buyer_id TEXT REFERENCES users(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'mobile_payment')),
    status TEXT CHECK(status IN ('completed', 'refunded', 'failed')),
    transaction_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event feedback
CREATE TABLE IF NOT EXISTS event_feedback (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    feedback_text TEXT,
    anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vendor ratings
CREATE TABLE IF NOT EXISTS vendor_ratings (
    id TEXT PRIMARY KEY,
    booth_id TEXT REFERENCES vendor_booths(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id),
    rating INTEGER CHECK(rating BETWEEN 1 AND 5),
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Event announcements
CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    event_id TEXT REFERENCES events(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT REFERENCES users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_registrations_event_user ON registrations(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_booths_event ON vendor_booths(event_id);
CREATE INDEX IF NOT EXISTS idx_sales_booth_time ON sales_transactions(booth_id, transaction_time);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON event_sessions(event_id);
