import { Router } from 'express';
import { createVideoComment, createVideoUpload, deleteVideoComment, finishVideoUpload, getVideoUpload, listVideoComments, listVideos, putVideoChunk, toggleVideoLike } from '@controllers/videoController';
import { requireAuth } from '@middleware/auth';
import { receiveVideoChunk } from '@middleware/upload';

const router = Router();
router.use(requireAuth);
router.get('/', listVideos);
router.post('/:videoId/likes', toggleVideoLike);
router.get('/:videoId/comments', listVideoComments);
router.post('/:videoId/comments', createVideoComment);
router.delete('/comments/:commentId', deleteVideoComment);
router.post('/uploads', createVideoUpload);
router.get('/uploads/:uploadId', getVideoUpload);
router.put('/uploads/:uploadId/chunks/:index', receiveVideoChunk, putVideoChunk);
router.post('/uploads/:uploadId/complete', finishVideoUpload);

export default router;
