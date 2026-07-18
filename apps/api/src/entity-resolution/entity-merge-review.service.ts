import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Executes (or dismisses) a Phase 2 fuzzy-match suggestion. Nothing here
 * runs automatically — every merge is a human clicking "approve" on a
 * specific confidence-scored candidate. Approving moves entityB's data onto
 * entityA and removes entityB; rejecting just marks the review dismissed
 * and leaves both entities as they are.
 */
@Injectable()
export class EntityMergeReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending() {
    return this.prisma.entityMergeReview.findMany({
      where: { status: 'pending' },
      orderBy: { confidence: 'desc' },
      include: {
        entityA: {
          select: { id: true, canonicalName: true, primaryCountryId: true, aliases: { select: { name: true } } },
        },
        entityB: {
          select: { id: true, canonicalName: true, primaryCountryId: true, aliases: { select: { name: true } } },
        },
      },
    });
  }

  async approve(reviewId: string, reviewerId: string) {
    const review = await this.getPendingOrThrow(reviewId);

    const [aliases, identifiers, sanctions, sourceLinks] = await Promise.all([
      this.prisma.entityAlias.findMany({ where: { entityId: review.entityBId } }),
      this.prisma.entityIdentifier.findMany({ where: { entityId: review.entityBId } }),
      this.prisma.entitySanction.findMany({ where: { entityId: review.entityBId } }),
      this.prisma.entitySourceLink.findMany({ where: { entityId: review.entityBId } }),
    ]);

    await this.prisma.$transaction(async (tx) => {
      for (const a of aliases) {
        await tx.entityAlias.upsert({
          where: { entityId_name: { entityId: review.entityAId, name: a.name } },
          create: { entityId: review.entityAId, name: a.name, sourceId: a.sourceId },
          update: {},
        });
      }
      for (const id of identifiers) {
        await tx.entityIdentifier.upsert({
          where: { type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId } },
          create: {
            entityId: review.entityAId,
            type: id.type,
            value: id.value,
            countryId: id.countryId,
            sourceId: id.sourceId,
          },
          // If entityA somehow already carries this exact identifier
          // (shouldn't happen — that would have exact-matched in Phase 1),
          // re-point it defensively rather than error out the whole merge.
          update: { entityId: review.entityAId },
        });
      }
      for (const s of sanctions) {
        await tx.entitySanction.upsert({
          where: { entityId_regime_program: { entityId: review.entityAId, regime: s.regime, program: s.program } },
          create: { entityId: review.entityAId, regime: s.regime, program: s.program, sourceId: s.sourceId },
          update: {},
        });
      }
      for (const link of sourceLinks) {
        await tx.entitySourceLink.update({ where: { id: link.id }, data: { entityId: review.entityAId } });
      }
      // Mark this review approved BEFORE deleting entityB — the FK from
      // EntityMergeReview.entityB is ON DELETE CASCADE, so deleting the
      // entity first would cascade-delete this very review row and leave
      // nothing for the update below to find.
      await tx.entityMergeReview.update({
        where: { id: reviewId },
        data: { status: 'approved', reviewerId, reviewedAt: new Date() },
      });
      // Cascades away entityB's now-empty child rows plus any OTHER pending
      // review that also named entityB — a merge decision on one candidate
      // implicitly resolves any other queued suggestion for the entity
      // being removed.
      await tx.entity.delete({ where: { id: review.entityBId } });
    });

    return { merged: true, entityId: review.entityAId };
  }

  async reject(reviewId: string, reviewerId: string) {
    await this.getPendingOrThrow(reviewId);
    await this.prisma.entityMergeReview.update({
      where: { id: reviewId },
      data: { status: 'rejected', reviewerId, reviewedAt: new Date() },
    });
    return { merged: false };
  }

  private async getPendingOrThrow(reviewId: string) {
    const review = await this.prisma.entityMergeReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException(`Merge review "${reviewId}" not found`);
    if (review.status !== 'pending') throw new BadRequestException('This review was already resolved');
    return review;
  }
}
