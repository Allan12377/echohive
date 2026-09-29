import api from '@services/api';
import { uploadChatAttachment } from '@services/chatService';

export interface StatusUpdate {
  id: string;
  mediaUrl: string;
  mediaType: string;
  caption?: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface StatusGroup {
  user: { id: string; username: string; avatarUrl?: string | null };
  isMine: boolean;
  updates: StatusUpdate[];
}

export async function getStatuses(): Promise<StatusGroup[]> {
  const { data } = await api.get<{ statuses: StatusGroup[] }>('/statuses');
  return data.statuses;
}

export async function publishStatus(file: File, caption: string): Promise<void> {
  if (!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'model/gltf-binary') {
    throw new Error('Choose an image, video, or 3D photo.');
  }
  const uploaded = await uploadChatAttachment(file);
  await api.post('/statuses', { mediaUrl: uploaded.url, mediaType: uploaded.mimeType, caption });
}

export async function removeStatus(statusId: string): Promise<void> {
  await api.delete(`/statuses/${statusId}`);
}
