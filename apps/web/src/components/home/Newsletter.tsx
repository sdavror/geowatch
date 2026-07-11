'use client';

import { useState } from 'react';

/**
 * Newsletter capture. Client-only for now (no backend list yet) — validates
 * and shows a confirmation; wiring to a real list is a later phase.
 */
export function Newsletter() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl border border-border/10 bg-bg-2 p-6">
      <h3 className="text-[17px] font-semibold text-text-primary">The Daily Brief</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
        One email each morning — the stories shaping the world, without the bias.
      </p>
      {done ? (
        <p className="mt-4 text-[13px] font-medium text-brand-text">Thanks — check your inbox to confirm.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email.includes('@')) setDone(true);
          }}
          className="mt-4 flex flex-col gap-2"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full rounded-lg border border-border/10 bg-bg px-3 py-2.5 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-full bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.97]"
          >
            Subscribe
          </button>
        </form>
      )}
    </section>
  );
}
