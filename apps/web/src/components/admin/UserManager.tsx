'use client';

import { useEffect, useState } from 'react';
import type { AuthUser, UserRole } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

const ROLES: UserRole[] = ['viewer', 'editor', 'superadmin'];

export function UserManager() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setUsers(await authFetch<AuthUser[]>('/admin/users'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const changeRole = async (id: string, role: UserRole) => {
    setError(null);
    try {
      await authFetch(`/admin/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  if (loading) return <p className="text-xs text-text-tertiary">Loading users…</p>;

  return (
    <div>
      {error && <p className="mb-2 text-xs text-status-conflict">{error}</p>}
      <div className="flex flex-col gap-1">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-3 rounded-lg border border-border/10 bg-bg-2 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-text-primary">{u.email}</div>
              <div className="text-[10px] text-text-tertiary">
                {u.lastLogin ? `Last seen ${new Date(u.lastLogin).toLocaleDateString()}` : 'Never signed in'}
              </div>
            </div>
            <select
              value={u.role}
              onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
              className="rounded-md border border-border/10 bg-bg-3 px-2 py-1 text-[11px] text-text-primary focus:border-accent-blue focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-text-tertiary">
        Promote a user to <span className="text-text-secondary">editor</span> to let them write and
        publish news.
      </p>
    </div>
  );
}
