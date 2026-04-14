import jwt from 'jsonwebtoken';

export type UserRole = 'Super Admin' | 'Admin' | 'HR' | 'Manager' | 'Employee' | 'Technician';

export interface AdminClaim {
  userId: string;
  email: string;
  user_role: UserRole;
  company_id: string;
}

export const signAccessToken = (payload: AdminClaim): string =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });

export const signRefreshToken = (payload: Pick<AdminClaim, 'userId'>): string =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });

export const verifyAccessToken = (token: string): AdminClaim =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AdminClaim;
