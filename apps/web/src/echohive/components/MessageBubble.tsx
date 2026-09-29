import React from 'react';
import { Message } from '@app-types/index';

interface Props {
  message: Message;
  isOwn: boolean;
}

const MessageBubble: React.FC<Props> = ({ message, isOwn }) => {
  const modifier = isOwn ? 'message-bubble--sent' : 'message-bubble--received';
  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const attachmentType = message.attachmentType || '';
  const attachmentName = message.attachmentName || 'Download file';
  const fileSize = message.attachmentSize
    ? message.attachmentSize >= 1024 * 1024
      ? `${(message.attachmentSize / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(message.attachmentSize / 1024))} KB`
    : '';

  return (
    <article className={`message-row ${isOwn ? 'message-row--sent' : 'message-row--received'}`}>
      <div className={`message-bubble ${modifier}`}>
        {message.content && <p>{message.content}</p>}
        {message.mediaUrl && attachmentType.startsWith('image/') && (
          <a className="attachment-preview" href={message.mediaUrl} target="_blank" rel="noreferrer">
            <img src={message.mediaUrl} alt={attachmentName} loading="lazy" />
          </a>
        )}
        {message.mediaUrl && attachmentType.startsWith('video/') && (
          <video className="attachment-video" src={message.mediaUrl} controls preload="metadata" />
        )}
        {message.mediaUrl && attachmentType.startsWith('audio/') && (
          <audio className="attachment-audio" src={message.mediaUrl} controls preload="metadata" aria-label="Voice note" />
        )}
        {message.mediaUrl && !attachmentType.startsWith('image/') && !attachmentType.startsWith('video/') && !attachmentType.startsWith('audio/') && (
          <a className="attachment-download" href={message.mediaUrl} download={attachmentName} target="_blank" rel="noreferrer">
            <span className="attachment-file-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z" /><path d="M13 3v7h7M8 15h8M8 18h6" /></svg>
            </span>
            <span className="attachment-copy"><strong>{attachmentName}</strong><small>{[attachmentType || 'File', fileSize].filter(Boolean).join(' · ')}</small></span>
            <span className="attachment-download-icon" aria-hidden="true">↓</span>
          </a>
        )}
        <time dateTime={message.createdAt}>{time}</time>
      </div>
    </article>
  );
};

export default MessageBubble;
