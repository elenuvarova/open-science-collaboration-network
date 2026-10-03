# FSD-архитектура — структура `src/` по 6 слоям

> ⛔ **Этот этап — только локальный запуск, без выкладки наружу.** Единственный «запуск» здесь — `npm run dev` у тебя на компьютере (это разрешено и нормально). Нельзя: разворачивать приложение на хостинг/сервер (Vercel / Netlify / Render / VPS), подключать git-remote / GitHub, делать `git push`, запускать деплой-скиллы или предлагать деплой. Если кажется, что «ничего не задеплоено» — так и задумано: публикация в интернет, git и GitHub — отдельно, в Уроке 3.

Цель: развернуть в `../../product/src/` структуру Feature-Sliced Design — 6 слоёв, импорты только вниз.

## 6 слоёв (сверху вниз)

```
src/
├── app/        ← роутинг, провайдеры, глобальные стили + layout.tsx с постоянной обвязкой (Header/Sidebar)
├── pages/      ← страницы целиком (по одной на маршрут из spec.md), только контент — без общей обвязки
├── widgets/    ← крупные блоки UI (Header, Sidebar, Footer) — подключаются в layout.tsx, не в страницах
├── features/   ← действия пользователя (LoginForm, AddToCart)
├── entities/   ← бизнес-сущности (User, Order — из модели данных spec.md)
└── shared/
    ├── ui/     ← UI-кит из Задания 2 (atom / molecule / UI-organism)
    ├── lib/    ← утилиты
    ├── api/    ← базовый api-клиент
    └── config/ ← env, константы
```

## Две оси архитектуры

В проекте работают **две методологии одновременно** — это не конфликт, а гибрид:

| Где | Методология | Что регулирует |
|---|---|---|
| Снаружи (вся `src/`) | Feature-Sliced Design | Куда положить файл по бизнес-роли (entities/features/widgets/pages) |
| Внутри `shared/ui/` | Мягкий Atomic Design | Как думать про компоненты UI-кита (atom/molecule/organism) |

**Главное правило гибрида:** как только компонент знает о бизнес-домене (типы `User`, `Product`, `Order`, store сущности) — он уходит из `shared/ui/` в FSD-слои:

| Компонент | Где | По какому правилу |
|---|---|---|
| `Modal`, `Toast`, `DataTable` | `shared/ui/` | UI-organism без домена |
| `UserCard`, `UserAvatar` | `entities/user/ui/` | Знает о User |
| `LoginForm`, `AddToCartButton` | `features/login/ui/`, `features/add-to-cart/ui/` | Действие |
| `Header`, `Sidebar` | `widgets/header/`, `widgets/sidebar/` | Крупный доменный блок |

Atomic Design (atoms → molecules → organisms → templates → pages) **не подменяет** FSD — `pages/` и `templates/` Atomic Design'а нам не нужны, потому что эти роли играют FSD-слои `pages/` и `app/layout.tsx`. Atomic помогает только внутри UI-кита.

Подробное правило (можно сослаться в чате с AI): `../../product/docs/rules/ui-kit-atomic.md`.

## Правило: импорты только вниз

```
app → pages → widgets → features → entities → shared
```

**Запрещено:**
- Слайс импортит соседний слайс на том же уровне
- Слайс импортит из слоя выше

**Разрешено:**
- `pages/dashboard/` импортит из `widgets/`, `features/`, `entities/`, `shared/`
- `widgets/header/` импортит из `features/login`, `entities/user`, `shared/ui`

## Чистый корень: весь код в `src/`

FSD держит код в `src/` по слоям — а корень проекта остаётся **чистым**. Это не косметика: когда в корне порядок, AI кладёт файлы предсказуемо, навигация и онбординг быстрые, а ревью видит структуру с первого взгляда. Захламлённый корень (россыпь `.js`-скриптов, папки `components/`/`lib/` мимо `src/`, дампы и скриншоты) — первый признак, что проект «поплыл».

**Что разрешено в корне кода** — только обязательный конфиг + папки. Часть конфига Next/Node **обязана** лежать в корне (иначе сборка падает, в `src/` их не унести): `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.*`, `next-env.d.ts`, `postcss.config.*`, `eslint.config.*`, `components.json`, `.gitignore`. Папки: `src/` (весь код), `docs/` (документация), `public/`, `prisma/` (если БД), `scripts/` (разовые скрипты на TS).

**Что в корне запрещено:** любой код вне `src/` (компоненты, `lib`, `hooks`, `utils` — всё в FSD-слои), одноразовые скрипты в корне (только в `scripts/`, на TS), дампы данных / скриншоты / временные файлы, лишние rc-файлы (`.prettierrc`, `.babelrc` — конфиг в `package.json`; `tailwind.config` на v4 не нужен), plain `.js` для кода приложения (пишем на TypeScript).

> Этот принцип действует не один раз, а постоянно — поэтому ниже мы выносим его в **правило проекта**, на которое ссылается `AGENTS.md` (AI читает его каждую сессию). А когда в Уроке 6 появится лендинг, код уедет в `development/` (монорепо), но правило «весь код в своём `src/`, корень чистый» останется тем же.

## Шаг 0 — Зафиксировать правило структуры

Создай `../../product/docs/rules/project-structure.md` — оно уже прописано в таблице «Правила (читать по триггеру)» твоего `AGENTS.md` (Урок 1), поэтому AI будет сверяться с ним при размещении файлов в каждой сессии:

```markdown
# Структура проекта — весь код в src/, корень чистый

## Принцип
Весь код разработки — в `src/` по FSD. Корень кода держим чистым: только обязательный
конфиг + папки. Кладёшь файл по слою FSD, а не в корень.

## Разрешено в корне кода
Обязательный конфиг (Next/Node без него в корне не работают): package.json,
package-lock.json, tsconfig.json, next.config.*, next-env.d.ts, postcss.config.*,
eslint.config.*, components.json, .gitignore.
Папки: src/ (код), docs/ (документация), public/, prisma/ (если БД), scripts/ (разовые скрипты, TS).

## Запрещено в корне
- Код вне src/ (компоненты, lib, hooks, utils) — всё в FSD-слои src/.
- Разовые скрипты (seed/check/fix/migrate) в корне — только в scripts/, на TS.
- Дампы данных, скриншоты, временные файлы — не в корне/репозитории.
- Лишние rc-файлы (.prettierrc, .babelrc) — конфиг в package.json; tailwind.config на v4 не нужен.
- Plain .js для кода приложения — пишем на TypeScript (.ts/.tsx).

## Куда что
| Что | Куда |
|---|---|
| UI без домена | src/shared/ui/ |
| Бизнес-сущность (User, Order) | src/entities/<name>/ |
| Действие пользователя | src/features/<name>/ |
| Крупный блок (Header, Sidebar) | src/widgets/<name>/ |
| Страница | src/pages/<name>/ (компонент `<Screen>Screen`, НЕ `Page`) + тонкий адаптер `page.tsx` в src/app/ |
| Утилита | src/shared/lib/ |
| Документация | docs/ |
| Разовый скрипт | scripts/ (TS) |

## Именование страниц
Компонент страницы в `src/pages/<name>/ui/` — всегда `<Screen>Screen` (`HomeScreen`,
`ProfileScreen`), именованный экспорт. Никаких `Page` / `export default function Page()`
внутри `pages/`. Имя `page` зарезервировано за файлом-маршрутом Next.js `src/app/.../page.tsx`
(переименовать нельзя), который лишь ре-экспортирует `<Screen>Screen`. Так нет коллизии `Page`/`Page`.

## Самопроверка
В корне кода: `find . -maxdepth 1 -name "*.js" -not -name "*.config.js"` (plain .js быть не
должно), и нет папок components/ lib/ hooks/ в корне (код мимо src/ — нарушение).
Именование страниц: `grep -rl "export default function Page" src/pages/` — должно быть пусто
(в `pages/` компоненты называются `<Screen>Screen`, а не `Page`).

## После монорепо-сплита (Урок 6)
Код уезжает в development/ (apps/app + apps/landing + packages/ui). Правило то же, но
«корень кода» = корень соответствующего apps/* или packages/*; общие токены и компоненты —
только в packages/ui, apps импортят оттуда.
```

## Шаг 1 — Создать структуру

Создай папки:

```bash
cd ../../product
mkdir -p src/{app,pages,widgets,features,entities}
mkdir -p src/shared/{ui,lib,api,config}
mkdir -p scripts
```

(UI-кит уже в `../../product/src/shared/ui/` из Задания 2.)

## Шаг 2 — Слайсы из spec.md

Прочитай `../../product/docs/spec.md` → раздел «Данные (модель)» → каждая сущность становится слайсом в `entities/`.

Например, если в модели есть `User`, `Order`:

```
src/entities/
├── user/
│   ├── model/
│   │   └── types.ts          ← interface User
│   ├── api/
│   │   ├── mock-user.ts      ← моки (заменяются при подключении БД)
│   │   ├── getUser.ts        ← запросы (пока вызывают моки)
│   │   └── updateUser.ts
│   ├── ui/
│   │   └── UserCard.tsx      ← переиспользуемая визуализация
│   └── index.ts              ← Public API слайса
└── order/
    ├── model/
    ├── api/
    ├── ui/
    └── index.ts
```

## Шаг 3 — Слайсы из действий пользователя

Прочитай `spec.md` → раздел «Экраны» → раздел «Действия» каждого экрана → действия которые переиспользуются на нескольких экранах становятся слайсами в `features/`.

Примеры:
- `features/login/` — форма логина (используется на /login и в модалке Header)
- `features/edit-profile/` — редактирование профиля
- `features/add-to-cart/` — добавить в корзину

Структура каждого слайса:
```
features/login/
├── ui/
│   └── LoginForm.tsx
├── model/
│   └── useLogin.ts          ← хук с логикой
├── api/
│   └── loginRequest.ts
└── index.ts
```

## Шаг 4 — Pages (страницы)

Прочитай `spec.md` → каждая страница из раздела «Экраны» становится слайсом в `pages/`:

```
src/pages/
├── home/
│   ├── ui/
│   │   └── HomeScreen.tsx     ← компонент с суффиксом Screen, НЕ Page
│   └── index.ts              ← export { HomeScreen } from './ui/HomeScreen'
├── profile/
├── settings/
└── ...
```

> ⚠️ **Соглашение об именовании — закрываем конфликт `Page` ↔ `page.tsx` заранее.** FSD-компонент страницы **всегда** называем `<Screen>Screen` (`HomeScreen`, `ProfileScreen`, `SettingsScreen`) — файл `<Screen>Screen.tsx`, именованный экспорт. **Никогда не называй компонент голым `Page` и не делай `export default function Page()` внутри `pages/`.** Слово `page` остаётся только за служебным файлом маршрута Next.js — `src/app/.../page.tsx` (это имя требует сам Next, переименовать его нельзя). Так единственный `page` в проекте — это файл-маршрут, а компоненты — `*Screen`; ни IDE, ни AI больше не предложат «переименуй, тут два Page».

## Шаг 5 — Next.js routing в `src/app/`

Next.js App Router использует папку `app/` для маршрутов. В FSD `app/` тоже есть. Используем тонкие адаптеры:

```tsx
// src/app/(app)/profile/page.tsx — Next.js routing (имя файла page.tsx обязательно)
import { ProfileScreen } from "@/pages/profile"
export default ProfileScreen
```

Это позволяет Next.js routing работать, а основная логика страницы — в FSD-слайсе `pages/profile/`. Файл маршрута называется `page.tsx` (так требует Next), а компонент внутри — `ProfileScreen`: имена не пересекаются, конфликта `Page`/`Page` нет (см. соглашение в Шаге 4).

## Шаг 5.1 — Постоянная обвязка через `layout.tsx` (меню не должно перезагружаться)

Общая обвязка приложения — меню, шапка (`Header`), боковое меню (`Sidebar`), подвал (`Footer`) — на всех внутренних экранах одна и та же. Если положить её **внутрь каждой страницы** (`pages/<screen>/`), то при каждом переходе она будет заново монтироваться и перерисовываться: меню «мигает», переключение между страницами медленное, активный пункт и состояние шапки сбрасываются.

В App Router для этого есть `layout.tsx`. Ключевое свойство: **layout переживает навигацию между его дочерними страницами и НЕ перемонтируется** — Next.js меняет только `{children}` (контент страницы), а сам каркас остаётся на месте. Поэтому обвязку кладём в сегментный layout, а не в страницы.

Используем route-группу `(app)` для внутренних экранов приложения. Обвязка живёт в её layout, страницы рендерят **только свой контент**:

```tsx
// src/app/(app)/layout.tsx — постоянная обвязка для всех внутренних экранов
import { Header } from "@/widgets/header"
import { Sidebar } from "@/widgets/sidebar"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
```

```tsx
// src/app/(app)/profile/page.tsx — только адаптер на страницу, БЕЗ Header/Sidebar
import { ProfileScreen } from "@/pages/profile"
export default ProfileScreen
```

Правила:
- **Header / Sidebar / Footer / Nav — только в `(app)/layout.tsx`, не внутри `pages/`.** Страница рендерит свой контент и ничего не знает про общую обвязку.
- **Публичные экраны без меню** (лендинг, `/login`, `/signup`) кладём в **отдельную группу** `(public)` со своим `layout.tsx` (или вообще без него) — чтобы меню приложения не показывалось на странице входа. Группы в скобках на URL не влияют: `(app)/profile` и `(public)/login` дают `/profile` и `/login`.
- **Состояние обвязки** (открыт ли сайдбар, активный пункт меню) держим в самом layout/виджете, а активный пункт подсвечиваем через `usePathname()` — оно само следит за текущим URL, без ручного проброса на каждую страницу.

```
src/app/
├── layout.tsx            ← корневой: <html>/<body>, шрифт next/font, провайдеры
├── (public)/             ← экраны без меню приложения
│   ├── layout.tsx        ← минимальная обёртка (или без неё)
│   ├── login/page.tsx
│   └── page.tsx          ← лендинг / главная
└── (app)/                ← внутренние экраны приложения
    ├── layout.tsx        ← Header + Sidebar (постоянная обвязка)
    ├── profile/page.tsx
    └── settings/page.tsx
```

## Шаг 5.2 — Навигация через `<Link>` (мягкие переходы + кэш)

Чтобы переключение страниц было быстрым, внутренние переходы делаем через `<Link>` из `next/link`, а не через `<a href>` и не через `window.location`:

```tsx
import Link from "next/link"

<Link href="/profile">Профиль</Link>   // ✅ мягкая навигация
<a href="/profile">Профиль</a>          // 🔴 полная перезагрузка страницы — каркас тоже перегрузится
```

Что это даёт:
- **Мягкая навигация (client-side):** меняется только контент внутри `(app)/layout.tsx`, постоянная обвязка остаётся смонтированной — то самое «меню не перезагружается».
- **Префетч:** Next.js заранее подгружает код и данные для видимых на экране ссылок, поэтому переход ощущается мгновенным.
- **Router Cache:** уже посещённые сегменты держатся в памяти браузера, повторный заход на страницу не грузит всё заново.

`<a href>` оставляем только для внешних ссылок (на другой сайт). Для навигации из обработчика (после сабмита формы и т.п.) — `router.push()` из `next/navigation`; он тоже даёт мягкую навигацию и сохраняет обвязку.

## Шаг 6 — Public API через `index.ts`

Каждый слайс экспортирует только нужное наружу через `index.ts`:

```ts
// features/login/index.ts
export { LoginForm } from './ui/LoginForm'
export { useLogin } from './model/useLogin'
// loginRequest НЕ экспортирован — внутренняя реализация
```

Снаружи используем только `import { LoginForm } from '@/features/login'`, не глубокие пути.

## Шаг 7 — Проверка импортов

```bash
cd ../../product
# Проверить что слайсы не импортят друг друга на том же уровне
grep -r "from '@/features/" src/features/ | grep -v "from '@/features/$(folder)'"
```

Если найдено — это нарушение FSD, пересмотри (либо общий код вынести в `entities/`, либо использовать паттерн @x для cross-entity).

## После выполнения

1. Покажи `tree -L 3 ../../product/src/`

2. Для каждого слайса покажи содержимое `index.ts`

3. Проверь что импорты идут только вниз

4. **Чистый корень — grep-гард.** Прогони в корне продукта и убедись, что пусто (код не утёк из `src/`):

   ```bash
   cd ../../product
   find . -maxdepth 1 -name "*.js" -not -name "*.config.js"   # plain .js в корне — быть не должно
   ls -d components lib hooks utils 2>/dev/null               # код мимо src/ — нарушение
   ```

   Нашлось — перенеси в `src/` по слою FSD (или разовый скрипт — в `scripts/`), это нарушение `docs/rules/project-structure.md`.

