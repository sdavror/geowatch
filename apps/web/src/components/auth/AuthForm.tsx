'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Mark } from '@/components/Logo';

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
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 text-center">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="flex items-center justify-center gap-2"
          >
            <Mark size={26} />
            <span className="text-lg font-semibold tracking-wide text-text-primary">Apolitics</span>
          </motion.div>
          <p className="mt-1 text-[12px] text-text-tertiary">apolitically about politics · without bias</p>
          <p className="mt-3 text-xs text-text-tertiary">
            {isRegister ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border/10 bg-bg-2 p-5 shadow-card"
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

          {error && (
            <motion.p
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              className="mt-3 text-xs text-status-conflict"
            >
              {error}
            </motion.p>
          )}

          <motion.button
            type="submit"
            disabled={busy}
            whileTap={{ scale: 0.97 }}
            className="mt-4 w-full rounded-full bg-brand py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
          </motion.button>
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
          <Link href="/" className="hover:text-brand-text">
            ← Back to Apolitics
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
