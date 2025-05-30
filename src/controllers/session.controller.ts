import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { SessionService } from '../services/session.service';
import { AuthRequest } from '../middleware/auth.middleware';

const sessionService = new SessionService();

const createSessionSchema = z.object({
  agentId: z.string().uuid().optional()
});

export async function createSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { agentId } = createSessionSchema.parse(req.body);
    const userId = req.user!.userId;

    const session = await sessionService.createSession(userId, agentId);
    res.status(201).json({ session });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    next(error);
    return;
  }
}

export async function getSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const sessions = await sessionService.getUserSessions(userId);
    res.json({ sessions });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify session belongs to user
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ session });
  } catch (error) {
    next(error);
    return;
  }
}

export async function deleteSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify session belongs to user
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await sessionService.deleteSession(sessionId);
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    next(error);
    return;
  }
}

export async function extendSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const session = await sessionService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify session belongs to user
    if (session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const extendedSession = await sessionService.extendSession(sessionId);
    res.json({ session: extendedSession });
  } catch (error) {
    next(error);
    return;
  }
}

export async function deleteAllSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    await sessionService.deleteUserSessions(userId);
    res.json({ message: 'All sessions deleted successfully' });
  } catch (error) {
    next(error);
    return;
  }
}