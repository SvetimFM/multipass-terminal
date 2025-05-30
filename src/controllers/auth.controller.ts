import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword, generateToken, generateAgentToken } from '../utils/auth';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

// Validation schemas
const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100)
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const registerAgentSchema = z.object({
  name: z.string().min(1).max(100),
  platform: z.enum(['windows', 'linux', 'darwin'])
});

// Temporary in-memory user store (replace with database)
const users = new Map<string, any>();

export async function signUp(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = signUpSchema.parse(req.body);

    // Check if user exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Create user
    const userId = uuidv4();
    const passwordHash = await hashPassword(password);
    
    const user = {
      id: userId,
      email,
      passwordHash,
      subscriptionStatus: 'trial',
      subscriptionTier: 'free',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    users.set(userId, user);

    // Generate token
    const token = generateToken({
      userId,
      email,
      subscriptionTier: user.subscriptionTier
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionTier: user.subscriptionTier
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function signIn(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = signInSchema.parse(req.body);

    // Find user
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionTier: user.subscriptionTier
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function registerAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, platform } = registerAgentSchema.parse(req.body);
    const userId = (req as any).user.userId;

    const agentId = uuidv4();
    const agent = {
      id: agentId,
      userId,
      name,
      platform,
      status: 'offline',
      lastSeen: new Date(),
      capabilities: ['command-execution', 'file-access', 'system-info']
    };

    // Store agent in Redis
    await redis.set(`agent:${agentId}`, JSON.stringify(agent), { EX: 86400 * 30 });

    // Generate agent-specific token
    const agentToken = generateAgentToken(userId, agentId);

    res.status(201).json({
      agent,
      token: agentToken
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).user.userId;
    const user = users.get(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        subscriptionStatus: user.subscriptionStatus,
        subscriptionTier: user.subscriptionTier,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
    return;
  }
}