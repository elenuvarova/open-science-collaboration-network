# infrastructure.md + save-session

> **Цель:** в `../../product/docs/memory/infrastructure.md` зафиксирован полный snapshot инфры (VPS, домен, deploy.sh, nginx, безопасность). Этап деплоя закрыт через `/save-session`.

---

## Промт

```
Создай ../../product/docs/memory/infrastructure.md как единый snapshot инфры.

Это L2-файл: hook не печатает его при старте, но AI читает целиком когда задача
касается инфры. Это бережёт контекст в обычных сессиях и даёт полный контекст
в инфра-задачах.

Содержание:

# Infrastructure — <project-name>

> Snapshot production-инфры. Обновляй при крупных изменениях. Все пароли и
> ключи — в .env.production, не сюда. Здесь — только адреса, имена, пути,
> структура.

## VPS
- Провайдер: <Hetzner / Selectel / Timeweb / другой>
- IP: <IP>
- Пользователь (deploy): <user> (sudo)
- SSH: только по ключам, порт 22 (UFW открыт)
- ОС: Ubuntu <версия>

## Домен
- Основной: <domain>
- DNS A-запись: <domain> → <IP>
- HTTPS: Let's Encrypt через Certbot, авто-продление включено
  (sudo systemctl status certbot.timer — active)

## Структура на сервере
/var/www/<project-name>/
├── docker-compose.yml      ← контейнер web
├── Dockerfile
├── .env.production         ← 600, owner=<user>, секреты
├── deploy.sh               ← 755, выбранный сценарий деплоя + docker compose up
└── (код проекта или собранные артефакты — зависит от ADR-002)

## docker-compose
Сейчас один сервис: web (Next.js на 127.0.0.1:3000, наружу через nginx).
PostgreSQL добавится на этапе работы с данными как сервис db.

## nginx
- Конфиг: /etc/nginx/sites-available/<project-name>
- Reverse-proxy на 127.0.0.1:3000
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- HSTS включает Certbot (Strict-Transport-Security)

## Безопасность
- SSH: только по ключам, root запрещён
- UFW: открыты только 22/80/443
- fail2ban: SSH + nginx (perform check: sudo fail2ban-client status)
- Rate limiting в Next.js middleware: 30/min общий, 5/min на /api/auth/*
- Hooks-guardrails в .claude/hooks/ (PreToolUse Bash + Write)

## Логи
- docker compose logs -f web; sudo journalctl -u nginx --since "10m ago"

## Деплой
- Доступ к серверу: .env.deploy (SERVER_IP / SERVER_USER / SSH_KEY_PATH / GITHUB_URL / DOMAIN), в .gitignore, права 600
- Локально из проекта: ./scripts/deploy-remote.sh (читает доступ из .env.deploy, подключается по SSH сам)
- Запуск деплоя на сервере делает AI по SSH (доступ из .env.deploy): "/var/www/<project-name>/deploy.sh"
- Стратегия: см. ADR-002-deploy-strategy.md (AI/SSH, git-based, CI/CD, платформа или другой вариант)
- На финальном этапе — опционально GitHub Actions для авто-деплоя по push в main

## Ключевые env-переменные (значения в .env.production, НЕ ЗДЕСЬ)
- NEXTAUTH_SECRET (этап Auth)
- NEXTAUTH_URL (этап Auth) — https://<domain>
- DATABASE_URL (этап Auth)
- (этапы расширений: OPENROUTER_API_KEY, SMTP_*, TELEGRAM_BOT_TOKEN, ...)

## Бэкапы
- (этап БД добавит ежедневный бэкап PostgreSQL → /var/backups/postgres/)
- Текущий код: история в GitHub
- .env.production: на сервере, не в git — снимать вручную если меняется
  (TODO: автоматический encrypted backup на финальном этапе)

## Что добавится дальше
- БД и Auth: PostgreSQL контейнер, ежедневный бэкап БД, Auth-конфиг
- Расширения: storage для файлов и медиа (volume), SMTP, OpenRouter, Telegram-бот webhook
- Финал: PWA manifest, опционально CI/CD

## Incident runbook
- (Появится на финальном этапе → docs/incident-runbook.md)
- Сейчас при падении: AI подключается по SSH (доступ из .env.deploy),
  docker compose logs --tail=200 web, docker compose restart web

ПОСЛЕ:

1. Добавь строку в ../../product/docs/memory/INDEX.md в раздел "Инфраструктура":
   - [infrastructure.md](infrastructure.md) — VPS, домен, docker-compose, nginx, безопасность

2. Закрой сессию.

   В Claude Code: /save-session
   В Codex: "прочитай prompts/save-session.md и выполни"

   Параметры:
   - slug: deploy
   - описание: "Деплой завершён. Сервис доступен на https://<domain>. Базовая
     безопасность (SSH-ключи, UFW, fail2ban, rate limiting).
     PreToolUse hooks для Bash и Write. Решение: ADR-002 (стратегия деплоя под проект)."

   /save-session должен:
   - Создать ../../product/docs/memory/sessions/<YYYY-MM-DD>-deploy.md
   - Обновить state.md (шаг → "Готов к этапу БД и Auth"; доступы к серверу
     не дублируй в state.md, сошлись на .env.deploy и пути к deploy.sh /
     .env.production на сервере)
   - Добавить строку в INDEX.md в таблицу Sessions

ПОКАЖИ МНЕ:
- Финальный infrastructure.md
- Обновлённый state.md (шаг + бэклог + доступы)
- Запись в INDEX.md
```

---

## Edge cases

- Если у проекта нестандартная структура (например, не `/var/www/`, а `/srv/<project>`) — фиксируй фактическую, не шаблонную
- Если есть дополнительные сервисы (отдельный Redis, MinIO) — добавь раздел в `infrastructure.md`
- В будущем добавятся секции «БД», «Storage», «SMTP» — каждое в свой раздел, не сваливая всё в один


---

> 🛑 **СТОП — конец шага.** Этот промт выполнен. Не переходи к следующему промту или шагу, не предлагай «давай дальше сделаем X», не пересказывай, что идёт дальше по уроку. Темп задаёт пользователь — он сам откроет следующий шаг в `lesson.md`, когда будет готов. Сейчас покажи результат этого шага и остановись, дождись команды пользователя.
