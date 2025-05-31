import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';
import { NotificationService } from '../services/notification.service';

const notificationService = new NotificationService();

const respondSchema = z.object({
  response: z.string().min(1).max(5000)
});

export async function getNotifications(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const userId = req.user!.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    const notifications = await notificationService.getUserNotifications(userId, limit);
    res.json({ notifications });
  } catch (error) {
    next(error);
    return;
  }
}

export async function getNotification(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { notificationId } = req.params;
    const notification = await notificationService.getNotification(notificationId);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Verify notification belongs to user
    if (notification.userId !== req.user?.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ notification });
  } catch (error) {
    next(error);
    return;
  }
}

export async function respondToNotification(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { notificationId } = req.params;
    const { response } = respondSchema.parse(req.body);
    const userId = req.user!.userId;

    const userResponse = await notificationService.handleUserResponse(
      notificationId,
      userId,
      response
    );

    if (!userResponse) {
      return res.status(404).json({ error: 'Notification not found or expired' });
    }

    res.json({ 
      message: 'Response recorded',
      response: userResponse 
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (error instanceof Error && error.message.includes('does not require')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
    return;
  }
}

export async function markAsRead(req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> {
  try {
    const { notificationId } = req.params;
    const userId = req.user!.userId;

    await notificationService.markAsRead(notificationId, userId);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Notification not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
    return;
  }
}