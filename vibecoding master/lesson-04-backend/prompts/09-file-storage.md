# Файлы: upload, хранение, защищённая отдача, HLS-видео

## Когда выполнять

Шаг обязательный: почти в каждом продукте есть аватар, лого или вложения, и хранилище под них закладываем сразу. Прочитай `spec.md` и собери список того, что пользователь загружает (аватары, фото, документы, видео). Если на старте конкретных файлов нет — всё равно подними базовое хранилище под будущий аватар пользователя.

## Архитектура

```
Browser → POST /api/files/upload → MinIO (своя VPS) / Bunny / S3 → URL в БД
                                                    ↓
                                              Frontend читает URL → отдаёт файл
```

### Где хранить

| Сервис | Когда |
|---|---|
| **MinIO (на своём VPS)** | **По умолчанию.** S3-совместимый, рядом в docker-compose, данные под вашим контролем и под 152-ФЗ |
| **Managed S3 у провайдера в РФ** (Yandex Object Storage, Selectel, VK Cloud / Cloud.ru, Timeweb) | Когда не хотите держать файлы на своём VPS: провайдер выносит хранилище на свою сторону и сам отвечает за надёжность и масштаб, а данные остаются в РФ-юрисдикции (152-ФЗ). Платите за гигабайты и трафик. S3-совместимо, поэтому **код не меняется** — отличаются только endpoint и ключи в `.env` |
| **Bunny** | Если нужен CDN для отдачи (видео, картинки) — работает из РФ |
| **Cloudflare R2 / AWS S3** | Только если вы и аудитория за границей — в РФ часто недоступны/нестабильны (блокировки, проблемы с оплатой) |

Для РФ-проектов по умолчанию — MinIO на своём сервере; под CDN — Bunny. Managed S3 у российского провайдера — разумная развилка, когда файлы не хочется держать на своём VPS (память и диск 1 ГБ-бокса быстро становятся узким местом, см. заметку про OOM ниже) или нужна managed-надёжность, не выходя из РФ-юрисдикции. Cloudflare R2 / AWS S3 — лишь для зарубежной аудитории. Vercel Blob не используем.

Все четыре варианта — это S3-совместимое объектное хранилище за одним и тем же API (`@aws-sdk/client-s3`). Поэтому хранилище в этом уроке выбирается один раз и при необходимости меняется без переписывания кода: переключение MinIO ↔ managed S3 ↔ R2 — это смена четырёх env-переменных (`STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` / `STORAGE_BUCKET`), а не правка роутов загрузки и отдачи.

**Когда managed S3 берут сразу, не поднимая MinIO.** Посмотри по `spec.md`, сколько и каких файлов будет в продукте. Если их будет много и они тяжёлые — в первую очередь видео, а также большие галереи фото или архивы документов — managed S3 у провайдера (а под отдачу видео ещё и CDN, Bunny) имеет смысл взять с самого начала. На росте такого продукта MinIO на своём боксе всё равно упрётся в память и диск, и переезжать придётся под нагрузкой. Для обычного случая (аватары, лого, единичные вложения) дефолт остаётся MinIO.

**Откуда отдавать файлы.** По умолчанию — через основной домен: роутами приложения (`/api/files/...`) с проверкой владельца, ничего дополнительно настраивать не нужно. Отдельный поддомен под хранилище (`storage.<домен>`) по умолчанию НЕ настраивай — только упомяни как опцию на будущее (бесплатно, через DNS + nginx; пригодится под CDN или отделение статики).

## Модель File в схеме — сделай это ПЕРВЫМ

Код ниже пишет ссылки на файлы в таблицу `File`, поэтому сначала заведи её в `../../product/prisma/schema.prisma` и прогони миграцию. Таблица новая и пустая — с существующими данными она не конфликтует, миграция проходит за один раз:

```prisma
model File {
  id           String   @id @default(cuid())
  key          String   @unique          // ключ/путь файла в хранилище
  originalName String
  size         Int
  contentType  String
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt    DateTime @default(now())
  @@index([userId])
}
```

Если файл — это аватар пользователя, в этой же миграции добавь поле `avatarUrl String?` в модель `User`.

```
npx prisma migrate dev --name add-files
```

На проде миграция применится сама при деплое — `npx prisma migrate deploy` уже стоит в `deploy.sh` из Задания 3. Отдельно на сервере ничего запускать не нужно.

## Если выбран MinIO — подними его в docker-compose (делается один раз, автоматически)

Когда хранилище — MinIO (дефолт), добавь его сервис в тот же `../../product/docker-compose.yml`, что и база, и создай бакет init-контейнером. Тогда всё поднимается одной командой `docker compose up`, и студенту не нужно лезть в веб-консоль и что-то настраивать руками:

```yaml
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${STORAGE_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${STORAGE_SECRET_KEY}
    volumes:
      - minio_data:/data           # файлы переживают пересборку контейнера
    ports:
      - "127.0.0.1:9000:9000"      # API — только локально, наружу не торчит
      - "127.0.0.1:9001:9001"      # консоль — только локально
    restart: unless-stopped
    mem_limit: 512m                # потолок: MinIO любит кэшировать в RAM, без лимита съест весь бокс

  minio-init:                       # создаёт бакет автоматически при старте
    image: minio/mc
    depends_on: [minio]
    environment:
      STORAGE_ACCESS_KEY: ${STORAGE_ACCESS_KEY}
      STORAGE_SECRET_KEY: ${STORAGE_SECRET_KEY}
      STORAGE_BUCKET: ${STORAGE_BUCKET}
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $$STORAGE_ACCESS_KEY $$STORAGE_SECRET_KEY &&
      mc mb -p local/$$STORAGE_BUCKET"

volumes:
  minio_data:
```

> **Память на 1 ГБ-боксе — тонкое место.** MinIO держит кэш в RAM, поэтому `mem_limit`
> обязателен (иначе он один выест бокс). Но не ставь слишком мало: при превышении
> лимита Docker убьёт контейнер (OOM-kill). 512m — разумный старт; вместе с web (512m)
> и Postgres (256m) это уже почти весь 1 ГБ, так что swap + swappiness=10 (Уроки 3-4)
> здесь обязательны. Если MinIO упирается/падает по памяти — это сигнал вынести файлы
> в managed S3 у провайдера в РФ (Yandex Object Storage / Selectel / VK Cloud) либо
> в Bunny / R2, или взять VPS на 2 ГБ+, а не занижать лимит.

Приложение ходит в MinIO по внутреннему адресу — `STORAGE_ENDPOINT=http://minio:9000` (наружу порты не открываем). Для MinIO `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` ты генерируешь сам (надёжные строки), `STORAGE_BUCKET` — любое имя; ничего вписывать пользователю не нужно.

## Если выбран managed S3 у провайдера — MinIO в docker-compose НЕ поднимаем

Когда хранилище берётся готовым у провайдера (Yandex Object Storage, Selectel, VK Cloud / Cloud.ru, Timeweb), сервис `minio` и `minio-init` из docker-compose выше **не добавляем** — файлы живут на стороне провайдера, локальный контейнер не нужен. Никакой памяти бокса хранилище в этом случае не ест. Что меняется в скриптах:

- **../../product/docker-compose.yml** — пропускаем блоки `minio` / `minio-init` и том `minio_data`. Остаются только `db` и `web`.
- **Бакет** — создаёт пользователь в кабинете провайдера (или ты — через `aws s3 mb` / `mc mb`, если у него уже есть CLI с ключами). В отличие от MinIO, init-контейнером это не автоматизируется.
- **`.env`** — `STORAGE_ENDPOINT` указывает на S3-endpoint провайдера (например, `https://storage.yandexcloud.net`, `https://s3.timeweb.cloud`), ключи и имя бакета пользователь берёт из кабинета (см. Шаг 0).
- **Код (upload route, signed URLs, deploy.sh)** — без изменений: клиент `@aws-sdk/client-s3` уже сконфигурирован через `process.env.STORAGE_*`, ему всё равно, MinIO это или managed S3.

То есть весь переход с дефолта на managed S3 — это «не поднять MinIO» в docker-compose плюс другие значения в `.env`. Зафиксируй выбор в ADR так же, как и для MinIO.

## Шаг 0 — Ключи хранилища

Доступ к выбранному хранилищу: для **MinIO** ключи задаются автоматически (см. выше — генерируешь сам, endpoint `http://minio:9000`); для **Bunny / R2 / S3** — пользователь создаёт аккаунт в кабинете сервиса и получает пару «access key + secret key», endpoint и имя бакета.

Положи их в env-файл (НЕ в чат, НЕ в терминал). Сам создай (или дополни) файл с плейсхолдерами:
- локальная разработка → `../../product/.env.local`
- прод → `../../product/.env.production`

```
STORAGE_ENDPOINT=впиши-сюда-endpoint-хранилища
STORAGE_ACCESS_KEY=впиши-сюда-access-key
STORAGE_SECRET_KEY=впиши-сюда-secret-key
STORAGE_BUCKET=впиши-сюда-имя-бакета
```

Скажи пользователю: «Я создал `../../product/.env.local`. Открой его и впиши значения после каждого `=` вместо плейсхолдеров, сохрани». Пользователь вписывает ключи прямо в файл, ни в терминал, ни в чат вводить ничего не нужно, и ты значения ключей не видишь. Подключение к хранилищу ты делаешь сам, читая ключи из env через `process.env.*`. Файлы `../../product/.env.local` и `../../product/.env.production` уже в `.gitignore`.

## Шаг 1 — Upload endpoint

```ts
// ../../product/src/app/api/files/upload/route.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.STORAGE_ENDPOINT,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.STORAGE_SECRET_KEY,
  },
  region: 'auto',
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })
  
  const formData = await req.formData()
  const file = formData.get('file') as File
  
  // Валидация размера и типа
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'too_large' }, { status: 400 })
  
  const key = `uploads/${session.user.id}/${crypto.randomUUID()}-${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())
  
  await s3.send(new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: file.type,
  }))
  
  // Сохрани в БД
  await db.file.create({
    data: { userId: session.user.id, key, originalName: file.name, size: file.size, contentType: file.type },
  })
  
  return Response.json({ key })
}
```

## Шаг 2 — Signed URLs для защищённой отдачи

Если файл приватный (доступен только владельцу или с правами):

```ts
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export async function GET(req: Request, { params }: { params: { key: string } }) {
  const session = await getSession()
  const file = await db.file.findUnique({ where: { key: params.key } })
  
  // Проверка прав
  if (file.userId !== session.user.id && session.user.role !== 'admin') {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }
  
  const url = await getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: file.key,
  }), { expiresIn: 3600 }) // 1 час
  
  return Response.redirect(url)
}
```

Если файл публичный — отдаём прямой URL через CDN (Bunny / Cloudflare).

## Шаг 3 — UI компонент upload

`../../product/src/features/file-upload/ui/FileUpload.tsx`:
- Drag-and-drop зона
- Прогресс-бар
- Превью для картинок
- Toast после успеха

## Шаг 4 — Картинки (next/image)

Для отображения картинок используй `next/image`:

```tsx
<Image src={fileUrl} width={400} height={300} alt={...} placeholder="blur" />
```

Next.js сам сделает оптимизацию (WebP, lazy loading, responsive).

## Шаг 5 — HLS-видео (если в продукте есть видео)

Для стриминга больших видео — конвертация в HLS:

1. **Bunny Stream** — самый простой путь, заливаешь mp4, получаешь .m3u8

2. **AWS MediaConvert + S3** — для enterprise

3. **Свой сервер с ffmpeg** — если очень хочется

Frontend плеер:
```tsx
import Hls from 'hls.js'

const video = document.querySelector('video')
const hls = new Hls()
hls.loadSource(playlistUrl)
hls.attachMedia(video)
```

Защита видео — signed URLs на playlist.

## Шаг 6 — Безопасность

- **Размер файлов:** лимит на запрос (например 10MB) + лимит на пользователя (например 1GB)
- **Типы файлов:** whitelist разрешённых (`image/*`, `video/mp4`, `application/pdf`) — не blacklist
- **Имена файлов:** не использовать оригинальное имя как ключ — sanitize или UUID
- **Антивирус:** для пользовательского контента можно ClamAV или сервис

## После реализации

1. Покажи пользователю upload в UI

2. Проверь signed URLs (открыть с другого аккаунта — должно быть 403)

3. В `spec.md` зафиксируй лимиты на файлы и поддерживаемые типы

4. ADR в `memory/decisions/`: выбор хранилища, лимиты, политика приватности файлов

