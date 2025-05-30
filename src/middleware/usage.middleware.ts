import { Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { AuthRequest } from './auth.middleware';
import { getCommandExecutionLimits } from '../utils/security';

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

export async function trackUsage(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.userId;
  const limits = getCommandExecutionLimits(req.user.subscriptionTier);
  
  // Track daily command usage
  const today = new Date().toISOString().split('T')[0];
  const usageKey = `usage:${userId}:${today}`;
  
  try {
    const currentUsage = await redis.incr(usageKey);
    
    // Set expiry on first use of the day
    if (currentUsage === 1) {
      await redis.expire(usageKey, 86400); // 24 hours
    }
    
    if (currentUsage > limits.maxDailyCommands) {
      return res.status(429).json({
        error: 'Daily command limit exceeded',
        limit: limits.maxDailyCommands,
        resetAt: new Date(Date.now() + 86400000).toISOString()
      });
    }
    
    // Add usage info to response headers
    res.setHeader('X-RateLimit-Limit', limits.maxDailyCommands.toString());
    res.setHeader('X-RateLimit-Remaining', (limits.maxDailyCommands - currentUsage).toString());
    res.setHeader('X-RateLimit-Reset', new Date(Date.now() + 86400000).toISOString());
    
    next();
  } catch (error) {
    console.error('Usage tracking error:', error);
    next(); // Don't block on tracking errors
  }
}

export async function getUserUsageStats(userId: string): Promise<{
  daily: number;
  weekly: number;
  monthly: number;
}> {
  const today = new Date();
  const dailyKey = `usage:${userId}:${today.toISOString().split('T')[0]}`;
  
  let daily = 0;
  let weekly = 0;
  let monthly = 0;
  
  try {
    // Get daily usage
    const dailyUsage = await redis.get(dailyKey);
    daily = dailyUsage ? parseInt(dailyUsage) : 0;
    
    // Calculate weekly usage
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = `usage:${userId}:${date.toISOString().split('T')[0]}`;
      const usage = await redis.get(key);
      weekly += usage ? parseInt(usage) : 0;
    }
    
    // Calculate monthly usage
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const key = `usage:${userId}:${date.toISOString().split('T')[0]}`;
      const usage = await redis.get(key);
      monthly += usage ? parseInt(usage) : 0;
    }
  } catch (error) {
    console.error('Error getting usage stats:', error);
  }
  
  return { daily, weekly, monthly };
}