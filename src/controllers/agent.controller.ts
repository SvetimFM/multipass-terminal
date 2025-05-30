import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { createClient } from 'redis';
import { AuthRequest } from '../middleware/auth.middleware';
import { Agent } from '../types';

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  capabilities: z.array(z.string()).optional()
});

export async function getAgents(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const keys = await redis.keys(`agent:*`);
    const agents: Agent[] = [];

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const agent = JSON.parse(data) as Agent;
        if (agent.userId === userId) {
          agents.push(agent);
        }
      }
    }

    res.json({ agents });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getAgent(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { agentId } = req.params;
    const data = await redis.get(`agent:${agentId}`);

    if (!data) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = JSON.parse(data) as Agent;
    
    // Verify agent belongs to user
    if (agent.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ agent });
  } catch (error) {
    next(error);
    return;
  }
}

export async function updateAgent(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { agentId } = req.params;
    const updates = updateAgentSchema.parse(req.body);
    
    const data = await redis.get(`agent:${agentId}`);
    if (!data) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = JSON.parse(data) as Agent;
    
    // Verify agent belongs to user
    if (agent.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update agent
    const updatedAgent = {
      ...agent,
      ...updates,
      lastSeen: new Date()
    };

    await redis.set(`agent:${agentId}`, JSON.stringify(updatedAgent), { EX: 86400 * 30 });

    res.json({ agent: updatedAgent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function deleteAgent(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { agentId } = req.params;
    const data = await redis.get(`agent:${agentId}`);

    if (!data) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = JSON.parse(data) as Agent;
    
    // Verify agent belongs to user
    if (agent.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await redis.del(`agent:${agentId}`);
    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getAgentStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { agentId } = req.params;
    const data = await redis.get(`agent:${agentId}`);

    if (!data) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const agent = JSON.parse(data) as Agent;
    
    // Verify agent belongs to user
    if (agent.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if agent is really online by checking active connections
    const connectionKeys = await redis.keys(`connection:*`);
    let isOnline = false;

    for (const key of connectionKeys) {
      const connData = await redis.get(key);
      if (connData) {
        const connection = JSON.parse(connData);
        if (connection.agentId === agentId) {
          isOnline = true;
          break;
        }
      }
    }

    res.json({
      agentId: agent.id,
      status: isOnline ? 'online' : 'offline',
      lastSeen: agent.lastSeen,
      platform: agent.platform,
      capabilities: agent.capabilities
    });
  } catch (error) {
    next(error);
    return;
  }
}