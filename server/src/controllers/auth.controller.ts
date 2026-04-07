// server/src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler';
import { User, LifecycleState } from '../models/User.model';
import { RefreshToken } from '../models/RefreshToken.model';
import { signAccessToken, signRefreshToken } from '../lib/tokenService';
import { AppError } from '../utils/AppError';

// 7 days in milliseconds
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError('Email and password are required', 400, 'BAD_REQUEST');
  }

  const user = await User.findOne({ email }).select('+password_hash');
  if (!user) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  if (user.lifecycle_state === 'terminated' || user.lifecycle_state === 'archived') {
    throw new AppError('Account is terminated or archived', 403, 'FORBIDDEN');
  }

  // Determine user role (for now, default to employee if not fully implemented in RBAC)
  // In a full implementation, you would resolve this from UserRole, but we'll use a mocked or fallback role
  const userRole = 'employee' as any;

  // Sign tokens
  const accessToken = signAccessToken({
    userId: user._id.toString(),
    user_role: userRole,
    company_id: user.company_id.toString()
  });

  // Create a raw refresh token and its hash
  const rawRefreshToken = signRefreshToken({ userId: user._id.toString() });
  const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

  // Save refresh token hash in DB
  user.refresh_token_hash = refreshTokenHash;
  user.last_login = new Date();
  await user.save();

  // Create RefreshToken record
  await RefreshToken.create({
    user_id: user._id,
    token_hash: refreshTokenHash,
    expires_at: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE),
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });

  // Set the refresh cookie
  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_MAX_AGE,
    path: '/api/v1/auth/refresh' // only sent to refresh endpoint to save bandwidth
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        company_id: user.company_id,
        role: userRole,
      }
    }
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  
  if (!token) {
    throw new AppError('No refresh token provided', 401, 'NO_TOKEN');
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Verify in DB
  const validTokenRecord = await RefreshToken.findOne({
    token_hash: tokenHash,
    is_revoked: false,
    expires_at: { $gt: new Date() }
  });

  if (!validTokenRecord) {
    throw new AppError('Invalid or expired refresh token', 401, 'INVALID_TOKEN');
  }

  const user = await User.findById(validTokenRecord.user_id);
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (user.refresh_token_hash !== tokenHash) {
    throw new AppError('Token was invalidated globally', 401, 'INVALID_TOKEN');
  }

  if (user.lifecycle_state === 'terminated' || user.lifecycle_state === 'archived') {
    throw new AppError('Account is terminated or archived', 403, 'FORBIDDEN');
  }

  // Issue new access token
  const accessToken = signAccessToken({
    userId: user._id.toString(),
    user_role: 'employee' as any,
    company_id: user.company_id.toString()
  });

  res.status(200).json({
    success: true,
    data: {
      accessToken
    }
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    // Invalidate RefreshToken record
    await RefreshToken.updateMany(
      { token_hash: tokenHash },
      { $set: { is_revoked: true } }
    );

    // Optionally clear hash from User
    if (req.user) {
      await User.findByIdAndUpdate(req.user.userId, { $unset: { refresh_token_hash: 1 } });
    }
  }

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth/refresh'
  });

  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user.userId).select('-password_hash -refresh_token_hash');
  
  if (!user) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  res.status(200).json({
    success: true,
    data: {
      user
    }
  });
});
