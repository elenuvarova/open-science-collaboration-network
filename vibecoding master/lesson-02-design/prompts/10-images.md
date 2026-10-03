# Настройка оптимизации изображений

> ⛔ **Этот этап — только локальный запуск, без выкладки наружу.** Единственный «запуск» здесь — `npm run dev` у тебя на компьютере (это разрешено и нормально). Нельзя: разворачивать приложение на хостинг/сервер (Vercel / Netlify / Render / VPS), подключать git-remote / GitHub, делать `git push`, запускать деплой-скиллы или предлагать деплой. Если кажется, что «ничего не задеплоено» — так и задумано: публикация в интернет, git и GitHub — отдельно, в Уроке 3.

Цель: один раз настроить автоматическую оптимизацию картинок — чтобы они автоматически сжимались, конвертировались в WebP/AVIF и мобилка никогда не грузила десктопный файл.

## Зачем это нужно

Без настройки:
- Оригинальные JPG/PNG могут весить 5–20 МБ — медленная загрузка, плохой LCP
- Мобилка грузит ту же картинку что десктоп — трафик × 4–5 впустую
- Git-репо раздувается большими бинарными файлами

После настройки:
- Любая картинка при коммите автоматически сжимается до нормального размера
- Браузер получает WebP или AVIF — в 2–4 раза меньше JPG
- Мобилка грузит маленькую версию, десктоп — большую

---

## Шаг 1 — Установить sharp

```bash
cd ../../product

# npm
npm install sharp

# pnpm
pnpm add sharp
```

`sharp` — C++ библиотека обработки изображений (libvips). Именно её использует `next/image` под капотом. Без неё Next.js оптимизирует медленно.

---

## Шаг 2 — Настроить next.config.ts

```
Прочитай ../../product/next.config.ts (или ../../product/next.config.js).
Добавь в раздел images:
- formats: ['image/avif', 'image/webp']
- deviceSizes под breakpoints проекта (из spec.md или DESIGN.md)
- minimumCacheTTL: 31536000

Пример для обычного лендинга (desktop 1440 + mobile 375):
  deviceSizes: [375, 480, 768, 1024, 1440, 1920, 2560]
  imageSizes: [16, 32, 64, 128, 256]

Если breakpoints в проекте другие — подстрой под них.
```

---

## Шаг 3 — Добавить скрипт оптимизации

```
Создай файл ../../product/scripts/optimize-images.js

Скрипт должен:
- Принимать аргумент: папка (по умолчанию public/) или один файл
- Принимать флаг --dry-run (только показать, не менять)
- Для каждого JPG/PNG (рекурсивно):
  - Пропустить файлы < 100 КБ (уже маленькие)
  - Сжать JPG: resize max 2560px, quality 82, progressive, mozjpeg
  - Сжать PNG: resize max 2560px, strip metadata
  - Перезаписать оригинал
  - Показать: имя файла + размер до + размер после + процент экономии

Использует: require('sharp'), fs, path. CommonJS, не ESM.

Добавь в ../../product/package.json scripts:
  "images:opt": "node scripts/optimize-images.js public",
  "images:opt:dry": "node scripts/optimize-images.js public --dry-run"
```

Проверь что скрипт работает:
```bash
cd ../../product
node scripts/optimize-images.js public --dry-run
```

---

## Шаг 4 — Скрипт авто-сжатия (git-хук подключается в Уроке 3)

Сжимать staged-картинки удобно автоматически через git pre-commit хук. Но git в курсе появляется только в Уроке 3 (в Уроке 2 приложение создаётся с `--disable-git`). Поэтому здесь готовим **скрипт**, а в pre-commit его встроим в Уроке 3 — в тот же хук, что и спека-гейт (один pre-commit на проект).

```
Создай ../../product/scripts/optimize-staged-images.sh:
- получить staged картинки: git diff --cached --name-only --diff-filter=AM | grep -iE '\.(jpe?g|png)$'
- для каждой: node scripts/optimize-images.js <путь>
- re-stage: git add <путь>
- если node не найден — warn и exit 0 (не ломать коммит)
chmod +x scripts/optimize-staged-images.sh
```

Пока git нет (Урок 2) — сжимай вручную: `npm run images:opt`. В Уроке 3, когда настроишь git и pre-commit хук (`../../product/scripts/hooks/pre-commit`, там же спека-гейт), вставь в **начало** хука строку `sh scripts/optimize-staged-images.sh` — и сжатие пойдёт автоматически на каждом коммите.

---

## Шаг 5 — Первый прогон по всем изображениям

Сжимает все существующие картинки в `../../product/public/`:

```bash
cd ../../product
node scripts/optimize-images.js public
```

Покажи пользователю результат: сколько файлов, сколько места сэкономлено.

---

## Шаг 6 — Обновить все `<Image>` компоненты

`next/image` может отдавать неправильный размер мобилке если не указан `sizes`:

```
Проверь все использования <Image> в ../../product/src/
Для каждого без пропа sizes — добавь правильный:

- Изображение во всю ширину экрана: sizes="100vw"
- Изображение в половину экрана: sizes="(max-width: 768px) 100vw, 50vw"
- Карточка в гриде 3-col: sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
- Hero-изображение: добавь также проп priority (влияет на LCP)

Правило: sizes должен описывать РЕАЛЬНУЮ ширину контейнера на каждом breakpoint.
```

---

## После выполнения

Добавь в `../../product/docs/memory/state.md`:
```
## Оптимизация изображений — Настроена
- sharp установлен
- next.config.ts: avif/webp форматы, deviceSizes под проект
- scripts/optimize-images.js — pre-compress source files
- scripts/optimize-staged-images.sh — готов; авто-вызов в pre-commit подключим в Уроке 3 (git)
- Первый прогон: X файлов оптимизировано, сэкономлено Y МБ
```

## Чеклист

- [ ] `sharp` установлен (есть в package.json dependencies)
- [ ] `next.config.ts` содержит `formats: ['image/avif', 'image/webp']` и `deviceSizes`
- [ ] `scripts/optimize-images.js` создан и работает (`--dry-run` показывает файлы)
- [ ] `scripts/optimize-staged-images.sh` создан (авто-вызов в pre-commit — в Уроке 3, вместе со спека-гейтом)
- [ ] Первый прогон `node scripts/optimize-images.js public` завершён
- [ ] Все `<Image>` компоненты имеют проп `sizes`
- [ ] Hero-изображения имеют проп `priority`

