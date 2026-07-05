'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/auth';

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await authFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'mb-3 w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary focus:border-accent-blue focus:outline-none';

  return (
    <form onSubmit={handleSubmit} className="max-w-sm rounded-2xl border border-border/10 bg-bg-2 p-5">
      <h2 className="mb-4 text-sm font-semibold text-text-primary">Change password</h2>

      <label className="mb-1 block text-[12px] text-text-secondary">Current password</label>
      <input
        type="password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        className={inputClass}
      />

      <label className="mb-1 block text-[12px] text-text-secondary">New password</label>
      <input
        type="password"
        required
        minLength={8}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="At least 8 characters"
        className={inputClass}
      />

      <label className="mb-1 block text-[12px] text-text-secondary">Confirm new password</label>
      <input
        type="password"
        required
        minLength={8}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={inputClass}
      />

      {error && <p className="mb-3 text-xs text-status-conflict">{error}</p>}
      {done && <p className="mb-3 text-xs text-status-stable">Password updated.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-brand-bg px-4 py-2 text-xs font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}
