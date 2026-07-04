'use client';

import { useState } from 'react';
import { useAuth, uploadImage } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';

export function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setDone(false);
    try {
      const { imageUrl } = await uploadImage(file);
      setAvatarUrl(imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await updateProfile({ displayName: displayName.trim(), avatarUrl });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const resolved = mediaUrl(avatarUrl);

  return (
    <div className="mb-4 max-w-sm rounded-2xl border border-border/10 bg-bg-2 p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">Profile</h2>

      <div className="mb-4 flex items-center gap-3">
        {resolved ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolved} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bg-3 text-lg text-text-secondary">
            {(displayName || user?.email || '?').charAt(0).toUpperCase()}
          </div>
        )}
        <label className="cursor-pointer rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-xs text-text-secondary hover:bg-bg-4">
          {uploading ? 'Uploading…' : resolved ? 'Change avatar' : 'Upload avatar'}
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>
        {resolved && (
          <button
            onClick={() => setAvatarUrl(null)}
            className="text-xs text-text-tertiary hover:text-status-conflict"
          >
            Remove
          </button>
        )}
      </div>

      <label className="mb-1 block text-[11px] text-text-secondary">Nickname</label>
      <input
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        maxLength={50}
        placeholder="How your name shows on comments"
        className="mb-3 w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
      />

      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}
      {done && <p className="mb-3 text-xs text-status-stable">Profile saved.</p>}

      <button
        onClick={handleSave}
        disabled={busy || uploading}
        className="rounded-lg bg-brand-bg px-4 py-2 text-xs font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </div>
  );
}
