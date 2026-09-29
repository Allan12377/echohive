import { createReadStream, createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Response } from 'express';
import { z } from 'zod';
import prisma from '@config/prisma';
import { uploadDirectory } from '@config/uploads';
import { AuthedRequest } from '@middleware/auth';

const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const sessionDirectory = path.join(uploadDirectory, '.video-sessions');
const sessionSchema = z.object({
  id: z.string().uuid(), originalName: z.string().max(255), mimeType: z.string().max(150),
  size: z.number().int().positive().max(MAX_VIDEO_SIZE), chunkCount: z.number().int().positive(),
  caption: z.string().trim().max(500), creatorId: z.string(),
});

async function readSession(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  try {
    const value: unknown = JSON.parse(await fs.readFile(path.join(sessionDirectory, `${id}.json`), 'utf8'));
    const parsed = sessionSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function createVideoUpload(req: AuthedRequest, res: Response) {
  const parsed = z.object({
    originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().max(150),
    size: z.number().int().positive().max(MAX_VIDEO_SIZE), caption: z.string().trim().max(500).default(''),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!parsed.data.mimeType.startsWith('video/')) return res.status(415).json({ error: 'Choose a video file' });

  const id = randomUUID();
  const chunkCount = Math.ceil(parsed.data.size / CHUNK_SIZE);
  const session = { ...parsed.data, id, chunkCount, creatorId: req.userId as string };
  await fs.mkdir(path.join(sessionDirectory, id), { recursive: true });
  await fs.writeFile(path.join(sessionDirectory, `${id}.json`), JSON.stringify(session), { flag: 'wx' });
  return res.status(201).json({ uploadId: id, chunkSize: CHUNK_SIZE, chunkCount });
}

export async function getVideoUpload(req: AuthedRequest, res: Response) {
  const session = await readSession(req.params.uploadId);
  if (!session || session.creatorId !== req.userId) return res.status(404).json({ error: 'Upload session not found' });
  const received: number[] = [];
  for (let index = 0; index < session.chunkCount; index += 1) {
    try {
      await fs.access(path.join(sessionDirectory, session.id, `${index}.part`));
      received.push(index);
    } catch { /* Missing chunks are expected while an upload is in progress. */ }
  }
  return res.json({ uploadId: session.id, chunkSize: CHUNK_SIZE, chunkCount: session.chunkCount, received });
}

export async function putVideoChunk(req: AuthedRequest, res: Response) {
  const session = await readSession(req.params.uploadId);
  if (!session || session.creatorId !== req.userId) return res.status(404).json({ error: 'Upload session not found' });
  const index = Number(req.params.index);
  if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount) return res.status(400).json({ error: 'Invalid chunk index' });
  if (!req.file) return res.status(400).json({ error: 'Video chunk is missing' });
  const expectedSize = index === session.chunkCount - 1 ? session.size - index * CHUNK_SIZE : CHUNK_SIZE;
  if (req.file.size !== expectedSize) return res.status(400).json({ error: 'Video chunk size does not match the upload' });
  await fs.writeFile(path.join(sessionDirectory, session.id, `${index}.part`), req.file.buffer);
  return res.status(204).end();
}

export async function finishVideoUpload(req: AuthedRequest, res: Response) {
  const session = await readSession(req.params.uploadId);
  if (!session || session.creatorId !== req.userId) return res.status(404).json({ error: 'Upload session not found' });
  const extension = path.extname(session.originalName).toLowerCase();
  const allowed = new Set(['.mp4', '.webm', '.mov', '.m4v']);
  if (!allowed.has(extension)) return res.status(415).json({ error: 'Use an MP4, WebM, MOV, or M4V video' });

  const chunkPaths = Array.from({ length: session.chunkCount }, (_, index) => path.join(sessionDirectory, session.id, `${index}.part`));
  const videoUrl = `/uploads/video-${session.id}${extension}`;
  const destination = path.join(uploadDirectory, path.basename(videoUrl));
  try {
    let total = 0;
    for (const chunkPath of chunkPaths) total += (await fs.stat(chunkPath)).size;
    if (total !== session.size) return res.status(409).json({ error: 'Some video chunks are missing. Resume the upload and try again.' });

    const output = createWriteStream(destination, { flags: 'wx' });
    await pipeline(async function* () {
      for (const chunkPath of chunkPaths) yield* createReadStream(chunkPath);
    }, output);
    const post = await prisma.videoPost.create({
      data: { creatorId: session.creatorId, videoUrl, caption: session.caption },
      select: { id: true, videoUrl: true, caption: true, createdAt: true, creator: { select: { id: true, username: true, avatarUrl: true } } },
    });
    await fs.rm(path.join(sessionDirectory, session.id), { recursive: true, force: true });
    await fs.rm(path.join(sessionDirectory, `${session.id}.json`), { force: true });
    return res.status(201).json({ post: { ...post, likeCount: 0, commentCount: 0, likedByMe: false } });
  } catch {
    await fs.rm(destination, { force: true }).catch(() => {});
    return res.status(409).json({ error: 'Some video chunks are missing. Resume the upload and try again.' });
  }
}

export async function listVideos(req: AuthedRequest, res: Response) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 30);
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const posts = await prisma.videoPost.findMany({
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, videoUrl: true, caption: true, createdAt: true,
      creator: { select: { id: true, username: true, avatarUrl: true } },
      _count: { select: { likes: true, comments: true } },
      likes: { where: { userId: req.userId }, select: { userId: true }, take: 1 },
    },
  });
  const hasMore = posts.length > limit;
  const page = (hasMore ? posts.slice(0, limit) : posts).map(({ _count, likes, ...post }) => ({
    ...post,
    likeCount: _count.likes,
    commentCount: _count.comments,
    likedByMe: likes.length > 0,
  }));
  return res.json({ posts: page, nextCursor: hasMore ? page[page.length - 1]?.id : null });
}

export async function toggleVideoLike(req: AuthedRequest, res: Response) {
  const videoPostId = req.params.videoId;
  const userId = req.userId as string;
  const post = await prisma.videoPost.findUnique({ where: { id: videoPostId }, select: { id: true } });
  if (!post) return res.status(404).json({ error: 'Clip not found' });

  const existing = await prisma.videoLike.findUnique({ where: { videoPostId_userId: { videoPostId, userId } } });
  if (existing) {
    await prisma.videoLike.delete({ where: { videoPostId_userId: { videoPostId, userId } } });
  } else {
    await prisma.videoLike.create({ data: { videoPostId, userId } });
  }
  const [likeCount, liked] = await Promise.all([
    prisma.videoLike.count({ where: { videoPostId } }),
    prisma.videoLike.findUnique({ where: { videoPostId_userId: { videoPostId, userId } }, select: { id: true } }),
  ]);
  return res.json({ liked: Boolean(liked), likeCount });
}

export async function listVideoComments(req: AuthedRequest, res: Response) {
  const videoPostId = req.params.videoId;
  const post = await prisma.videoPost.findUnique({ where: { id: videoPostId }, select: { id: true } });
  if (!post) return res.status(404).json({ error: 'Clip not found' });
  const comments = await prisma.videoComment.findMany({
    where: { videoPostId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  return res.json({ comments: comments.reverse() });
}

export async function createVideoComment(req: AuthedRequest, res: Response) {
  const parsed = z.object({ content: z.string().trim().min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Write a comment up to 1,000 characters.' });
  const videoPostId = req.params.videoId;
  const post = await prisma.videoPost.findUnique({ where: { id: videoPostId }, select: { id: true } });
  if (!post) return res.status(404).json({ error: 'Clip not found' });
  const comment = await prisma.videoComment.create({
    data: { videoPostId, userId: req.userId as string, content: parsed.data.content },
    select: { id: true, content: true, createdAt: true, user: { select: { id: true, username: true, avatarUrl: true } } },
  });
  return res.status(201).json({ comment });
}

export async function deleteVideoComment(req: AuthedRequest, res: Response) {
  const result = await prisma.videoComment.deleteMany({ where: { id: req.params.commentId, userId: req.userId as string } });
  if (!result.count) return res.status(404).json({ error: 'Comment not found' });
  return res.status(204).end();
}
