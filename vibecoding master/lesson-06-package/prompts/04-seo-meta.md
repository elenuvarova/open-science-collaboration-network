# SEO-мета: favicon, Open Graph, title, description

> ⚠️ **Делаем для ОБОИХ приложений монорепо — и лендинга, и сервиса (`apps/app`), а не только лендинга.** У сервиса тоже должны быть: иконка во вкладке (favicon), web-clip на домашний экран (apple-touch-icon), OG-превью при шаринге его ссылки и осмысленные **title/description на КАЖДОМ экране** (auth, dashboard, settings, основной флоу). Пути ниже даны для `apps/landing/...` — **всё то же продублируй в `apps/app/...`**: свои файлы в `public/`, базовая `metadata` (icons + title template + дефолтный OG) в `apps/app/src/app/layout.tsx`, плюс per-screen `generateMetadata`/`metadata` на страницах сервиса (текст берётся из `docs/screens/<экран>.md`). Если монорепо-сплит пропускали (внутренний продукт без лендинга) — одно приложение, пути вида `../../product/src/...` / `../../product/public/...`.

## Источник картинок — СНАЧАЛА спроси меня

Иконки (favicon / apple-touch / PWA) и OG-картинку можно получить тремя способами. До генерации спроси меня, каким идём (для иконки и для OG источник может быть разным), и действуй по выбору:

1. **ИЗ FIGMA.** Я дам ссылку на фрейм/файл Figma. Достань оттуда нужный фрейм — иконку (квадратный фрейм), OG (1200×630 или ближайший макет) — экспортни в PNG и используй как основу. В Claude Code — через Figma-интеграцию (`get_design_context` / экспорт ассета по node-id); если её нет — попроси меня экспортнуть PNG и прислать файл.

2. **ГОТОВЫЙ ФАЙЛ.** Я укажу путь к картинке (логотип / уже готовая OG). Возьми как есть: для favicon прогони через `realfavicongenerator.net` (или собери набор размеров сам), OG приведи к 1200×630. Ничего не дорисовывай без спроса.

3. **ТЫ ГЕНЕРИШЬ из продукта.** Если Figma и файла нет — собери сам на основе того, что уже есть: цвета и шрифты из `DESIGN.md`, логотип/название продукта, скриншоты первых экранов и визуальное направление из `landing-brief.md`. Иконка — простая и узнаваемая, без мелкого текста; OG — логотип + крючок из брифа на брендовом фоне (можно с фрагментом скриншота продукта). Для иконки можно подключить image-генерацию (DALL·E / Midjourney, промт «simple app icon for <продукт>, flat, <цвет>, no text»), для OG — свёрстанный HTML→PNG или Dynamic OG (см. ниже). Покажи мне 2-3 варианта и дай выбрать, прежде чем фиксировать.

Не уверен, что выбрать → порекомендуй: есть Figma или готовый бренд-ассет — бери его; нет ничего — генери из `DESIGN.md` и скриншотов, потом покажи на подтверждение. Выбранные источники зафиксируй в `spec.md` (раздел «SEO»).

Дальше — техника по каждому артефакту (применяй к тому, что получил из выбранного источника).

## favicon

### Откуда взять

| Источник | Как |
|---|---|
| **Из Figma** | Экспорт нужного фрейма как PNG 512×512, потом через `realfavicongenerator.net` сделать набор |
| **Своя картинка** | Картинка → `realfavicongenerator.net` → готовый набор |
| **AI-генерация** | DALL-E / Midjourney с промтом «simple app icon for [продукт], flat, [цвет], no text» → конвертация |

### Что нужно (минимум)

```
../../product/development/apps/landing/public/
├── favicon.ico              ← 16×16, 32×32, 48×48 в одном файле
├── icon.png                 ← 192×192 (Android)
├── apple-touch-icon.png     ← 180×180 (iOS)
└── favicon.svg              ← векторный (опционально)
```

### Подключение в Next.js

В `../../product/development/apps/landing/src/app/layout.tsx`:

```tsx
export const metadata = {
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}
```

Или просто положи файлы в `public/` — Next.js автоматически их подключит. **Файлы кладём в `public/` ОБОИХ приложений** — `apps/landing/public/` И `apps/app/public/` (или один общий ассет, скопированный в оба), и `icons` прописываем в `layout.tsx` каждого. Иначе у сервиса вкладка будет без иконки.

## Open Graph (для шаринга)

### Картинка

Размер: 1200×630px (стандарт для Facebook, Twitter, Slack, Telegram).

Содержимое:
- Логотип продукта
- Главный заголовок (короткий, читаемый)
- Подзаголовок (опционально)
- Брендовый цвет фона

Не используй мелкий текст — превью отображается маленьким.

### Как сделать

| Способ | Когда |
|---|---|
| **Figma** | Если есть бренд-дизайн |
| **Canva** | Быстрый шаблон |
| **AI** (DALL-E) | Прототип |
| **Dynamic OG image** через Next.js | Если нужно генерить под каждую страницу |

Положи в `../../product/development/apps/landing/public/og-image.png`.

### Подключение

```tsx
// ../../product/development/apps/landing/src/app/layout.tsx
export const metadata = {
  title: 'Your Product — One-line value proposition',
  description: 'What it does, for whom, why care — under 160 chars.',
  openGraph: {
    title: 'Your Product',
    description: 'Same as above or rephrased',
    url: 'https://your-domain.com',
    siteName: 'Your Product',
    images: [
      {
        url: 'https://your-domain.com/og-image.png',
        width: 1200,
        height: 630,
      },
    ],
    locale: 'ru_RU',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your Product',
    description: 'Same as above',
    images: ['https://your-domain.com/og-image.png'],
  },
}
```

## title + description

### title (что Google показывает в выдаче)

- Длина: 50–60 символов
- Формат: `Product Name — Main value proposition`
- Пример: `Linear — The issue tracking tool you'll enjoy using`

### description (под title в выдаче)

- Длина: 140–160 символов
- Что: что продукт, для кого, главная польза
- Без duplicates с title
- Включай ключевые слова естественно

### Per-screen — на лендинге опционально, в сервисе ОБЯЗАТЕЛЬНО

На лендинге per-page можно переопределять по желанию (блог, статьи). А в **сервисе (`apps/app`) каждый экран задаёт свой `title`/`description`** — чтобы вкладки не были все «Product», а в истории браузера/закладках было понятно, где что. Базовый шаблон — в `layout.tsx` сервиса (`title: { template: '%s — Product', default: 'Product' }`), а каждый экран — свой:

```tsx
// статический экран сервиса — ../../product/development/apps/app/src/app/(app)/settings/page.tsx
export const metadata = { title: 'Настройки', description: '...' }   // → «Настройки — Product»

// динамический — ../../product/development/apps/app/src/app/(app)/orders/[id]/page.tsx
export async function generateMetadata({ params }): Promise<Metadata> {
  const order = await getOrder(params.id)
  return { title: `Заказ #${order.number}`, description: '...' }
}
```

Тексты бери из `../../product/docs/screens/<экран>.md`. Пройди по всем ключевым экранам сервиса (auth, dashboard, основной флоу, settings) — у каждого должен быть свой `title`.

## Проверка

После выкатки:
- https://www.opengraph.xyz/ — проверка OG-тегов
- https://realfavicongenerator.net/favicon_checker — проверка favicon
- Шарь свой URL в Telegram / Slack — посмотри как превью

> **Telegram кэширует превью.** При первом шаринге Telegram запоминает OG-карточку и показывает старую версию даже после правок. Если обновление не видно — отправь ссылку боту @WebpageBot (https://t.me/WebpageBot), он ответит «OK, link preview updated» и сбросит кэш. Аналогично: Facebook — Sharing Debugger (developers.facebook.com/tools/debug), LinkedIn — Post Inspector.

## После реализации

1. Покажи пользователю — **на ОБОИХ приложениях (лендинг и сервис)**:
   - Открытую вкладку браузера (иконка видна и на лендинге, и на экранах сервиса)
   - Превью при шаринге ссылки (Telegram/Slack) — и лендинга, и сервиса
   - Что у каждого ключевого экрана сервиса свой `title` (вкладки не все «Product»)
   - Заголовок в выдаче Google (через https://search.google.com/test/rich-results)

2. Проверь, что иконки лежат в `public/` обоих приложений и `metadata` есть в `layout.tsx` обоих, а на экранах сервиса проставлены per-screen title/description.

3. Зафиксируй в `spec.md` (раздел «SEO»): title, description, favicon source, OG image source — и что мета настроены и на лендинге, и на сервисе.

