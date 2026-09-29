import api from '@services/api';

export interface VideoPost {
  id: string;
  videoUrl: string;
  caption: string;
  createdAt: string;
  creator: { id: string; username: string; avatarUrl?: string | null };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}

export interface VideoComment {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; username: string; avatarUrl?: string | null };
}

interface VideoPage { posts: VideoPost[]; nextCursor: string | null }
interface UploadSession { uploadId: string; chunkSize: number; chunkCount: number; received: number[] }
interface UploadResume { uploadId: string; name: string; size: number; lastModified: number }
type UploadFingerprint = Omit<UploadResume, 'uploadId'>;

const resumeKey = 'video-upload-resume';

export async function getVideos(cursor?: string): Promise<VideoPage> {
  const { data } = await api.get<VideoPage>('/videos', { params: cursor ? { cursor } : undefined });
  return data;
}

export async function toggleVideoLike(videoId: string): Promise<{ liked: boolean; likeCount: number }> {
  const { data } = await api.post<{ liked: boolean; likeCount: number }>(`/videos/${videoId}/likes`);
  return data;
}

export async function getVideoComments(videoId: string): Promise<VideoComment[]> {
  const { data } = await api.get<{ comments: VideoComment[] }>(`/videos/${videoId}/comments`);
  return data.comments;
}

export async function addVideoComment(videoId: string, content: string): Promise<VideoComment> {
  const { data } = await api.post<{ comment: VideoComment }>(`/videos/${videoId}/comments`, { content });
  return data.comment;
}

export async function uploadVideo(file: File, caption: string, onProgress: (percent: number) => void): Promise<VideoPost> {
  const fingerprint: UploadFingerprint = { name: file.name, size: file.size, lastModified: file.lastModified };
  let resume: UploadResume | null = null;
  try { resume = JSON.parse(localStorage.getItem(resumeKey) || 'null') as UploadResume | null; } catch { resume = null; }

  let session: UploadSession;
  if (resume && resume.name === fingerprint.name && resume.size === fingerprint.size && resume.lastModified === fingerprint.lastModified) {
    try {
      const { data } = await api.get<UploadSession>(`/videos/uploads/${resume.uploadId}`);
      session = data;
    } catch {
      resume = null;
      session = await createSession(file, caption, fingerprint);
    }
  } else {
    session = await createSession(file, caption, fingerprint);
  }

  const received = new Set(session.received || []);
  let sentBytes = [...received].reduce((sum, index) => sum + Math.min(session.chunkSize, file.size - index * session.chunkSize), 0);
  onProgress(Math.round((sentBytes / file.size) * 100));
  const pending = Array.from({ length: session.chunkCount }, (_, index) => index).filter((index) => !received.has(index));
  let nextIndex = 0;
  async function sendNext(): Promise<void> {
    const pendingIndex = nextIndex;
    nextIndex += 1;
    if (pendingIndex >= pending.length) return;
    const index = pending[pendingIndex];
    const start = index * session.chunkSize;
    const chunk = file.slice(start, Math.min(start + session.chunkSize, file.size));
    const body = new FormData();
    body.append('chunk', chunk, `${file.name}.part`);
    await api.put(`/videos/uploads/${session.uploadId}/chunks/${index}`, body);
    sentBytes += chunk.size;
    onProgress(Math.round((sentBytes / file.size) * 100));
    await sendNext();
  }
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, () => sendNext()));

  const { data } = await api.post<{ post: VideoPost }>(`/videos/uploads/${session.uploadId}/complete`);
  localStorage.removeItem(resumeKey);
  return data.post;
}

async function createSession(file: File, caption: string, fingerprint: UploadFingerprint): Promise<UploadSession> {
  const { data } = await api.post<{ uploadId: string; chunkSize: number; chunkCount: number }>('/videos/uploads', {
    originalName: file.name, mimeType: file.type || 'video/mp4', size: file.size, caption,
  });
  localStorage.setItem(resumeKey, JSON.stringify({ ...fingerprint, uploadId: data.uploadId }));
  return { ...data, received: [] };
}
