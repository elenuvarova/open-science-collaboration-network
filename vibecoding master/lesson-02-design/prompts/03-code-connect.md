# Перенос Figma-компонентов в код напрямую (Code Connect — опционально)

> ⛔ **Этот этап — только локальный запуск, без выкладки наружу.** Единственный «запуск» здесь — `npm run dev` у тебя на компьютере (это разрешено и нормально). Нельзя: разворачивать приложение на хостинг/сервер (Vercel / Netlify / Render / VPS), подключать git-remote / GitHub, делать `git push`, запускать деплой-скиллы или предлагать деплой. Если кажется, что «ничего не задеплоено» — так и задумано: публикация в интернет, git и GitHub — отдельно, в Уроке 3.

**Этот промт опциональный.** По умолчанию его можно пропустить и сразу идти в `04-fsd-architecture.md` — экраны соберутся напрямую из твоего UI-кита (см. «Дефолт» ниже). Отдельная фича Code Connect даёт чуть более автоматический перенос, но требует тарифа Figma **Organization или Enterprise** — это выше, чем нужно для самого курса. Если у тебя его нет — это нормально, ничего не теряешь: UI-кит уже собран pixel-perfect, и прямой путь даёт практически тот же результат.

## Дефолт — прямая работа с Figma-компонентами (любой тариф)

После того как UI-кит собран в `../../product/src/shared/ui/` по 5-шаговому workflow из `02-ui-kit.md` (каждый компонент прошёл `get_design_context` + сверку скриншотов), **никакого отдельного шага между UI-китом и экранами не нужно.** Перенос делается прямо на этапе сборки экранов (`06-screens.md`):

1. AI делает `get_design_context` по экрану — Figma MCP возвращает Tailwind-каркас (сырые классы и структуру).
2. AI делает `get_screenshot` экрана — это эталон, как должно выглядеть.
3. AI собирает экран **своими компонентами из `shared/ui/`**, опираясь на каркас (layout, отступы) + скриншот (эталон) + раздел `## Визуал` файла `../../product/docs/screens/<url>.md` (точные значения из Задания 5).

Почему это работает без потери точности: UI-кит уже собран **пиксель в пиксель по реальному Figma**, и в `## Визуал` каждого экрана зафиксированы точные размеры/отступы/состояния. AI не «угадывает кнопку с нуля» — он подставляет уже готовый, точный `<Button variant="primary">` из твоего кита и сверяет результат со скриншотом. Это и есть перенос Figma → код. Code Connect лишь автоматизирует последний шаг подстановки и снижает разнобой на больших проектах (см. ниже) — но **не повышает пиксельную точность**: компоненты и так точные.

**A1 и A2 на этом этапе собираются одинаково.** Разница только в происхождении UI-кита:
- **A1** (в Figma была библиотека компонентов) — UI-кит собран pixel-perfect по готовым Figma-компонентам, маппинг «этот frame → мой `<Button>`» для AI надёжен.
- **A2** (в Figma только макеты) — компоненты вычленены из вхождений на экранах.

В обоих случаях шаги сборки экрана идентичны: `get_design_context` + `get_screenshot` + компоненты из `shared/ui/` по `## Визуал`. Дальше → `04-fsd-architecture.md`.

---

## Опционально — Code Connect (только тариф Organization / Enterprise)

Если у тебя **Organization или Enterprise** аккаунт Figma и хочется, чтобы Figma MCP при `get_design_context` экрана сразу возвращал готовый JSX с твоими `<Button>`/`<Card>`/`<Input>` (без шага «подставь компонент сам») — это делает **Code Connect**. Он привязывает Figma-компонент к твоему React-импорту и публикует связку на сервер Figma.

**Что это реально даёт:** меньше разнобоя на больших проектах (AI не интерпретирует каркас на каждом из десятков экранов, а копирует готовый JSX) и более автоматичную сборку. **Чего НЕ даёт:** прироста пиксельной точности — компоненты уже собраны pixel-perfect в `02-ui-kit.md`, экран выглядит так же и без Code Connect. Это про консистентность и удобство, не про качество отрисовки. На малых проектах (5–10 экранов) выгода почти незаметна.

**Предусловия:**
- Тариф Figma **Organization или Enterprise** (на Free / Starter / Professional `publish` не работает — вернёт ошибку «requires Organization or Enterprise plan»).
- В Figma-файле компоненты UI-кита оформлены как настоящие **components** (с variants и properties), не frames. Если только макеты (подслучай A2) — привязывать почти не к чему, Code Connect не даст выгоды, пропусти.
- DESIGN.md готов, UI-кит в `shared/ui/` собран по 5-шаговому workflow.

### Шаг 1 — Установить Code Connect CLI

```bash
cd ../../product
npm install -D @figma/code-connect
npx figma connect --version
```

### Шаг 2 — Создать `figma.config.json`

В корне продукта (рядом с `package.json`):

```json
{
  "codeConnect": {
    "include": ["src/shared/ui/**/*.figma.tsx"],
    "parser": "react",
    "importPaths": {
      "src/shared/ui/*": "@/shared/ui/*"
    }
  }
}
```

`importPaths` маппит относительный путь к alias из `tsconfig.json` — чтобы Figma показывал `import { Button } from "@/shared/ui/button"`, а не `./Button`.

### Шаг 3 — Personal Access Token для публикации

Code Connect для **публикации** использует PAT (не OAuth Figma MCP) — отдельный токен только для publish-команды.

1. Открой `https://www.figma.com/settings/personal-access-tokens`
2. Create new token. Scope: **Code Connect → Write**, **File content → Read**. Срок 30 дней.
3. Положи токен в env-файл (не в код, не в чат, не в терминал). Создай/дополни `.env.local` плейсхолдером:
   ```
   FIGMA_ACCESS_TOKEN=впиши-сюда-свой-Code-Connect-токен
   ```
   Скажи пользователю: «Создал `.env.local`. Открой и впиши токен после `FIGMA_ACCESS_TOKEN=`, сохрани». Значение токена ты не видишь. Git в этом уроке не подключаем; когда он появится в Уроке 3, `.env*` сразу попадёт в `.gitignore`.
4. Publish-команда берёт токен из `.env.local` (`FIGMA_ACCESS_TOKEN`). Запуск делает AI, пользователю в терминал ничего вводить не нужно.

### Шаг 4 — Сгенерировать `.figma.tsx` для каждого компонента

**Для каждого компонента** в `shared/ui/<name>/`:

1. В Figma выдели нужный компонент (например, `Button` component set).
2. ПКМ → Copy link to selection. Будет вида `https://figma.com/file/<fileKey>/...?node-id=<nodeId>`.
3. Создай рядом с компонентом файл `<Component>.figma.tsx`. Для `shared/ui/button/Button.tsx` → `shared/ui/button/Button.figma.tsx`:

```tsx
import { figma } from "@figma/code-connect"
import { Button } from "./Button"

figma.connect(
  Button,
  "https://figma.com/file/<fileKey>/...?node-id=<nodeId>",
  {
    props: {
      variant: figma.enum("Variant", {
        Primary: "primary",
        Secondary: "secondary",
        Outline: "outline",
        Ghost: "ghost",
        Destructive: "destructive",
        Link: "link",
      }),
      size: figma.enum("Size", {
        Small: "sm",
        Medium: "default",
        Large: "lg",
        Icon: "icon",
      }),
      children: figma.children("*"),
      loading: figma.boolean("Loading"),
    },
    example: ({ variant, size, children, loading }) => (
      <Button variant={variant} size={size} loading={loading}>
        {children}
      </Button>
    ),
  }
)
```

**Соответствие property → figma.{type}:**

| Figma property type | Code Connect API | Пример |
|---|---|---|
| Variant (enum) | `figma.enum("PropName", {...})` | размер, тип кнопки |
| Boolean (toggle) | `figma.boolean("PropName")` | loading, disabled |
| Text | `figma.string("PropName")` | подпись |
| Instance | `figma.instance("PropName")` | вложенный компонент (иконка в кнопке) |
| Children (auto layout) | `figma.children("*")` / `figma.children("Icon")` | дочерние элементы |

**Важно:** имена Figma-property (`Variant`, `Size`, `Loading`) и значения (`Primary`, `Small`) должны точно совпадать с Figma. Проверяй через Figma → Inspect → Properties. Пройди так по всем компонентам UI-кита (10–15 файлов).

### Шаг 5 — Опубликовать маппинг

```bash
cd ../../product
npx figma connect publish
```

Команда найдёт все `*.figma.tsx`, свалидирует и загрузит маппинг в Figma. Результат: в Figma открой компонент → правая панель Inspect → Dev Resources → должен появиться React-сниппет с правильным импортом и props.

> Если команда вернула **«requires Organization or Enterprise plan»** — твой тариф ниже. Это не ошибка в проекте: просто пропусти Code Connect целиком и собирай экраны прямым путём (см. «Дефолт» выше). На пиксельную точность это не влияет — теряешь только автоматизацию подстановки.

### Шаг 6 — Проверка через MCP

В чате:
```
Возьми <ссылка на любой экран в Figma>. Сгенерируй React-компонент. Используй компоненты из @/shared/ui/.
```

Агент сделает `get_code_connect_map`, увидит маппинги и сгенерит экран твоими компонентами с правильными props.

### После выполнения (если делал Code Connect)

1. Покажи `tree shared/ui/` — пары `<Component>.tsx` + `<Component>.figma.tsx`.
2. Покажи скриншот секции Dev Resources в Figma — там React-сниппет.
3. Зафиксируй ADR в `../../product/docs/memory/decisions/ADR-XXX-code-connect.md`: что настроен Code Connect, зачем (автоматизация подстановки компонентов), когда обновлять (новый компонент → новый `*.figma.tsx` + `npx figma connect publish`).

### Почему PAT, а не OAuth MCP

Code Connect — отдельный инструмент Figma для **публикации** маппинга, работает через REST API с PAT. MCP — для чтения дизайна в агенте, Code Connect — для пуша маппинга. Токены разные. PAT хранится только в `.env.local`, в git не попадает, в чат не даём.
