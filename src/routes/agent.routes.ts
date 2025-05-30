import { Router } from 'express';
import * as agentController from '../controllers/agent.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', agentController.getAgents);
router.get('/:agentId', agentController.getAgent);
router.put('/:agentId', agentController.updateAgent);
router.delete('/:agentId', agentController.deleteAgent);
router.get('/:agentId/status', agentController.getAgentStatus);

export default router;