# Lesson 4 — Промт 02: PostgreSQL контейнер на сервере + бэкапы

> **Цель:** PostgreSQL крутится в docker-compose на VPS, доступен только из контейнера web (через 127.0.0.1:5432). Настроен ежедневный бэкап в `/var/backups/postgres/`.

> **Если в ADR-003 выбран Supabase** — этот промт пропускается: свою базу поднимать не нужно. Вместо него возьми connection string из дашборда Supabase (Project Settings → Database), положи в `DATABASE_URL` (`.env.production` и `.env.local`) и переходи к схеме и миграциям (Промт 03). Бэкапы у Supabase свои. Этот промт — для варианта «свой Postgres на VPS».

---

## Промт

```
Подключись к VPS (детали в ../../product/docs/memory/infrastructure.md) и подними PostgreSQL.

ШАГ 0 — Выдели swap (буфер на пик деплоя).

В норме 1 GB RAM хватает и swap простаивает. На деплое blue-green ненадолго держит
две версии web-контейнера сразу — без запаса можно упасть с OOM. Один раз выделяем
swap (swappiness=10 — трогается только под нехватку, т.е. фактически на деплое):

  free -h                          # посмотреть RAM и есть ли уже swap
  # если swap = 0 — создаём swap-файл на 2 GB:
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab     # переживёт перезагрузку
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf  # своп только под нехватку
  sudo sysctl -p /etc/sysctl.d/99-swap.conf
  free -h                          # теперь swap виден

Если swap уже есть — пропусти этот шаг.

ШАГ 1 — Дополни docker-compose.yml на сервере:

services:
  web:
    # ... существующие настройки
    depends_on:
      - db
    environment:
      DATABASE_URL: "postgresql://my_service:${DB_PASSWORD}@db:5432/my_service"
      # Внутри docker-сети web обращается к db по имени сервиса

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: my_service
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: my_service
    volumes:
      - postgres-data:/var/lib/postgresql/data
    ports:
      - "127.0.0.1:5432:5432"   # КРИТИЧНО: только localhost, не 0.0.0.0
    restart: unless-stopped
    mem_limit: 256m              # Postgres-alpine в покое ~50-100 МБ; потолок, чтобы не выел бокс
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U my_service"]
      interval: 10s
      timeout: 5s
      retries: 5

# Почему mem_limit: на боксе с 1 ГБ один контейнер без потолка может выесть всю RAM,
# и ОС начнёт свопить → тормоза. 256m Postgres хватает на учебный объём; если упрётся
# (тяжёлые запросы/много соединений) — подними лимит или VPS, не оставляй без него.

volumes:
  postgres-data:

ШАГ 2 — Сгенерируй сильный пароль и положи в .env.production:

  openssl rand -base64 32        # запиши вывод

В /var/www/<project-name>/.env.production добавь:

  DB_PASSWORD=<сгенерированный>
  DATABASE_URL=postgresql://my_service:<DB_PASSWORD>@db:5432/my_service
  POSTGRES_USER=my_service
  POSTGRES_DB=my_service

  chmod 600 .env.production

(Из контейнера web обращение идёт по имени сервиса `db`, а не 127.0.0.1.)

ШАГ 3 — Запусти:
  ./deploy.sh

Должны подняться оба контейнера (web + db).

  docker compose ps
  # Оба должны быть Up. У db должен быть статус (healthy)

ШАГ 4 — Проверь работу БД:
  docker compose exec db psql -U my_service -d my_service -c '\l'
  # Покажет список БД (template0, template1, my_service)

ШАГ 5 — Проверь что 5432 НЕ торчит наружу:

Порт привязан к 127.0.0.1 (ШАГ 1) — слушает только сам сервер, наружу не отдан.

С сервера:
  ss -tulnp | grep 5432
  # Должно быть только 127.0.0.1:5432, НЕ 0.0.0.0:5432

С локальной машины:
  nc -zv <IP-сервера> 5432
  # Должно быть refused или timeout (порт слушает только 127.0.0.1, наружу не отдан)

ШАГ 6 — Настрой ежедневный бэкап.

На сервере:

  sudo nano /usr/local/bin/backup-db.sh

Содержимое:

  #!/usr/bin/env bash
  set -euo pipefail
  BACKUP_DIR=/var/backups/postgres
  PROJECT_DIR=/var/www/<project-name>
  mkdir -p "$BACKUP_DIR"
  STAMP=$(date +%Y%m%d-%H%M%S)
  cd "$PROJECT_DIR"
  docker compose exec -T db pg_dump -U my_service my_service \
    | gzip > "$BACKUP_DIR/my_service-$STAMP.sql.gz"
  # Удаляем бэкапы старше 7 дней
  find "$BACKUP_DIR" -name '*.sql.gz' -mtime +7 -delete

  sudo chmod +x /usr/local/bin/backup-db.sh

Cron каждый день в 03:00:

  sudo crontab -e
  0 3 * * * /usr/local/bin/backup-db.sh

Сделай ручной запуск для проверки:
  sudo /usr/local/bin/backup-db.sh
  ls -lh /var/backups/postgres/

Должен появиться .sql.gz файл.

ШАГ 7 — Обнови ../../product/docs/memory/infrastructure.md.

Добавь раздел:

  ## БД
  - PostgreSQL 16-alpine в docker-compose
  - Внутри docker-сети доступна по DATABASE_URL=postgresql://...@db:5432/...
  - Снаружи и с других машин закрыта (только 127.0.0.1:5432 на хосте)
  - Бэкапы: /usr/local/bin/backup-db.sh, ежедневно 03:00, ретеншн 7 дней
  - /var/backups/postgres/
  - Swap: /swapfile 2 GB, vm.swappiness=10 — простаивает в норме, буфер на пик деплоя

  Раздел "Структура на сервере" → добавь postgres-data volume.

ПОКАЖИ МНЕ:
- docker compose ps на сервере (оба контейнера Up, db healthy)
- Тест что 5432 закрыт снаружи (вывод nc с локальной машины)
- ls /var/backups/postgres/ (содержит свежий .sql.gz)
- Финальный infrastructure.md (раздел БД)
```

---

## Edge cases

- В обычной работе 1 GB RAM на тестовый проект хватает (Postgres-alpine ~50-100 MB). Пик — на деплое (blue-green держит 2 версии web), его и закрывает swap из ШАГА 0. Если памяти не хватает уже в покое (а не только на деплое) — это другой симптом: сними `docker stats --no-stream`, и если RAM реально занята контейнерами, увеличь VPS
- Postgres healthcheck `pg_isready` — встроенный, не нужно ничего ставить
- Если `docker compose exec` ругается «no terminal» — добавь флаг `-T` (как в скрипте бэкапа)

