# Промт: Security check — единая проверка безопасности веб-приложения

> **Universal markdown.** Любой AI (Claude Code, Codex, Cursor) читает и выполняет. Из Codex/Cursor — открой и следуй. В Claude Code зашит в скилл `/security-check`.

---

## Когда применять

- После деплоя — серверная безопасность
- После настройки Auth — auth, IDOR, sessions, injections
- После Upload / AI / webhooks — файлы, secrets, payment webhooks
- Перед публичным запуском — финальный полный прогон
- Регулярно в проде — раз в месяц / перед релизом

Есть фокусные security-проверки на каждом этапе: в Уроке 3 (деплой), Уроке 4 (бэкенд + БД + auth), Уроке 5 (расширения) и финальный аудит в Уроке 7.

---

## Шаги промт

### Шаг 0 — Прочитай источники истины

- Встроенный чек-лист OWASP Top 10 ниже (14 разделов A–N) — основной источник
- Если у тебя есть собственные накопленные правила безопасности (в `../../product/docs/rules/` или заметках) — приложи их как дополнительный контекст
- Документация фреймворка по security (Next.js Security, OWASP Cheat Sheets) — если нужно углубиться
- `../../product/docs/rules/safety-checks.md` — детекция секретов, debug-кода, body-лимитов
- `../../product/docs/memory/infrastructure.md` — реальная конфигурация (если есть)

Если файлов нет — пометь N/A в отчёте, продолжай по доступным.

### Шаг 1 — Прогон по 14 разделам

Для каждой категории — 🔴 / ⚠️ / ✅ + ссылка на файл:строка + что чинить. Не описывай атаку абстрактно — проверяй РЕАЛЬНЫЙ код.

**A. Authorization & IDOR**
- Все API endpoints в `app/api/` имеют проверку сессии? (grep auth/session)
- Для каждого ресурса с userId есть IDOR-проверка (`entity.userId === session.user.id`)?
- List endpoints фильтруют по userId / по правам секции?
- Admin endpoints дополнительно проверяют `role === 'ADMIN'`?

**B. Inputs & Injection**
- SQL injection: Prisma / ORM с параметризованными запросами? `$queryRaw` через template literals, не сборка строки?
- Mass assignment: API не принимает целиком `request.body` в `db.update` — явный whitelist через `z.pick` / explicit destructure?
- Prototype pollution: dynamic route params не используются через `{...params}` без проверки

**C. XSS**
- React: проверь все места с прямой вставкой raw HTML (атрибут `d.SetInnerHTML` или эквивалент в Vue/Svelte/Solid). Только в строго санитизованных местах?
- Сторонние HTML/Markdown: используется ли `DOMPurify` / `sanitize-html`?
- Серверный рендер пользовательского ввода в HTML — экранируется?

**D. CSRF**
- Cookie: `SameSite=Lax/Strict` + `HttpOnly` + `Secure` (на проде)
- State-changing API (POST / PATCH / DELETE) — защищены через CSRF-token или через SameSite-cookie + проверку Origin?

**E. Authentication / Sessions**
- Сессии в БД (не только JWT) — можно инвалидировать
- Пароли через `bcrypt`/`scrypt` (rounds ≥ 12) — никогда plain
- Reset-password: токен одноразовый, TTL ≤ 1 час
- Смена email: подтверждение через старый email
- Admin-пароль: длина ≥ 16 + сложность
- Защита от user-enumeration на `/login` и `/forgot-password` (одинаковые ответы)
- Rate limit на `/api/auth/*` (5/min с IP, 3/hour на `/sign-up`)

**F. File uploads**
- Whitelist mime + magic bytes (`file-type` или эквивалент)
- `MAX_SIZE_BYTES` — явный лимит, не дефолт node http
- Имя файла на диске — UUID/cuid, не user-input (path traversal)
- Расширение определяется через magic bytes, не из `file.name`
- Защита от data-bombs (zip с экспоненциальным разжатием)

**G. Secrets**
- Pre-commit hook сканирует на секреты (`sk-`, `ghp_`, `AKIA…`)
- `.gitignore`: `.env`, `.env.*` (кроме `.env.example`)
- В коде нет секретов с дефолтным значением (`process.env.X || 'fallback'`) — обязательно throw если переменной нет
- `chmod 600` на `.env` / `.env.production`
- История git: нет коммитов с `.env` (`git log --all -- .env*`)

**H. HTTP security headers**
- `Content-Security-Policy` — есть и не слишком разрешительный
- `X-Frame-Options: SAMEORIGIN` (защита от click-jacking)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (если не нужно)
- HSTS включён (`Strict-Transport-Security`) — обычно от Certbot

**I. Body size & timeouts**
- Явный лимит body на API routes (особенно upload)
- Slowloris защита: nginx `client_body_timeout`, `client_header_timeout`
- Timeouts на внешние fetch вызовы (`AbortSignal`)

**J. Webhooks / Payments**
- Подпись webhook проверяется (HMAC от провайдера)
- Idempotency: один и тот же event не обрабатывается дважды
- Timing-safe сравнение подписи (`crypto.timingSafeEqual`)

**K. Audit & Logging**
- Audit log для admin-действий
- В логах никогда не пишутся: пароли, токены, full email/телефон без маски, PAN, CVV
- Log rotation настроен (docker `daemon.json` или logrotate)

**L. Deployment**
- Контейнер запускается под non-root (`USER nextjs` в Dockerfile)
- `.env.production` — `chmod 600`
- 5432 (Postgres), 6379 (Redis) — закрыты UFW (только localhost)
- SSH: только по ключам, root отключён
- fail2ban установлен и работает
- Backup БД — есть, ротация настроена

**M. Production-конфиг**
- `next.config.js`: НЕ `ignoreBuildErrors` / `ignoreLintErrors` на проде
- `middlewareClientMaxBodySize` / `serverActions.bodySizeLimit` — явно указаны
- Body limits проверены через e2e тестом

**N. Архитектурные ловушки**
- Кастомный `server.js` — не пропускает middleware-проверки auth?
- JSON-файловое хранилище — есть ли `flock` или migrate в Postgres?

### Шаг 2 — Сформируй отчёт

Сохрани в `../../product/docs/audits/security-check-<YYYY-MM-DD>.md`:

```markdown
# Security Check — <YYYY-MM-DD>

## Сводка
- 🔴 Критично (блокирует прод): N
- ⚠️ Среднее (надо починить): M
- ✅ В порядке: K

## Критично 🔴
### N.A.1 — IDOR на /api/<resource>/[id]
- **Где:** app/api/<resource>/[id]/route.ts:25
- **Что:** GET возвращает ресурс без проверки entity.userId
- **Атака:** пользователь A может открыть /<resource>/<id-B> по URL
- **Чинить:** добавить `if (resource.userId !== session.user.id) return 404`

### ...

## Среднее ⚠️
### ...

## В порядке ✅
- HSTS включён
- SSH только по ключам
- ...

## Что не проверено / Out of scope
- <причина: нет файла X, нет доступа к серверу>
```

### Шаг 3 — Спроси пользователя

```
Найдено 🔴 N критичных, ⚠️ M средних. Чиним сейчас?
- Да, всё → починка по приоритету (🔴 первым)
- Только 🔴 → средние в backlog
- Покажи диффы перед починкой → подтверждение по каждому
- Я сам → отчёт остаётся, не чиним
```

### Шаг 4 — После починки

- Прогон тестов из `../../product/docs/test-cases.md`
- `/save-session` с slug `security-check-<YYYY-MM-DD>`
- Если 🔴 проблема — обязательно ADR в `../../product/docs/memory/decisions/`

---

## Связанные механизмы (быстрый/глубокий)

| | `../../product/scripts/security-precheck.sh` | `/security-check` (этот промт) | Месячный cron |
|---|---|---|---|
| Тип | Bash | AI | Bash |
| Время | секунды | минуты | секунды |
| Глубина | 6 типовых ошибок | 14 разделов глубоко | 8 серверных проверок |
| Запуск | автоматически (deploy gate) | вручную (по триггеру) | автоматически (cron 1-е число) |
| Чинит? | Нет | Да, с подтверждением | Нет (шлёт отчёт) |

Установка precheck как pre-deploy gate описана в Задании 10 этого урока (`prompts/13-security-precheck-deploy-gate.md`).
Ежемесячный security-прогон можно поставить в cron — попроси AI создать cron-задачу которая запускает security-precheck раз в месяц и шлёт отчёт.

---

## Антипаттерны

- 🔴 Один прогон в финале — поздно. Прогоняй после каждого шага (деплой, Auth, расширения, финал)
- 🔴 Чинить всё сразу без подтверждения — на 🔴 ОК, на ⚠️ опасно (можно сломать рабочее)
- 🔴 Игнорировать ⚠️ — со временем накапливаются и становятся 🔴

