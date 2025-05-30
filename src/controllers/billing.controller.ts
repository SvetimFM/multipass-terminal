import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BillingService } from '../services/billing.service';
import { AuthRequest } from '../middleware/auth.middleware';

const billingService = new BillingService();

// In-memory store for customer IDs (replace with database)
const customerIds = new Map<string, string>();

const createCheckoutSchema = z.object({
  planId: z.enum(['basic', 'pro']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
});

const updateSubscriptionSchema = z.object({
  planId: z.enum(['free', 'basic', 'pro'])
});

export async function getSubscriptionPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = billingService.getSubscriptionPlans();
    res.json({ plans });
  } catch (error) {
    next(error);
    return;
  }
}

export async function createCheckoutSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { planId, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body);
    const userId = req.user!.userId;

    // Get or create customer ID
    let customerId = customerIds.get(userId);
    if (!customerId) {
      customerId = await billingService.createCustomer({
        id: userId,
        email: req.user!.email
      });
      customerIds.set(userId, customerId);
    }

    const session = await billingService.createCheckoutSession(
      customerId,
      planId,
      successUrl,
      cancelUrl
    );

    res.json({ 
      checkoutUrl: session.url,
      sessionId: session.id 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function createPortalSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { returnUrl } = z.object({ returnUrl: z.string().url() }).parse(req.body);
    const userId = req.user!.userId;

    const customerId = customerIds.get(userId);
    if (!customerId) {
      return res.status(404).json({ error: 'No billing account found' });
    }

    const session = await billingService.createPortalSession(customerId, returnUrl);
    res.json({ portalUrl: session.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function updateSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { planId } = updateSubscriptionSchema.parse(req.body);
    // const userId = req.user!.userId;  // Would be used for database lookup

    // Get user's current subscription (this would come from database)
    const subscriptionId = 'sub_example'; // Replace with actual lookup
    
    if (planId === 'free') {
      await billingService.cancelSubscription(subscriptionId);
      res.json({ message: 'Subscription cancelled', newPlan: 'free' });
    } else {
      const subscription = await billingService.updateSubscription(subscriptionId, planId);
      res.json({ 
        message: 'Subscription updated',
        newPlan: planId,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000)
        }
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function handleWebhook(req: Request, res: Response, _next: NextFunction) {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe signature' });
    }

    const { type, data } = await billingService.handleWebhook(req.body, signature);

    // Handle different webhook events
    switch (type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        // Update user's subscription status in database
        console.log('Subscription updated:', data);
        break;
      
      case 'customer.subscription.deleted':
        // Downgrade user to free tier
        console.log('Subscription cancelled:', data);
        break;
      
      case 'invoice.payment_failed':
        // Handle failed payment
        console.log('Payment failed:', data);
        break;
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
}