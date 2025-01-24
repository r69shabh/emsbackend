import express from 'express';
import { apiLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import healthRouter from './routes/health';

const app = express();

// Add middleware
app.use(requestLogger);
app.use(apiLimiter);
app.use(express.json());

// Add routes
app.use('/health', healthRouter);

export default app;
