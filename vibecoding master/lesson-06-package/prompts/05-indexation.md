# Индексация и AI-поиск (GEO): что открыть, что закрыть, как находиться в LLM

> **Пути (монорепо после `00`).** Публичная индексация (`robots.txt`, `sitemap.ts`, `llms.txt`, schema.org) живёт в приложении **лендинга** (`../../product/development/apps/landing/...`); `noindex` на внутренних страницах — в **сервисе** (`../../product/development/apps/app/...`). Если монорепо-сплит был пропущен — замени `development/apps/landing/` и `development/apps/app/` обратно на корень продукта (`../../product/...`).

## Принцип

- **Лендинг и публичные страницы** (FAQ, блог, цены) — открыты для индексации
- **Страницы продукта** (личный кабинет, дашборд, настройки) — закрыты от индексации
- **Технические страницы** (API, admin) — закрыты

Базовая индексация (robots + sitemap ниже) нужна всем, кто вообще хочет, чтобы продукт находили. Отдельно — **находимость в AI-поиске (GEO/AEO)**: чтобы продукт цитировали ChatGPT, Perplexity, Google AI Overviews и т.п. Это отдельный выбор (`llms.txt`, schema.org, доступ AI-ботам) — см. раздел «AI-поиск (GEO)» ниже, его делаем по желанию пользователя.

## robots.txt

`../../product/development/apps/landing/public/robots.txt`:

```
User-agent: *
Allow: /
Disallow: /app/
Disallow: /dashboard/
Disallow: /admin/
Disallow: /api/
Disallow: /settings/

Sitemap: https://your-domain.com/sitemap.xml
```

## Meta noindex на внутренних страницах

В layout-файле для роутов продукта:

```tsx
// ../../product/development/apps/app/src/app/(app)/layout.tsx — layout сервиса для всех страниц за логином
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
}
```

Это автоматически применится ко всем страницам внутри `(app)/`.

## sitemap.xml

`../../product/development/apps/landing/src/app/sitemap.ts` в Next.js — это не статичный файл, а **функция**: она выполняется на сервере и отдаёт актуальный список при каждом запросе/сборке. Поэтому sitemap не надо править руками — его надо написать так, чтобы он сам собирался из реальных маршрутов.

Два слоя:

- **Статичные публичные страницы** (лендинг, `/pricing`, юридические `/privacy`, `/terms`, `/cookies`) — перечисляем в массиве. Добавили публичную страницу → дописали одну строку.
- **Динамический контент** (блог, публичные профили, каталог) — НЕ перечисляем руками, а тянем из источника (БД / CMS / файлы), чтобы новые записи попадали в sitemap автоматически. Так он обновляется сам.

```ts
// ../../product/development/apps/landing/src/app/sitemap.ts
import type { MetadataRoute } from 'next'
import { getPublishedPosts } from '@/shared/lib/posts' // источник динамики

const base = 'https://your-domain.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Статичные публичные маршруты (включая юридические страницы из 07-legal)
  const staticRoutes = ['', '/pricing', '/privacy', '/terms', '/cookies'].map(
    (path) => ({
      url: `${base}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
    }),
  )

  // 2. Динамика из источника — появляется в sitemap сама, без ручных правок
  const posts = await getPublishedPosts()
  const postRoutes = posts.map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: p.updatedAt, // реальная дата изменения, не new Date()
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  return [...staticRoutes, ...postRoutes]
}
```

Доступен по `/sitemap.xml`. Внутренние разделы (`/app`, `/dashboard`, `/admin`) в sitemap НЕ кладём — они и так закрыты в robots и через `noindex`. Если динамики нет (только лендинг + юр.страницы) — оставляем один статичный массив, второй слой не нужен.

> Для динамических страниц используй настоящие `updatedAt` из источника, а не `new Date()` — иначе поисковик каждый раз видит «всё обновилось сегодня» и теряет доверие к `lastModified`. Если контент тянется на каждый запрос — добавь `revalidate`, чтобы sitemap не пересобирался на каждый заход бота.

## AI-поиск (GEO/AEO) — СНАЧАЛА спроси меня, нужно ли

Классический SEO (robots/sitemap выше) приводит людей из Google/Yandex. GEO (Generative Engine Optimization) / AEO (Answer Engine Optimization) — это чтобы продукт **находили и цитировали AI-ассистенты и AI-поиск** (ChatGPT, Perplexity, Claude, Google AI Overviews). Это не всем нужно, поэтому спроси меня:

> «Хотите, чтобы продукт находили в AI-поиске (ChatGPT, Perplexity, AI Overviews), и его цитировали в ответах? Или держим приватнее — продукт просто есть в Google по прямому запросу, без отдельной работы под AI?»

- Если я говорю **«держим приватнее»** — ничего из GEO не добавляем. Базовой индексации хватает. Если хочу совсем закрыться от обучения AI — допиши в `robots.txt` запрет AI-ботам:
  ```
  User-agent: GPTBot
  Disallow: /
  User-agent: Google-Extended
  Disallow: /
  User-agent: CCBot
  Disallow: /
  User-agent: PerplexityBot
  Disallow: /
  ```

- Если я говорю **«хочу, чтобы находили»** — добавь ВСЁ перечисленное автоматически, не переспрашивая по каждому пункту:

  1. **`llms.txt`** в `../../product/development/apps/landing/public/llms.txt` — Markdown-карта продукта для LLM: что это, для кого, главная ценность, ссылки на ключевые публичные страницы (лендинг, фичи, цены, FAQ, блог) с одной строкой описания у каждой. Бери факты из `landing-brief.md` и `spec.md`, не выдумывай. По возможности — расширенный `llms-full.txt` с полным текстом ключевых страниц.

  2. **Структурированные данные (JSON-LD schema.org)** в `layout.tsx` / на лендинге через `<script type="application/ld+json">`:
     - `Organization` или `SoftwareApplication` (название, описание, URL, логотип);
     - `WebSite` с `potentialAction: SearchAction` (если есть поиск);
     - `FAQPage` — из блока FAQ лендинга (вопрос/ответ один-в-один);
     - `BreadcrumbList` для вложенных публичных страниц.
     Разметка должна соответствовать видимому контенту, иначе это спам-сигнал.

  3. **robots.txt — явно разрешить AI-ботов** (не закрывать GPTBot / Google-Extended / PerplexityBot / ClaudeBot), чтобы они могли читать публичные страницы.

  4. **Контент под ответы (AEO):** на публичных страницах — внятные заголовки-вопросы, прямой ответ в первом абзаце, короткие определения «что такое <продукт>», FAQ с самодостаточными ответами. AI цитирует то, что легко извлечь.

  5. **Sitemap** уже отдаёт публичные URL (выше) — это и есть вход для AI-краулеров.

  В Claude Code для этого есть скилл `ai-seo` (`/ai-seo`) и `seo-geo` — можно прогнать ими; в Codex/Cursor сделай по пунктам выше вручную.

Зафиксируй выбор (приватно / GEO) в `spec.md` раздел «SEO», чтобы дальше не переспрашивать.

## Проверка

После деплоя:

```bash
curl https://your-domain.com/robots.txt
curl https://your-domain.com/sitemap.xml
curl -I https://your-domain.com/dashboard | grep -i x-robots
```

Должно быть:
- `robots.txt` доступен
- `sitemap.xml` содержит только публичные URL
- На `/dashboard` либо `X-Robots-Tag: noindex` либо `<meta name="robots" content="noindex">` в HTML

## Google Search Console

1. Зарегистрируйся: https://search.google.com/search-console

2. Добавь свой домен, подтверди (через DNS-запись или meta tag)

3. Отправь sitemap.xml

4. Дождись индексации лендинга (1-7 дней)

## Yandex Webmaster (для РФ-аудитории)

То же самое: https://webmaster.yandex.ru — добавь сайт, подтверди, отправь sitemap.

## После реализации

1. Покажи пользователю:
   - `robots.txt` доступен
   - `sitemap.xml` содержит только лендинг и публичные страницы
   - `/dashboard` имеет meta noindex

2. Зарегистрируй в Google Search Console (5 минут)

3. Если выбран AI-поиск (GEO) — проверь, что `/llms.txt` отдаётся (`curl https://your-domain.com/llms.txt`) и JSON-LD валиден через https://validator.schema.org/ или https://search.google.com/test/rich-results

4. Зафиксируй в `spec.md` раздел «SEO»: список индексируемых страниц + выбор по AI-поиску (приватно / GEO)

