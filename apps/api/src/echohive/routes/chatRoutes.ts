import { Router } from 'express';
import { requireAuth } from '@middleware/auth';
import { findUsers, listConversations, openConversation } from '@controllers/chatController';
import { uploadAttachment } from '@controllers/uploadController';
import { receiveAttachment } from '@middleware/upload';

const router = Router();

router.use(requireAuth);
router.get('/users', findUsers);
router.get('/conversations', listConversations);
router.post('/conversations', openConversation);
router.post('/upload', receiveAttachment, uploadAttachment);

export default router;