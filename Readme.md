# College Event Management System

A comprehensive system for managing college events, including event creation, registration, and attendance tracking.

## Core Features

- User authentication and authorization (Admin, Organizer, Attendee roles)
- Event management (CRUD operations)
- Event registration with QR code generation
- Event filtering and search
- Attendance tracking
- User profile management

## Project Structure

```
college-event-system/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   └── index.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── events.js
│   │   │   └── users.js
│   │   ├── index.js
│   │   └── test.js
│   └── package.json
└── package.json
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin', 'organizer', 'attendee')) NOT NULL
);
```

### Events Table
```sql
CREATE TABLE events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    location TEXT NOT NULL,
    organizer_id TEXT NOT NULL,
    category TEXT NOT NULL,
    capacity INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organizer_id) REFERENCES users (id)
);
```

### Registrations Table
```sql
CREATE TABLE registrations (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT CHECK(status IN ('pending', 'confirmed', 'cancelled')) NOT NULL,
    registration_date TEXT DEFAULT CURRENT_TIMESTAMP,
    qr_code TEXT,
    FOREIGN KEY (event_id) REFERENCES events (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
```

## Setup

1. Clone the repository
```bash
git clone [repository-url]
cd college-event-system
```

2. Install dependencies
```bash
npm install
```

3. Start the server
```bash
npm run dev
```

## API Documentation

### Authentication

#### Register User
```
POST /api/auth/register
Body: {
    "name": "string",
    "email": "string",
    "password": "string",
    "role": "admin" | "organizer" | "attendee"
}
```

#### Login
```
POST /api/auth/login
Body: {
    "email": "string",
    "password": "string"
}
```

### Events

#### Get All Events
```
GET /api/events
Query Parameters:
    - category: "academic" | "cultural" | "sports" | "technical"
    - search: string
    - date: YYYY-MM-DD
```

#### Get Event by ID
```
GET /api/events/:id
```

#### Create Event
```
POST /api/events
Body: {
    "title": "string",
    "description": "string",
    "date": "YYYY-MM-DD",
    "location": "string",
    "category": "academic" | "cultural" | "sports" | "technical",
    "capacity": number
}
```

#### Update Event
```
PUT /api/events/:id
Body: {
    "title": "string",
    "description": "string",
    "date": "YYYY-MM-DD",
    "location": "string",
    "category": "academic" | "cultural" | "sports" | "technical",
    "capacity": number
}
```

#### Delete Event
```
DELETE /api/events/:id
```

### Event Registration

#### Register for Event
```
POST /api/events/:id/register
```

#### Cancel Registration
```
DELETE /api/events/:id/register
```

#### Get Event Attendees
```
GET /api/events/:id/attendees
```

### User Management

#### Get User Profile
```
GET /api/users/profile
```

#### Update User Profile
```
PUT /api/users/profile
Body: {
    "name": "string"
}
```

#### Get User's Registered Events
```
GET /api/users/registered-events
```

#### Get User's Organized Events
```
GET /api/users/organized-events
```

## Testing

Run the test suite:
```bash
npm test
```