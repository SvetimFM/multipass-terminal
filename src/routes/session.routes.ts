import { Router } from 'express';
import * as sessionController from '../controllers/session.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.post('/', sessionController.createSession);
router.get('/', sessionController.getSessions);
router.get('/:sessionId', sessionController.getSession);
router.delete('/:sessionId', sessionController.deleteSession);
router.post('/:sessionId/extend', sessionController.extendSession);
router.delete('/', sessionController.deleteAllSessions);

export default router;