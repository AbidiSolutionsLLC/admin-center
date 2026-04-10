import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // 1. Handle custom AppError
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }

  // 2. Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((e: any) => ({ path: e.path.join('.'), message: e.message }))
    });
  }

  // 3. Handle MongoDB Duplicate Key Errors (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = Object.values(err.keyValue || {})[0] || 'value';
    const message = `A record with this ${field} ("${value}") already exists.`;
    
    return res.status(409).json({
      success: false,
      error: message,
      code: 'DUPLICATE_KEY_ERROR',
      field
    });
  }

  // 4. Handle Mongoose ValidationError
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e: any) => ({
      path: e.path,
      message: e.message
    }));
    return res.status(400).json({
      success: false,
      error: 'Database validation failed',
      code: 'DATABASE_VALIDATION_ERROR',
      details
    });
  }

  // 5. Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid ${err.path}: ${err.value}`,
      code: 'INVALID_ID_FORMAT'
    });
  }

  // 6. Handle JWT Errors
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Your session has expired. Please log in again.',
      code: 'TOKEN_EXPIRED'
    });
  }
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token.',
      code: 'INVALID_TOKEN'
    });
  }

  // 7. Fallback: Unhandled Errors
  console.error('[Unhandled Error]', err);
  
  // Don't leak stack traces in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message || 'Internal server error';

  return res.status(500).json({
    success: false,
    error: message,
    code: 'INTERNAL_ERROR'
  });
};
