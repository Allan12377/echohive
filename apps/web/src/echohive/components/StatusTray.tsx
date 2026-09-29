import React, { ChangeEvent, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '@components/Avatar';
import { getStatuses, publishStatus, removeStatus, StatusGroup } from '@services/statusService';

const ModelViewer = lazy(() => import('@components/ModelViewer'));

interface Props { currentUserId: string; page?: boolean; }

const StatusTray: React.FC<Props> = ({ currentUserId, page = false }) => {
  const [groups, setGroups] = useState<StatusGroup[]>([]);
  const [selected, setSelected] = useState<{ group: StatusGroup; index: number } | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => getStatuses().then(setGroups).catch(() => setError('Could not load status updates.')), []);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 60_000); return () => window.clearInterval(timer); }, [refresh]);

  const myGroup = groups.find((group) => group.user.id === currentUserId);
  const otherGroups = groups.filter((group) => group.user.id !== currentUserId);
  const active = useMemo(() => selected && groups.find((group) => group.user.id === selected.group.user.id), [selected, groups]);
  const activeUpdate = active && selected ? active.updates[selected.index] : undefined;

  useEffect(() => {
    if (!activeUpdate || !active) return;
    const updateCount = active.updates.length;
    const duration = activeUpdate.mediaType.startsWith('video/') ? 15_000 : activeUpdate.mediaType === 'model/gltf-binary' ? 12_000 : 6_000;
    const timer = window.setTimeout(() => {
      setSelected((current) => {
        if (!current || current.index + 1 >= updateCount) return null;
        return { ...current, index: current.index + 1 };
      });
    }, duration);
    return () => window.clearTimeout(timer);
  }, [activeUpdate?.id, active?.updates.length]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError('Choose a file smaller than 50 MB.'); return; }
    setUploading(true); setError('');
    try {
      await publishStatus(file, caption.trim());
      setComposeOpen(false); setCaption(''); setNotice('Your status is live for 24 hours.');
      await refresh();
    } catch {
      setError('Could not publish that update. Choose an image or video under 50 MB.');
    } finally { setUploading(false); }
  }

  async function deleteActive() {
    if (!activeUpdate) return;
    try {
      await removeStatus(activeUpdate.id);
      setSelected(null);
      setNotice('Status update deleted.');
      await refresh();
    } catch { setError('Could not delete this update.'); }
  }

  function advance(direction: number) {
    if (!active || !selected) return;
    const next = selected.index + direction;
    if (next < 0) return setSelected({ ...selected, index: 0 });
    if (next >= active.updates.length) return setSelected(null);
    setSelected({ ...selected, index: next });
  }

  return <>
    <section className={`status-tray ${page ? 'status-tray--page' : ''}`} aria-label="Status updates">
      <div className="status-tray-heading"><div><strong>Stories</strong><span>Images and moments, here for 24 hours</span></div>
        <button type="button" className="status-create-button" onClick={() => { setError(''); setComposeOpen(true); }}>+ Add</button>
        {notice && <small role="status">{notice}</small>}
      </div>
      <div className="status-people">
        <button type="button" className="status-person status-person--add" onClick={() => myGroup ? setSelected({ group: myGroup, index: 0 }) : (setError(''), setComposeOpen(true))} aria-label={myGroup ? 'View your status update' : 'Add a status update'}>
          <span className={myGroup ? 'status-avatar-ring' : 'status-avatar-ring status-avatar-ring--empty'}>{myGroup ? <Avatar username={myGroup.user.username} avatarUrl={myGroup.user.avatarUrl} /> : <span className="status-add-avatar">+</span>}</span>
          <span>{myGroup ? 'My story' : 'Add story'}</span>
        </button>
        {otherGroups.map((group) => <button type="button" className="status-person" key={group.user.id} onClick={() => setSelected({ group, index: 0 })}>
          <span className="status-avatar-ring"><Avatar username={group.user.username} avatarUrl={group.user.avatarUrl} /></span>
          <span>{group.user.username}</span>
        </button>)}
        {!otherGroups.length && <span className="status-empty-hint">New updates from people will show up here.</span>}
      </div>
      {error && !composeOpen && <p className="status-error" role="alert">{error}</p>}
      <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={upload} />
    </section>

    {composeOpen && <div className="status-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !uploading) setComposeOpen(false); }}>
      <section className="status-compose" role="dialog" aria-modal="true" aria-labelledby="status-compose-title">
        <header><div><h2 id="status-compose-title">Share a story</h2><p>It disappears automatically after 24 hours.</p></div><button type="button" aria-label="Close" onClick={() => setComposeOpen(false)}>×</button></header>
        <label className="status-caption-label">Caption <textarea maxLength={280} rows={3} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Add a little context…" /></label>
        <div className="status-compose-footer"><small>{caption.length}/280 · Images or videos up to 50 MB</small><button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : 'Choose media'}</button></div>
        {error && <p className="status-error" role="alert">{error}</p>}
      </section>
    </div>}

    {activeUpdate && active && selected && <div className="status-viewer-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section className="status-viewer" role="dialog" aria-modal="true" aria-label={`${active.user.username}'s story`}>
        <div className="status-progress-track"><i key={activeUpdate.id} style={{ animationDuration: `${activeUpdate.mediaType.startsWith('video/') ? 15 : 6}s` }} /></div>
        <header><Avatar username={active.user.username} avatarUrl={active.user.avatarUrl} /><div><strong>{active.user.username}</strong><small>{new Date(activeUpdate.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div>
          {active.isMine && <button type="button" onClick={() => void deleteActive()}>Delete</button>}<button type="button" aria-label="Close story" onClick={() => setSelected(null)}>×</button>
        </header>
        <div className="status-media">
          {activeUpdate.mediaType === 'model/gltf-binary'
            ? <Suspense fallback={<span className="status-model-loading">Preparing 3D status…</span>}><ModelViewer key={activeUpdate.id} modelUrl={activeUpdate.mediaUrl} autoRotate className="status-3d-viewer" /></Suspense>
            : activeUpdate.mediaType.startsWith('video/')
              ? <video key={activeUpdate.id} src={activeUpdate.mediaUrl} autoPlay playsInline controls />
              : <img src={activeUpdate.mediaUrl} alt={`${active.user.username}'s story`} />}
        </div>
        {activeUpdate.caption && <p className="status-viewer-caption">{activeUpdate.caption}</p>}
        <button type="button" className="status-hit status-hit--prev" onClick={() => advance(-1)} aria-label="Previous story" />
        <button type="button" className="status-hit status-hit--next" onClick={() => advance(1)} aria-label="Next story" />
      </section>
    </div>}
  </>;
};

export default StatusTray;
