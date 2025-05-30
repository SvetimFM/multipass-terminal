import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    subscriptionTier: string;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    const payload = await verifyToken(token);
    req.user = payload;
    
    next();
    return;
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireSubscription(tier: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): Response | void => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const tierLevels = ['free', 'basic', 'pro'];
    const userTierLevel = tierLevels.indexOf(req.user.subscriptionTier);
    const requiredTierLevel = tierLevels.indexOf(tier);

    if (userTierLevel < requiredTierLevel) {
      return res.status(403).json({ 
        error: 'Insufficient subscription tier',
        required: tier,
        current: req.user.subscriptionTier
      });
    }

    next();
    return;
  };
}