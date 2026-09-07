import { Router } from 'express';
import { login, refreshToken, getMe, changePassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

export const validateAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ success: false, message: 'Invalid authentication input' });
  next();
};

const router = Router();

router.post('/login', body('email').isString().trim().isEmail().toLowerCase(), body('password').isString().isLength({ min: 6, max: 72 }), validateAuth, login);
router.post('/refresh-token', body('refreshToken').isString().isJWT(), validateAuth, refreshToken);
router.post('/logout', authenticate, (_req, res) => res.json({ success: true, message: 'Logged out' }));
router.get('/me', authenticate, getMe);
router.put('/change-password', authenticate, body('currentPassword').isString().isLength({ min: 6, max: 72 }), body('newPassword').isString().isLength({ min: 6, max: 72 }), validateAuth, changePassword);

export default router;
