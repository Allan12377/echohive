import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '@config/prisma';

interface AuthedSocket extends Socket {
  userId?: string;
}

export function initSockets(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  // Authenticate every socket connection using the same JWT as the REST API
  io.use((socket: AuthedSocket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));

    try {
      const secret = process.env.JWT_SECRET as string;
      const payload = jwt.verify(token, secret) as { userId: string };
      socket.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid auth token'));
    }
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = socket.userId as string;
    const callDescriptionSchema = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(100000) });
    const callCandidateSchema = z.object({
      candidate: z.string().max(4096),
      sdpMid: z.string().max(256).nullable().optional(),
      sdpMLineIndex: z.number().int().nullable().optional(),
      usernameFragment: z.string().max(256).nullable().optional(),
    });
    const isCallParticipant = async (conversationId: string, peerId: string) => {
      if (peerId === userId) return false;
      const participants = await prisma.participant.findMany({
        where: { conversationId, userId: { in: [userId, peerId] } },
        select: { userId: true },
      });
      return participants.length === 2;
    };

    // Personal room lets us push events to a user regardless of which
    // conversation-specific room they're in.
    socket.join(`user:${userId}`);

    socket.on('profile:refresh', async () => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, avatarUrl: true, about: true, lastSeen: true },
        });
        if (user) io.emit('profile:updated', user);
      } catch {
        // Profile refresh is best-effort; the persisted profile remains available via REST.
      }
    });

    prisma.user
      .update({ where: { id: userId }, data: { lastSeen: new Date() } })
      .catch(() => {});

    socket.on('conversation:join', (conversationId: string) => {
      if (!z.string().uuid().safeParse(conversationId).success) return;
      prisma.participant
        .findUnique({ where: { conversationId_userId: { conversationId, userId } } })
        .then((participant) => {
          if (participant) socket.join(`conversation:${conversationId}`);
        })
        .catch(() => {});
    });

    socket.on('conversation:leave', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('call:invite', async (payload: unknown, acknowledge?: (result: { ok: boolean; error?: string }) => void) => {
      const parsed = z.object({
        conversationId: z.string().uuid(),
        recipientId: z.string().uuid(),
        media: z.enum(['audio', 'video']),
        offer: callDescriptionSchema.extend({ type: z.literal('offer') }),
      }).safeParse(payload);
      if (!parsed.success) return acknowledge?.({ ok: false, error: 'Invalid call request' });

      try {
        const { conversationId, recipientId, media, offer } = parsed.data;
        if (!await isCallParticipant(conversationId, recipientId)) return acknowledge?.({ ok: false, error: 'This person is not in the conversation' });
        if (!io.sockets.adapter.rooms.get(`user:${recipientId}`)?.size) return acknowledge?.({ ok: false, error: 'This person is offline' });
        const caller = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, avatarUrl: true } });
        if (!caller) return acknowledge?.({ ok: false, error: 'Your account could not be found' });
        io.to(`user:${recipientId}`).emit('call:incoming', { conversationId, caller, media, offer });
        acknowledge?.({ ok: true });
      } catch {
        acknowledge?.({ ok: false, error: 'Could not start the call' });
      }
    });

    socket.on('call:answer', async (payload: unknown) => {
      const parsed = z.object({ conversationId: z.string().uuid(), peerId: z.string().uuid(), answer: callDescriptionSchema.extend({ type: z.literal('answer') }) }).safeParse(payload);
      if (!parsed.success) return;
      try {
        const { conversationId, peerId, answer } = parsed.data;
        if (await isCallParticipant(conversationId, peerId)) io.to(`user:${peerId}`).emit('call:answered', { conversationId, answer });
      } catch { /* A dropped signaling packet ends through the call connection state. */ }
    });

    socket.on('call:ice', async (payload: unknown) => {
      const parsed = z.object({ conversationId: z.string().uuid(), peerId: z.string().uuid(), candidate: callCandidateSchema }).safeParse(payload);
      if (!parsed.success) return;
      try {
        const { conversationId, peerId, candidate } = parsed.data;
        if (await isCallParticipant(conversationId, peerId)) io.to(`user:${peerId}`).emit('call:ice', { conversationId, candidate });
      } catch { /* ICE is best-effort; peers keep gathering candidates. */ }
    });

    socket.on('call:decline', async (payload: unknown) => {
      const parsed = z.object({ conversationId: z.string().uuid(), peerId: z.string().uuid() }).safeParse(payload);
      if (!parsed.success) return;
      try {
        const { conversationId, peerId } = parsed.data;
        if (await isCallParticipant(conversationId, peerId)) io.to(`user:${peerId}`).emit('call:declined', { conversationId });
      } catch { /* The peer will see the disconnected call state. */ }
    });

    socket.on('call:end', async (payload: unknown) => {
      const parsed = z.object({ conversationId: z.string().uuid(), peerId: z.string().uuid() }).safeParse(payload);
      if (!parsed.success) return;
      try {
        const { conversationId, peerId } = parsed.data;
        if (await isCallParticipant(conversationId, peerId)) io.to(`user:${peerId}`).emit('call:ended', { conversationId });
      } catch { /* The peer will see the disconnected call state. */ }
    });

    socket.on('conversation:read', async (conversationId: string) => {
      if (!z.string().uuid().safeParse(conversationId).success) return;

      try {
        const participant = await prisma.participant.findUnique({
          where: { conversationId_userId: { conversationId, userId } },
        });
        if (!participant) return;

        await prisma.message.updateMany({
          where: { conversationId, senderId: { not: userId }, status: { not: 'READ' } },
          data: { status: 'READ' },
        });

        const participants = await prisma.participant.findMany({
          where: { conversationId },
          select: { userId: true },
        });
        io.to(`conversation:${conversationId}`)
          .to(participants.map((item) => `user:${item.userId}`))
          .emit('conversation:read', { conversationId, readerId: userId });
      } catch {
        // A read receipt is best-effort; unread status can be reconciled on the next list load.
      }
    });

    socket.on(
      'message:send',
      async (
        payload: { conversationId: string; content?: string; mediaUrl?: string },
        acknowledge?: (result: { ok: boolean; error?: string }) => void
      ) => {
        const parsed = z.object({
          conversationId: z.string().uuid(),
          content: z.string().trim().min(1).max(4000).optional(),
          mediaUrl: z.string().regex(/^\/uploads\/[a-f0-9-]+(?:\.[a-z0-9]+)?$/i).optional(),
          attachmentName: z.string().min(1).max(255).optional(),
          attachmentType: z.string().max(150).optional(),
          attachmentSize: z.number().int().min(0).max(50 * 1024 * 1024).optional(),
        }).refine((message) => message.content || message.mediaUrl).safeParse(payload);

        if (!parsed.success) {
          acknowledge?.({ ok: false, error: 'Enter a message before sending' });
          return;
        }

        try {
          const { conversationId, content, mediaUrl, attachmentName, attachmentType, attachmentSize } = parsed.data;
          const participant = await prisma.participant.findUnique({
            where: { conversationId_userId: { conversationId, userId } },
          });
          if (!participant) {
            acknowledge?.({ ok: false, error: 'You are not a participant in this conversation' });
            return;
          }

          const message = await prisma.message.create({
            data: { conversationId, senderId: userId, content, mediaUrl, attachmentName, attachmentType, attachmentSize },
          });

          const participants = await prisma.participant.findMany({
            where: { conversationId },
            select: { userId: true },
          });
          io.to(`conversation:${conversationId}`)
            .to(participants.map((participant) => `user:${participant.userId}`))
            .emit('message:new', message);
          acknowledge?.({ ok: true });
        } catch {
          acknowledge?.({ ok: false, error: 'Message could not be sent' });
        }
      }
    );

    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { userId, conversationId });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId, conversationId });
    });

    socket.on('disconnect', () => {
      prisma.user
        .update({ where: { id: userId }, data: { lastSeen: new Date() } })
        .catch(() => {});
    });
  });

  return io;
}
