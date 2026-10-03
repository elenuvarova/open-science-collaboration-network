# Инициализация разработки — Next.js + зависимости

> ⛔ **Этот этап — только локальный запуск, без выкладки наружу.** Единственный «запуск» здесь — `npm run dev` у тебя на компьютере (это разрешено и нормально). Нельзя: разворачивать приложение на хостинг/сервер (Vercel / Netlify / Render / VPS), подключать git-remote / GitHub, делать `git push`, запускать деплой-скиллы или предлагать деплой. Если кажется, что «ничего не задеплоено» — так и задумано: публикация в интернет, git и GitHub — отдельно, в Уроке 3.

Цель: к концу промта в `../../product/` есть рабочий Next.js проект с TypeScript, Tailwind и стартовыми зависимостями. На основе этого скелета далее ставится shadcn UI-кит и собираются экраны.

## Рекомендованный стек

| Слой | Рекомендация | Альтернативы (если у тебя другие предпочтения) |
|---|---|---|
| Фреймворк | **Next.js 16** (App Router) | Next.js 15, Remix, Astro |
| Язык | **TypeScript (strict)** | JavaScript (не рекомендуется — AI делает на 30–50% больше итераций без типов) |
| Стили | **Tailwind CSS v4** (идёт по умолчанию с Next.js 16) | Tailwind v3 (если ставишь Next.js 15), CSS Modules, vanilla CSS |
| UI-компоненты | **shadcn/ui** (копи-паст компонентов, не библиотека) | Radix UI напрямую, Headless UI, MUI |
| Иконки | **lucide-react** (идёт с shadcn) | react-icons, Heroicons |
| Архитектура | **Feature-Sliced Design** (структура папок) | Своя структура, классический "components/pages" |

Это **рекомендация, не догма** — каждая позиция меняется по желанию. Дальше промт показывает установку рекомендованного стека; если меняешь — адаптируй команды.

> **React и TypeScript — не «или-или», а разные слои стека.** В таблице нет отдельной строки «React», потому что React приходит вместе с **Next.js** (строка «Фреймворк»): Next.js построен на React. React отвечает за интерфейс — компоненты, из которых собран экран. **TypeScript** (строка «Язык») — это язык, на котором пишется всё, включая сами React-компоненты. Файл `.tsx` = React-компонент (`jsx`) с типами (`ts`). То есть вы пишете React **на** TypeScript внутри Next.js — это один стек, а не выбор между ними. Аналогия: «дом из кирпича» (материал = язык) и «двухэтажный» (конструкция = фреймворк/React) описывают разные вещи, одно другому не замена.

Про деплой здесь не решаем — это отдельный этап. Возможные варианты (VPS / Vercel / Render / Railway / Netlify) рассматриваются позже.

## Шаг 0 — Подтверди стек
Рекомендованный стек: **Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui + Feature-Sliced Design
Подбери другой рекомендованный стек под данную задачу, если явно лучше использовать что-то другое. Покажи пользователю рекомендованный стек и спроси, подходит ли (один вопрос с вариантом отказа):

> «Рекомендованный стек: **Next.js 16 (React) + TypeScript + Tailwind v4 + shadcn/ui + Feature-Sliced Design**.
>
> Можно его использовать, или у тебя есть предпочтения по фреймворку / стилям / TypeScript-vs-JS? (например, "хочу Next.js 15", "хочу без TypeScript", "хочу не Tailwind")»

Это рекомендация по умолчанию. Если пользователь без возражений — берём как есть. Если есть предпочтения — адаптируем.

Действуй по ответу:
- **«Подходит» / «давай» / без возражений** → дальше следуй промту как есть.
- **«Хочу X вместо Y»** → отметь изменение в `../../product/docs/spec.md` в разделе «Стек», адаптируй команды установки.

Запиши итоговый стек в `../../product/docs/spec.md`:

```markdown
## Стек
- Frontend: Next.js 16 (App Router)
- Язык: TypeScript (strict)
- Стили: Tailwind CSS v4
- UI: shadcn/ui + lucide-react
- Архитектура: Feature-Sliced Design
- Deploy: решается позже
```

## Шаг 1 — Создать Next.js проект

Из родительской директории относительно `product/` (то есть из корня репо где работаем — на два уровня выше папки урока):

```bash
cd ../..
npx create-next-app@latest product \
  --typescript \
  --tailwind \
  --app \
  --eslint \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack \
  --disable-git \
  --no-agents-md
```

Что выбрано флагами:
- `--typescript` — TypeScript включён
- `--tailwind` — Tailwind CSS (на Next.js 16 это автоматически v4)
- `--app` — App Router (FSD структура завязана на него)
- `--src-dir` — код в `src/`, что нужно для FSD-структуры
- `--import-alias "@/*"` — короткие импорты `@/shared/ui/button`
- `--no-turbopack` — пока работаем на стандартном бандлере (опционально, Turbopack можно включить отдельно)
- `--disable-git` — **важно:** не даём create-next-app самому инициализировать git и делать коммит. Git подключаем осознанно в Уроке 3 (там же — GitHub и первый push). Без этого флага create-next-app тихо создаёт репозиторий и коммитит «Initial commit from Create Next App» — лишнее и сбивает с толку.
- `--no-agents-md` — не генерируем `AGENTS.md`/`CLAUDE.md` от create-next-app: ваш `AGENTS.md` уже собран в Уроке 1, перезаписывать его не нужно.

Если CLI спрашивает «App Router?» или «src directory?» — отвечай "Yes" на обе.

**Если у пользователя в `Шаге 0` выбран Next.js 15** — используй `create-next-app@15`. В этом случае Tailwind будет v3, а не v4 — это нормально, дальше всё работает (только в шаге shadcn config-файл будет `tailwind.config.ts` вместо `@theme` директивы).

## Шаг 1.5 — Префлайт: правила и рецепты в `product/`, обёртки в корне

Канон воркспейса:
- **Правила (`AGENTS.md`) и промты-рецепты (`prompts/`)** — **внутри** `product/`. Это отдельный git-репозиторий, его клонирует команда; всё, что должно ехать с проектом, живёт внутри него.
- **Обёртки (`.claude/`: скиллы, хуки, `settings.json`)** — в **корне воркспейса**. Claude грузит конфиг из открытой папки (обычно весь воркспейс), а внутрь `product/` сам не заглядывает, поэтому обёртки должны лежать в корне, чтобы гарантированно срабатывать. Внутри скилла — лишь ссылка на рецепт из `product/prompts/`.
- В **корне** `CLAUDE.md` = `@product/AGENTS.md` (импорт правил продукта — они в контексте сразу, а не лениво). Документация (`docs/`) — внутри `product/`.

Иногда из-за прошлых шагов или из-за того что `create-next-app` инициализировал что-то не там, структура расходится: `.claude` оказался внутри `product/`, `AGENTS.md` — в корне, или `docs/` не в `product/`. Прогони префлайт-гард — он приведёт **любую** структуру к канону (ничего не затирая).

```bash
# Запускаем из корня воркспейса (на два уровня выше папки урока)
cd ../..

# 1) ПРАВИЛА (AGENTS.md) должны быть ВНУТРИ product/. Если оказались в корне — переносим.
if [ -f AGENTS.md ] && [ ! -L AGENTS.md ]; then
  if [ ! -f product/AGENTS.md ]; then
    mv AGENTS.md product/AGENTS.md
    echo "перенёс ./AGENTS.md → product/AGENTS.md"
  else
    echo "⚠️  и в корне, и в product/ есть реальный AGENTS.md — гард не затирает. Слей их вручную: источник правды — product/AGENTS.md, корневой замени на указатель."
  fi
fi

# 2) ОБЁРТКИ (.claude / .codex / .cursor) должны быть в КОРНЕ. Если оказались в product/ — поднимаем.
for cfg in .claude .codex .cursor; do
  if [ -d "product/$cfg" ]; then
    mkdir -p "$cfg"
    cp -Rn "product/$cfg/." "$cfg/" 2>/dev/null
    rm -rf "product/$cfg"
    echo "перенёс product/$cfg → ./$cfg (обёртки в корень воркспейса)"
  fi
done

# 3) Указатели на правила продукта
[ -f product/AGENTS.md ] && ( cd product && [ -e CLAUDE.md ] || ln -sf AGENTS.md CLAUDE.md )  # Claude ищет CLAUDE.md
[ -L CLAUDE.md ] && rm -f CLAUDE.md
printf '@product/AGENTS.md\n' > CLAUDE.md                                          # корень: импорт правил
{ [ ! -e AGENTS.md ] || [ -L AGENTS.md ]; } && ln -sf product/AGENTS.md AGENTS.md  # корень: ярлык для Codex

# 4) Документация продукта (docs/) — внутри product/. Если docs/ оказалась в корне — переносим/сливаем.
if [ -d docs ] && [ ! -L docs ]; then
  mkdir -p product/docs
  cp -Rn docs/. product/docs/ 2>/dev/null   # сливаем, не затирая то, что уже есть в product/docs
  rm -rf docs
  echo "перенёс ./docs → product/docs"
fi
```

Если `docs/` обнаружился ещё где-то (например, внутри папки урока) — перенеси его в `product/docs/` так же. Цель: `AGENTS.md`, `prompts/`, `docs/` — всегда внутри `product/`; `.claude/` (скиллы, хуки) — в корне воркспейса; в корне `CLAUDE.md` импортирует правила продукта.

## Шаг 2 — Проверка что проект собирается

```bash
cd ../../product
npm run build
```

Должно завершиться без ошибок. Если есть ошибки — почини **до** перехода дальше, не нагромождай поверх сломанного.

```bash
npm run dev
# открой http://localhost:3000 — стартовая страница Next.js видна
```

## Шаг 3 — Дополнительные зависимости

Сразу ставим минимальный набор, который понадобится дальше:

```bash
npm install class-variance-authority clsx tailwind-merge
npm install lucide-react
```

Назначение:
- `class-variance-authority` (`cva`) — описывает варианты компонентов (`variant="primary"`, `size="md"`)
- `clsx` + `tailwind-merge` — утилита `cn()` для объединения классов с разрешением конфликтов
- `lucide-react` — набор иконок (shadcn использует его по умолчанию)

## Шаг 4 — Утилита `cn` в `src/shared/lib/utils.ts`

```bash
mkdir -p src/shared/lib
```

```typescript
// src/shared/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Эту функцию shadcn использует во всех компонентах. Если её нет — компоненты не работают.

## Шаг 5 — Замени стартовую страницу

Перезапиши `src/app/page.tsx` целиком следующим содержимым:

```typescript
// src/app/page.tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-semibold">Проект готов к работе</h1>
        <p className="text-sm text-gray-600">
          Дальше — DESIGN.md и UI-кит. После сборки UI-кита эта страница
          в режиме разработки будет вести на <code>/style-guide</code>.
        </p>
      </div>
    </main>
  );
}
```

Перезапиши `src/app/globals.css` — оставь только базовый слой Tailwind, демо-стили `create-next-app` (CSS-переменные для логотипов, gradient-фоны и т.д.) удали:

**Tailwind v4 (Next.js 16):**
```css
/* src/app/globals.css */
@import "tailwindcss";
```

**Tailwind v3 (Next.js 15):**
```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Шаг 6 — pnpm build scripts (если используется pnpm)

Если пользователь использует pnpm (а не npm) — pnpm по умолчанию **блокирует** build-scripts для некоторых пакетов (защита от malicious code). Если при установке `sharp`, `unrs-resolver` или похожих появилось warning — добавь в `package.json`:

```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["sharp", "unrs-resolver"]
  }
}
```

Затем `pnpm install` ещё раз.

Если используется npm или yarn — пропусти этот шаг.

## Шаг 7 — Проверка (обязательно, не пропускать)

```bash
npm run dev
```

Открой `http://localhost:3000` — на экране «Проект готов к работе» по центру. Это значит Next.js, TypeScript и Tailwind работают.

В отдельной вкладке прогон сборки:

```bash
npm run build
```

Build должен пройти без ошибок и без TypeScript warning.

## Что НЕ делаем в этом промте

- ❌ Не ставим shadcn — это в следующем промте (`02-ui-kit.md`)
- ❌ Не создаём FSD структуру (entities/features/widgets/pages) — это в `04-fsd-architecture.md`
- ❌ Не пишем DESIGN.md — это в `01-design-system.md`
- ❌ Не настраиваем темы / переменные / дизайн-токены — это в DESIGN.md
- ❌ Не выбираем хостинг / деплой — это отдельный этап
- ❌ **Не инициализируем git и не коммитим** — поэтому `--disable-git`. Git, GitHub, первый коммит и pre-commit хук (спека-гейт) — всё в Уроке 3.

Цель этого промта — только **скелет проекта**. Остальное по очереди.

