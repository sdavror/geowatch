import { createHmac, timingSafeEqual } from 'crypto';

// Minimal HS256 JWT sign/verify — avoids pulling in @nestjs/jwt just for
// this. Not a general-purpose JWT library: it supports exactly the one
// algorithm and claim set we use (sub, role, email, iat, exp).

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlJson(obj: unknown): string {
  return base64url(JSON.stringify(obj));
}

export function signToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64urlJson(full);
  const data = `${header}.${body}`;
  const sig = base64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = base64url(
    createHmac('sha256', secret).update(`${header}.${body}`).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
    ) as TokenPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
