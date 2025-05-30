import express, { Router } from 'express';
import * as billingController from '../controllers/billing.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.get('/plans', billingController.getSubscriptionPlans);

// Webhook route (no auth, validated by Stripe signature)
router.post('/webhook', express.raw({ type: 'application/json' }), billingController.handleWebhook);

// Protected routes
router.post('/checkout', authenticate, billingController.createCheckoutSession);
router.post('/portal', authenticate, billingController.createPortalSession);
router.put('/subscription', authenticate, billingController.updateSubscription);

export default router;