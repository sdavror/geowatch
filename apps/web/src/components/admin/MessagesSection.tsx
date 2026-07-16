'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessagePeer, ThreadMessage } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';
import { mediaUrl } from '@/lib/api';
import { formatRelativeTime } from '@/lib/formatRelativeTime';

/**
 * Internal newsroom messages: peers on the left, the active thread on the
 * right. Polls the open thread every 15s — enough for a hand-off
 * back-channel without a websocket.
 */
export function MessagesSection() {
  const [peers, setPeers] = useState<MessagePeer[]>([]);
  const [activePeer, setActivePeer] = useState<MessagePeer | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadPeers = useCallback(async () => {
    try {
      setPeers(await authFetch<MessagePeer[]>('/admin/messages/peers'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
    }
  }, []);

  const loadThread = useCallback(async (peerId: string) => {
    try {
      setThread(await authFetch<ThreadMessage[]>(`/admin/messages/thread/${peerId}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    void loadPeers();
  }, [loadPeers]);

  useEffect(() => {
    if (!activePeer) return;
    void loadThread(activePeer.id);
    const interval = setInterval(() => void loadThread(activePeer.id), 15_000);
    return () => clearInterval(interval);
  }, [activePeer, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [thread.length]);

  const send = async () => {
    if (!activePeer || !draft.trim() || sending) return;
    setSending(true);
    try {
      await authFetch('/admin/messages', {
        method: 'POST',
        body: JSON.stringify({ toId: activePeer.id, body: draft.trim() }),
      });
      setDraft('');
      await Promise.all([loadThread(activePeer.id), loadPeers()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const avatarOf = (p: MessagePeer) => {
    const url = mediaUrl(p.avatarUrl);
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="h-full w-full object-cover" />
    ) : (
      p.name.slice(0, 1).toUpperCase()
    );
  };

  return (
    <div className="flex h-[calc(100vh-140px)] max-w-4xl flex-col">
      <h1 className="mb-4 text-h1 text-text-primary">Messages</h1>
      {error && <p className="mb-2 text-caption text-status-conflict">{error}</p>}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/10 bg-bg-2">
        {/* Peers */}
        <div className="flex w-56 flex-shrink-0 flex-col overflow-y-auto border-r border-border/10">
          {peers.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePeer(p)}
              className={`flex items-center gap-2.5 border-b border-border/5 px-3 py-2.5 text-left transition-colors ${
                activePeer?.id === p.id ? 'bg-brand-bg' : 'hover:bg-bg-3'
              }`}
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-bg-4 text-caption font-semibold text-text-secondary">
                {avatarOf(p)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-body2 font-medium text-text-primary">{p.name}</span>
                  {p.unread > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
                      {p.unread}
                    </span>
                  )}
                </div>
                <div className="truncate text-[10px] text-text-tertiary">
                  {p.lastMessage ?? <span className="capitalize">{p.role}</span>}
                </div>
              </div>
            </button>
          ))}
          {peers.length === 0 && (
            <p className="p-4 text-center text-caption text-text-tertiary">
              No other editors yet — invite teammates via Users.
            </p>
          )}
        </div>

        {/* Thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          {activePeer ? (
            <>
              <div className="border-b border-border/10 px-4 py-2.5 text-body2 font-medium text-text-primary">
                {activePeer.name} <span className="text-caption font-normal capitalize text-text-tertiary">· {activePeer.role}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <div className="flex flex-col gap-1.5">
                  {thread.map((m) => (
                    <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-body2 ${
                          m.mine ? 'bg-brand text-white' : 'bg-bg-3 text-text-primary'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`mt-0.5 text-[9px] ${m.mine ? 'text-white/60' : 'text-text-tertiary'}`}>
                          {formatRelativeTime(m.createdAt)}
                          {m.mine && m.readAt ? ' · read' : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                  {thread.length === 0 && (
                    <p className="py-8 text-center text-caption text-text-tertiary">
                      No messages yet — say hi.
                    </p>
                  )}
                  <div ref={bottomRef} />
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border/10 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder={`Message ${activePeer.name}…`}
                  className="min-w-0 flex-1 rounded-full border border-border/10 bg-bg px-4 py-2 text-body2 text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
                />
                <button
                  onClick={send}
                  disabled={!draft.trim() || sending}
                  className="rounded-full bg-brand-bg px-4 py-2 text-caption font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-caption text-text-tertiary">
              Pick a teammate to start a conversation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
