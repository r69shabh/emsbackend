
# Event Management System Backend

A comprehensive backend system for managing events, vendors, registrations, and sales. The system supports multiple user roles and portal-specific access control.

## 🌟 Features

### Authentication & Authorization
- Multi-portal authentication system (Admin, Vendor, Organizer, Attendee)
- Role-based access control
- Session management with Redis
- Secure token-based authentication
- Admin-controlled user management

### Event Management
- Comprehensive event creation and management
- Multi-day event support with sessions
- Registration system with waitlist functionality
- QR code generation for tickets
- Event feedback and ratings

### Vendor Management
- Booth application and approval system
- Product management
- Real-time sales tracking
- Sales analytics and reporting
- Vendor ratings and reviews

### Admin Dashboard
- System-wide analytics
- User management and role control
- Vendor application processing
- Event monitoring
- System health tracking

## 🏗 System Architecture

### Database Schema
```sql
Key Tables:
- users (role-based access control)
- events (event management)
- event_sessions (multi-day events)
- registrations (with waitlist)
- vendor_booths
- vendor_products
- sales_transactions
- feedback and ratings
```

### Portal Access Matrix
| Portal    | Allowed Roles                    |
|-----------|----------------------------------|
| Admin     | admin                            |
| Vendor    | vendor                           |
| Organizer | organizer                        |
| Attendee  | attendee, organizer, admin       |

## 🚀 Getting Started

### Prerequisites
- Node.js >= 14
- Redis server
- SQLite3

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/event-management-system.git
cd event-management-system
```

2. Install dependencies:
```bash
cd backend
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Initialize the database:
```bash
sqlite3 database.db < src/db/schema.sql
```

5. Start Redis server:
```bash
brew services start redis
```

6. Start the server:
```bash
npm run dev
```

## 📚 API Documentation

### Authentication

#### Public Registration (Attendees)
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepass"
}
```

#### Portal Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password",
  "portal": "vendor"  // admin, vendor, organizer, or attendee
}
```

### Admin Routes

#### Create User (Admin only)
```http
POST /api/auth/users
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Vendor Name",
  "email": "vendor@company.com",
  "role": "vendor",
  "company": "Company Name"
}
```

#### Update User Role (Admin only)
```http
PUT /api/auth/users/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "vendor",
  "status": "active"
}
```

### Event Management

#### Create Event
```http
POST /api/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Tech Conference 2024",
  "description": "Annual tech conference",
  "date": "2024-06-15",
  "location": "Convention Center",
  "capacity": 500
}
```

### Vendor Management

#### Apply for Booth
```http
POST /api/vendors/booths
Authorization: Bearer <token>
Content-Type: application/json

{
  "eventId": "event-uuid",
  "boothNumber": "A1",
  "description": "Tech gadgets booth"
}
```

## 🔒 Security Features

- JWT token authentication
- Redis session management
- Role-based access control
- Input validation with Zod
- Request rate limiting
- Secure password hashing
- XSS protection
- SQL injection prevention

## 💻 Development

### Project Structure
```
backend/
├── src/
│   ├── db/
│   │   └── schema.sql
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js
│   │   ├── events.js
│   │   ├── users.js
│   │   └── vendors.js
│   └── index.js
├── package.json
└── README.md
```

### Running Tests
```bash
npm test
```

### Environment Variables
```
PORT=3000
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

## 📈 Monitoring

The system includes built-in monitoring endpoints:

- `/health` - System health check
- `/api/admin/system-health` - Detailed system status (Admin only)
- `/api/admin/analytics` - System-wide analytics (Admin only)

## 🔄 Error Handling

The system implements comprehensive error handling:
- Validation errors
- Authentication errors
- Authorization errors
- Business logic errors
- System errors

## 🚧 Future Enhancements

- Email notification system
- Payment gateway integration
- OAuth support
- Advanced analytics
- Mobile app integration
- Real-time event updates
- Automated waitlist management

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request
