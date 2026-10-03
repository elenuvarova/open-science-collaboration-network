# Промты — Git, .env, деплой на VPS, базовая безопасность

| № | Файл | Что делает |
|---|---|---|
| 00 | [01-git-concepts.md](01-git-concepts.md) | Концепции Git как наглядная HTML-страница `git-intro.html`: git vs GitHub vs GitLab, ветки и merge визуально, commit/push/pull/diff/откат с примерами «было → стало» |
| 01 | [02-git-github.md](02-git-github.md) | Способы аутентификации (SSH vs PAT vs gh CLI), что такое SSH, риски логин/пароль vs ключи, первый push на GitHub |
| 02 | [03-env-secrets.md](03-env-secrets.md) | `.env.local`, `.env.example`, `.gitignore`, безопасность секретов |
| 02b | [03b-env-backup-handoff.md](03b-env-backup-handoff.md) | _(опционально)_ Запасная копия `.env` (менеджер секретов / iCloud / age-файл) и безопасная передача проекта другому разработчику |
| 03 | [04-deploy-strategy-adr.md](04-deploy-strategy-adr.md) | ADR-002: выбор стратегии деплоя под проект (AI/SSH, git-based, CI/CD, платформы, scp/rsync) |
| 04 | [05-vps-docker-compose.md](05-vps-docker-compose.md) | VPS + Dockerfile + docker-compose + deploy.sh + ../../product/scripts/deploy-remote.sh |
| 05 | [07-domain-https.md](07-domain-https.md) | Домен, nginx reverse-proxy, HTTPS через Certbot, security headers |
| 06 | [08-security-basics.md](08-security-basics.md) | SSH-ключи, UFW, fail2ban, rate limiting в middleware |
| 07 | [09-bash-write-hooks.md](09-bash-write-hooks.md) | Хуки (Claude/Codex/Cursor): блокировка опасных команд и секретов + напоминалки про `/security-check`, снимок контекста |
| 09 | [10-infrastructure-and-save.md](10-infrastructure-and-save.md) | `../../product/docs/memory/infrastructure.md` (snapshot инфры) + save-session |
| 10 | [12-security-check.md](12-security-check.md) | **Первый ручной аудит безопасности по 14 разделам OWASP-style + сборка своего скилла `/security-check`.** Пользователь проходит руками, понимает что проверяется, потом оформляет как переиспользуемый промт. Эталон-шаблон — ориентир, не копия |
| 11 | [13-security-precheck-deploy-gate.md](13-security-precheck-deploy-gate.md) | `../../product/scripts/security-precheck.sh` — быстрый bash-гейт безопасности до `docker compose up --build` |
| 12 | [14-zero-downtime.md](14-zero-downtime.md) | Graceful shutdown: деплой без обрыва активных запросов (Dockerfile + compose + `../../product/instrumentation.ts`) |
