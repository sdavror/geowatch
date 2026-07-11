'use client';

import { useState } from 'react';

interface ShareBarProps {
  title: string;
}

function IconBtn({
  label,
  onClick,
  href,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
}) {
  const cls =
    'flex h-9 w-9 items-center justify-center rounded-full border border-border/10 bg-bg-2 text-text-secondary transition-colors hover:border-brand/40 hover:text-brand-text';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} aria-label={label} className={cls}>
      {children}
    </button>
  );
}

/** Share row — native share when available, plus copy-link and socials. */
export function ShareBar({ title }: ShareBarProps) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const enc = encodeURIComponent(url);
  const encTitle = encodeURIComponent(title);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="mr-1 text-[12px] font-medium text-text-tertiary">Share</span>
      <IconBtn label="Share on X" href={`https://twitter.com/intent/tweet?url=${enc}&text=${encTitle}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.82l4.71 6.23 5.46-6.23zm-1.16 17.52h1.83L7.01 4.13H5.05l12.03 15.64z"/></svg>
      </IconBtn>
      <IconBtn label="Share on Facebook" href={`https://www.facebook.com/sharer/sharer.php?u=${enc}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z"/></svg>
      </IconBtn>
      <IconBtn label="Share on LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.64h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9z"/></svg>
      </IconBtn>
      <IconBtn label={copied ? 'Link copied' : 'Copy link'} onClick={copy}>
        {copied ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
      </IconBtn>
    </div>
  );
}
