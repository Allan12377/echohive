import React, { ChangeEvent, FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Socket } from 'socket.io-client';
import { useSocket } from '@hooks/useSocket';
import Avatar from '@components/Avatar';
import MessageBubble from '@components/MessageBubble';
import { ChatConversation, ChatUser, Message, Profile } from '@app-types/index';
import { getMessages, listConversations, openConversation, searchUsers, uploadChatAttachment } from '@services/chatService';
import { getMyProfile, updateMyProfile, uploadProfileAvatar } from '@services/profileService';
import { getCallIceServers } from '@services/callService';

interface Props {
  currentUserId: string;
  token: string;
  onLogout: () => void;
  embedded?: boolean;
  visible?: boolean;
  initialContact?: ChatUser | null;
  profileRequest?: number;
}

interface OutgoingMessage {
  conversationId: string;
  content?: string;
  mediaUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
}

type CallMedia = 'audio' | 'video';
interface CallSession {
  conversationId: string;
  peer: ChatUser;
  media: CallMedia;
  direction: 'outgoing' | 'incoming';
  status: 'ringing' | 'connecting' | 'active';
  offer?: RTCSessionDescriptionInit;
}

function initials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const ChatWindow: React.FC<Props> = ({ currentUserId, token, onLogout, embedded = false, visible = true, initialContact = null, profileRequest = 0 }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUsername, setProfileUsername] = useState('');
  const [profileAbout, setProfileAbout] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [callSession, setCallSession] = useState<CallSession | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callMuted, setCallMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [callNotice, setCallNotice] = useState('');
  const socket = useSocket(token);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef<ChatConversation | null>(null);
  const openingContactsRef = useRef(new Map<string, Promise<ChatConversation>>());
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardVoiceRef = useRef(false);
  const callRef = useRef<CallSession | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceRef = useRef<Array<{ conversationId: string; candidate: RTCIceCandidateInit }>>([]);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  function updateCall(next: CallSession | null) {
    callRef.current = next;
    setCallSession(next);
  }

  async function addPendingIce(connection: RTCPeerConnection, conversationId: string) {
    if (!connection.remoteDescription) return;
    const candidates = pendingIceRef.current.filter((item) => item.conversationId === conversationId);
    pendingIceRef.current = pendingIceRef.current.filter((item) => item.conversationId !== conversationId);
    await Promise.all(candidates.map(({ candidate }) => connection.addIceCandidate(candidate).catch(() => {})));
  }

  async function createCallPeer(session: CallSession, stream: MediaStream): Promise<RTCPeerConnection> {
    const connection = new RTCPeerConnection({ iceServers: await getCallIceServers() });
    peerConnectionRef.current = connection;
    stream.getTracks().forEach((track) => connection.addTrack(track, stream));
    connection.onicecandidate = (event) => {
      if (event.candidate) socket?.emit('call:ice', {
        conversationId: session.conversationId,
        peerId: session.peer.id,
        candidate: event.candidate.toJSON(),
      });
    };
    connection.ontrack = (event) => {
      const streamWithTrack = event.streams[0] || new MediaStream([event.track]);
      setRemoteStream(streamWithTrack);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'connected' && callRef.current) {
        updateCall({ ...callRef.current, status: 'active' });
      } else if (connection.connectionState === 'failed') {
        setError('The call could not connect. Check the network or configure a TURN relay.');
        endCall(false);
      }
    };
    return connection;
  }

  function endCall(notifyPeer: boolean, decline = false) {
    const session = callRef.current;
    if (notifyPeer && session) socket?.emit(decline ? 'call:decline' : 'call:end', {
      conversationId: session.conversationId,
      peerId: session.peer.id,
    });
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingIceRef.current = pendingIceRef.current.filter((item) => item.conversationId !== session?.conversationId);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallMuted(false);
    setCameraEnabled(true);
    updateCall(null);
  }

  async function startCall(media: CallMedia) {
    if (!selected || !socket || callRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setError('Calls are not supported in this browser. Use a recent Chrome, Edge, or Safari browser.');
      return;
    }
    const session: CallSession = { conversationId: selected.id, peer: selected.contact, media, direction: 'outgoing', status: 'ringing' };
    updateCall(session);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: media === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const connection = await createCallPeer(session, stream);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      const response = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const timeout = window.setTimeout(() => resolve({ ok: false, error: 'The call request timed out.' }), 12_000);
        socket.emit('call:invite', { conversationId: session.conversationId, recipientId: session.peer.id, media, offer }, (result: { ok: boolean; error?: string }) => {
          window.clearTimeout(timeout);
          resolve(result);
        });
      });
      if (!response.ok) throw new Error(response.error || 'Could not start this call.');
    } catch (failure) {
      endCall(false);
      setError(failure instanceof Error && failure.name === 'NotAllowedError'
        ? 'Allow camera and microphone access to start a call.'
        : failure instanceof Error ? failure.message : 'Could not start the call.');
    }
  }

  async function acceptCall() {
    const session = callRef.current;
    if (!session || session.direction !== 'incoming' || !session.offer || !socket) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: session.media === 'video' });
      localStreamRef.current = stream;
      setLocalStream(stream);
      const connection = await createCallPeer(session, stream);
      await connection.setRemoteDescription(session.offer);
      await addPendingIce(connection, session.conversationId);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      socket.emit('call:answer', { conversationId: session.conversationId, peerId: session.peer.id, answer });
      updateCall({ ...session, status: 'connecting' });
      const conversationsNow = conversations.length ? conversations : await listConversations();
      const conversation = conversationsNow.find((item) => item.id === session.conversationId);
      if (conversation) {
        setConversations(conversationsNow);
        chooseConversation(conversation);
      }
    } catch (failure) {
      endCall(true, true);
      setError(failure instanceof Error && failure.name === 'NotAllowedError'
        ? 'Allow camera and microphone access to answer the call.'
        : 'Could not answer the call.');
    }
  }

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (initialContact) startConversation(initialContact);
  }, [initialContact?.id]);

  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(() => setError('Could not load conversations. Please refresh the page.'));
    getMyProfile()
      .then((user) => setProfile(user))
      .catch(() => setError('Could not load your profile. Please refresh the page.'));
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    const timeout = setTimeout(() => {
      searchUsers(value)
        .then((users) => {
          if (active) setResults(users);
        })
        .catch(() => {
          if (active) setError('Could not search for people.');
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }

    let active = true;
    setLoadingMessages(true);
    setError(null);
    getMessages(selected.id)
      .then((items) => {
        if (active) setMessages(items);
      })
      .catch(() => {
        if (active) setError('Could not load this conversation.');
      })
      .finally(() => {
        if (active) setLoadingMessages(false);
      });

    return () => {
      active = false;
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!socket || !selected) return;

    const conversationId = selected.id;
    const onTypingStart = (event: { userId: string; conversationId: string }) => {
      if (event.conversationId === conversationId && event.userId !== currentUserId) setTyping(true);
    };
    const onTypingStop = (event: { userId: string; conversationId: string }) => {
      if (event.conversationId === conversationId && event.userId !== currentUserId) setTyping(false);
    };

    socket.emit('conversation:join', conversationId);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      socket.emit('conversation:leave', conversationId);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
    };
  }, [socket, selected?.id, currentUserId]);

  useEffect(() => {
    if (!socket) return;

    const onMessage = (message: Message) => {
      const isOpen = selectedRef.current?.id === message.conversationId;
      if (isOpen) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
        if (message.senderId !== currentUserId) socket.emit('conversation:read', message.conversationId);
        setConversations((current) => current
          .map((conversation) => conversation.id === message.conversationId
            ? { ...conversation, lastMessage: message, unreadCount: 0 }
            : conversation)
          .sort((left, right) => new Date(right.lastMessage?.createdAt ?? right.createdAt).getTime()
            - new Date(left.lastMessage?.createdAt ?? left.createdAt).getTime()));
      } else {
        listConversations().then(setConversations).catch(() => {});
      }
    };
    const onConversationRead = (event: { conversationId: string; readerId: string }) => {
      if (event.readerId === currentUserId) {
        setConversations((current) => current.map((conversation) => conversation.id === event.conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation));
      } else {
        setMessages((current) => current.map((message) => message.conversationId === event.conversationId
          && message.senderId === currentUserId
          ? { ...message, status: 'READ' }
          : message));
      }
    };
    const onProfileUpdated = (updated: ChatUser) => {
      if (updated.id === currentUserId) setProfile((current) => current ? { ...current, ...updated } : current);
      setResults((current) => current.map((user) => user.id === updated.id ? { ...user, ...updated } : user));
      setConversations((current) => current.map((conversation) => conversation.contact.id === updated.id
        ? { ...conversation, contact: { ...conversation.contact, ...updated } }
        : conversation));
      setSelected((current) => current?.contact.id === updated.id
        ? { ...current, contact: { ...current.contact, ...updated } }
        : current);
    };

    socket.on('message:new', onMessage);
    socket.on('conversation:read', onConversationRead);
    socket.on('profile:updated', onProfileUpdated);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('conversation:read', onConversationRead);
      socket.off('profile:updated', onProfileUpdated);
    };
  }, [socket, currentUserId]);

  useEffect(() => {
    if (!socket) return;
    const onIncomingCall = (event: { conversationId: string; caller: ChatUser; media: CallMedia; offer: RTCSessionDescriptionInit }) => {
      if (callRef.current) {
        socket.emit('call:decline', { conversationId: event.conversationId, peerId: event.caller.id });
        return;
      }
      updateCall({ conversationId: event.conversationId, peer: event.caller, media: event.media, direction: 'incoming', status: 'ringing', offer: event.offer });
    };
    const onCallAnswered = async (event: { conversationId: string; answer: RTCSessionDescriptionInit }) => {
      if (callRef.current?.conversationId !== event.conversationId) return;
      try {
        const connection = peerConnectionRef.current;
        if (!connection) return;
        await connection.setRemoteDescription(event.answer);
        await addPendingIce(connection, event.conversationId);
        if (callRef.current) updateCall({ ...callRef.current, status: 'connecting' });
      } catch {
        setError('The call could not connect. Please try again.');
        endCall(false);
      }
    };
    const onCallIce = async (event: { conversationId: string; candidate: RTCIceCandidateInit }) => {
      if (callRef.current && callRef.current.conversationId !== event.conversationId) return;
      const connection = peerConnectionRef.current;
      if (!connection?.remoteDescription) {
        if (pendingIceRef.current.length < 64) pendingIceRef.current.push({ conversationId: event.conversationId, candidate: event.candidate });
        return;
      }
      await connection.addIceCandidate(event.candidate).catch(() => {});
    };
    const onCallDeclined = (event: { conversationId: string }) => {
      if (callRef.current?.conversationId !== event.conversationId) return;
      endCall(false);
      setCallNotice('Call declined');
    };
    const onCallEnded = (event: { conversationId: string }) => {
      if (callRef.current?.conversationId !== event.conversationId) return;
      endCall(false);
      setCallNotice('Call ended');
    };
    socket.on('call:incoming', onIncomingCall);
    socket.on('call:answered', onCallAnswered);
    socket.on('call:ice', onCallIce);
    socket.on('call:declined', onCallDeclined);
    socket.on('call:ended', onCallEnded);
    return () => {
      socket.off('call:incoming', onIncomingCall);
      socket.off('call:answered', onCallAnswered);
      socket.off('call:ice', onCallIce);
      socket.off('call:declined', onCallDeclined);
      socket.off('call:ended', onCallEnded);
    };
  }, [socket]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = callSession?.media === 'audio' ? remoteStream : null;
  }, [localStream, remoteStream, callSession?.media]);

  useEffect(() => {
    if (!callNotice) return;
    const timeout = window.setTimeout(() => setCallNotice(''), 3200);
    return () => window.clearTimeout(timeout);
  }, [callNotice]);

  useEffect(() => {
    if (!callSession || callSession.status === 'active') return;
    const sessionId = callSession.conversationId;
    const wasRinging = callSession.status === 'ringing';
    const timeout = window.setTimeout(() => {
      if (callRef.current?.conversationId !== sessionId || callRef.current.status === 'active') return;
      endCall(true);
      setCallNotice(wasRinging ? 'No answer' : 'Call could not connect');
    }, wasRinging ? 45_000 : 30_000);
    return () => window.clearTimeout(timeout);
  }, [callSession]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    discardVoiceRef.current = true;
    if (voiceRecorderRef.current?.state === 'recording') voiceRecorderRef.current.stop();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function chooseConversation(conversation: ChatConversation) {
    if (selectedRef.current?.id !== conversation.id && voiceRecorderRef.current?.state === 'recording') {
      discardVoiceRef.current = true;
      voiceRecorderRef.current.stop();
    }
    setSelected(conversation);
    if (conversation.unreadCount > 0) {
      setConversations((current) => current.map((item) => item.id === conversation.id
        ? { ...item, unreadCount: 0 }
        : item));
    }
    socket?.emit('conversation:read', conversation.id);
    setMobileChatOpen(true);
    setQuery('');
    setResults([]);
    setError(null);
  }

  async function startConversation(user: ChatUser) {
    setError(null);
    try {
      let request = openingContactsRef.current.get(user.id);
      if (!request) {
        request = openConversation(user.id);
        openingContactsRef.current.set(user.id, request);
      }
      const conversation = await request;
      openingContactsRef.current.delete(user.id);
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      chooseConversation(conversation);
    } catch {
      openingContactsRef.current.delete(user.id);
      setError('Could not open this conversation. Please try again.');
    }
  }

  function acknowledgeSend(
    currentSocket: Socket,
    payload: OutgoingMessage,
    acknowledge?: (result: { ok: boolean; error?: string }) => void
  ) {
    currentSocket.emit('message:send', payload, (result: { ok: boolean; error?: string }) => {
      if (acknowledge) acknowledge(result);
      if (!result.ok) setError(result.error || 'Message could not be sent.');
    });
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selected || !socket) return;

    setError(null);
    setDraft('');
    socket.emit('typing:stop', selected.id);
    acknowledgeSend(socket, { conversationId: selected.id, content }, (result) => {
      if (!result.ok) setDraft(content);
    });
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !selected || !socket) return;

    setError(null);
    setUploadingAttachment(true);
    try {
      const uploaded = await uploadChatAttachment(file);
      acknowledgeSend(socket, {
        conversationId: selected.id,
        mediaUrl: uploaded.url,
        attachmentName: uploaded.originalName,
        attachmentType: uploaded.mimeType,
        attachmentSize: uploaded.size,
      });
    } catch {
      setError('Upload failed. Files must be 50 MB or smaller.');
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function startVoiceRecording() {
    if (!selected || !socket || recordingVoice || uploadingAttachment) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Voice recording is not supported in this browser. Try a recent version of Chrome, Edge, or Safari.');
      return;
    }

    const conversationId = selected.id;
    const currentSocket = socket;
    setError(null);
    let stream: MediaStream | null = null;
    try {
      const capturedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = capturedStream;
      if (selectedRef.current?.id !== conversationId) {
        capturedStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeType = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(capturedStream, { mimeType }) : new MediaRecorder(capturedStream);
      voiceStreamRef.current = capturedStream;
      voiceChunksRef.current = [];
      discardVoiceRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        capturedStream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        voiceRecorderRef.current = null;
        if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
        setRecordingVoice(false);
        if (discardVoiceRef.current) {
          discardVoiceRef.current = false;
          voiceChunksRef.current = [];
          return;
        }

        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        voiceChunksRef.current = [];
        if (!blob.size) {
          setError('The recording was empty. Please try again.');
          return;
        }
        const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type: blob.type });
        setUploadingAttachment(true);
        try {
          const uploaded = await uploadChatAttachment(file);
          acknowledgeSend(currentSocket, {
            conversationId,
            mediaUrl: uploaded.url,
            attachmentName: 'Voice note',
            attachmentType: uploaded.mimeType,
            attachmentSize: uploaded.size,
          });
        } catch {
          setError('Voice note upload failed. Please try recording again.');
        } finally {
          setUploadingAttachment(false);
        }
      };
      recorder.start(250);
      voiceRecorderRef.current = recorder;
      setRecordingSeconds(0);
      setRecordingVoice(true);
      voiceTimerRef.current = setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setError('Allow microphone access to record a voice note.');
    }
  }

  function discardVoiceRecording() {
    if (!voiceRecorderRef.current || voiceRecorderRef.current.state !== 'recording') return;
    discardVoiceRef.current = true;
    voiceRecorderRef.current.stop();
  }

  const openProfile = useCallback(() => {
    if (!profile) return;
    setProfileUsername(profile.username);
    setProfileAbout(profile.about || '');
    setProfileError(null);
    setProfileOpen(true);
  }, [profile]);

  const handledProfileRequestRef = useRef(0);
  useEffect(() => {
    if (!profile || profileRequest <= handledProfileRequestRef.current) return;
    handledProfileRequestRef.current = profileRequest;
    openProfile();
  }, [profileRequest, profile, openProfile]);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updated = await updateMyProfile({ username: profileUsername, about: profileAbout });
      setProfile(updated);
      socket?.emit('profile:refresh');
      setProfileOpen(false);
    } catch {
      setProfileError('Could not save profile. The username may already be taken.');
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Choose a JPEG, PNG, WebP, or GIF image.');
      return;
    }

    setAvatarUploading(true);
    setProfileError(null);
    try {
      const updated = await uploadProfileAvatar(file);
      setProfile(updated);
      socket?.emit('profile:refresh');
    } catch {
      setProfileError('Could not upload this photo. Images must be 5 MB or smaller.');
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!socket || !selected) return;
    if (value.trim()) socket.emit('typing:start', selected.id);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing:stop', selected.id);
    }, 900);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const searchMode = query.trim().length >= 2;

  return (
    <main className={`messenger-shell ${embedded ? 'messenger-shell--embedded' : ''} ${mobileChatOpen ? 'messenger-shell--chat-open' : ''}`} style={visible ? undefined : { display: 'none' }}>
      <aside className="chat-sidebar">
        <header className="sidebar-topbar">
          <div className="sidebar-brand"><img className="brand-mark" src="/echohive-icon.svg" alt="" /><span>Messages</span></div>
          {!embedded && <button type="button" className="icon-button logout-button" onClick={onLogout} aria-label="Log out" title="Log out">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3m9-8h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /></svg>
          </button>}
        </header>

        <div className="sidebar-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
          <input
            aria-label="Search people"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people by username"
          />
          {query && <button className="search-clear" type="button" aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
        </div>

        {error && !selected && <div className="sidebar-error" role="alert">{error}</div>}
        <div className="list-heading">{searchMode ? 'PEOPLE' : 'CHATS'}</div>
        <div className="conversation-list">
          {searchMode ? (
            searching ? <p className="list-empty">Searching…</p> : results.length ? results.map((user) => (
              <button type="button" className="conversation-item" key={user.id} onClick={() => startConversation(user)}>
                <Avatar username={user.username} avatarUrl={user.avatarUrl} />
                <span className="conversation-copy"><strong>{user.username}</strong><small>{user.about || 'Start a conversation'}</small></span>
                <span className="open-arrow">›</span>
              </button>
            )) : <p className="list-empty">No people found. Try another username.</p>
          ) : conversations.length ? conversations.map((conversation) => (
            <button
              type="button"
              className={`conversation-item ${selected?.id === conversation.id ? 'conversation-item--active' : ''}`}
              key={conversation.id}
              onClick={() => chooseConversation(conversation)}
            >
              <Avatar username={conversation.contact.username} avatarUrl={conversation.contact.avatarUrl} />
              <span className="conversation-copy">
                <strong>{conversation.contact.username}</strong>
                <small>{conversation.lastMessage?.content || conversation.lastMessage?.attachmentName || conversation.contact.about || 'Start a conversation'}</small>
              </span>
              <span className="conversation-meta">
                <time>{formatTime(conversation.lastMessage?.createdAt ?? conversation.createdAt)}</time>
                {conversation.unreadCount > 0 && (
                  <span className="unread-count" aria-label={`${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? '' : 's'}`}>
                    {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                  </span>
                )}
              </span>
            </button>
          )) : <div className="list-empty list-empty--welcome">Search for someone by username to start chatting.</div>}
        </div>

        <button type="button" className="sidebar-profile" onClick={openProfile} aria-label="Edit profile">
          <Avatar username={profile?.username || 'Me'} avatarUrl={profile?.avatarUrl} className="avatar--small" />
          <span className="profile-copy"><strong>{profile?.username || 'Your account'}</strong><small>{profile?.about || 'Edit profile and status'}</small></span>
          <span className="profile-edit-mark" aria-hidden="true">⋯</span>
        </button>
      </aside>

      <section className="chat-panel">
        {selected ? (
          <>
            <header className="chat-topbar">
              <button type="button" className="icon-button back-button" aria-label="Back to chats" onClick={() => setMobileChatOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <Avatar username={selected.contact.username} avatarUrl={selected.contact.avatarUrl} />
              <div className="chat-contact"><strong>{selected.contact.username}</strong><small>{typing ? 'typing…' : selected.contact.about || 'Direct message'}</small></div>
              <div className="chat-topbar-actions">
                <span className="secure-label"><span />Direct conversation</span>
                <button type="button" className="chat-call-action" onClick={() => void startCall('audio')} disabled={!socket || Boolean(callSession)} title="Start voice call" aria-label="Start voice call">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3a14 14 0 0 1-6-6l3-2-2-5Z" /></svg>
                </button>
                <button type="button" className="chat-call-action" onClick={() => void startCall('video')} disabled={!socket || Boolean(callSession)} title="Start video call" aria-label="Start video call">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
                </button>
              </div>
            </header>

            <div className="message-history" aria-live="polite">
              <div className="history-intro"><Avatar username={selected.contact.username} avatarUrl={selected.contact.avatarUrl} className="avatar--large" /><strong>{selected.contact.username}</strong><small>{selected.contact.about || 'This is the beginning of your conversation.'}</small></div>
              {loadingMessages ? <p className="history-status">Loading messages…</p> : messages.map((message) => (
                <MessageBubble key={message.id} message={message} isOwn={message.senderId === currentUserId} />
              ))}
              {typing && <div className="typing-indicator"><span /><span /><span /></div>}
              <div ref={messagesEndRef} />
            </div>

            {error && <div className="chat-error" role="alert">{error}</div>}
            <form className="composer" onSubmit={handleSend}>
              <input ref={attachmentInputRef} className="visually-hidden" type="file" onChange={handleAttachmentChange} />
              <button
                type="button"
                className="icon-button attach-button"
                onClick={() => attachmentInputRef.current?.click()}
                disabled={uploadingAttachment || !socket}
                aria-label="Attach a file"
                title="Attach a file"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.4 11.1-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.8 1.8 0 0 1-2.5-2.5l8.5-8.5" /></svg>
              </button>
              {recordingVoice ? <div className="voice-recording-controls" role="status">
                <span className="voice-recording-indicator"><i />Recording {Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, '0')}</span>
                <button type="button" className="voice-cancel-button" onClick={discardVoiceRecording} aria-label="Discard voice note">Discard</button>
                <button type="button" className="voice-send-button" onClick={() => voiceRecorderRef.current?.stop()} aria-label="Send voice note">Send voice note</button>
              </div> : <>
              <textarea
                aria-label="Message"
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={uploadingAttachment ? 'Uploading file…' : 'Write a message…'}
                rows={1}
                maxLength={4000}
                disabled={uploadingAttachment}
              />
              <span className="composer-hint">{uploadingAttachment ? 'Uploading · 50 MB maximum' : 'Enter to send · Shift+Enter for a new line'}</span>
              {draft.trim() ? <button className="send-button" type="submit" disabled={!socket || uploadingAttachment} aria-label="Send message" title="Send message">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 3-7.2 18-3.6-7.2L3 10.2 21 3Z" /><path d="M10.2 13.8 15 9" /></svg>
              </button> : <button type="button" className="icon-button voice-record-button" onClick={() => void startVoiceRecording()} disabled={!socket || uploadingAttachment} aria-label="Record voice note" title="Record voice note">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" /></svg>
              </button>}
              </>}
            </form>
          </>
        ) : (
          <div className="empty-chat">
            <div className="empty-chat-art"><span className="art-back" /><span className="art-front">M</span><span className="art-spark">✳</span></div>
            <h1>Your messages, in one place</h1>
            <p>Choose a conversation or search for someone to start a private chat.</p>
            <span className="empty-chat-rule" />
            <small>One-to-one conversations</small>
          </div>
        )}
      </section>

      {callSession && createPortal(<div className="call-overlay" role="presentation">
        <section className={`call-card ${callSession.media === 'video' && callSession.status !== 'ringing' ? 'call-card--video' : ''}`} role="dialog" aria-modal="true" aria-label={`${callSession.media} call with ${callSession.peer.username}`}>
          {callSession.media === 'video' && callSession.status !== 'ringing' && remoteStream
            ? <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
            : <div className="call-person"><span className="call-avatar-ring"><Avatar username={callSession.peer.username} avatarUrl={callSession.peer.avatarUrl} className="avatar--call" /></span>
                <strong>{callSession.peer.username}</strong>
                <small>{callSession.direction === 'incoming' ? `Incoming ${callSession.media === 'video' ? 'video' : 'voice'} call` : callSession.status === 'active' ? 'Connected' : callSession.status === 'connecting' ? 'Connecting…' : `Calling ${callSession.peer.username}…`}</small>
              </div>}
          {callSession.media === 'audio' && <audio ref={remoteAudioRef} autoPlay />}
          {callSession.media === 'video' && callSession.status !== 'ringing' && localStream && <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />}
          {callSession.direction === 'incoming' && callSession.status === 'ringing' ? <div className="call-incoming-actions">
            <button type="button" className="call-decline-button" onClick={() => endCall(true, true)}>Decline</button>
            <button type="button" className="call-accept-button" onClick={() => void acceptCall()}>{callSession.media === 'video' ? 'Accept video' : 'Accept call'}</button>
          </div> : <div className="call-controls">
            {callSession.status !== 'active' && <span>{callSession.status === 'ringing' ? 'Ringing' : 'Connecting'}</span>}
            <button type="button" className={callMuted ? 'call-control is-on' : 'call-control'} onClick={() => {
              const next = !callMuted;
              localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
              setCallMuted(next);
            }} aria-label={callMuted ? 'Unmute microphone' : 'Mute microphone'}>{callMuted ? 'Unmute' : 'Mute'}</button>
            {callSession.media === 'video' && <button type="button" className={cameraEnabled ? 'call-control' : 'call-control is-on'} onClick={() => {
              const next = !cameraEnabled;
              localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
              setCameraEnabled(next);
            }} aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{cameraEnabled ? 'Camera on' : 'Camera off'}</button>}
            <button type="button" className="call-end-button" onClick={() => endCall(true)}>End call</button>
          </div>}
        </section>
      </div>, document.body)}
      {callNotice && createPortal(<div className="call-notice" role="status">{callNotice}</div>, document.body)}

      {profileOpen && profile && (
        <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <form className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" onSubmit={saveProfile}>
            <header className="profile-dialog-header">
              <div><h2 id="profile-title">Your profile</h2><p>Update your public details.</p></div>
              <button type="button" className="icon-button" aria-label="Close profile" onClick={() => setProfileOpen(false)}>×</button>
            </header>
            {profileError && <div className="profile-error" role="alert">{profileError}</div>}
            <div className="profile-photo-row">
              <Avatar username={profile.username} avatarUrl={profile.avatarUrl} className="avatar--profile" />
              <div className="profile-photo-copy"><strong>Profile photo</strong><small>JPEG, PNG, WebP, or GIF · 5 MB max</small></div>
              <input ref={avatarInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarChange} />
              <button type="button" className="profile-photo-action" onClick={() => avatarInputRef.current?.click()} disabled={avatarUploading}>
                {avatarUploading ? 'Uploading…' : 'Change'}
              </button>
            </div>
            <label className="profile-field"><span>Username</span><input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} minLength={3} maxLength={30} required /></label>
            <label className="profile-field"><span>About / status</span><textarea value={profileAbout} onChange={(event) => setProfileAbout(event.target.value)} maxLength={139} rows={3} placeholder="Add a short status" /></label>
            <div className="profile-character-count">{profileAbout.length}/139</div>
            <footer className="profile-dialog-actions">
              <button type="button" className="profile-cancel" onClick={() => setProfileOpen(false)}>Cancel</button>
              <button type="submit" className="profile-save" disabled={profileSaving || avatarUploading}>{profileSaving ? 'Saving…' : 'Save changes'}</button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
};

export default ChatWindow;
