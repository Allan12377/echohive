import { Response } from 'express';
import { z } from 'zod';
import prisma from '@config/prisma';
import { AuthedRequest } from '@middleware/auth';

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000).optional(),
  mediaUrl: z.string().regex(/^\/uploads\/[a-f0-9-]+(?:\.[a-z0-9]+)?$/i).optional(),
  attachmentName: z.string().min(1).max(255).optional(),
  attachmentType: z.string().max(150).optional(),
  attachmentSize: z.number().int().min(0).max(50 * 1024 * 1024).optional(),
}).refine((message) => message.content || message.mediaUrl, 'A message or attachment is required');

export async function getMessages(req: AuthedRequest, res: Response) {
  const { conversationId } = req.params;
  const userId = req.userId as string;
  const participant = await prisma.participant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) return res.status(403).json({ error: 'You are not a participant in this conversation' });

  const limit = Number(req.query.limit) || 50;
  const cursor = req.query.cursor as string | undefined;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
  });

  return res.json({ messages: messages.reverse() });
}

export async function sendMessage(req: AuthedRequest, res: Response) {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { conversationId, content, mediaUrl, attachmentName, attachmentType, attachmentSize } = parsed.data;
  const senderId = req.userId as string;
  const participant = await prisma.participant.findUnique({
    where: { conversationId_userId: { conversationId, userId: senderId } },
  });
  if (!participant) return res.status(403).json({ error: 'You are not a participant in this conversation' });

  const message = await prisma.message.create({
    data: { conversationId, senderId, content, mediaUrl, attachmentName, attachmentType, attachmentSize },
  });

  // Note: the Socket.io layer (src/sockets) is responsible for pushing
  // this message to connected participants in real time.
  return res.status(201).json({ message });
}
