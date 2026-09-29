import { Response } from 'express';
import { z } from 'zod';
import prisma from '@config/prisma';
import { AuthedRequest } from '@middleware/auth';

const mediaUrlSchema = z.string().regex(/^\/uploads\/[a-f0-9-]+(?:\.[a-z0-9]+)?$/i);
const createSchema = z.object({
  mediaUrl: mediaUrlSchema,
  mediaType: z.string().max(100).refine((value) => value.startsWith('image/') || value.startsWith('video/') || value === 'model/gltf-binary'),
  caption: z.string().trim().max(280).optional(),
});

export async function listStatuses(req: AuthedRequest, res: Response) {
  await prisma.statusUpdate.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  const updates = await prisma.statusUpdate.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  const grouped = new Map<string, { user: { id: string; username: string; avatarUrl: string | null }; updates: typeof updates }>();
  for (const update of updates) {
    const existing = grouped.get(update.userId);
    if (existing) existing.updates.push(update);
    else grouped.set(update.userId, { user: update.user, updates: [update] });
  }
  const statuses = [...grouped.values()].map(({ user, updates: userUpdates }) => ({
    user,
    isMine: user.id === req.userId,
    updates: userUpdates.map(({ id, mediaUrl, mediaType, caption, createdAt, expiresAt }) => ({ id, mediaUrl, mediaType, caption, createdAt, expiresAt })),
  }));
  statuses.sort((a, b) => Number(b.isMine) - Number(a.isMine) || new Date(a.updates[0].createdAt).getTime() - new Date(b.updates[0].createdAt).getTime());
  return res.json({ statuses });
}

export async function createStatus(req: AuthedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose an image or video and add a caption up to 280 characters.' });
  const update = await prisma.statusUpdate.create({
    data: { ...parsed.data, userId: req.userId!, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  return res.status(201).json({ update });
}

export async function deleteStatus(req: AuthedRequest, res: Response) {
  const result = await prisma.statusUpdate.deleteMany({ where: { id: req.params.statusId, userId: req.userId } });
  if (!result.count) return res.status(404).json({ error: 'Status update not found' });
  return res.status(204).end();
}
