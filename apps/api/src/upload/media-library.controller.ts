import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, normalize } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UPLOAD_DIR } from './upload.config';

/**
 * Media library over the /uploads static dir: every uploaded file with its
 * size, date and where it's used (article photos, user avatars). Unused
 * files can be deleted; used ones are protected.
 */
@Controller('admin/media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('editor') // superadmin passes via RolesGuard's owner bypass
export class MediaLibraryController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list() {
    let names: string[] = [];
    try {
      names = await fs.readdir(UPLOAD_DIR);
    } catch {
      return []; // dir not created yet — nothing uploaded
    }

    const [articles, users] = await Promise.all([
      this.prisma.article.findMany({
        where: { imageUrl: { startsWith: '/uploads/' } },
        select: { id: true, title: true, imageUrl: true },
      }),
      this.prisma.user.findMany({
        where: { avatarUrl: { startsWith: '/uploads/' } },
        select: { id: true, avatarUrl: true, displayName: true, email: true },
      }),
    ]);
    const articleByFile = new Map(articles.map((a) => [a.imageUrl!.replace('/uploads/', ''), a]));
    const avatarFiles = new Map(users.map((u) => [u.avatarUrl!.replace('/uploads/', ''), u]));

    const items = await Promise.all(
      names.map(async (name) => {
        const stat = await fs.stat(join(UPLOAD_DIR, name)).catch(() => null);
        if (!stat?.isFile()) return null;
        const article = articleByFile.get(name);
        const avatarUser = avatarFiles.get(name);
        return {
          filename: name,
          url: `/uploads/${name}`,
          sizeBytes: stat.size,
          uploadedAt: stat.mtime.toISOString(),
          usedBy: article
            ? { kind: 'article' as const, id: article.id, label: article.title }
            : avatarUser
              ? {
                  kind: 'avatar' as const,
                  id: avatarUser.id,
                  label: avatarUser.displayName?.trim() || avatarUser.email.split('@')[0],
                }
              : null,
        };
      }),
    );
    return items
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }

  @Delete(':filename')
  async remove(@Param('filename') filename: string) {
    // The filename must resolve to a direct child of UPLOAD_DIR — no path
    // separators, no traversal.
    if (!/^[\w.-]+$/.test(filename) || normalize(filename).includes('..')) {
      throw new BadRequestException('Invalid filename');
    }
    const url = `/uploads/${filename}`;
    const [article, user] = await Promise.all([
      this.prisma.article.findFirst({ where: { imageUrl: url }, select: { title: true } }),
      this.prisma.user.findFirst({ where: { avatarUrl: url }, select: { id: true } }),
    ]);
    if (article) throw new ConflictException(`In use by article "${article.title}"`);
    if (user) throw new ConflictException('In use as a user avatar');

    try {
      await fs.unlink(join(UPLOAD_DIR, filename));
    } catch {
      throw new BadRequestException('File not found');
    }
    return { deleted: true, filename };
  }
}
