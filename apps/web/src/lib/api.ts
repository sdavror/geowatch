export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

// Origin without the /api prefix — uploaded images are served from
// {origin}/uploads/... (static assets aren't under the global /api prefix).
export const API_ORIGIN = API_BASE_URL.replace(/\/api\/?$/, '');

/** Resolve an article imageUrl ("/uploads/x.jpg") to an absolute URL. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? 'Request failed', res.status);
  }

  return res.json() as Promise<T>;
}

export const fetcher = <T>(path: string): Promise<T> => apiFetch<T>(path);
