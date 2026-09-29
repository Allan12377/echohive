import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '@middleware/auth';

const router = Router();
const iceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

router.use(requireAuth);
router.get('/ice-servers', (_req, res) => {
  let servers: z.infer<typeof iceServerSchema>[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.RTC_ICE_SERVERS) {
    try {
      const configured = z.array(iceServerSchema).min(1).safeParse(JSON.parse(process.env.RTC_ICE_SERVERS));
      if (configured.success) servers = configured.data;
      else console.error('RTC_ICE_SERVERS is invalid; using the default STUN server.');
    } catch {
      console.error('RTC_ICE_SERVERS is not valid JSON; using the default STUN server.');
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ iceServers: servers });
});

export default router;
