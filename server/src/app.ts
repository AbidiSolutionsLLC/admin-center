import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimiter';
import './models';
import routes from './routes';
import { initIdentity, mountIdentity } from './identity';

/**
 * Build the Express app. Requires an open Mongoose connection (identity adapter indexes + keys).
 * Used by src/index.ts and by in-process scripts (scripts/smoke-oidc-login.ts).
 */
export async function createServer(): Promise<Express> {
  await initIdentity();

  const app = express();

  const trustProxyConfig = process.env.TRUST_PROXY || 1;
  // Convert to number if it's a numeric string, otherwise keep as string (for IP/subnet configs)
  app.set('trust proxy', isNaN(Number(trustProxyConfig)) ? trustProxyConfig : Number(trustProxyConfig));

  // E1: identity realms first — before cors/helmet/body parsing (the provider handles its own).
  mountIdentity(app);

  app.use(cors({
    origin: (origin, callback) => {
      // WI-13: reflecting any origin requires NODE_ENV=development AND ALLOW_ANY_ORIGIN=true
      const allowAny = process.env.NODE_ENV === 'development' && process.env.ALLOW_ANY_ORIGIN === 'true';
      if (allowAny) {
        callback(null, origin || true);
      } else {
        const allowedOrigins = [
          ...(process.env.CLIENT_URL || 'http://localhost:5173').split(','),
          ...(process.env.ADMIN_SPA_ORIGIN || '').split(','),
        ].map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
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

  return app;
}

export default createServer;
