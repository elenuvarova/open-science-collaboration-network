# Схема БД по PRD, миграции, seed-данные

> **Цель:** `../../product/prisma/schema.prisma` — полная схема из анализа spec/PRD/типов/экранов (User + ВСЕ предметные сущности и связи), миграция применена локально и на проде, seed наполняет базу базовыми данными (справочники/дефолты) и демо-записями из моков.

---

## Промт

```
Локально на ноуте установи Prisma и составь схему по PRD.

ШАГ 1 — Установи Prisma:
  npm install prisma @prisma/client
  npx prisma init --datasource-provider postgresql

Это создаст:
- ../../product/prisma/schema.prisma (с datasource-блоком)
- ../../product/.env (если ещё нет — там DATABASE_URL placeholder)

Удали ../../product/.env (он у нас не используется — мы всё через ../../product/.env.local), либо
объедини с ../../product/.env.local. Если конфликтуют — приоритет ../../product/.env.local.

ШАГ 2 — Подключение к удалённой БД через SSH-туннель.

Доступы (IP, пользователь, пароль БД) бери из infrastructure.md и .env.production:
пароль ты сгенерировал на прошлом шаге, я его не вводил и в чат не передаю.
Туннель и контейнер поднимаешь ты сам, я только подтверждаю выбор A) или B).

Локальная разработка может работать через два способа:

A) SSH-туннель к серверной БД (проще, не нужен локальный Postgres):
   Подними туннель сам (он работает, пока процесс открыт):
   ssh -L 5432:127.0.0.1:5432 <user>@<IP>

   В ../../product/.env.local запиши DATABASE_URL (пароль возьми из ../../product/.env.production):
   DATABASE_URL=postgresql://my_service:<пароль из .env.production>@127.0.0.1:5432/my_service

B) Локальный Postgres-контейнер (если хочу работать оффлайн):
   docker run -d --name <project>-pg \
     -e POSTGRES_USER=my_service \
     -e POSTGRES_PASSWORD=local_dev \
     -e POSTGRES_DB=my_service \
     -p 5432:5432 \
     postgres:16-alpine

   В ../../product/.env.local:
   DATABASE_URL=postgresql://my_service:local_dev@127.0.0.1:5432/my_service

Выбери A) или B). Спроси меня. По умолчанию A) — туннель проще, не нужно
синхронизировать данные.

ШАГ 3 — Собери ПОЛНУЮ схему данных из анализа всех источников.

Сначала ПРОАНАЛИЗИРУЙ всё, что у меня уже есть про данные, и составь полную карту
модели — не пропусти ни одной сущности и связи. Источники:
- ../../product/docs/spec.md (модель данных, пользовательские сценарии, сущности)
- ../../product/docs/PRD.md
- ../../product/src/entities/<entity>/model/types.ts — типы сущностей с этапа прототипа
- ../../product/src/entities/<entity>/api/mock-*.ts — какие поля реально нужны UI
- экраны: формы, фильтры, таблицы — из них видны поля, статусы и связи

Выпиши и ПОКАЖИ МНЕ карту модели ДО написания ../../product/prisma/schema.prisma:
- список ВСЕХ сущностей (таблиц);
- для каждой — поля с типами и обязательностью;
- все связи: 1-к-1, 1-ко-многим, многие-ко-многим (для m2m — отдельная
  join-таблица), и в какую сторону;
- enum'ы (статусы, роли, типы) — из значений на экранах и в спеке;
- что НЕ нашёл в источниках и пришлось додумать — отметь отдельно, чтобы я
  подтвердил.

После моего подтверждения карты пиши ../../product/prisma/schema.prisma. Базовая модель User
(заполнится при настройке auth):

  model User {
    id            String    @id @default(cuid())
    email         String    @unique
    name          String?
    emailVerified DateTime?
    image         String?
    role          Role      @default(USER)
    hashedPassword String?  // null для OAuth-пользователей; заполнится при настройке email/pass
    createdAt     DateTime  @default(now())
    updatedAt     DateTime  @updatedAt

    // Связи к предметным сущностям — добавь по карте модели
    // например: tasks Task[]
  }

  enum Role {
    USER
    ADMIN
  }

Дальше — ВСЕ предметные сущности из карты, целиком, а не «несколько для примера».
Цель — полная база со всеми сущностями и связями, готовая к работе.

ВАЖНО — связи и индексы:
- Для каждой сущности, принадлежащей пользователю — поле userId String и
  связь user User @relation(fields: [userId], references: [id])
- Многие-ко-многим — через явную join-модель (или @relation с неявной таблицей)
- Индексы на userId, createdAt и поля, по которым часто ищем/фильтруем
- Каскадное удаление: onDelete: Cascade для зависимых данных
  (если удаляется User — удалить его задачи и т.д.)
- enum'ы для статусов/типов вместо «магических строк»

ПОКАЖИ МНЕ финальный ../../product/prisma/schema.prisma ДО запуска миграции. Я могу попросить
поправить.

ШАГ 4 — После моего подтверждения:

  npx prisma migrate dev --name init

Это:
- Создаст файл миграции в ../../product/prisma/migrations/<timestamp>_init/migration.sql
- Применит миграцию к БД (через туннель к серверу или к локальному контейнеру)
- Сгенерирует Prisma Client в node_modules/@prisma/client

ШАГ 5 — Создай ../../product/prisma/seed.ts: базовые данные + демо.

Seed заполняет базу стартовыми данными двух видов:
1. БАЗОВЫЕ (reference) — без них приложение не работает: справочники, категории,
   статусы, дефолтные настройки, демо-админ. Бери их из spec.md (что подразумевается
   как изначально присутствующее). Эти данные нужны и на dev, и на проде.
2. ДЕМО — тестовые записи из моков Урока 2, чтобы экраны были не пустые. Их потом
   можно очистить (Задание 4 покажет empty state). Демо — только для dev.

Возьми in-memory массивы из ../../product/src/entities/<entity>/api/mock-*.ts. Перепиши их
как create-вызовы Prisma:

  import { PrismaClient } from '@prisma/client'
  const prisma = new PrismaClient()

  async function main() {
    // Очистка для повторного запуска (в порядке зависимостей)
    await prisma.<entity>.deleteMany()
    await prisma.user.deleteMany()

    // User
    const demoUser = await prisma.user.create({
      data: {
        email: 'demo@example.com',
        name: 'Demo User',
        role: 'USER',
        // hashedPassword добавим при настройке Auth
      },
    })

    // Предметные сущности из моков
    await prisma.<entity>.createMany({
      data: [
        { /* из моков */, userId: demoUser.id },
        { /* ... */, userId: demoUser.id },
      ],
    })
  }

  main()
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())

В ../../product/package.json добавь скрипт seed:
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }

Установи tsx если ещё нет:
  npm install -D tsx

Запусти seed:
  npx prisma db seed

ШАГ 6 — Создай ../../product/src/shared/db.ts (Prisma client как singleton):

  import { PrismaClient } from '@prisma/client'

  const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

  export const db =
    globalForPrisma.prisma ?? new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn'] : ['error'],
    })

  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

(Singleton нужен чтобы в hot-reload Next.js не плодить connections.)

ШАГ 7 — Применение миграций на проде.

Дополни /var/www/<project-name>/deploy.sh на сервере:

  #!/usr/bin/env bash
  set -euo pipefail
  cd /var/www/<project-name>
  git pull
  docker compose up -d --build
  docker compose exec -T web npx prisma migrate deploy
  echo "Deployed at $(date)"

(prisma migrate deploy — НЕ создаёт новые миграции, только применяет существующие.
Безопасно для продакшена.)

Запусти ./scripts/deploy-remote.sh — миграции должны примениться.

ШАГ 8 — Обнови ../../product/docs/PRD.md — добавь раздел "Схема данных":

  ## Схема данных

  ### User
  - id, email (unique), name, role (USER | ADMIN), hashedPassword, ...

  ### <Entity>
  - id, userId (FK к User), <поля>, ...

(Описание для людей. Источник правды — ../../product/prisma/schema.prisma. PRD ссылается на ключевые
поля и связи.)

ПОКАЖИ МНЕ:
- Финальный ../../product/prisma/schema.prisma
- Список миграций (ls ../../product/prisma/migrations/)
- Запусти npx prisma studio — проверь что данные видны
- Скриншот / описание Prisma Studio с заполненными таблицами
```

---

## Edge cases

- Если SSH-туннель закрылся посреди работы Prisma — следующий вызов упадёт с ECONNREFUSED. Перезапусти туннель
- При первом `prisma migrate dev` Prisma попросит "Drop database?" — если БД свежая (нет важных данных), дропни. Если уже есть данные — нет
- На проде НИКОГДА не запускай `migrate dev` — только `migrate deploy`. Dev может ломать данные

