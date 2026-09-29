import { Router } from 'express';
import { getMyProfile, updateAvatar, updateMyProfile } from '@controllers/profileController';
import { requireAuth } from '@middleware/auth';
import { receiveAvatar } from '@middleware/upload';

const router = Router();

router.use(requireAuth);
router.get('/me', getMyProfile);
router.patch('/me', updateMyProfile);
router.put('/me/avatar', receiveAvatar, updateAvatar);

export default router;