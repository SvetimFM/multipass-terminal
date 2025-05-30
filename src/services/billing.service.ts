import Stripe from 'stripe';
import { User } from '../types';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  limits: {
    maxDailyCommands: number;
    maxConcurrentCommands: number;
    maxExecutionTime: number;
  };
}

const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    interval: 'month',
    features: [
      '100 commands per day',
      '2 concurrent commands',
      '1 minute execution time',
      'Basic support'
    ],
    limits: {
      maxDailyCommands: 100,
      maxConcurrentCommands: 2,
      maxExecutionTime: 60000
    }
  },
  basic: {
    id: 'basic',
    name: 'Basic',
    price: 5,
    interval: 'month',
    features: [
      '1,000 commands per day',
      '5 concurrent commands',
      '2 minute execution time',
      'Priority support',
      'Command history'
    ],
    limits: {
      maxDailyCommands: 1000,
      maxConcurrentCommands: 5,
      maxExecutionTime: 120000
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 20,
    interval: 'month',
    features: [
      '10,000 commands per day',
      '10 concurrent commands',
      '5 minute execution time',
      'Premium support',
      'Command history',
      'Team collaboration',
      'API access'
    ],
    limits: {
      maxDailyCommands: 10000,
      maxConcurrentCommands: 10,
      maxExecutionTime: 300000
    }
  }
};

export class BillingService {
  async createCustomer(user: Partial<User>): Promise<string> {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: user.id!
      }
    });
    return customer.id;
  }

  async createSubscription(
    customerId: string,
    planId: string
  ): Promise<Stripe.Subscription> {
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan || plan.price === 0) {
      throw new Error('Invalid subscription plan');
    }

    // Create or get price
    const prices = await stripe.prices.list({
      limit: 100
    });

    let priceId: string;
    if (prices.data.length > 0) {
      priceId = prices.data[0].id;
    } else {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.features.join(', ')
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price * 100,
        currency: 'usd',
        recurring: {
          interval: plan.interval
        }
      });
      priceId = price.id;
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: {
        planId
      }
    });

    return subscription;
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return await stripe.subscriptions.cancel(subscriptionId);
  }

  async updateSubscription(
    subscriptionId: string,
    newPlanId: string
  ): Promise<Stripe.Subscription> {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const plan = SUBSCRIPTION_PLANS[newPlanId];
    
    if (!plan) {
      throw new Error('Invalid subscription plan');
    }

    // Get or create new price
    const prices = await stripe.prices.list({
      limit: 100
    });

    let priceId: string;
    if (prices.data.length > 0) {
      priceId = prices.data[0].id;
    } else {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.features.join(', ')
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price * 100,
        currency: 'usd',
        recurring: {
          interval: plan.interval
        }
      });
      priceId = price.id;
    }

    // Update subscription
    return await stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: priceId
      }],
      metadata: {
        planId: newPlanId
      }
    });
  }

  async createCheckoutSession(
    customerId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<Stripe.Checkout.Session> {
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan || plan.price === 0) {
      throw new Error('Invalid subscription plan');
    }

    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan.name,
            description: plan.features.join(', ')
          },
          unit_amount: plan.price * 100,
          recurring: {
            interval: plan.interval
          }
        },
        quantity: 1
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        planId
      }
    });
  }

  async createPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });
  }

  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{ type: string; data: any }> {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        return {
          type: event.type,
          data: event.data.object
        };
      
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        return {
          type: event.type,
          data: event.data.object
        };
      
      default:
        return {
          type: event.type,
          data: event.data
        };
    }
  }

  getSubscriptionPlans(): SubscriptionPlan[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  getSubscriptionPlan(planId: string): SubscriptionPlan | undefined {
    return SUBSCRIPTION_PLANS[planId];
  }
}