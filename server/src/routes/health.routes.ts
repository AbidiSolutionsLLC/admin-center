import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
}));

export default router;
