import api from '@services/api';
import { ChatConversation, ChatUser, Message } from '@app-types/index';

export interface UploadedAttachment {
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

export async function searchUsers(search: string): Promise<ChatUser[]> {
  const { data } = await api.get<{ users: ChatUser[] }>('/chat/users', { params: { search } });
  return data.users;
}

export async function listConversations(): Promise<ChatConversation[]> {
  const { data } = await api.get<{ conversations: ChatConversation[] }>('/chat/conversations', {
    headers: { 'Cache-Control': 'no-cache' },
  });
  return data.conversations;
}

export async function openConversation(recipientId: string): Promise<ChatConversation> {
  const { data } = await api.post<{ conversation: ChatConversation }>('/chat/conversations', { recipientId });
  return data.conversation;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data } = await api.get<{ messages: Message[] }>(`/messages/${conversationId}`);
  return data.messages;
}

export async function uploadChatAttachment(file: File): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<UploadedAttachment>('/chat/upload', form);
  return data;
}