import express from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import db from '../db/index.js';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { randomUUID } from 'crypto';

const router = express.Router();

const eventSchema = z.object({
  title: z.string().min(3),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string(),
  category: z.enum(['academic', 'cultural', 'sports', 'technical']),
  capacity: z.number().int().positive()
});

// Get all events with filters
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category, search, date } = req.query;
    let sql = `
      SELECT e.*, u.name as organizer_name,
             (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'confirmed') as registered_count
      FROM events e
      JOIN users u ON e.organizer_id = u.id
      WHERE 1=1
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
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get event by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const events = await db.query(
      `SELECT e.*, u.name as organizer_name,
              (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'confirmed') as registered_count
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

// Create event
router.post('/', authenticateToken, authorize(['admin', 'organizer']), async (req, res) => {
  try {
    const validatedData = eventSchema.parse(req.body);
    const eventId = randomUUID();

    await db.exec(
      `INSERT INTO events (id, title, description, date, location, organizer_id, category, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        validatedData.title,
        validatedData.description,
        validatedData.date,
        validatedData.location,
        req.user.id,
        validatedData.category,
        validatedData.capacity
      ]
    );

    res.status(201).json({ id: eventId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
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
       SET title = ?, description = ?, date = ?, location = ?, category = ?, capacity = ?
       WHERE id = ?`,
      [
        validatedData.title,
        validatedData.description,
        validatedData.date,
        validatedData.location,
        validatedData.category,
        validatedData.capacity,
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

// Register for event
router.post('/:id/register', authenticateToken, async (req, res) => {
  try {
    const { id: eventId } = req.params;
    const userId = req.user.id;

    const events = await db.query('SELECT * FROM events WHERE id = ?', [eventId]);
    const event = events[0];
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const registrationCount = await db.query(
      'SELECT COUNT(*) as count FROM registrations WHERE event_id = ? AND status = "confirmed"',
      [eventId]
    );

    if (registrationCount[0].count >= event.capacity) {
      return res.status(400).json({ error: 'Event is at full capacity' });
    }

    const existingRegistration = await db.query(
      'SELECT * FROM registrations WHERE event_id = ? AND user_id = ?',
      [eventId, userId]
    );

    if (existingRegistration.length > 0) {
      return res.status(400).json({ error: 'Already registered for this event' });
    }

    const registrationId = randomUUID();
    const qrCode = await QRCode.toDataURL(registrationId);

    await db.exec(
      'INSERT INTO registrations (id, event_id, user_id, status, qr_code) VALUES (?, ?, ?, ?, ?)',
      [registrationId, eventId, userId, 'confirmed', qrCode]
    );

    res.status(201).json({ registrationId, qrCode });
  } catch (error) {
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
      `SELECT u.id, u.name, u.email, r.registration_date, r.status
       FROM registrations r
       JOIN users u ON r.user_id = u.id
       WHERE r.event_id = ?
       ORDER BY r.registration_date DESC`,
      [id]
    );

    res.json(attendees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attendees' });
  }
});

export default router;