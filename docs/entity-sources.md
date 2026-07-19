# Entity Resolution — registry & sanctions-source coverage

Working reference for the Entity Resolution Engine's source expansion. Every
row was checked against the live endpoint from this host before being
marked buildable — "researched, blocked" means the endpoint was actually
tried and failed, not assumed to fail. Update this table as sources are
added or new candidates are researched.

## Live (shipped)

| Source | Country/scope | Type | Auth | PR |
|---|---|---|---|---|
| OFAC SDN | US sanctions (RU/UA/BY scope) | sanctions | keyless | #36 |
| GLEIF | global (LEI registry + ownership) | registry | keyless | #36, #40 |
| EU Consolidated Sanctions | EU | sanctions | keyless | #40 |
| UK OFSI | UK sanctions | sanctions | keyless | #40 |
| US SEC EDGAR | US public companies | registry | keyless (descriptive User-Agent required) | #41 |
| UK Companies House | UK | registry | free API key (user-registered) | #42 |
| France SIRENE/RNE | France | registry | keyless | #43 |

## Built this round (`feature/registry-expansion`) — all four ingested live against production data

| Source | Country/scope | Type | Auth | Result |
|---|---|---|---|---|
| Canada Consolidated Autonomous Sanctions List | Canada | sanctions | keyless | Bulk XML, same shape as EU/OFSI, no structured identifiers (relies on Phase 2/3 fuzzy+LLM). Live run: **1,756 processed → 1,756 new entities, 0 auto-merged** (correct — Phase 2 never auto-merges); queued **811 pending merge reviews**, e.g. a real 100%-confidence "BANK ROSSIYA" vs "Bank Rossiya" duplicate pair correctly held for human approval rather than silently merged or duplicated. ~14 min run time (LLM gray-zone budget is the bottleneck). |
| Australia DFAT Consolidated List | Australia | sanctions | keyless | Ships as XLSX (1.3MB) — added the `xlsx` (SheetJS) dependency, the repo's first. Rows grouped by base `Reference` number (alias suffix stripped), same pattern as OFSI's GroupID. Live run: **459 processed → 459 new entities, 0 auto-merged**. ~2.5 min run time. |
| UK Companies House PSC (beneficial ownership) | UK | registry extension | reuses existing free API key | Not a new registry — extends the existing Companies House adapter with real "Persons with Significant Control" data. Corporate-entity PSCs link as `EntityRelationship` parents (same shape as GLEIF's parent/child). Individual-person PSCs (real people) are deliberately **not** modelled — `Entity.entityType` only supports `company`; adding a Person concept is a schema decision, not a source-addition decision, so those are left in the raw payload for a future round. Verified live against 3 real sanctioned UK entities (Rosneft Marine UK, Sberbank CIB UK, Surgutneftegas Ltd) — correct `kind` discrimination each time (2 individual PSCs correctly skipped, 0 corporate PSCs present in this sample so the relationship-linking arm itself wasn't exercised live, though it reuses the same Prisma upsert already proven correct by the GLEIF relationship path). |
| US Consolidated Screening List (trade.gov) | US, aggregates 11 non-SDN export/sanctions lists (BIS Entity List, Denied Persons List, ITAR debarred, Treasury SSI, etc.) | sanctions | free API key (user self-registered at developer.trade.gov) | SDN itself deliberately excluded — 100% redundant with the existing dedicated `ofac-sdn.adapter.ts`. **Real endpoint quirks found only by testing live**, not from the docs: (1) hostname in the actual "Try this operation" console is `data.trade.gov`, not `api.trade.gov` from the docs prose; (2) `types=Entity` filter is silently broken for 7 of the 13 lists (returns 0 even for lists that are almost entirely companies, e.g. BIS Entity List) — classify Individual vs Entity client-side instead, from birth/citizenship/nationality field presence; (3) hard pagination ceiling of offset+size≤1050 per query, worked around by splitting per (source × country) — one combo (Entity List × Russia, 1,094 records) still exceeds it by 44, logged not silently dropped. **Two real bugs found and fixed via live verification**: an unpaced probe-then-paginate loop hit persistent 429s that were silently treated as "0 results" (a first live run under-counted several genuinely non-empty lists, e.g. SSI came back empty) — fixed with retry+backoff and per-request pacing; a `crimea (occupied)` free-text country label (this API's Crimea convention, distinct from OFAC's own "Region: Crimea") blew the `CHAR(2)` `primaryCountryId` column and crashed the whole ingestion run partway through — fixed with the same normalize-known-aliases pattern as `OFAC_COUNTRY_NAME_ALIASES`. Corrected live run: **1,269 processed → 615 new entities, 654 merged via real exact-identifier matches** (much higher merge rate than Canada/Australia, confirming CSL's structured `ids[]` genuinely cross-reference existing OFAC/GLEIF data) — verified a clean new-entity case end-to-end (`AKTSIONERNOE OBSHCHESTVO RT-KHIMICHESKIE TEKHNOLOGII I KOMPOZITSIONNYE MATERIALY`, 3 correct `reg_number@RU` identifiers, `US CSL (SSI)` sanction, correct source attribution). Pending-review queue grew from 811 to **1,950** after this run. |

## Researched, blocked (same category as UN sanctions / GDELT — revisit later)

| Source | Country/scope | Type | What was tried | Result |
|---|---|---|---|---|
| Switzerland SECO (SESAM) | Switzerland | sanctions | Multiple documented XML endpoint variants (`sesam.search.admin.ch`, `sesam.search-admin.ch`, `seco.admin.ch/sanktionen/xml/...`) | DNS/connection failures or 404s from this host on every variant found via search. The site itself confirms an XML export exists but the exact current path wasn't resolvable live. Worth a retry with a real browser session (Companies House-style UA fix didn't apply — this looks like a routing/DNS issue, not UA blocking). |
| Czech ARES | Czechia | registry | `ares.gov.cz/ekonomicke-subjekty-v-be/rest/...` and `/ekonomicke-subjekty/v3/...`, with and without browser User-Agent | 403 "The request is blocked" (WAF) on every attempt — looks like bot/geo-blocking, not a UA issue (the OFSI/state.gov browser-UA fix didn't help here). |
| Ireland CRO | Ireland | registry | `api.cro.ie/` | 403 — likely requires a registered API key; not yet investigated further. |
| Poland KRS | Poland | registry | `api-krs.ms.gov.pl/api/krs/OdpisAktualny/{krsNumber}` | **Works**, but lookup-only by known KRS number (confirmed real data incl. NIP/REGON for e.g. ORLEN, KRS 0000028860) — no name-search endpoint found (`/api/krs/Wyszukaj?nazwa=...` → 404). Not usable for our search-by-name enrichment flow without a separate name→KRS-number bridge (e.g. GUS REGON search). Revisit if a search endpoint turns up. |
| Estonia e-Business Register | Estonia | registry | `avaandmed.ariregister.rik.ee/api/detailandmed?...` (guessed path) | Returned an HTML page, not a JSON API — the real open-data endpoint wasn't found this round. Reputed to have a genuinely open API; needs proper doc research, not guessed paths. |

## Candidates not yet probed (next research round)

- Netherlands KVK (has an API, but the free tier's exact terms need checking)
- US BIS Entity List / Denied Persons List as **standalone** feeds (fallback if the trade.gov CSL aggregator proves unreliable once a key exists)
- UN Security Council Consolidated List — previously deferred (protected API gateway), not re-tried this round
- Beneficial-ownership registries beyond UK PSC (OpenOwnership aggregator; a few EU states still publish UBO data post-CJEU access restrictions) — would need the same Person-modelling schema decision flagged above for Companies House PSC individuals
