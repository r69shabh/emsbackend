import jwt from 'jsonwebtoken';
import { redis } from '../index.js';

const PORTAL_ACCESS = {
  'admin': ['admin'],
  'vendor': ['vendor'],
  'organizer': ['organizer'],
  'attendee': ['attendee', 'organizer', 'admin']  // Multiple roles can access attendee portal
};

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify JWT token
    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid token' });
      }

      // Verify session exists in Redis
      const session = await redis.get(`session:${decoded.id}`);
      if (!session) {
        return res.status(401).json({ error: 'Session expired' });
      }

      // If portal is specified in the request, verify access
      const requestedPortal = req.headers['x-portal'];
      if (requestedPortal && !PORTAL_ACCESS[requestedPortal].includes(decoded.role)) {
        return res.status(403).json({ 
          error: 'Access denied to this portal',
          allowedPortals: Object.keys(PORTAL_ACCESS).filter(portal => 
            PORTAL_ACCESS[portal].includes(decoded.role)
          )
        });
      }

      req.user = decoded;
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
};

export const authorize = (roles) => {
  return async (req, res, next) => {
    try {
      // Check role permission
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Verify user is still active
      const session = await redis.get(`session:${req.user.id}`);
      if (!session) {
        return res.status(401).json({ error: 'Session expired' });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      res.status(500).json({ error: 'Authorization error' });
    }
  };
};

export const requirePortal = (allowedPortals) => {
  return (req, res, next) => {
    const portal = req.headers['x-portal'];
    
    if (!portal) {
      return res.status(400).json({ error: 'Portal header required' });
    }

    if (!allowedPortals.includes(portal)) {
      return res.status(403).json({ 
        error: 'Invalid portal access',
        allowedPortals
      });
    }

    next();
  };
};