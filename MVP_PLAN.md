# GeoWatch MVP — Покроковий план реалізації

## Що входить до MVP

Мінімально функціональний продукт, який можна задеплоїти в production:

| Функція | MVP | Post-MVP |
|---|---|---|
| Monorepo + Docker | ✅ | — |
| БД + Prisma схема | ✅ | — |
| Auth (JWT + refresh) | ✅ | OAuth |
| Countries API | ✅ | — |
| Events API | ✅ | — |
| News ingestion (NewsAPI) | ✅ | GDELT, RSS |
| AI summarization | ✅ | Clustering |
| Dedup системa | ✅ | — |
| Risk scoring | ✅ | ML model |
| WebSocket live feed | ✅ | — |
| Next.js frontend | ✅ | — |
| Інтерактивна карта | ✅ | 3D Globe |
| Admin dashboard | ✅ | Analytics |
| Search | ✅ | Vector search |
| Vercel + DO deploy | ✅ | Terraform |

---

## Етап 1 — Monorepo, Docker, Infrastructure
**Ціль:** локальне середовище запускається однією командою `docker-compose up`

### Задачі
- [ ] Turborepo monorepo scaffold
- [ ] `packages/shared-types` — спільні TypeScript типи
- [ ] `apps/api` — NestJS boilerplate
- [ ] `apps/web` — Next.js 14 boilerplate
- [ ] Prisma schema (всі таблиці)
- [ ] docker-compose.yml (postgres, redis, api, web)
- [ ] Dockerfile для api і web
- [ ] `.env.example` файли
- [ ] Seed script (196 країн з базовими даними)
- [ ] Health-check endpoint

### Критерії готовності
- `docker-compose up` стартує без помилок
- `GET /api/health` → `{ status: "ok", db: "ok", redis: "ok" }`
- `GET /` на порту 3000 рендерить Next.js сторінку
- Prisma migrate + seed виконується автоматично
- `packages/shared-types` імпортується в обох apps

---

## Етап 2 — Countries API + базовий фронтенд
**Ціль:** публічний API країн з кешуванням + карта на фронтенді

### Задачі
- [ ] `CountriesModule` у NestJS (controller, service, dto)
- [ ] Redis caching decorator
- [ ] `GET /api/countries` — список з фільтрацією
- [ ] `GET /api/countries/:id` — деталі країни
- [ ] `GET /api/countries/:id/risk-history` — графік ризику
- [ ] Next.js: головна сторінка з картою (react-simple-maps)
- [ ] Country sidebar компонент
- [ ] SWR hooks для країн
- [ ] Zustand store для вибраної країни

### Критерії готовності
- API повертає всі 196 країн з risk_score і status
- Карта відображає кольорове кодування за статусом
- Клік по країні відкриває sidebar з деталями
- Redis cache: повторний запит < 10ms

---

## Етап 3 — Auth + Admin Dashboard
**Ціль:** захищений адмін з управлінням країнами і подіями

### Задачі
- [ ] `AuthModule` — JWT + refresh token
- [ ] bcrypt хешування паролів
- [ ] `UsersModule` — CRUD адміністраторів
- [ ] RolesGuard — superadmin / editor / viewer
- [ ] `PATCH /api/admin/countries/:id` — override статусу
- [ ] `POST/PATCH/DELETE /api/admin/events` — CRUD подій
- [ ] Next.js: `/admin` layout з auth guard
- [ ] Admin: Countries status override UI
- [ ] Admin: Events management table
- [ ] NextAuth.js інтеграція з кастомним credentials provider

### Критерії готовності
- Login/logout працює
- JWT expires 8h, refresh 30d
- Тільки superadmin може видаляти; editor може редагувати
- Override статусу країни зберігається і кешується

---

## Етап 4 — News Ingestion Pipeline
**Ціль:** автоматичний збір новин кожні 15 хвилин

### Задачі
- [ ] `SourcesModule` — реєстр джерел
- [ ] `IngestionModule` — cron scheduler
- [ ] NewsAPI adapter
- [ ] RSS adapter (rss-parser)
- [ ] `DedupService` — SHA256 content hash
- [ ] `ArticlesModule` — зберігання і пагінація
- [ ] `GET /api/news` — фід з фільтрами
- [ ] `GET /api/news/:id`
- [ ] Admin: Sources management UI
- [ ] Admin: Articles queue UI

### Критерії готовності
- Ingestion запускається кожні 15 хв via `@Cron`
- Дублікати відфільтровуються (перевірка за content_hash)
- 50+ статей за першу годину роботи
- Стаття прив'язана до country_id

---

## Етап 5 — AI: Summarization + Classification
**Ціль:** кожна стаття отримує AI-summary і категорію

### Задачі
- [ ] `AiModule` — OpenAI client singleton
- [ ] `SummarizerService` — GPT-4o-mini summary
- [ ] `ClassifierService` — category + country + tags
- [ ] `RiskScorerService` — розрахунок risk score
- [ ] `RiskScheduler` — перерахунок кожні 30 хв
- [ ] Admin: Approval queue (approve/reject AI summary)
- [ ] `PATCH /api/admin/news/:id/approve`
- [ ] Risk score history запис
- [ ] Оновлення country.status автоматично

### Критерії готовності
- Кожна нова стаття отримує summary протягом 60с
- Risk score країни оновлюється після нових подій
- Approval queue показує pending summaries
- GPT помилки обробляються gracefully (retry 3x)

---

## Етап 6 — WebSocket Live Feed + Search
**Ціль:** real-time оновлення + повнотекстовий пошук

### Задачі
- [ ] `NewsGateway` — Socket.IO WebSocket
- [ ] Redis Pub/Sub для broadcast між інстансами
- [ ] `GET /api/search` — full-text через pg ts_vector
- [ ] Ticker компонент на фронтенді
- [ ] Live feed з WebSocket hook
- [ ] Search сторінка

### Критерії готовності
- Нова стаття з'являється в браузері < 3с після ingestion
- Пошук повертає результати < 200ms
- WebSocket reconnect при обриві

---

## Етап 7 — Production Deploy
**Ціль:** Vercel + DigitalOcean production

### Задачі
- [ ] DigitalOcean App Platform для api
- [ ] DigitalOcean Managed PostgreSQL
- [ ] DigitalOcean Managed Redis
- [ ] Vercel deploy для web
- [ ] GitHub Actions CI/CD pipeline
- [ ] Environment variables setup
- [ ] Health monitoring (UptimeRobot)
- [ ] nginx reverse proxy config
- [ ] Rate limiting (100 req/min per IP)
- [ ] CORS production config

### Критерії готовності
- Production URL доступний публічно
- Zero-downtime deploy через GitHub Actions
- API response < 300ms (p95)
- Uptime monitoring налаштований

---

## Залежності між етапами

```
Е1 (Infra) ──→ Е2 (Countries API) ──→ Е3 (Auth)
                       │
                       ↓
               Е4 (Ingestion) ──→ Е5 (AI) ──→ Е6 (WebSocket)
                                                      │
                                                      ↓
                                               Е7 (Deploy)
```

## Оцінка часу

| Етап | Складність | Оцінка |
|---|---|---|
| Е1 Infra | Medium | 1 день |
| Е2 Countries | Medium | 1.5 дні |
| Е3 Auth | High | 1.5 дні |
| Е4 Ingestion | High | 2 дні |
| Е5 AI | High | 2 дні |
| Е6 WebSocket | Medium | 1.5 дні |
| Е7 Deploy | Medium | 1 день |
| **Разом** | | **~10.5 днів** |
