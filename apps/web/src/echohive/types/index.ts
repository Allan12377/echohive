export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string | null;
  about?: string | null;
  lastSeen?: string;
}

export type MessageStatus = 'SENT' | 'DELIVERED' | 'READ';

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content?: string | null;
  mediaUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentSize?: number | null;
  status: MessageStatus;
  createdAt: string;
}

export interface Conversation {
  id: string;
  isGroup: boolean;
  name?: string;
  createdAt: string;
}

export interface ChatUser {
  id: string;
  username: string;
  avatarUrl?: string | null;
  about?: string | null;
  lastSeen?: string;
}

export interface Profile extends ChatUser {
  email: string;
  businessName?: string | null;
  businessAbout?: string | null;
}

export interface MarketListing {
  id: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  imageUrl?: string | null;
  modelUrl?: string | null;
  createdAt: string;
  seller: ChatUser & { businessName: string | null; businessAbout: string | null };
}

export interface ChatConversation extends Conversation {
  contact: ChatUser;
  lastMessage: Message | null;
  unreadCount: number;
}

export interface AuthResponse {
  user: User;
  token: string;
}
