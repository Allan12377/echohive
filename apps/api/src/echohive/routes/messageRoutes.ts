import { Router } from 'express';
import { requireAuth } from '@middleware/auth';
import { getMessages, sendMessage } from '@controllers/messageController';

const router = Router();

router.use(requireAuth);
router.get('/:conversationId', getMessages);
router.post('/', sendMessage);

export default router;
