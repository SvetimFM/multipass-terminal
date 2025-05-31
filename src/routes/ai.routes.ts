import { Router } from 'express';
import * as aiController from '../controllers/ai.controller';
import { authenticate, requireSubscription } from '../middleware/auth.middleware';
import { trackUsage } from '../middleware/usage.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Task management
router.post('/tasks', trackUsage, aiController.createTask);
router.get('/tasks', aiController.getUserTasks);
router.get('/tasks/:taskId', aiController.getTask);
router.delete('/tasks/:taskId', aiController.cancelTask);

// Instance management
router.get('/instances', aiController.getUserInstances);
router.post('/instances', requireSubscription('basic'), aiController.createInstance);
router.delete('/instances/:instanceId', aiController.stopInstance);

// Stats and info
router.get('/stats', aiController.getQueueStats);
router.get('/stats/instances', requireSubscription('pro'), aiController.getInstanceStats);
router.get('/providers', aiController.getProviders);

export default router;