import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForArticle(articleId: string) {
    const comments = await this.prisma.comment.findMany({
      where: { articleId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      },
    });
    return comments.map((c) => this.serialize(c));
  }

  async create(articleId: string, userId: string, body: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true },
    });
    if (!article) throw new NotFoundException('Article not found');

    const comment = await this.prisma.comment.create({
      data: { articleId, userId, body: body.trim() },
      include: {
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
      },
    });
    return this.serialize(comment);
  }

  /**
   * Moderation feed: latest comments site-wide with just enough article
   * context to judge each one. Editors reach it from the admin panel.
   */
  async listRecent(limit = 100) {
    const comments = await this.prisma.comment.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      include: {
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
        article: { select: { id: true, title: true } },
      },
    });
    return comments.map((c) => ({
      ...this.serialize(c),
      article: { id: c.article.id, title: c.article.title },
    }));
  }

  /** Editors moderate the public comment feed — role-guarded at the route. */
  async removeAsModerator(commentId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { deleted: true, id: commentId };
  }

  /** Author can delete their own comment; superadmin can delete any. */
  async remove(commentId: string, userId: string, role: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId && role !== 'superadmin') {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { deleted: true, id: commentId };
  }

  private serialize(c: {
    id: string;
    articleId: string;
    body: string;
    createdAt: Date;
    user: { id: string; displayName: string | null; email: string; avatarUrl: string | null };
  }) {
    // Fall back to the local-part of the email when no nickname is set, so a
    // comment never shows a raw full email address publicly.
    const name = c.user.displayName?.trim() || c.user.email.split('@')[0];
    return {
      id: c.id,
      articleId: c.articleId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: { id: c.user.id, name, avatarUrl: c.user.avatarUrl ?? null },
    };
  }
}
