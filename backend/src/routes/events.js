import express from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import db from '../db/index.js';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { randomUUID } from 'crypto';
import { redis } from '../index.js';
import pkg from 'sanitize-html';
const { sanitizeHtml } = pkg;

const router = express.Router();

const CACHE_TTL = 300; // 5 minutes in seconds

// Update schema definition
const eventSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(3).max(1000),
  date: z.string().refine(val => {
    const eventDate = new Date(val);
    const today = new Date();
    // Set both dates to start of day for comparison
    today.setHours(0, 0, 0, 0);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate >= today;
  }, { message: "Event date must be today or in the future" }),
  location: z.string().min(3).max(200),
  capacity: z.number().int().positive(),
  category: z.enum(['conference', 'workshop', 'seminar', 'networking', 'other', 'academic']),
  ticket_price: z.number().nonnegative().default(0),
  is_virtual: z.boolean().optional().default(false),
  registration_deadline: z.string().optional()
});

// Get all events with filters and caching
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search, date } = req.query;
    const cacheKey = `events:${category || 'all'}:${search || 'none'}:${date || 'all'}`;
    
    // Try to get from cache first
    const cachedEvents = await redis.get(cacheKey);
    if (cachedEvents) {
      return res.json(JSON.parse(cachedEvents));
    }
    
    let sql = `
      SELECT e.*, u.name as organizer_name,
             (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'confirmed') as registered_count,
             (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'waitlist') as waitlist_count
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      WHERE e.date >= CURRENT_DATE
    `;
    const params = [];

    if (category && category !== 'all') {
      sql += ' AND e.category = ?';
      params.push(category);
    }

    if (search) {
      sql += ' AND (e.title LIKE ? OR e.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (date) {
      sql += ' AND e.date = ?';
      params.push(date);
    }

    sql += ' ORDER BY e.date ASC';

    const events = await db.query(sql, params);
    
    // Cache the results
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(events));
    
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get event by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const events = await db.query(
      `SELECT e.*, u.name as organizer_name,
              (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'confirmed') as registered_count,
              (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'waitlist') as waitlist_count
       FROM events e
       JOIN users u ON e.organizer_id = u.id
       WHERE e.id = ?`,
      [id]
    );

    if (events.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const event = events[0];
    
    // Check if user is registered
    const registrations = await db.query(
      'SELECT * FROM registrations WHERE event_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    
    event.isRegistered = registrations.length > 0;
    
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Update create event route
router.post('/', authenticateToken, authorize(['admin', 'organizer']), async (req, res) => {
  try {
    console.log('Received event data:', req.body);
    
    // Convert fields to expected types
    const normalizedData = {
      ...req.body,
      capacity: Number(req.body.capacity),
      ticket_price: Number(req.body.ticket_price || 0),
      is_virtual: Boolean(req.body.is_virtual),
      registration_deadline: req.body.registration_deadline || null // Add default value
    };

    const validatedData = eventSchema.parse(normalizedData);
    const eventId = randomUUID();

    await db.exec(
      `INSERT INTO events (
        id, title, description, date, location, capacity, 
        category, ticket_price, is_virtual, registration_deadline,
        organizer_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        eventId,
        validatedData.title,
        validatedData.description,
        validatedData.date,
        validatedData.location,
        validatedData.capacity,
        validatedData.category,
        validatedData.ticket_price,
        validatedData.is_virtual ? 1 : 0,
        validatedData.registration_deadline || null, // Ensure null if not provided
        req.user.id,
        'published'
      ]
    );

    const [createdEvent] = await db.query(
      'SELECT * FROM events WHERE id = ?',
      [eventId]
    );

    res.status(201).json(createdEvent);
  } catch (error) {
    console.error('Event creation error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/:id', authenticateToken, authorize(['admin', 'organizer']), async (req, res) => {
  try {
    const { id } = req.params;
    const validatedData = eventSchema.parse(req.body);

    // Check if user is the organizer
    const events = await db.query(
      'SELECT * FROM events WHERE id = ? AND organizer_id = ?',
      [id, req.user.id]
    );

    if (events.length === 0) {
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }

    await db.exec(
      `UPDATE events 
       SET title = ?, description = ?, date = ?, location = ?, category = ?, 
           capacity = ?, ticket_price = ?, is_virtual = ?, registration_deadline = ?
       WHERE id = ?`,
      [
        validatedData.title,
        validatedData.description,
        validatedData.date,
        validatedData.location,
        validatedData.category,
        validatedData.capacity,
        validatedData.ticket_price,
        validatedData.is_virtual,
        validatedData.registration_deadline,
        id
      ]
    );

    res.json({ message: 'Event updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/:id', authenticateToken, authorize(['admin', 'organizer']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is the organizer
    const events = await db.query(
      'SELECT * FROM events WHERE id = ? AND organizer_id = ?',
      [id, req.user.id]
    );

    if (events.length === 0) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }

    // Delete registrations first
    await db.exec('DELETE FROM registrations WHERE event_id = ?', [id]);
    // Then delete the event
    await db.exec('DELETE FROM events WHERE id = ?', [id]);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// Register for an event with waitlist support
router.post('/:id/register', authenticateToken, async (req, res) => {
  const { id: eventId } = req.params;
  const userId = req.user.id;

  try {
    // Start transaction
    await db.exec('BEGIN');
    
    // Check if already registered
    const existingReg = await db.query(
      'SELECT * FROM registrations WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );
    
    if (existingReg.length > 0) {
      await db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Already registered for this event' });
    }
    
    // Get event details with current registration count
    const [event] = await db.query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM registrations 
               WHERE event_id = e.id AND status = 'confirmed') as registered_count
       FROM events e WHERE e.id = ?`,
      [eventId]
    );
    
    if (!event) {
      await db.exec('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Check if registration deadline has passed
    if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
      await db.exec('ROLLBACK');
      return res.status(400).json({ error: 'Registration deadline has passed' });
    }
    
    // Determine registration status
    const status = event.registered_count < event.capacity ? 'confirmed' : 'waitlist';
    const registrationId = randomUUID();
    
    // Create registration
    await db.exec(
      `INSERT INTO registrations (id, event_id, user_id, status, registration_time)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [registrationId, eventId, userId, status]
    );
    
    // Generate QR code if confirmed
    let qrCode = null;
    if (status === 'confirmed') {
      qrCode = await QRCode.toDataURL(registrationId);
      await db.exec(
        'UPDATE registrations SET qr_code = ? WHERE id = ?',
        [qrCode, registrationId]
      );
    }
    
    await db.exec('COMMIT');
    
    // Invalidate cache
    await redis.del(`events:*`);
    
    res.json({
      message: status === 'confirmed' 
        ? 'Successfully registered for the event' 
        : 'Added to waitlist',
      status,
      qrCode,
      position: status === 'waitlist' ? event.registered_count - event.capacity + 1 : null
    });
    
  } catch (error) {
    await db.exec('ROLLBACK');
    console.error('Error registering for event:', error);
    res.status(500).json({ error: 'Failed to register for event' });
  }
});

// Cancel registration
router.delete('/:id/register', authenticateToken, async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.id;

    const result = await db.exec(
      'DELETE FROM registrations WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    res.json({ message: 'Registration cancelled successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to cancel registration' });
  }
});

// Get event attendees (organizer only)
router.get('/:id/attendees', authenticateToken, authorize(['admin', 'organizer']), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is the organizer
    const events = await db.query(
      'SELECT * FROM events WHERE id = ? AND organizer_id = ?',
      [id, req.user.id]
    );

    if (events.length === 0) {
      return res.status(403).json({ error: 'Not authorized to view attendees' });
    }

    const attendees = await db.query(
      `SELECT u.id, u.name, u.email, r.registration_time, r.status
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       WHERE r.event_id = ?
       ORDER BY r.registration_time DESC`,
      [id]
    );

    res.json(attendees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendees' });
  }
});

export default router;
