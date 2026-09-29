import React, { ChangeEvent, useEffect, useRef, useState } from 'react';
import ModelViewer from '@components/ModelViewer';
import { uploadChatAttachment } from '@services/chatService';
import { createPhotoRelief } from '@services/photo3d';
import { publishStatus } from '@services/statusService';

interface Props {
  modelUrl: string | null;
  modelTitle: string;
  onModelChange: (url: string, title: string) => void;
  onStatusPosted: () => void;
}

const Studio: React.FC<Props> = ({ modelUrl, modelTitle, onModelChange, onStatusPosted }) => {
  const modelInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [creatingRelief, setCreatingRelief] = useState(false);
  const [publishingStatus, setPublishingStatus] = useState(false);
  const [reliefFile, setReliefFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function chooseModel(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) { setError('Choose a GLB model file.'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('3D models must be 50 MB or smaller.'); return; }

    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadChatAttachment(file);
      setReliefFile(null);
      setPreviewUrl(null);
      onModelChange(uploaded.url, file.name);
    } catch {
      setError('The model could not be uploaded. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Choose a photo to make a 3D relief.'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('Choose a photo smaller than 15 MB.'); return; }

    setCreatingRelief(true);
    setError(null);
    try {
      const generated = await createPhotoRelief(file);
      setReliefFile(generated);
      setPreviewUrl(URL.createObjectURL(generated));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not turn this photo into a 3D relief.');
    } finally {
      setCreatingRelief(false);
    }
  }

  async function postReliefToStatus() {
    if (!reliefFile) return;
    setPublishingStatus(true);
    setError(null);
    try {
      await publishStatus(reliefFile, caption.trim());
      onStatusPosted();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not post this 3D status. Please try again.');
    } finally {
      setPublishingStatus(false);
    }
  }

  const displayModelUrl = previewUrl || modelUrl;

  return (
    <main className={`studio-page${reliefFile ? ' studio-page--relief' : ''}`}>
      <ModelViewer key={displayModelUrl || 'sample-object'} modelUrl={displayModelUrl} autoRotate={Boolean(previewUrl)} className="studio-canvas" />
      <div className="studio-topline">
        <span className="studio-kicker">ECHOHIVE / 3D STUDIO</span>
        <span className="studio-live"><span />INTERACTIVE VIEW</span>
      </div>
      <section className="studio-title-block">
        <span className="studio-index">01 / PHOTO RELIEF STUDIO</span>
        <h1>{reliefFile ? 'Your photo, with dimension.' : modelUrl ? modelTitle : 'Give your ideas dimension.'}</h1>
        <p>{reliefFile
          ? 'This rotating 3D relief gets its depth from image brightness. It is not a full AI object reconstruction.'
          : modelUrl ? 'Drag to orbit. Scroll or pinch to zoom.' : 'Turn a photo into a rotating 3D relief, or load a GLB model.'}</p>
      </section>
      <div className="studio-controls">
        <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/*" onChange={choosePhoto} />
        <input ref={modelInputRef} className="visually-hidden" type="file" accept=".glb,model/gltf-binary" onChange={chooseModel} />
        <button type="button" className="studio-photo-button" onClick={() => photoInputRef.current?.click()} disabled={creatingRelief || uploading || publishingStatus}>
          {creatingRelief ? 'Creating 3D relief…' : reliefFile ? 'Choose a different photo' : 'Turn a photo into 3D'}
        </button>
        {reliefFile && <>
          <label className="studio-status-caption"><span>Status caption</span><input maxLength={280} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Add a caption to your 3D status" /></label>
          <button type="button" className="studio-post-status" onClick={() => void postReliefToStatus()} disabled={publishingStatus || creatingRelief}>
            {publishingStatus ? 'Posting to Status…' : 'Post 3D to Status'}
          </button>
        </>}
        <button type="button" onClick={() => modelInputRef.current?.click()} disabled={uploading || creatingRelief || publishingStatus}>
          {uploading ? 'Uploading model…' : 'Load a GLB model'}
        </button>
        <span>Photo up to 15 MB · GLB up to 50 MB</span>
      </div>
      <span className="studio-coordinate">X / Y / Z</span>
      {error && <div className="studio-error" role="alert">{error}</div>}
    </main>
  );
};

export default Studio;
