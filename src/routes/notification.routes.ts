import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', notificationController.getNotifications);
router.get('/:notificationId', notificationController.getNotification);
router.post('/:notificationId/respond', notificationController.respondToNotification);
router.post('/:notificationId/read', notificationController.markAsRead);

export default router;