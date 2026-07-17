import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type IdentifierType = 'lei' | 'reg_number' | 'tax_id';

export interface NormalizedIdentifier {
  type: IdentifierType;
  value: string;
  // Empty string for globally-unique identifiers (LEI); an ISO2 code for
  // nationally-scoped ones (a registration/tax number is only unique within
  // its own country — the same digits could theoretically appear in two
  // different jurisdictions).
  countryId: string;
}

export interface NormalizedEntityRecord {
  sourceExternalId: string;
  name: string;
  aliases: string[];
  identifiers: NormalizedIdentifier[];
  sanctions?: Array<{ regime: string; program: string }>;
  raw: unknown;
}

export interface ResolveResult {
  entityId: string;
  merged: boolean; // true if this record matched an existing Entity by identifier
}

/**
 * Phase 1 of the Entity Resolution Engine: identifier-only matching. No
 * fuzzy name similarity, no LLM suggestion — those are Phase 2/3. A record
 * merges into an existing Entity ONLY when it shares an identifier
 * (type + value + countryId) with one already on file; otherwise it becomes
 * a new Entity. This is deliberately conservative: a wrong automatic merge
 * silently attributes one company's sanctions/aliases to a different real
 * company, and that's much harder to notice and undo than simply having two
 * separate Entity rows that a later fuzzy/LLM pass can propose merging.
 */
@Injectable()
export class EntityResolutionService {
  private readonly logger = new Logger(EntityResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolve(record: NormalizedEntityRecord, sourceId: string): Promise<ResolveResult> {
    let matchedEntityId: string | null = null;
    for (const id of record.identifiers) {
      const existing = await this.prisma.entityIdentifier.findUnique({
        where: {
          type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId },
        },
        select: { entityId: true },
      });
      if (existing) {
        matchedEntityId = existing.entityId;
        break;
      }
    }

    const entityId =
      matchedEntityId ??
      (
        await this.prisma.entity.create({
          data: { entityType: 'company', canonicalName: record.name },
        })
      ).id;

    const allNames = [record.name, ...record.aliases];
    for (const name of new Set(allNames)) {
      await this.prisma.entityAlias.upsert({
        where: { entityId_name: { entityId, name } },
        create: { entityId, name, sourceId },
        update: {},
      });
    }

    for (const id of record.identifiers) {
      await this.prisma.entityIdentifier.upsert({
        where: {
          type_value_countryId: { type: id.type, value: id.value, countryId: id.countryId },
        },
        // If this identifier already existed it belongs to matchedEntityId
        // (that's how we got here) — the create branch only fires for
        // genuinely new identifiers on this entity.
        create: { entityId, type: id.type, value: id.value, countryId: id.countryId, sourceId },
        update: {},
      });
    }

    await this.prisma.entitySourceLink.upsert({
      where: { sourceId_externalId: { sourceId, externalId: record.sourceExternalId } },
      create: {
        entityId,
        sourceId,
        externalId: record.sourceExternalId,
        rawPayload: record.raw as Prisma.InputJsonValue,
      },
      update: { entityId, rawPayload: record.raw as Prisma.InputJsonValue, fetchedAt: new Date() },
    });

    for (const s of record.sanctions ?? []) {
      await this.prisma.entitySanction.upsert({
        where: { entityId_regime_program: { entityId, regime: s.regime, program: s.program } },
        create: { entityId, regime: s.regime, program: s.program, sourceId },
        update: {},
      });
    }

    if (matchedEntityId) {
      this.logger.debug(`Merged "${record.name}" into existing entity ${matchedEntityId} by identifier match`);
    }

    return { entityId, merged: matchedEntityId !== null };
  }
}
