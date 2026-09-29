import { Router } from 'express';
import authRoutes from '@routes/authRoutes';
import chatRoutes from '@routes/chatRoutes';
import messageRoutes from '@routes/messageRoutes';
import marketRoutes from '@routes/marketRoutes';
import profileRoutes from '@routes/profileRoutes';
import videoRoutes from '@routes/videoRoutes';
import statusRoutes from '@routes/statusRoutes';
import callRoutes from '@routes/callRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/messages', messageRoutes);
router.use('/market', marketRoutes);
router.use('/profile', profileRoutes);
router.use('/videos', videoRoutes);
router.use('/statuses', statusRoutes);
router.use('/calls', callRoutes);

export default router;
