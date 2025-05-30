import { Router } from 'express';
import * as commandController from '../controllers/command.controller';
import { authenticate } from '../middleware/auth.middleware';
import { trackUsage } from '../middleware/usage.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/execute', trackUsage, commandController.executeCommand);
router.get('/stats', commandController.getCommandStats);
router.get('/:commandId', commandController.getCommand);
router.delete('/:commandId', commandController.cancelCommand);
router.get('/session/:sessionId', commandController.getSessionCommands);

export default router;