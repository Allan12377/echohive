import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '@config/prisma';
import { AuthedRequest } from '@middleware/auth';

const conversationInclude = {
  participants: {
    include: {
      user: {
        select: { id: true, username: true, avatarUrl: true, about: true, lastSeen: true },
      },
    },
  },
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude;

type ConversationWithDetails = Prisma.ConversationGetPayload<{
  include: typeof conversationInclude;
}>;

const openConversationSchema = z.object({
  recipientId: z.string().uuid(),
});

function formatConversation(conversation: ConversationWithDetails, userId: string) {
  const contact = conversation.participants.find((participant) => participant.userId !== userId)?.user;
  if (!contact) return null;

  return {
    id: conversation.id,
    isGroup: conversation.isGroup,
    name: conversation.name,
    createdAt: conversation.createdAt,
    contact,
    lastMessage: conversation.messages[0] ?? null,
    unreadCount: 0,
  };
}

export async function findUsers(req: AuthedRequest, res: Response) {
  const search = String(req.query.search || '').trim();
  if (search.length < 2) return res.json({ users: [] });

  const users = await prisma.user.findMany({
    where: {
      id: { not: req.userId },
      username: { contains: search, mode: 'insensitive' },
    },
    select: { id: true, username: true, avatarUrl: true, about: true, lastSeen: true },
    orderBy: { username: 'asc' },
    take: 20,
  });

  return res.json({ users });
}

export async function listConversations(req: AuthedRequest, res: Response) {
  const userId = req.userId as string;
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId } } },
    include: conversationInclude,
  });

  const unreadMessages = conversations.length
    ? await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversations.map((conversation) => conversation.id) },
        senderId: { not: userId },
        status: { not: 'READ' },
      },
      _count: { _all: true },
    })
    : [];
  const unreadCounts = new Map(unreadMessages.map((item) => [item.conversationId, item._count._all]));

  const formatted = conversations
    .map((conversation) => formatConversation(conversation, userId))
    .filter((conversation): conversation is NonNullable<typeof conversation> => conversation !== null)
    .map((conversation) => ({
      ...conversation,
      unreadCount: unreadCounts.get(conversation.id) || 0,
    }))
    .sort((left, right) => {
      const leftDate = left.lastMessage?.createdAt ?? left.createdAt;
      const rightDate = right.lastMessage?.createdAt ?? right.createdAt;
      return rightDate.getTime() - leftDate.getTime();
    });

  res.set('Cache-Control', 'no-store');
  return res.json({ conversations: formatted });
}

export async function openConversation(req: AuthedRequest, res: Response) {
  const parsed = openConversationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const userId = req.userId as string;
  const { recipientId } = parsed.data;
  if (recipientId === userId) return res.status(400).json({ error: 'Choose another user' });
  const directKey = [userId, recipientId].sort().join(':');

  const recipient = await prisma.user.findUnique({ where: { id: recipientId }, select: { id: true } });
  if (!recipient) return res.status(404).json({ error: 'User not found' });

  const existing = await prisma.conversation.findUnique({
    where: { directKey },
    include: conversationInclude,
  });

  if (existing) {
    return res.json({ conversation: formatConversation(existing, userId) });
  }

  const legacy = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: recipientId } } },
        { participants: { every: { userId: { in: [userId, recipientId] } } } },
      ],
    },
    include: conversationInclude,
  });
  if (legacy) {
    await prisma.conversation.update({ where: { id: legacy.id }, data: { directKey } });
    return res.json({ conversation: formatConversation(legacy, userId) });
  }

  let conversation;
  try {
    conversation = await prisma.conversation.create({
      data: {
        isGroup: false,
        directKey,
        participants: { create: [{ userId }, { userId: recipientId }] },
      },
      include: conversationInclude,
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    conversation = await prisma.conversation.findUnique({ where: { directKey }, include: conversationInclude });
    if (!conversation) throw error;
    return res.json({ conversation: formatConversation(conversation, userId) });
  }

  return res.status(201).json({ conversation: formatConversation(conversation, userId) });
}