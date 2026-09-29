import { Router } from 'express';
import { createBusinessProfile, createListing, deleteListing, listListings } from '@controllers/marketController';
import { requireAuth } from '@middleware/auth';

const router = Router();

router.use(requireAuth);
router.get('/listings', listListings);
router.put('/business-profile', createBusinessProfile);
router.post('/listings', createListing);
router.delete('/listings/:listingId', deleteListing);

export default router;