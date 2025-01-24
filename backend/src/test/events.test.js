import { expect } from 'chai';
import request from 'supertest';
import { app } from '../index.js';
import db from '../db/index.js';
import jwt from 'jsonwebtoken';

describe('Event Routes', () => {
  let adminToken;
  let organizerToken;
  
  before(async () => {
    // Create test users
    const adminId = crypto.randomUUID();
    const organizerId = crypto.randomUUID();
    
    await db.exec(`
      INSERT INTO users (id, name, email, password, role, status) 
      VALUES 
      (?, 'Admin', 'admin@test.com', 'hashedpass', 'admin', 'active'),
      (?, 'Organizer', 'organizer@test.com', 'hashedpass', 'organizer', 'active')
    `, [adminId, organizerId]);

    // Generate tokens
    adminToken = jwt.sign(
      { id: adminId, role: 'admin' },
      process.env.JWT_SECRET || 'your-secret-key'
    );

    organizerToken = jwt.sign(
      { id: organizerId, role: 'organizer' },
      process.env.JWT_SECRET || 'your-secret-key'
    );
  });

  after(async () => {
    // Clean up test data
    await db.exec('DELETE FROM events');
    await db.exec('DELETE FROM users WHERE email IN (?, ?)', 
      ['admin@test.com', 'organizer@test.com']
    );
  });

  describe('POST /api/events', () => {
    it('should create an event when valid data is provided by organizer', async () => {
      // Get tomorrow's date in YYYY-MM-DD format
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const eventData = {
        title: 'Test Event',
        description: 'Test Description for the event',
        date: tomorrowStr,
        location: 'Test Venue',
        capacity: 100,
        category: 'academic',
        ticket_price: 50,
        is_virtual: false
      };

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData);

      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body.title).to.equal(eventData.title);
    });

    it('should return 400 when required fields are missing', async () => {
      const invalidData = {
        title: 'Test Event'
        // Missing required fields
      };

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(invalidData);

      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });

    it('should return 400 when date is in the past', async () => {
      const eventData = {
        title: 'Past Event',
        description: 'Test Description for past event',
        date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
        location: 'Test Venue',
        capacity: 100,
        category: 'conference',
        ticket_price: 50,
        is_virtual: false
      };

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`)
        .send(eventData);

      expect(res.status).to.equal(400);
      expect(res.body.error).to.equal('Validation error');
    });

    it('should return 403 when non-organizer tries to create event', async () => {
      const eventData = {
        title: 'Test Event',
        description: 'Test Description',
        date: new Date(Date.now() + 86400000).toISOString(),
        location: 'Test Venue',
        capacity: 100,
        category: 'conference',
        ticket_price: 50
      };

      const attendeeToken = jwt.sign(
        { id: crypto.randomUUID(), role: 'attendee' },
        process.env.JWT_SECRET || 'your-secret-key'
      );

      const res = await request(app)
        .post('/api/events')
        .set('Authorization', `Bearer ${attendeeToken}`)
        .send(eventData);

      expect(res.status).to.equal(403);
    });
  });

  describe('GET /api/events', () => {
    let testEventId;

    before(async () => {
      // Create a test event
      testEventId = crypto.randomUUID();
      await db.exec(`
        INSERT INTO events (id, title, description, date, location, capacity, category, 
                          ticket_price, organizer_id, status, created_at)
        VALUES (?, 'Test Event', 'Description', ?, 'Venue', 100, 'conference', 50.00,
               (SELECT id FROM users WHERE email = 'organizer@test.com'),
               'published', datetime('now'))
      `, [testEventId, new Date(Date.now() + 86400000).toISOString()]);
    });

    it('should list all published events', async () => {
      const res = await request(app)
        .get('/api/events')
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.be.at.least(1);
      expect(res.body[0]).to.have.property('id');
    });

    it('should filter events by category', async () => {
      const res = await request(app)
        .get('/api/events')
        .query({ category: 'conference' })
        .set('Authorization', `Bearer ${organizerToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
      expect(res.body[0].category).to.equal('conference');
    });
  });
});
