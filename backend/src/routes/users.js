import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import db from '../db/index.js';

const router = express.Router();

// Get user's registered events
router.get('/registered-events', authenticateToken, async (req, res) => {
  try {
    const events = await db.query(
      `SELECT e.*, u.name as organizer_name, r.registration_date, r.status, r.qr_code
       FROM registrations r
       JOIN events e ON r.event_id = e.id
       JOIN users u ON e.organizer_id = u.id
       WHERE r.user_id = ?
       ORDER BY e.date ASC`,
      [req.user.id]
    );
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch registered events' });
  }
});

// Get user's organized events
router.get('/organized-events', authenticateToken, async (req, res) => {
  try {
    const events = await db.query(
      `SELECT e.*, 
              (SELECT COUNT(*) FROM registrations WHERE event_id = e.id AND status = 'confirmed') as registered_count
       FROM events e
       WHERE e.organizer_id = ?
       ORDER BY e.date ASC`,
      [req.user.id]
    );
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch organized events' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }

    await db.exec(
      'UPDATE users SET name = ? WHERE id = ?',
      [name, req.user.id]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;