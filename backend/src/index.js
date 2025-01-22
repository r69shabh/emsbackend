import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import Redis from 'ioredis';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import userRoutes from './routes/users.js';
import vendorRoutes from './routes/vendors.js';
import adminRoutes from './routes/admin.js';
import { authenticateToken } from './middleware/auth.js';

// Initialize Redis client with error handling
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('error', (err) => {
  console.error('Redis error:', err);
  if (err.code === 'ECONNREFUSED') {
    console.error('Redis connection refused. Please check if Redis is running.');
  }
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

const app = express();

// Security middlewares
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for'] || req.ip;
  }
});
app.use(limiter);

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    try {
      JSON.parse(buf.toString(encoding || 'utf8'));
    } catch (e) {
      throw new Error('Invalid JSON');
    }
  }
}));

// Add request ID middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Health check endpoint with basic system status
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.status(200).json({
      status: 'OK',
      timestamp: new Date(),
      redis: 'connected',
      version: process.env.APP_VERSION || '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date(),
      redis: 'disconnected',
      error: process.env.NODE_ENV === 'production' ? 'Service unavailable' : error.message
    });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/admin', adminRoutes);

// Error handling middleware with better error responses
app.use((err, req, res, next) => {
  console.error(err);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.details
    });
  }
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }
  
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Invalid Input',
      details: err.errors
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    requestId: req.id
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
// Handle shutdown signals
['SIGTERM', 'SIGINT'].forEach(signal => {
  process.on(signal, async () => {
  console.log(`${signal} received. Shutting down gracefully...`);
  
  // Close Redis connection
  await redis.quit();
  
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    
    // Force close after 10s
    setTimeout(() => {
      console.log('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export { app, redis };
