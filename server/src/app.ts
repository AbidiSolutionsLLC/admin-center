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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(globalLimiter);
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

// Mount routes
app.use('/api/v1', routes);

// Global Error Handler
app.use(errorHandler);

export default app;
