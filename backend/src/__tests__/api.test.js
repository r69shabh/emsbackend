import { expect } from 'chai';
import request from 'supertest';
import { app, db } from '../index.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

describe('Authentication API', () => {
  before(() => {
    // Clear test database
    db.exec('DELETE FROM registrations');
    db.exec('DELETE FROM events');
    db.exec('DELETE FROM users');
  });

  after(() => {
    db.close();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'attendee'
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('token');
      expect(res.body.user).to.have.property('id');
      expect(res.body.user.email).to.equal('test@example.com');
    });

    it('should reject registration with invalid data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'invalid-email',
          password: '123',
          role: 'invalid'
        });

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });
  });

  describe('POST /api/auth/login', () => {
    before(async () => {
      const hashedPassword = await bcrypt.hash('password123', 10);
      db.prepare(`
        INSERT INTO users (id, name, email, password, role)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'test-user-id',
        'Test User',
        'login@example.com',
        hashedPassword,
        'attendee'
      );
    });

    it('should login successfully with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123'
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
      expect(res.body.user.email).to.equal('login@example.com');
    });

    it('should reject login with invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword'
        });

      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });
});

describe('Events API', () => {
  let authToken;
  let eventId;

  before(async () => {
    // Create test user and get auth token
    const hashedPassword = await bcrypt.hash('password123', 10);
    db.prepare(`
      INSERT INTO users (id, name, email, password, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'organizer-id',
      'Organizer',
      'organizer@example.com',
      hashedPassword,
      'organizer'
    );

    authToken = jwt.sign(
      { id: 'organizer-id', email: 'organizer@example.com', role: 'organizer' },
      process.env.JWT_SECRET || 'your-secret-key'
    );
  });

  describe('POST /api/events', () => {
    it('should create a new event successfully', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Event',
          description: 'Test Description',
          date: '2024-12-25',
          location: 'Test Location',
          category: 'academic',
          capacity: 100
        });

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      eventId = res.body.id;
    });

    it('should reject event creation with invalid data', async () => {
      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'T',
          date: 'invalid-date',
          category: 'invalid'
        });

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /api/events', () => {
    it('should fetch events successfully', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
    });

    it('should filter events by category', async () => {
      const res = await request(app)
        .get('/api/events?category=academic')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0].category).to.equal('academic');
    });
  });

  describe('POST /api/events/:id/register', () => {
    it('should register for an event successfully', async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/register`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('registrationId');
      expect(res.body).to.have.property('qrCode');
    });

    it('should prevent duplicate registrations', async () => {
      const res = await request(app)
        .post(`/api/events/${eventId}/register`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(400);
      expect(res.body.error).to.equal('Already registered for this event');
    });
  });
});

describe('User Events API', () => {
  let authToken;

  before(() => {
    authToken = jwt.sign(
      { id: 'organizer-id', email: 'organizer@example.com', role: 'organizer' },
      process.env.JWT_SECRET || 'your-secret-key'
    );
  });

  describe('GET /api/user/registered-events', () => {
    it('should fetch user\'s registered events', async () => {
      const res = await request(app)
        .get('/api/user/registered-events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });

  describe('GET /api/user/organized-events', () => {
    it('should fetch organizer\'s events', async () => {
      const res = await request(app)
        .get('/api/user/organized-events')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.greaterThan(0);
    });
  });
});