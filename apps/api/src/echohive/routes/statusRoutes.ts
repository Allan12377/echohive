import { Router } from 'express';
import { createStatus, deleteStatus, listStatuses } from '@controllers/statusController';
import { requireAuth } from '@middleware/auth';

const router = Router();
router.use(requireAuth);
router.get('/', listStatuses);
router.post('/', createStatus);
router.delete('/:statusId', deleteStatus);

export default router;
