import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@config/prisma';
import { AuthedRequest } from '@middleware/auth';
import { removeUploadedFile } from '@config/uploads';

const updateProfileSchema = z.object({
  username: z.string().trim().min(3).max(30),
  about: z.string().trim().max(139),
});

export async function getMyProfile(req: AuthedRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId as string },
    select: { id: true, username: true, email: true, avatarUrl: true, about: true, businessName: true, businessAbout: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user });
}

export async function updateMyProfile(req: AuthedRequest, res: Response) {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const user = await prisma.user.update({
      where: { id: req.userId as string },
      data: parsed.data,
      select: { id: true, username: true, email: true, avatarUrl: true, about: true },
    });
    return res.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'That username is already taken' });
    }
    throw error;
  }
}

export async function updateAvatar(req: AuthedRequest, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'Choose an image to upload' });

  const userId = req.userId as string;
  const previous = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  const avatarUrl = `/uploads/${req.file.filename}`;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: { id: true, username: true, email: true, avatarUrl: true, about: true },
  });

  if (previous?.avatarUrl !== avatarUrl) removeUploadedFile(previous?.avatarUrl);
  return res.json({ user });
}