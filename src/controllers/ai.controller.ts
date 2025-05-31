import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { AgentInstanceService } from '../services/agent-instance.service';
import { AgentQueueService } from '../services/agent-queue.service';

// Initialize services
import { NotificationService } from '../services/notification.service';
const instanceService = new AgentInstanceService();
const notificationService = new NotificationService();
const queueService = new AgentQueueService(instanceService, notificationService);

// Validation schemas
const createTaskSchema = z.object({
  sessionId: z.string().uuid(),
  command: z.string().min(1).max(5000),
  provider: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

const createInstanceSchema = z.object({
  provider: z.string().optional()
});

export async function createTask(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { sessionId, command, provider, metadata } = createTaskSchema.parse(req.body);
    const userId = req.user!.userId;

    const task = await queueService.queueTask(
      userId,
      sessionId,
      command,
      provider,
      metadata
    );

    res.status(201).json({ task });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function getTask(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { taskId } = req.params;
    const task = await queueService.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Verify task belongs to user
    if (task.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ task });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getUserTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    const tasks = await queueService.getUserTasks(userId, limit);
    res.json({ tasks });
  } catch (error) {
    next(error);
    return;
  }
}

export async function cancelTask(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { taskId } = req.params;
    
    // Get task to verify ownership
    const task = await queueService.getTask(taskId);
    if (!task || task.userId !== req.user?.userId) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const cancelled = await queueService.cancelTask(taskId);
    if (!cancelled) {
      return res.status(400).json({ error: 'Task cannot be cancelled' });
    }

    res.json({ message: 'Task cancelled successfully' });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getQueueStats(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const stats = await queueService.getQueueStats();
    res.json({ stats });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getProviders(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const providers = instanceService.getAvailableProviders().map(name => ({
      id: name,
      ...instanceService.getProviderInfo(name)
    }));
    
    res.json({ providers });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getUserInstances(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.userId;
    const instances = instanceService.getUserInstances(userId).map(instance => ({
      id: instance.id,
      provider: instance.provider,
      status: instance.status,
      createdAt: instance.createdAt,
      lastActivity: instance.lastActivity,
      currentTask: instance.currentTask
    }));

    res.json({ instances });
  } catch (error) {
    next(error);
    return;
  }
}

export async function createInstance(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { provider } = createInstanceSchema.parse(req.body);
    const userId = req.user!.userId;

    const instance = await instanceService.createInstance(userId, provider);
    
    res.status(201).json({
      instance: {
        id: instance.id,
        provider: instance.provider,
        status: instance.status,
        createdAt: instance.createdAt
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof Error && error.message.includes('Maximum instances')) {
      return res.status(429).json({ error: error.message });
    }
    next(error);
    return;
  }
}

export async function stopInstance(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { instanceId } = req.params;
    const instance = instanceService.getInstance(instanceId);

    if (!instance || instance.userId !== req.user?.userId) {
      return res.status(404).json({ error: 'Instance not found' });
    }

    await instanceService.stopInstance(instanceId);
    res.json({ message: 'Instance stopped successfully' });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getInstanceStats(_req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const stats = await instanceService.getInstanceStats();
    res.json({ stats });
  } catch (error) {
    next(error);
    return;
  }
}