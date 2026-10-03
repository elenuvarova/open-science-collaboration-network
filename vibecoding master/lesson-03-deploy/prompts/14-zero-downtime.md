# Zero-downtime deploy — обновление без обрыва запросов

> **Цель:** при `./deploy.sh` ни один запрос не обрывается. Уровень 1 (graceful shutdown) — старая версия дорабатывает активные запросы перед остановкой. Уровень 2 (blue-green) — новая версия поднимается рядом, трафик переключается только когда она готова, старая ещё дорабатывает; окна ошибок 502 нет вообще. Оба уровня — в этом промте.

## Зачем

Когда выкатывается новая версия, контейнер перезапускается. Без graceful shutdown («мягкого выключения») в этот момент рвётся **любой запрос, который сейчас выполняется**, а не только нажатие «Сохранить»:

- POST формы (сохранение, оплата, регистрация) — транзакция оборвётся на середине;
- загрузка/обработка файла — прервётся;
- фоновая задача (отправка письма, обработка) — не завершится;
- открытые WebSocket/SSE — отвалятся.

Решение — graceful shutdown: по сигналу `SIGTERM` приложение перестаёт брать **новые** запросы, но **доделывает текущие**, аккуратно закрывает соединения с БД и фоновые задачи, и только потом выключается.

## Четыре слоя (собираются за один проход)

| Слой | Файл | Что делает |
|---|---|---|
| `STOPSIGNAL SIGTERM` | `Dockerfile` | Docker шлёт «мягкий» сигнал, а не убивает процесс мгновенно |
| `ENV NEXT_DRAINING_PROCESS_TIMEOUT_MS=20000` | `Dockerfile` | Next.js ждёт до 20 сек на дозавершение активных запросов |
| `stop_grace_period: 30s` | `docker-compose.yml` | Docker даёт контейнеру 30 сек на корректное завершение |
| signal handler | `instrumentation.ts` | Закрывает Prisma/Redis/очереди в правильном порядке |

## Готовый `instrumentation.ts` (`../../product/instrumentation.ts`)

Next.js 14+ сам подхватывает этот файл при старте.

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const shutdown = async (signal: string) => {
    console.log(`[shutdown] получен ${signal} — закрываю ресурсы`)
    try {
      const { prisma } = await import('@/lib/prisma')
      await prisma.$disconnect()
    } catch {}
    // сюда же — Redis.quit(), остановка очередей и фоновых задач, если есть
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
```

## Промт

```
Настрой zero-downtime deploy (graceful shutdown), чтобы при ./deploy.sh не
обрывался ни один активный запрос (сохранение, оплата, загрузка файла, фоновая
задача, WebSocket) — не только кнопка «Сохранить».

Собери все четыре слоя за один проход:
1. В ../../product/Dockerfile добавь:
     STOPSIGNAL SIGTERM
     ENV NEXT_DRAINING_PROCESS_TIMEOUT_MS=20000
2. В ../../product/docker-compose.yml сервису приложения добавь:
     stop_grace_period: 30s
3. Создай ../../product/instrumentation.ts с обработчиком SIGTERM/SIGINT: на сигнал
   приложение перестаёт брать новые запросы и доделывает текущие, потом закрывает
   Prisma ($disconnect) и Redis/очереди (если используются) в правильном порядке.
   Образец — в этом промте выше.
4. Если используется свой WebSocket-сервер — добавь корректное закрытие соединений.

Проверка (покажи мне):
- собери и подними локально, открой приложение;
- запусти долгий запрос (например, POST на /api/<save> или загрузку файла) и в
  этот момент сделай ./deploy.sh (или docker compose up -d --build);
- активный запрос должен дозавершиться (ответ 200, транзакция в БД закрыта), а
  не оборваться. Окно возможных 502 на новые запросы — 5-10 сек, это нормально.
```

## Уровень 2 — blue-green deploy (новая версия рядом, плавное переключение)

Уровень 1 закрывает обрыв уже идущих запросов, но между остановкой старого контейнера и готовностью нового остаётся окно 5-10 сек, когда новые запросы могут поймать 502. Для проекта с постоянным трафиком это окно лучше убрать совсем. Делается это через **blue-green** (две версии «синяя» и «зелёная»):

1. Новая версия поднимается **рядом** со старой, на отдельном порту. Старая в это время продолжает обслуживать всех.
2. Скрипт ждёт, пока новая версия пройдёт health-check (реально отвечает 200).
3. Только тогда nginx переключает трафик на новую версию — мгновенно, без окна 502.
4. Старая версия **не гасится сразу**, а работает ещё `DRAIN_SECONDS` (по умолчанию 180 сек, можно поставить больше). Всё это время уже открытые на ней запросы и долгие операции спокойно дозавершаются. Человек, который сидел на странице несколько минут и нажал «Сохранить», доделывает действие: его запрос либо дозавершается на старой версии, либо уходит на новую (она обратно совместима — см. ниже).
5. После окна старая версия гасится по SIGTERM, и graceful shutdown из Уровня 1 доделывает остатки.

**Важное условие — обратная совместимость.** Пока обе версии работают одновременно, они ходят в одну БД. Поэтому миграции должны быть expand-contract: сначала добавляем новое, не ломая старое (новый столбец nullable, а не переименование), а зачистку старого делаем отдельным деплоем позже. Тогда и старая, и новая версия работают на одной схеме, и переключение действительно плавное.

### Готовые файлы

**`docker-compose.yml` — две копии (blue на 3000, green на 3001):**

```yaml
services:
  web_blue:
    build: .            # на слабом VPS лучше image: ghcr.io/<user>/<repo>:latest (сборка в CI), см. ниже
    env_file: .env.production
    ports: ["127.0.0.1:3000:3000"]
    stop_grace_period: 30s
    restart: unless-stopped
    mem_limit: 512m     # потолок памяти на копию — две копии + db + minio должны влезть в бокс
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
  web_green:
    build: .
    env_file: .env.production
    ports: ["127.0.0.1:3001:3000"]
    stop_grace_period: 30s
    restart: unless-stopped
    mem_limit: 512m
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```

> ⚠️ **Две копии web одновременно — это двойная память.** На слабом VPS (~1 ГБ)
> blue-green требует, чтобы обе копии + Postgres + MinIO влезли разом. Поэтому
> здесь особенно важно НЕ собирать образ на сервере: сборка раздувает dockerd и
> добивает RAM, а `systemctl restart docker` для возврата памяти убьёт обе копии
> (конец zero-downtime). Правильно: образ собирается в CI/локально → push в GHCR,
> а в `build: .` ставишь `image: ghcr.io/...` и в deploy.sh вместо `--build` делаешь
> `docker compose pull`. Тогда переключение действительно без простоя. (Стратегия — ADR-002, промт 04.)

**nginx — трафик идёт через upstream, который переписывает скрипт.** В конфиге сайта (`/etc/nginx/sites-available/...`) вместо `proxy_pass http://127.0.0.1:3000;` ставим upstream:

```nginx
# /etc/nginx/conf.d/app-upstream.conf — этот файл переписывает deploy.sh
upstream app { server 127.0.0.1:3000; }
```

```nginx
# в server { ... } сайта
location / {
    proxy_pass http://app;
    # остальные proxy_set_header — как были
}
```

**`deploy.sh` (blue-green) на сервере:**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/<project-name>

DRAIN_SECONDS="${DRAIN_SECONDS:-180}"   # сколько старая версия ещё дорабатывает
STATE_FILE=".active-color"
ACTIVE="$(cat "$STATE_FILE" 2>/dev/null || echo blue)"

if [ "$ACTIVE" = "blue" ]; then
  TARGET=green; TARGET_PORT=3001; OLD_SVC=web_blue
else
  TARGET=blue;  TARGET_PORT=3000; OLD_SVC=web_green
fi
NEW_SVC="web_${TARGET}"

echo "▶ активна $ACTIVE → деплою $TARGET (порт $TARGET_PORT)"

# 1. свежий код + миграции (expand-contract, после бэкапа — см. Урок 4)
git pull

# 2. поднять НОВЫЙ цвет рядом со старым
#    На слабом VPS лучше образ из реестра: docker compose pull "$NEW_SVC" (сборка в CI),
#    а не --build на сервере — иначе dockerd распухнет, а перезапустить его здесь нельзя.
docker compose up -d --build "$NEW_SVC"

# 3. health-check новой версии (до 60 сек), иначе откат без переключения
for i in $(seq 1 30); do
  if curl -fsS -m 3 "http://127.0.0.1:${TARGET_PORT}/" >/dev/null 2>&1; then
    echo "✔ $TARGET отвечает"; break
  fi
  if [ "$i" = 30 ]; then
    echo "🔴 $TARGET не поднялся за 60с — откат, трафик остаётся на $ACTIVE"
    docker compose stop "$NEW_SVC"
    exit 1
  fi
  sleep 2
done

# 4. переключить nginx на новую версию (мгновенно, без окна 502)
echo "upstream app { server 127.0.0.1:${TARGET_PORT}; }" \
  | sudo tee /etc/nginx/conf.d/app-upstream.conf >/dev/null
sudo nginx -t && sudo systemctl reload nginx
echo "$TARGET" > "$STATE_FILE"
echo "✔ трафик на $TARGET"

# 5. старая версия дорабатывает открытые запросы ещё DRAIN_SECONDS
echo "⏳ старая версия ($ACTIVE) дорабатывает ещё ${DRAIN_SECONDS}s..."
sleep "$DRAIN_SECONDS"

# 6. погасить старую (graceful: stop_grace_period + instrumentation.ts из Уровня 1)
docker compose stop "$OLD_SVC"

# 7. гигиена: чистим кэш сборок (растёт быстро). Демон Docker здесь НЕ перезапускаем —
#    restart убьёт обе копии и сломает zero-downtime. Если dockerd пухнет от сборок —
#    это сигнал собирать образ в CI и деплоить через pull, а не --build (см. врезку выше).
docker builder prune -f >/dev/null 2>&1 || true
echo "✔ деплой завершён, активна $TARGET"
```

### Промт (Уровень 2)

```
Переведи деплой на blue-green (zero-downtime без окна 502). Сделай:
1. В ../../product/docker-compose.yml — две копии приложения: web_blue (127.0.0.1:3000) и
   web_green (127.0.0.1:3001), обе build: ., env_file: .env.production,
   stop_grace_period: 30s.
2. В nginx — вынеси upstream в /etc/nginx/conf.d/app-upstream.conf
   (`upstream app { server 127.0.0.1:3000; }`), а в location / поставь
   `proxy_pass http://app;`.
3. Перепиши deploy.sh на blue-green по образцу из этого промта: подними неактивный
   цвет рядом, дождись health-check (200), переключи upstream и reload nginx,
   подожди DRAIN_SECONDS (дефолт 180), потом погаси старый цвет. Health-check
   обязателен: если новая версия не поднялась — откат без переключения трафика.
4. Заведи роут здоровья /api/health (возвращает 200), если его нет.
5. Напомни про expand-contract миграции: пока крутятся обе версии, схема БД должна
   быть совместима с обеими.

Проверка (покажи мне): сделай деплой под нагрузкой (хоть `while true; do curl -s
https://<domain> >/dev/null; done` в соседнем терминале) — за весь деплой не должно
быть ни одной 502. Запусти долгий запрос перед переключением — он дозавершится.
Обнови раздел «Деплой» в ../../product/docs/memory/infrastructure.md (blue-green, DRAIN_SECONDS).
```

## После

1. Покажи изменения в `../../product/Dockerfile`, `../../product/docker-compose.yml` и новый `../../product/instrumentation.ts`
2. Покажи результат теста (активный запрос дозавершился при деплое)
3. Обнови раздел «Деплой» в `../../product/docs/memory/infrastructure.md`: включён graceful shutdown
