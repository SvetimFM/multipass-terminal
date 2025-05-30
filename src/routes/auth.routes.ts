import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/signup', authController.signUp);
router.post('/signin', authController.signIn);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);
router.post('/agents/register', authenticate, authController.registerAgent);

export default router;