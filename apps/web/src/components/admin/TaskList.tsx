'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EditorialTask, TaskPriority } from '@geowatch/shared-types';
import { authFetch } from '@/lib/auth';

// Deadline chip per the design: red "Urgent", orange "Today", quiet date
// otherwise. Explicit priority=urgent forces the red chip regardless of date.
function deadlineChip(task: EditorialTask): { label: string; bg: string; fg: string } | null {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  if (task.priority === 'urgent') return { label: 'Urgent', bg: '#FEE2E2', fg: '#DC2626' };
  if (!task.deadline) return task.priority === 'high' ? { label: 'High', bg: '#FFEDD5', fg: '#EA580C' } : null;

  const d = new Date(task.deadline);
  if (d < startOfToday) return { label: 'Overdue', bg: '#FEE2E2', fg: '#DC2626' };
  if (d <= today) return { label: 'Today', bg: '#FFEDD5', fg: '#EA580C' };
  return {
    label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    bg: '#F1F5F9',
    fg: '#64748B',
  };
}

interface TaskListProps {
  /** Compact mode: dashboard widget — top open tasks, no add form. */
  compact?: boolean;
  /** Notifies the shell/dashboard that open-task counts changed. */
  onChanged?: () => void;
}

export function TaskList({ compact = false, onChanged }: TaskListProps) {
  const [tasks, setTasks] = useState<EditorialTask[]>([]);
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await authFetch<EditorialTask[]>('/admin/tasks'));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    try {
      await authFetch('/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: title.trim(), deadline: deadline || null, priority }),
      });
      setTitle('');
      setDeadline('');
      setPriority('normal');
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add task');
    }
  };

  const toggle = async (task: EditorialTask) => {
    try {
      await authFetch(`/admin/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: !task.done }),
      });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task');
    }
  };

  const remove = async (task: EditorialTask) => {
    try {
      await authFetch(`/admin/tasks/${task.id}`, { method: 'DELETE' });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const visible = compact ? tasks.filter((t) => !t.done).slice(0, 5) : tasks;

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add a task…"
            className="min-w-48 flex-1 rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent-blue focus:outline-none"
          />
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-[12px] text-text-secondary focus:border-accent-blue focus:outline-none"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="rounded-lg border border-border/10 bg-bg-2 px-3 py-2 text-[12px] text-text-secondary focus:border-accent-blue focus:outline-none"
          >
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <button
            onClick={add}
            disabled={!title.trim()}
            className="rounded-full bg-brand-bg px-4 py-2 text-[12px] font-medium text-brand-text hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {error && <p className="mb-2 text-xs text-status-conflict">{error}</p>}

      <div className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {visible.map((task) => {
            const chip = deadlineChip(task);
            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ type: 'spring', stiffness: 450, damping: 34 }}
                className="group flex items-start gap-2.5 rounded-lg border border-border/10 bg-bg-2 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggle(task)}
                  className="mt-0.5 h-3.5 w-3.5 accent-[#2563EB]"
                />
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[13px] ${task.done ? 'text-text-tertiary line-through' : 'text-text-primary'}`}
                  >
                    {task.title}
                  </div>
                  {task.deadline && (
                    <div className="text-[11px] text-text-tertiary">
                      Deadline:{' '}
                      {new Date(task.deadline).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
                {chip && !task.done && (
                  <span
                    className="mt-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: chip.bg, color: chip.fg }}
                  >
                    {chip.label}
                  </span>
                )}
                {!compact && (
                  <button
                    onClick={() => remove(task)}
                    className="mt-0.5 text-[11px] text-text-tertiary opacity-0 transition-opacity hover:text-status-conflict group-hover:opacity-100"
                  >
                    ✕
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {visible.length === 0 && !error && (
          <p className="py-4 text-center text-[12px] text-text-tertiary">
            {compact ? 'No open tasks — clear runway.' : 'No tasks yet. Add your first one above.'}
          </p>
        )}
      </div>
    </div>
  );
}
