# GeoWatch

Глобальна геополітична інтелігенс-платформа. Monorepo: Next.js 14 (web) + NestJS (api) + PostgreSQL + Redis.

## Стек

- **Frontend:** Next.js 14 (App Router), TypeScript, TailwindCSS, SWR, Zustand
- **Backend:** NestJS, TypeScript, Prisma ORM
- **DB:** PostgreSQL 16
- **Cache:** Redis 7
- **Monorepo:** Turborepo + npm workspaces

## Структура

```
geowatch/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
├── packages/
│   └── shared-types/ # Спільні TypeScript типи
├── docker-compose.yml
└── MVP_PLAN.md        # Повний поетапний план реалізації
```

## ⚠️ Перед першим запуском

Dockerfile-и копіюють `package-lock.json` для детермінованих білдів (`npm install` в multi-stage build). Цей файл не входить у згенерований код — створіть його один раз локально (потребує інтернету):

```bash
npm install
```

Це згенерує `package-lock.json` у корені репозиторію. Виконайте це **до** `docker-compose up --build`.

## Швидкий старт (Docker — рекомендовано)

Вимоги: Docker + Docker Compose. Нічого більше встановлювати не потрібно.

```bash
# 1. Скопіювати env файл
cp .env.example .env

# 2. Піднятti весь стек
docker-compose up --build

# 3. У окремому терміналі — застосувати seed (після того, як api стартував)
docker-compose exec api npm run db:seed
```

Після старту:
- Frontend: http://localhost:3000
- API: http://localhost:4000/api
- Health check: http://localhost:4000/api/health
- Postgres: localhost:5432 (geowatch / geowatch_dev_password)
- Redis: localhost:6379

Очікуваний результат на головній сторінці: три індикатори (API / Database / Redis), всі зелені "online".

## Локальний запуск без Docker (альтернатива)

```bash
npm install

# Підняти лише postgres + redis в Docker
docker-compose up postgres redis -d

# Налаштувати env
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local

# Migrate + seed
cd apps/api
npx prisma migrate dev --name init
npm run db:seed
cd ../..

# Запустити обидва apps одночасно (з кореня)
npm run dev
```

## Перевірка готовності Етапу 1

```bash
curl http://localhost:4000/api/health
# Очікується: {"status":"ok","db":"ok","redis":"ok","version":"1.0.0","uptime":N}
```

Адмін-користувач після seed: `admin@geowatch.local` / пароль із `ADMIN_SEED_PASSWORD` (за замовчуванням `ChangeMe123!`).
**Обов'язково змінити пароль перед production-деплоєм.**

## Корисні команди

```bash
npm run db:studio      # Prisma Studio — GUI для БД
npm run db:migrate     # Застосувати міграції (production)
npm run build          # Збілдити всі apps через Turborepo
npm run lint           # Лінтинг всіх apps
npm run type-check     # TypeScript перевірка всіх apps
```

## Наступні етапи

Дивись [`MVP_PLAN.md`](./MVP_PLAN.md) — повний план з 7 етапів: Countries API, Auth, News Ingestion, AI Summarization, WebSocket Live Feed, Production Deploy.

Команда **"продовжуй"** генерує код наступного етапу.
