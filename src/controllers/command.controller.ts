import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { CommandService } from '../services/command.service';
import { SessionService } from '../services/session.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { validateCommand } from '../utils/security';

const commandService = new CommandService();
const sessionService = new SessionService();

const executeCommandSchema = z.object({
  sessionId: z.string().uuid(),
  command: z.string().min(1).max(1000),
  workingDirectory: z.string().optional(),
  environment: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(300000).optional()
});

export async function executeCommand(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId, ...commandPayload } = executeCommandSchema.parse(req.body);

    // Validate command security
    const validation = validateCommand(commandPayload);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Verify session belongs to user
    const session = await sessionService.getSession(sessionId);
    if (!session || session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Invalid session' });
    }

    if (!session.agentId) {
      return res.status(400).json({ error: 'No agent connected to session' });
    }

    // Create command with sanitized payload
    const command = await commandService.createCommand(
      sessionId,
      session.agentId,
      validation.sanitized!
    );

    res.status(201).json({ command });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof Error && error.message.includes('Maximum concurrent commands')) {
      return res.status(429).json({ error: error.message });
    }
    next(error);
    return;
  }
}

export async function getCommand(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { commandId } = req.params;
    const command = await commandService.getCommand(commandId);

    if (!command) {
      return res.status(404).json({ error: 'Command not found' });
    }

    // Verify user has access to this command
    const session = await sessionService.getSession(command.sessionId);
    if (!session || session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ command });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getSessionCommands(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    const session = await sessionService.getSession(sessionId);
    if (!session || session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Invalid session' });
    }

    const commands = await commandService.getSessionCommands(sessionId);
    res.json({ commands });
  } catch (error) {
    next(error);
    return;
  }
}

export async function cancelCommand(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { commandId } = req.params;
    const command = await commandService.getCommand(commandId);

    if (!command) {
      return res.status(404).json({ error: 'Command not found' });
    }

    // Verify user has access to this command
    const session = await sessionService.getSession(command.sessionId);
    if (!session || session.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cancelled = await commandService.cancelCommand(commandId);
    if (!cancelled) {
      return res.status(400).json({ error: 'Command cannot be cancelled' });
    }

    res.json({ message: 'Command cancelled successfully' });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getCommandStats(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const sessions = await sessionService.getUserSessions(userId);
    
    let totalCommands = 0;
    let executingCommands = 0;
    let completedCommands = 0;
    let failedCommands = 0;

    for (const session of sessions) {
      const commands = await commandService.getSessionCommands(session.id);
      totalCommands += commands.length;
      executingCommands += commands.filter(c => c.status === 'executing').length;
      completedCommands += commands.filter(c => c.status === 'completed').length;
      failedCommands += commands.filter(c => c.status === 'failed').length;
    }

    res.json({
      stats: {
        total: totalCommands,
        executing: executingCommands,
        completed: completedCommands,
        failed: failedCommands,
        activeSessions: sessions.length
      }
    });
  } catch (error) {
    next(error);
    return;
  }
}