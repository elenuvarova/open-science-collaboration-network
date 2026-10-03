# Промты — База данных и Auth (на сервере)

| № | Файл | Что делает |
|---|---|---|
| 00 | [00-db-choice.md](00-db-choice.md) | ADR-003 (часть): выбор базы — Supabase vs свой Postgres (сравнение как Vercel/VPS) |
| 01 | [01-orm-choice.md](01-orm-choice.md) | _(опционально)_ осознанный выбор ORM (Prisma vs Drizzle). По умолчанию Prisma прикручена автоматически — этот промт только если хотите сравнить/взять Drizzle |
| 02 | [02-postgres-on-server.md](02-postgres-on-server.md) | PostgreSQL контейнер в docker-compose, swap, ежедневный бэкап (вариант «свой Postgres») |
| 03 | [03-schema-migrations-seed.md](03-schema-migrations-seed.md) | Полная `../../product/prisma/schema.prisma` из анализа spec/доков (все сущности и связи), миграция, seed: базовые + демо-данные |
| 04 | [04-mocks-to-real.md](04-mocks-to-real.md) | Замена моков на реальные Prisma-вызовы (UI не переписывается) |
| 05 | [05-auth-basic.md](05-auth-basic.md) | better-auth (ADR-004): регистрация, логин, сессии, защита роутов, выбор `requireEmailVerification` |
| 06 | [06-email-templates.md](06-email-templates.md) | Письма аккаунта: welcome / verify-email / password-reset / password-changed через React Email + Resend, подключение в auth-flow |
| 07 | [07-product-emails.md](07-product-emails.md) | Продуктовые email-события (инвайты, подтверждение заказа, смена статуса, дайджест) — если есть в spec; переиспользует провайдера из Промта 06 |
| 08 | [08-account-notifications.md](08-account-notifications.md) | Личный кабинет + IDOR-защита + настройки + центр уведомлений (только in-app: notify, колокольчик, /notifications, мьют типов) |
| 09 | [09-file-storage.md](09-file-storage.md) | Хранилище файлов (MinIO/R2/Bunny/S3), upload, signed URLs, HLS |
| 10 | [10-auth-security.md](10-auth-security.md) | Хеширование, cookie-флаги, rate limit, защита от user-enumeration |
| 11 | [11-persistence-check.md](11-persistence-check.md) | Смоук всего сервиса в конце сборки: auth + валидации + сохранение на каждом экране + файлы (создал → перезагрузил → проверил в базе → почистил). Ловит «сделал в UI, а не сработало/не сохранилось» |
| 12 | [12-update-memory-and-save.md](12-update-memory-and-save.md) | infrastructure.md (БД + Auth) + save-session |
| 13 | [13-security-check.md](13-security-check.md) | Прогон `/security-check` после Auth — фокус на IDOR, sessions, injections, user-enumeration |
