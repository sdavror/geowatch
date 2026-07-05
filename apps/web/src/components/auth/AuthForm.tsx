'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';

interface AuthFormProps {
  mode: 'login' | 'register';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isRegister) await register(email, password);
      else await login(email, password);
      router.push('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-lg font-semibold tracking-wide text-text-primary">GeoWatch</div>
          <p className="mt-1 text-xs text-text-tertiary">
            {isRegister ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border/10 bg-bg-2 p-5 shadow-lg"
        >
          <label className="mb-1 block text-[12px] text-text-secondary">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="mb-3 w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
          />

          <label className="mb-1 block text-[12px] text-text-secondary">Password</label>
          <input
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
            className="w-full rounded-lg border border-border/10 bg-bg-3 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
          />

          {error && <p className="mt-3 text-xs text-status-conflict">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-lg bg-brand-bg py-2 text-sm font-medium text-brand-text transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-text-tertiary">
          {isRegister ? (
            <>
              Already have an account?{' '}
              <Link href="/login" className="text-brand-text hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              No account yet?{' '}
              <Link href="/register" className="text-brand-text hover:underline">
                Register
              </Link>
            </>
          )}
        </p>
        <p className="mt-6 text-center text-[11px] text-text-tertiary">
          <Link href="/" className="hover:text-text-secondary">
            ← Back to GeoWatch
          </Link>
        </p>
      </div>
    </main>
  );
}
