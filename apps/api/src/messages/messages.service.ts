import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const userSelect = { id: true, displayName: true, email: true, avatarUrl: true, role: true } as const;

type PeerUser = { id: string; displayName: string | null; email: string; avatarUrl: string | null; role: string };

function peerName(u: PeerUser): string {
  return u.displayName?.trim() || u.email.split('@')[0];
}

/**
 * Internal editor-to-editor direct messages. Deliberately minimal — a
 * newsroom back-channel (hand off a story, flag a comment), not a chat
 * product: no threads, no attachments, no typing indicators.
 */
@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Everyone the caller can message (other editors + owner) with unread counts. */
  async peers(userId: string) {
    const [users, unread, latest] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { not: userId }, active: true, role: { in: ['editor', 'superadmin'] } },
        select: userSelect,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.message.groupBy({
        by: ['fromId'],
        where: { toId: userId, readAt: null },
        _count: { _all: true },
      }),
      // Latest line per conversation for the peer list preview.
      this.prisma.$queryRaw<Array<{ peer_id: string; body: string; created_at: Date }>>`
        SELECT DISTINCT ON (peer_id) peer_id, body, created_at FROM (
          SELECT CASE WHEN from_id = ${userId}::uuid THEN to_id ELSE from_id END AS peer_id,
                 body, created_at
          FROM messages
          WHERE from_id = ${userId}::uuid OR to_id = ${userId}::uuid
        ) m ORDER BY peer_id, created_at DESC`,
    ]);

    const unreadBy = new Map(unread.map((u) => [u.fromId, u._count._all]));
    const latestBy = new Map(latest.map((l) => [l.peer_id, l]));
    return users
      .map((u) => ({
        id: u.id,
        name: peerName(u),
        avatarUrl: u.avatarUrl ?? null,
        role: u.role,
        unread: unreadBy.get(u.id) ?? 0,
        lastMessage: latestBy.get(u.id)?.body.slice(0, 80) ?? null,
        lastMessageAt: latestBy.get(u.id)?.created_at.toISOString() ?? null,
      }))
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  }

  /** Full two-way thread with one peer; incoming messages are marked read. */
  async thread(userId: string, peerId: string) {
    const peer = await this.prisma.user.findUnique({ where: { id: peerId }, select: userSelect });
    if (!peer) throw new NotFoundException('User not found');

    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { fromId: userId, toId: peerId },
          { fromId: peerId, toId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    await this.prisma.message.updateMany({
      where: { fromId: peerId, toId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    return messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: m.fromId === userId,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
    }));
  }

  async send(userId: string, toId: string, body: string) {
    if (toId === userId) throw new BadRequestException('You cannot message yourself');
    const peer = await this.prisma.user.findFirst({
      where: { id: toId, active: true, role: { in: ['editor', 'superadmin'] } },
      select: { id: true },
    });
    if (!peer) throw new NotFoundException('Recipient not found or not an editor');

    const message = await this.prisma.message.create({
      data: { fromId: userId, toId, body: body.trim() },
    });
    return { id: message.id, createdAt: message.createdAt.toISOString() };
  }

  /** Total unread across all conversations — the sidebar badge. */
  async unreadCount(userId: string) {
    const unread = await this.prisma.message.count({ where: { toId: userId, readAt: null } });
    return { unread };
  }
}
