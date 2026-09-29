import React, { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { VideoComment, VideoPost, addVideoComment, getVideoComments, getVideos, toggleVideoLike, uploadVideo } from '@services/videoService';

interface Props {
  currentUserId: string;
  onMessageCreator: (creator: VideoPost['creator']) => void;
}

const VideoFeed: React.FC<Props> = ({ currentUserId, onMessageCreator }) => {
  const [posts, setPosts] = useState<VideoPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copiedPostId, setCopiedPostId] = useState<string | null>(null);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, VideoComment[]>>({});
  const [commentDraft, setCommentDraft] = useState('');
  const [commentLoading, setCommentLoading] = useState<string | null>(null);
  const [likeLoading, setLikeLoading] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    getVideos()
      .then((page) => { setPosts(page.posts); setCursor(page.nextCursor); })
      .catch(() => setError('Could not load videos. Please refresh and try again.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const root = feedRef.current;
    if (!root) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
          video.muted = muted;
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { root, threshold: [0, 0.65, 1] });
    root.querySelectorAll('video').forEach((video) => observer.observe(video));
    return () => observer.disconnect();
  }, [posts, muted]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await getVideos(cursor);
      setPosts((current) => [...current, ...page.posts.filter((post) => !current.some((item) => item.id === post.id))]);
      setCursor(page.nextCursor);
    } catch {
      setError('Could not load more videos.');
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cursor]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) { setError('Choose a video file.'); return; }
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const post = await uploadVideo(file, caption.trim(), setProgress);
      setPosts((current) => [post, ...current]);
      setCaption('');
      setUploadOpen(false);
      setNotice('Clip posted to the feed.');
      if (feedRef.current) feedRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (uploadError) {
      setError(uploadError instanceof Error && uploadError.message ? `Upload paused. Select the same file again to resume. ${uploadError.message}` : 'Upload paused. Select the same file again to resume.');
    } finally {
      setUploading(false);
    }
  }

  function handleScroll() {
    const element = feedRef.current;
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < element.clientHeight * 1.5) void loadMore();
  }

  async function copyVideoLink(post: VideoPost) {
    try {
      const shareUrl = new URL(post.videoUrl, window.location.origin).toString();
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const helper = document.createElement('textarea');
        helper.value = shareUrl;
        helper.setAttribute('readonly', 'true');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        document.body.removeChild(helper);
      }
      setCopiedPostId(post.id);
      setNotice('Clip link copied.');
      window.setTimeout(() => setCopiedPostId((current) => current === post.id ? null : current), 1800);
    } catch {
      setError('Could not copy the video link.');
    }
  }

  async function handleLike(post: VideoPost) {
    if (likeLoading) return;
    setLikeLoading(post.id);
    try {
      const result = await toggleVideoLike(post.id);
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, ...result } : item));
    } catch {
      setError('Could not update your like. Please try again.');
    } finally {
      setLikeLoading(null);
    }
  }

  async function toggleComments(post: VideoPost) {
    if (openCommentsPostId === post.id) {
      setOpenCommentsPostId(null);
      return;
    }
    setOpenCommentsPostId(post.id);
    setCommentDraft('');
    if (comments[post.id]) return;
    setCommentLoading(post.id);
    try {
      const loaded = await getVideoComments(post.id);
      setComments((current) => ({ ...current, [post.id]: loaded }));
    } catch {
      setError('Could not load comments. Please try again.');
      setOpenCommentsPostId(null);
    } finally {
      setCommentLoading(null);
    }
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>, post: VideoPost) {
    event.preventDefault();
    const content = commentDraft.trim();
    if (!content || commentLoading) return;
    setCommentLoading(post.id);
    try {
      const comment = await addVideoComment(post.id, content);
      setComments((current) => ({ ...current, [post.id]: [...(current[post.id] || []), comment].slice(-50) }));
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, commentCount: item.commentCount + 1 } : item));
      setCommentDraft('');
    } catch {
      setError('Could not post your comment. Please try again.');
    } finally {
      setCommentLoading(null);
    }
  }

  const feedCountLabel = `${posts.length} ${posts.length === 1 ? 'story' : 'stories'}`;

  return (
    <main className="video-page">
      <div className="video-feed-topbar">
        <div className="video-title-group">
          <span className="video-title-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6.5v11l9-5.5-9-5.5Z" /></svg></span>
          <div><span className="video-kicker">ECHOHIVE / PLAY</span><h1>Clips</h1><p>Fresh moments from the community.</p></div>
        </div>
        <div className="video-feed-count" aria-live="polite">{feedCountLabel}</div>
        <div className="video-top-actions">
          <button type="button" className="video-mute-button" onClick={() => setMuted((value) => !value)} aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" />{muted ? <path d="m17 9 4 6m0-6-4 6" /> : <path d="M16 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" />}</svg>
            <span>{muted ? 'Sound off' : 'Sound on'}</span>
          </button>
          <button type="button" className="video-upload-button" onClick={() => setUploadOpen((value) => !value)} aria-expanded={uploadOpen} aria-label="Create a clip">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span>Create clip</span>
          </button>
        </div>
      </div>
      {notice && <div className="video-status-toast" role="status" aria-live="polite">{notice}</div>}
      {error && <div className="video-error" role="alert">{error}<button type="button" onClick={() => setError(null)} aria-label="Dismiss">×</button></div>}
      {uploadOpen && <section className="video-upload-panel" aria-label="Create a video post">
        <div className="video-upload-intro"><span className="video-upload-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 9 5-9 5V7Z" /><path d="M20 12a8 8 0 1 1-2.3-5.6" /></svg></span><div><strong>Share a moment</strong><p>MP4, WebM or MOV up to 2 GB. Interrupted uploads can resume.</p></div></div>
        <label className="video-caption-field"><span className="visually-hidden">Video caption</span><input value={caption} maxLength={500} onChange={(event) => setCaption(event.target.value)} placeholder="Add a caption..." aria-label="Video caption" disabled={uploading} /></label>
        <input ref={fileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" className="visually-hidden" onChange={handleUpload} />
        <button type="button" className="video-choose-button" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? `Uploading ${progress}%` : 'Choose a video'}</button>
        {uploading && <div className="video-progress-wrap"><progress max="100" value={progress} aria-label="Upload progress" /><span>{progress}%</span></div>}
        <button type="button" className="video-upload-close" onClick={() => setUploadOpen(false)} disabled={uploading} aria-label="Close upload panel">×</button>
      </section>}
      <div className="video-feed" ref={feedRef} onScroll={handleScroll}>
        {loading && <div className="video-feed-empty">Loading the latest clips…</div>}
        {!loading && posts.length === 0 && <div className="video-feed-empty"><strong>Your video feed starts here.</strong><span>Share a quick moment, product detail, or behind-the-scenes story to spark conversation.</span><button type="button" onClick={() => setUploadOpen(true)}>Create the first clip</button></div>}
        {posts.map((post, index) => (
          <article className="video-card" key={post.id}>
            <div className="video-player-frame">
              <video src={post.videoUrl} controls playsInline loop muted={muted} preload={index < 2 ? 'metadata' : 'none'} />
              <div className="video-shade" />
              <div className="video-card-copy">
                <div className="video-creator">
                  <span className="video-creator-mark">{post.creator.avatarUrl ? <img src={post.creator.avatarUrl} alt="" /> : post.creator.username.slice(0, 1).toUpperCase()}</span>
                  <strong>@{post.creator.username}</strong>
                  {post.creator.id !== currentUserId && <button type="button" onClick={() => onMessageCreator(post.creator)}>Message</button>}
                </div>
                {post.caption && <p>{post.caption}</p>}
                <small>{new Date(post.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</small>
              </div>
            </div>
            <aside className="video-action-rail" aria-label={`Actions for ${post.creator.username}'s clip`}>
              <button type="button" className={`video-rail-like${post.likedByMe ? ' is-liked' : ''}`} onClick={() => void handleLike(post)} disabled={likeLoading === post.id} aria-label={post.likedByMe ? 'Unlike clip' : 'Like clip'} aria-pressed={post.likedByMe}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.7c0 5.2-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.7a4.4 4.4 0 0 1 8.8-1.3 4.4 4.4 0 0 1 8.8 1.3Z" /></svg><span>{post.likeCount || 0}</span>
              </button>
              <button type="button" className="video-rail-comments" onClick={() => void toggleComments(post)} aria-expanded={openCommentsPostId === post.id} aria-label={`Comments, ${post.commentCount || 0}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11.5h8m-8 3h5" /></svg><span>{post.commentCount || 0}</span>
              </button>
              {post.creator.id !== currentUserId && <button type="button" className="video-rail-message" onClick={() => onMessageCreator(post.creator)} aria-label={`Message ${post.creator.username}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.7-3A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11.5h8m-8 3h5" /></svg><span>Message</span>
              </button>}
              <button type="button" className="video-rail-share" onClick={() => void copyVideoLink(post)} aria-label="Copy video link">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13.5a4 4 0 0 0 6 .4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" /><path d="M14 10.5a4 4 0 0 0-6-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" /></svg><span>{copiedPostId === post.id ? 'Copied' : 'Share'}</span>
              </button>
            </aside>
            {openCommentsPostId === post.id && <section className="video-comments-panel" aria-label={`Comments on ${post.creator.username}'s clip`}>
              <div className="video-comments-heading"><strong>Comments</strong><span>{post.commentCount || 0}</span><button type="button" onClick={() => setOpenCommentsPostId(null)} aria-label="Close comments">×</button></div>
              <div className="video-comments-list" aria-live="polite">
                {commentLoading === post.id && !comments[post.id] && <p className="video-comments-empty">Loading comments…</p>}
                {comments[post.id]?.length === 0 && <p className="video-comments-empty">Start the conversation.</p>}
                {comments[post.id]?.map((comment) => <article className="video-comment" key={comment.id}>
                  <span className="video-comment-avatar">{comment.user.avatarUrl ? <img src={comment.user.avatarUrl} alt="" /> : comment.user.username.slice(0, 1).toUpperCase()}</span>
                  <div><strong>@{comment.user.username}</strong><p>{comment.content}</p><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time></div>
                </article>)}
              </div>
              <form className="video-comment-form" onSubmit={(event) => void submitComment(event, post)}>
                <label className="visually-hidden" htmlFor={`comment-${post.id}`}>Write a comment</label>
                <input id={`comment-${post.id}`} value={commentDraft} maxLength={1000} onChange={(event) => setCommentDraft(event.target.value)} placeholder="Add a comment…" />
                <button type="submit" disabled={!commentDraft.trim() || commentLoading === post.id}>{commentLoading === post.id && comments[post.id] ? 'Posting…' : 'Post'}</button>
              </form>
            </section>}
          </article>
        ))}
        {loadingMore && <div className="video-loading-more">Loading more clips…</div>}
      </div>
    </main>
  );
};

export default VideoFeed;
