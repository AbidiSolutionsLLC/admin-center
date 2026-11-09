import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimiter';
import './models';
import routes from './routes';

const app = express();

app.set('trust proxy', 1); // Trust first proxy (e.g. Nginx, Azure) if deploying behind one
app.use(cors({ 
  origin: (origin, callback) => {
    // WI-13: reflecting any origin requires NODE_ENV=development AND ALLOW_ANY_ORIGIN=true
    const allowAny = process.env.NODE_ENV === 'development' && process.env.ALLOW_ANY_ORIGIN === 'true';
    if (allowAny) {
      callback(null, origin || true);
    } else {
      const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(o => o.trim()).filter(Boolean);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  }, 
  credentials: true 
}));
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);

// Mount routes
app.use('/api/v1', routes);

// Global Error Handler
app.use(errorHandler);

export default app;
