import React, { lazy, Suspense, useState } from 'react';
import ChatWindow from '@pages/ChatWindow';
import Market from '@pages/Market';
import VideoFeed from '@pages/VideoFeed';
import StatusTray from '@components/StatusTray';
import { ChatUser } from '@app-types/index';

type Destination = 'market' | 'clips' | 'messages' | 'status' | 'studio';
const Studio = lazy(() => import('@pages/Studio'));

interface Props {
  currentUserId: string;
  token: string;
  onLogout: () => void;
}

const EchoHiveShell: React.FC<Props> = ({ currentUserId, token, onLogout }) => {
  const [destination, setDestination] = useState<Destination>('clips');
  const [contact, setContact] = useState<ChatUser | null>(null);
  const [profileRequest, setProfileRequest] = useState(0);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelTitle, setModelTitle] = useState('Product model');

  const sectionLabels: Record<Destination, { label: string; detail: string }> = {
    market: { label: 'Marketplace', detail: 'Explore shops, finds, and local creators' },
    clips: { label: 'Clips', detail: 'Discover people through short videos' },
    messages: { label: 'Messages', detail: 'Find people by username and start a conversation' },
    status: { label: 'Status', detail: 'Share a moment that lasts 24 hours' },
    studio: { label: '3D Studio', detail: 'Explore objects and ideas in 3D' },
  };

  function contactSeller(seller: ChatUser) {
    setContact(seller);
    setDestination('messages');
  }

  function openModel(url: string, title: string) {
    setModelUrl(url);
    setModelTitle(title);
    setDestination('studio');
  }

  return (
    <main className="echohive-app">
      <header className="echohive-topbar">
        <button type="button" className="echohive-brand" onClick={() => setDestination('clips')} aria-label="EchoHive home">
          <img className="echohive-symbol" src="/echohive-icon.svg" alt="" />
          <span>EchoHive</span>
        </button>

        <div className="echohive-header-meta" aria-live="polite">
          <span className="echohive-live-dot" />
          <span>{sectionLabels[destination].label}</span>
        </div>

        <nav className="echohive-navigation" aria-label="Main navigation">
          <button type="button" className={destination === 'clips' ? 'echohive-nav-item is-active' : 'echohive-nav-item'} aria-current={destination === 'clips' ? 'page' : undefined} onClick={() => setDestination('clips')} title="Clips">
            <svg className="echohive-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="m10 8 6 4-6 4z" /></svg><span>Clips</span>
          </button>
          <button type="button" className={destination === 'messages' ? 'echohive-nav-item is-active' : 'echohive-nav-item'} aria-current={destination === 'messages' ? 'page' : undefined} onClick={() => { setContact(null); setDestination('messages'); }} title="Messages">
            <svg className="echohive-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.4-3.6A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h8m-8 3h5" /></svg><span className="desktop-label">Messages</span><span className="mobile-label">Chat</span>
          </button>
          <button type="button" className={destination === 'status' ? 'echohive-nav-item is-active' : 'echohive-nav-item'} aria-current={destination === 'status' ? 'page' : undefined} onClick={() => setDestination('status')} title="Status">
            <svg className="echohive-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5.5" /><circle cx="12" cy="12" r="2.5" /></svg><span>Status</span>
          </button>
          <button type="button" className="echohive-nav-item" onClick={() => { setDestination('messages'); setProfileRequest((request) => request + 1); }} title="Profile settings" aria-label="Open profile settings">
            <svg className="echohive-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg><span>Profile</span>
          </button>
          <button type="button" className={destination === 'market' ? 'echohive-nav-item is-active' : 'echohive-nav-item'} aria-current={destination === 'market' ? 'page' : undefined} onClick={() => setDestination('market')} title="Marketplace">
            <svg className="echohive-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16l-1.3 11H5.3L4 9Z" /><path d="M8 9a4 4 0 0 1 8 0m-8 4v1m8-1v1" /></svg><span className="desktop-label">Marketplace</span><span className="mobile-label">Market</span>
          </button>
          <button type="button" className={destination === 'studio' ? 'echohive-nav-item is-active' : 'echohive-nav-item'} aria-current={destination === 'studio' ? 'page' : undefined} onClick={() => setDestination('studio')} title="3D Studio">
            <svg className="echohive-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21" /></svg><span className="desktop-label">3D Studio</span><span className="mobile-label">Studio</span>
          </button>
        </nav>

        <button type="button" className="echohive-logout" onClick={onLogout}>Sign out</button>
      </header>

      <div className="echohive-content">
        <div className={destination === 'clips' ? 'echohive-surface echohive-surface--clips' : 'echohive-surface'}>
          <div className="echohive-section-banner" aria-label={sectionLabels[destination].label}>
            <span>{sectionLabels[destination].label}</span>
            <strong>{sectionLabels[destination].detail}</strong>
          </div>

          {destination === 'market' && (
            <Market currentUserId={currentUserId} onMessageSeller={contactSeller} onOpenModel={openModel} />
          )}
          {destination === 'clips' && (
            <VideoFeed currentUserId={currentUserId} onMessageCreator={contactSeller} />
          )}
          <ChatWindow embedded visible={destination === 'messages'} currentUserId={currentUserId} token={token} onLogout={onLogout} initialContact={contact} profileRequest={profileRequest} />
          {destination === 'status' && <StatusTray currentUserId={currentUserId} page />}
          {destination === 'studio' && (
            <Suspense fallback={<div className="studio-loading">Preparing the 3D workspace…</div>}>
              <Studio
                modelUrl={modelUrl}
                modelTitle={modelTitle}
                onModelChange={(url, title) => { setModelUrl(url); setModelTitle(title); }}
                onStatusPosted={() => setDestination('status')}
              />
            </Suspense>
          )}
        </div>
      </div>
    </main>
  );
};

export default EchoHiveShell;
