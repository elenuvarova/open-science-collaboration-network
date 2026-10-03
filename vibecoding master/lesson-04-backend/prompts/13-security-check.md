# Security check после Auth и БД

> **Цель:** прогон чек-листа безопасности после настройки PostgreSQL + Auth. Фокус — auth, IDOR, injections, sessions.

---

## Промт

```
Запусти security-check для моего проекта.

Контекст: этап БД и Auth завершён — есть PostgreSQL в docker-compose, Prisma-схема,
better-auth (или NextAuth), сессии в БД, защита роутов через middleware,
IDOR-защита заявлена.

Сначала прочитай растущий ../../product/docs/security-checklist.md (создан в Уроке 3)
и сверься с ним. В конце допиши в него новые вектора этого этапа (auth, IDOR, сессии,
инъекции) — создай файл, если его вдруг нет. Чек-лист копится от этапа к этапу.

В Claude Code: /security-check
В Codex / Cursor: «прочитай prompts/security-check.md и выполни.
                  Контекст — этап БД и Auth, фокус на auth/IDOR/sessions».

Что должно быть проверено в этом запуске (на этом этапе):

🟢 КРИТИЧНО НА ЭТОМ ЭТАПЕ:
- A. Authorization & IDOR: каждый API в app/api/ имеет проверку сессии +
  IDOR-проверку (entity.userId === session.user.id) на ресурсах с userId
- E. Authentication / Sessions: bcrypt rounds ≥ 12, session.expiresAt в БД,
  cookie HttpOnly+Secure+SameSite=Lax, rate limit на /api/auth/* (5/min),
  user-enumeration защита (одинаковые ответы для login и forgot-password)
- B. Inputs & Injection: Prisma параметризованные запросы, mass assignment
  через explicit destructure / z.pick (не db.update({ data: req.body }))
- D. CSRF: SameSite=Lax + проверка Origin на state-changing API

🟡 ОБНОВЛЕНО:
- L. Deployment: проверь что .env.production обновлён (DATABASE_URL,
  NEXTAUTH_SECRET — НЕ совпадает с .env.local!), 5432 закрыт UFW
- G. Secrets: NEXTAUTH_SECRET длиной ≥ 32 байта, не дефолтное значение

🟢 Проверь что не сломалось:
- H. HTTP security headers
- L. SSH/UFW/fail2ban

⚪ Не проверяем в этом аудите (нет таких векторов в проекте):
- F. File uploads
- J. Webhooks / Payments

Сохрани отчёт в ../../product/docs/audits/security-check-<YYYY-MM-DD>.md.

ОСОБОЕ ВНИМАНИЕ — IDOR ТЕСТ:

Создай два тестовых аккаунта (A и B), каждым — по одному ресурсу. Под A
попробуй открыть /<resource>/<id-B> по URL и DELETE /api/<resource>/<id-B>
через curl. Должно быть 404 в обоих случаях.

Если тест IDOR прошёл — отметь в отчёте: «✅ IDOR проверен на двух тестовых
аккаунтах, не пробивается».

Если найдены 🔴 проблемы (особенно IDOR / открытые auth-endpoints) — чини
до перехода к следующему этапу.
```

---

## Что должно получиться

- `../../product/docs/audits/security-check-<YYYY-MM-DD>.md`
- Подтверждённый IDOR-тест на двух аккаунтах (формализуется как Сценарий 3 в `../../product/docs/test-cases.md`, Урок 7)
- ADR в `memory/decisions/` если было принято важное решение по auth (например, отказ от OAuth, выбор схемы паролей)
- Никаких 🔴 — переход к следующему этапу только когда чисто

## Edge cases

- Если выбрана Drizzle вместо Prisma — промт адаптирует проверки injection (raw SQL через `sql` template tag, не сборка строк)
- Если используется NextAuth (а не better-auth) — проверки те же, но имена функций отличаются (`getServerSession` вместо `auth.api.getSession`)

