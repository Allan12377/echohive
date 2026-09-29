import React, { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import Avatar from '@components/Avatar';
import { getMyProfile } from '@services/profileService';
import { getListings, ListingDraft, publishListing, saveBusinessProfile } from '@services/marketService';
import { uploadChatAttachment } from '@services/chatService';
import { MarketListing, Profile } from '@app-types/index';

interface Props {
  currentUserId: string;
  onMessageSeller: (seller: MarketListing['seller']) => void;
  onOpenModel: (modelUrl: string, title: string) => void;
}

const formatPrice = (price: string, currency: string) => {
  const amount = Number(price);
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const Market: React.FC<Props> = ({ currentUserId, onMessageSeller, onOpenModel }) => {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [businessAbout, setBusinessAbout] = useState('');
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadState, setUploadState] = useState('');
  const [draft, setDraft] = useState<ListingDraft>({ title: '', description: '', price: '', currency: 'USD' });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMyProfile()
      .then((user) => {
        setProfile(user);
        setBusinessName(user.businessName || '');
        setBusinessAbout(user.businessAbout || '');
      })
      .catch(() => setError('Could not load your business profile.'));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timeout = setTimeout(() => {
      getListings(search.trim())
        .then((items) => { if (active) setListings(items); })
        .catch(() => { if (active) setError('Could not load the marketplace.'); })
        .finally(() => { if (active) setLoading(false); });
    }, search.trim() ? 180 : 0);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [search]);

  async function saveBusiness(event: FormEvent) {
    event.preventDefault();
    setSavingBusiness(true);
    setError(null);
    try {
      const updated = await saveBusinessProfile({ businessName, businessAbout });
      setProfile(updated);
    } catch {
      setError('Could not save your business profile. Please try again.');
    } finally {
      setSavingBusiness(false);
    }
  }

  async function handleMediaChange(event: ChangeEvent<HTMLInputElement>, kind: 'image' | 'model') {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      setError('Files must be 50 MB or smaller.');
      return;
    }
    if (kind === 'image' && !file.type.startsWith('image/')) {
      setError('Choose an image file for the product photo.');
      return;
    }
    if (kind === 'model' && !file.name.toLowerCase().endsWith('.glb')) {
      setError('3D products currently accept GLB files.');
      return;
    }

    setError(null);
    setUploadState(kind === 'model' ? 'Uploading 3D model…' : 'Uploading product photo…');
    try {
      const uploaded = await uploadChatAttachment(file);
      setDraft((current) => ({ ...current, [kind === 'model' ? 'modelUrl' : 'imageUrl']: uploaded.url }));
    } catch {
      setError('Upload failed. Check the connection and try again.');
    } finally {
      setUploadState('');
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!profile?.businessName) {
      setError('Set up your business profile before publishing a listing.');
      return;
    }

    setPublishing(true);
    setError(null);
    try {
      const listing = await publishListing(draft);
      setListings((current) => [listing, ...current]);
      setDraft({ title: '', description: '', price: '', currency: 'USD' });
      setListingOpen(false);
    } catch {
      setError('Could not publish this listing. Check the details and try again.');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="market-page">
      <header className="market-header">
        <div>
          <span className="market-eyebrow">KONEKA MARKET</span>
          <h1>Find something made with care.</h1>
          <p>Discover independent businesses and talk directly with the people behind them.</p>
        </div>
        <div className="market-header-actions">
          {profile?.businessName
            ? <button className="market-primary-action" type="button" onClick={() => setListingOpen(true)}>New listing</button>
            : <span className="market-seller-prompt">Have something to sell? Set up your shop below.</span>}
        </div>
      </header>

      <div className="market-toolbar">
        <label className="market-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or shops" aria-label="Search marketplace" />
        </label>
        <span className="market-result-count">{loading ? 'Loading…' : `${listings.length} ${listings.length === 1 ? 'listing' : 'listings'}`}</span>
      </div>

      {error && <div className="market-error" role="alert">{error}</div>}

      <section className="listing-grid" aria-label="Marketplace listings">
        {loading ? <p className="market-empty">Gathering the latest listings…</p> : listings.length ? listings.map((listing, index) => (
          <article className="listing-card" key={listing.id} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
            <div className={`listing-image ${listing.imageUrl ? '' : 'listing-image--empty'}`}>
              {listing.imageUrl
                ? <img src={listing.imageUrl} alt={listing.title} loading="lazy" />
                : <div className="listing-placeholder"><span>{listing.title.slice(0, 1).toUpperCase()}</span><small>KONEKA / OBJECT {index + 1}</small></div>}
              {listing.modelUrl && <span className="listing-3d-tag">3D READY</span>}
              {listing.modelUrl && <button className="listing-view-3d" type="button" onClick={() => onOpenModel(listing.modelUrl as string, listing.title)}>View in 3D</button>}
            </div>
            <div className="listing-details">
              <div className="listing-shop-row">
                <Avatar username={listing.seller.businessName || listing.seller.username} avatarUrl={listing.seller.avatarUrl} className="avatar--tiny" />
                <span>{listing.seller.businessName || listing.seller.username}</span>
              </div>
              <h2>{listing.title}</h2>
              <p>{listing.description}</p>
              <footer>
                <strong>{formatPrice(listing.price, listing.currency)}</strong>
                {listing.seller.id !== currentUserId && <button type="button" onClick={() => onMessageSeller(listing.seller)}>Message seller</button>}
              </footer>
            </div>
          </article>
        )) : <div className="market-empty"><strong>No listings yet.</strong><span>Set up a shop and publish the first one.</span></div>}
      </section>

      {!profile?.businessName && (
        <section className="business-setup">
          <div className="business-setup-copy"><span className="market-eyebrow">SELL ON KONEKA</span><h2>Bring your business online.</h2><p>Create a public shop profile, publish products, and answer customers in private chat.</p></div>
          <form className="business-setup-form" onSubmit={saveBusiness}>
            <label><span>Business name</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} minLength={2} maxLength={80} required placeholder="Your shop name" /></label>
            <label><span>What do you make or sell?</span><textarea value={businessAbout} onChange={(event) => setBusinessAbout(event.target.value)} maxLength={500} rows={2} placeholder="A short introduction" /></label>
            <button type="submit" disabled={savingBusiness || !businessName.trim()}>{savingBusiness ? 'Saving…' : 'Create shop profile'}</button>
          </form>
        </section>
      )}

      {listingOpen && (
        <div className="profile-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setListingOpen(false); }}>
          <form className="listing-dialog" role="dialog" aria-modal="true" aria-labelledby="listing-title" onSubmit={publish}>
            <header className="profile-dialog-header">
              <div><h2 id="listing-title">Publish a listing</h2><p>Make your product easy to discover.</p></div>
              <button type="button" className="icon-button" aria-label="Close listing form" onClick={() => setListingOpen(false)}>×</button>
            </header>
            {error && <div className="profile-error" role="alert">{error}</div>}
            <label className="profile-field"><span>Product name</span><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={100} required /></label>
            <label className="profile-field"><span>Description</span><textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={2000} rows={3} required /></label>
            <div className="listing-price-fields">
              <label className="profile-field"><span>Price</span><input type="number" min="0.01" step="0.01" value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))} required /></label>
              <label className="profile-field"><span>Currency</span><input value={draft.currency} onChange={(event) => setDraft((current) => ({ ...current, currency: event.target.value.toUpperCase().slice(0, 3) }))} minLength={3} maxLength={3} required /></label>
            </div>
            <div className="listing-upload-actions">
              <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => handleMediaChange(event, 'image')} />
              <input ref={modelInputRef} className="visually-hidden" type="file" accept=".glb,model/gltf-binary" onChange={(event) => handleMediaChange(event, 'model')} />
              <button type="button" onClick={() => imageInputRef.current?.click()} disabled={Boolean(uploadState)}>{draft.imageUrl ? 'Photo added' : 'Add product photo'}</button>
              <button type="button" onClick={() => modelInputRef.current?.click()} disabled={Boolean(uploadState)}>{draft.modelUrl ? '3D model added' : 'Add GLB model'}</button>
            </div>
            <small className="listing-upload-note">Images and GLB models up to 50 MB. GLB models appear in the 3D Studio.</small>
            {uploadState && <p className="market-upload-state">{uploadState}</p>}
            <footer className="profile-dialog-actions">
              <button type="button" className="profile-cancel" onClick={() => setListingOpen(false)}>Cancel</button>
              <button type="submit" className="profile-save" disabled={publishing || Boolean(uploadState)}>{publishing ? 'Publishing…' : 'Publish listing'}</button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
};

export default Market;
