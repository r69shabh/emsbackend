import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticateToken, authorize } from '../middleware/auth.js';
import { redis } from '../index.js';

const router = express.Router();

const PORTAL_ROLES = {
  ADMIN_PORTAL: ['admin'],
  VENDOR_PORTAL: ['vendor'],
  ORGANIZER_PORTAL: ['organizer'],
  ATTENDEE_PORTAL: ['attendee']
};

// Public registration schema
const publicUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['attendee', 'organizer']).default('attendee')
});

// Schema for admin creating/updating users
const adminUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['admin', 'organizer', 'attendee', 'vendor']),
  company: z.string().optional(),
  phone: z.string().optional(),
  status: z.enum(['active', 'inactive', 'suspended']).default('active')
});

// Public registration (attendees only)
router.post('/register', async (req, res) => {
  try {
    const validatedData = publicUserSchema.parse(req.body);
    const { name, email, password } = validatedData;

    const existingUser = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    await db.exec(
      'INSERT INTO users (id, name, email, password, role, verified) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name, email, hashedPassword, validatedData.role, true]
    );

    const token = jwt.sign(
      { id: userId, email, role: validatedData.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({ 
      token,
      user: { id: userId, name, email, role: validatedData.role },
      portal: validatedData.role
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login with portal-specific access
router.post('/login', async (req, res) => {
  try {
    const { email, password, portal } = req.body;

    if (!email || !password || !portal) {
      return res.status(400).json({ error: 'Email, password, and portal are required' });
    }

    // Validate portal
    const allowedPortals = ['admin', 'vendor', 'organizer', 'attendee'];
    if (!allowedPortals.includes(portal)) {
      return res.status(400).json({ error: 'Invalid portal' });
    }

    const users = await db.query(
      'SELECT * FROM users WHERE email = ? AND status = "active"', 
      [email]
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check if user has access to requested portal
    const portalKey = portal.toUpperCase() + '_PORTAL';
    console.log('Checking portal access:', {
      portalKey,
      userRole: user.role,
      PORTAL_ROLES: PORTAL_ROLES
    });
    
    if (!PORTAL_ROLES[portalKey]) {
      console.error('Invalid portal key:', portalKey);
      return res.status(400).json({ error: 'Invalid portal' });
    }

    if (!PORTAL_ROLES[portalKey].includes(user.role)) {
      console.error('Access denied:', {
        userId: user.id,
        requestedPortal: portal,
        userRole: user.role,
        allowedRoles: PORTAL_ROLES[portalKey]
      });
      const allowedPortal = Object.keys(PORTAL_ROLES).find(key => 
        PORTAL_ROLES[key].includes(user.role)
      )?.toLowerCase().replace('_portal', '');
      
      console.error('Access denied:', {
        userId: user.id,
        requestedPortal: portal,
        userRole: user.role,
        allowedPortal
      });
      
      return res.status(403).json({ 
        error: 'You do not have access to this portal',
        allowedPortal
      });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        portal 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Store session in Redis for additional security
    await redis.setex(`session:${user.id}`, 24 * 60 * 60, token);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: user.company,
      },
      portal
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Admin routes for user management
router.post('/users', authenticateToken, authorize(['admin']), async (req, res) => {
  try {
    const validatedData = adminUserSchema.parse(req.body);
    const { name, email, password, role, company, phone, status } = validatedData;

    const existingUser = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : await bcrypt.hash(crypto.randomUUID(), 10);
    const userId = crypto.randomUUID();

    await db.exec(
      `INSERT INTO users (id, name, email, password, role, company, phone, status, verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, email, hashedPassword, role, company, phone, status, true]
    );

    // Send invitation email with temporary password if provided
    // TODO: Implement email service

    res.status(201).json({
      message: 'User created successfully',
      user: { id: userId, name, email, role, company, status }
    });
  } catch (error) {
    console.error('Create user error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user role and status
router.put('/users/:id', authenticateToken, authorize(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, status } = req.body;

    if (!['admin', 'organizer', 'vendor', 'attendee'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.exec(
      'UPDATE users SET role = ?, status = ? WHERE id = ?',
      [role, status, id]
    );

    // Invalidate any existing sessions for the user
    await redis.del(`session:${id}`);

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// List all users (admin only)
router.get('/users', authenticateToken, authorize(['admin']), async (req, res) => {
  try {
    const { role, status, search } = req.query;
    let query = 'SELECT id, name, email, role, company, status, created_at FROM users WHERE 1=1';
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR company LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const users = await db.query(query, params);
    res.json(users);
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Remove session from Redis
    await redis.del(`session:${req.user.id}`);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Delete current user
router.delete('/auth/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Delete user from database
    await db.exec('DELETE FROM users WHERE id = ?', [userId]);
    
    // Delete session from Redis
    await redis.del(`session:${userId}`);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Validate token and get user info
router.get('/validate', authenticateToken, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, name, email, role, company, status FROM users WHERE id = ? AND status = "active"',
      [req.user.id]
    );
    const user = users[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found or inactive' });
    }

    // Verify session exists in Redis
    const session = await redis.get(`session:${user.id}`);
    if (!session) {
      return res.status(401).json({ error: 'Session expired' });
    }

    res.json({ 
      user,
      portal: req.user.portal 
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

export default router;
