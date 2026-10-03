# Lesson 7 — Промт 06: PostToolUse hook против хардкода (дизайн + данные)

> **Universal AI prompt.** Hooks (PostToolUse и др.) существуют только в Claude Code. В OpenAI Codex и Cursor нативных hooks нет — эквивалент собирается через правила в `AGENTS.md` (см. альтернативу в конце промта).

> **Цель (Claude Code):** после каждой правки UI-файла (`app/`, `widgets/`, `features/`, `pages/`) автоматически идёт grep на хардкод — **стилей** (хексы/пиксели мимо DESIGN.md) и **данных** (инлайн-моки/массивы, которым место в БД через `entities/api`) — алерт если нашёлся.

> **Цель (Codex / Cursor):** в `AGENTS.md` добавлено правило-инструкция «после правки UI-файла — пройди grep на хардкод стилей и данных и сообщи». AI применяет каждый раз когда читает AGENTS.md.

---

## Шаг 0 — Определи окружение

| Если ты | Делай |
|---|---|
| **Claude Code** | Полный workflow ниже (создание PostToolUse hook'а в `.claude/hooks/`, регистрация в `.claude/settings.json`) |
| **Codex / Cursor / другой AI без hooks** | Пропусти всё про shell. Добавь в `AGENTS.md` правило в секцию «UI-правила»: «После каждой записи `.tsx`/`.jsx` файла в `app/`/`widgets/`/`features/`/`pages/` — прогни grep на хардкод стилей (`#[0-9a-fA-F]{3,8}`, `[\d+px]`) и данных (`const (mock|dummy|fake|sample|fixture)\w*`, инлайн `= [ {`). Если найдено — сообщи warning, не блокируй. Продуктовые данные должны идти из БД через `entities/api`, статику можно оставить». |

---

## Промт (для Claude Code)

```
Hook PostToolUse — детерминированная страховка от того, что AI «забывает» правило
ui-components-first в шуме длинной сессии. После каждой правки UI-файла —
автоматический grep на хардкод. Найдено — warning в выводе.

ШАГ 1 — Создай ../../.claude/hooks/post-tool-use-edit.sh:

#!/usr/bin/env bash
set -euo pipefail

FILEPATH="${1:-}"

# Применяем только к UI-файлам (entities/ сюда НЕ входит — там данным место)
case "$FILEPATH" in
  *src/app/*|*src/pages/*|*src/widgets/*|*src/features/*|*app/*)
    [ -f "$FILEPATH" ] || exit 0

    # 1) Дизайн-хардкод: хексы (#abc) и пиксели ([16px]) в обход токенов DESIGN.md
    if grep -E '#[0-9a-fA-F]{3,8}|\[\d+px\]' "$FILEPATH" > /dev/null 2>&1; then
      echo ""
      echo "⚠️  POST-HOOK warning: в файле $FILEPATH найден хардкод стилей"
      echo "   Хексы (#abc) или пиксели ([16px]) в обход токенов DESIGN.md."
      grep -nE '#[0-9a-fA-F]{3,8}|\[\d+px\]' "$FILEPATH" | head -10
      echo "   Правило ui-components-first: токены из DESIGN.md или variant в shared/ui."
    fi

    # 2) Хардкод данных: инлайн-моки/массивы в компоненте (данным место в БД через entities/api)
    if grep -nE 'const +(mock|dummy|fake|sample|fixture|test|placeholder)[A-Za-z0-9_]*' "$FILEPATH" > /dev/null 2>&1 \
       || grep -nE '=\s*\[\s*\{' "$FILEPATH" > /dev/null 2>&1; then
      echo ""
      echo "⚠️  POST-HOOK warning: в файле $FILEPATH похоже на захардкоженные данные"
      echo "   Инлайн-массив объектов или mock/dummy/fixture-переменная в компоненте."
      grep -nE 'const +(mock|dummy|fake|sample|fixture|test|placeholder)[A-Za-z0-9_]*|=\s*\[\s*\{' "$FILEPATH" | head -10
      echo "   Продуктовые данные должны идти из БД через entities/<entity>/api/, не лежать в компоненте."
      echo "   (Статику — навигацию, опции селекта, тексты — оставлять можно, это эвристика.)"
      # Не блокируем (это PostToolUse), warning виден
    fi
    ;;
esac

exit 0

chmod +x ../../.claude/hooks/post-tool-use-edit.sh

ШАГ 2 — Зарегистрируй в ../../.claude/settings.json (раздел "PostToolUse"):

{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-bash.sh\"" }] },
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-write.sh\"" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/post-tool-use-edit.sh\"" }] }
    ]
  }
}

⚠️ Схема вложенная (`matcher` + `hooks[]` с `type: "command"`) и путь через
`$CLAUDE_PROJECT_DIR` — плоский вариант Claude Code молча игнорирует.

ШАГ 3 — Тест.

Попроси Claude:

1. Временно записать в ../../product/development/apps/app/src/widgets/header/ui/Header.tsx (или другой UI-файл) строку
   с хардкодом:
   `<div className="bg-[#FF0000]">test</div>`

2. После записи hook должен напечатать warning со списком найденных хардкодов

3. Откати правку

ШАГ 4 — Обнови ../../product/docs/rules/hooks-guardrails.md, добавь раздел:

### .claude/hooks/post-tool-use-edit.sh

После каждой правки файла в src/app/, src/pages/, src/widgets/, src/features/
автоматически идёт grep на: (1) хардкод стилей — хексы (`#abc`) и пиксели
(`[16px]`); (2) хардкод данных — mock/dummy/fixture-переменные и инлайн-массивы
объектов (`= [ {`), которым место в БД через entities/api.
Найдено — warning, но НЕ блокировка (это PostToolUse, оно не может откатить).
Проверка данных эвристическая: статику (навигация, опции, тексты) можно оставлять.

Это второй слой защиты после правил ui-components-first и «данные из БД через
entities/api». Помогает когда AI «забыл» правило в шуме длинной сессии.

ПОКАЖИ МНЕ:
- Содержимое ../../.claude/hooks/post-tool-use-edit.sh
- Содержимое ../../.claude/settings.json (с PostToolUse)
- Демонстрация warning'а на тестовой правке
```

---

## Дополнительно: подсказка решений при чтении файлов

Ещё один PreToolUse hook — срабатывает когда Claude читает файл из ключевых путей
(`src/`, `../../product/docs/rules/`, `docs/`) и подсказывает: есть ли в памяти ADR на эту тему.

```
Добавь hook ../../.claude/hooks/pre-read-suggest.sh:

#!/usr/bin/env bash
# Когда Claude читает файл — ищем в памяти ADR которые могут быть релевантны.

FILEPATH="${1:-}"
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Применяем только к файлам внутри src/ или docs/rules/
case "$FILEPATH" in
  *src/*|*/docs/rules/*|*docs/*)
    : # продолжаем
    ;;
  *)
    exit 0
    ;;
esac

# Извлекаем ключевые слова из пути файла (имя файла без расширения и папки)
BASENAME=$(basename "$FILEPATH" | sed 's/\.[^.]*$//' | tr '[:upper:]' '[:lower:]' | tr '-_' '  ')

# Ищем в INDEX.md совпадения (если INDEX.md существует)
INDEX="$ROOT/product/docs/memory/INDEX.md"
if [ ! -f "$INDEX" ]; then
  exit 0
fi

MATCHES=""
for KEYWORD in $BASENAME; do
  [ ${#KEYWORD} -lt 4 ] && continue  # короткие слова пропускаем
  FOUND=$(grep -i "$KEYWORD" "$INDEX" 2>/dev/null | head -3)
  if [ -n "$FOUND" ]; then
    MATCHES="$MATCHES$FOUND\n"
  fi
done

if [ -n "$MATCHES" ]; then
  echo "💡 Возможно релевантные решения из памяти для $FILEPATH:"
  echo "$MATCHES"
fi

exit 0

chmod +x ../../.claude/hooks/pre-read-suggest.sh

Зарегистрируй в ../../.claude/settings.json в PreToolUse:

{ "matcher": "Read", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-read-suggest.sh\"" }] }

Тест: попроси Claude прочитать ../../product/development/apps/app/src/lib/auth.ts — если в INDEX.md есть ADR про авторизацию,
hook должен вывести подсказку об этом ADR.
```

---

## Хуки — не только от хардкода

Хук — это общий механизм guardrail'ов: маленький скрипт, который AI запускает автоматически в нужный момент (`PreToolUse` — до действия, можно блокировать; `PostToolUse` — после, удобно предупреждать). Хардкод — лишь один пример. На том же событии `Edit|Write` можно повесить и другие проверки — добавляй их в массив (хуки одного события выполняются вместе, не перезатирая друг друга):

- **Безопасность.** PostToolUse-предупреждение при правке чувствительных файлов (`**/auth*`, `**/middleware*`, `**/api/**`, миграции): «затронута security-зона, прогони `/security-check` перед коммитом». Часть уже есть из Урока 3 (security-reminder + счётчик правок); сюда же — grep на типовые анти-паттерны: логирование секретов, `dangerouslySetInnerHTML`, отключённый eslint/проверки, `process.env` с приватным ключом в клиентском файле.
- **Опасные команды и запись секретов** (PreToolUse, блокирующие): `pre-tool-use-bash.sh` режет `rm -rf` и подобное, `pre-tool-use-write.sh` не даёт записать реальный `.env`/ключ. Уже из Урока 3 — механизм тот же.
- **Доступность / UI-инварианты.** PostToolUse-grep на кликабельные `<div>` без `cursor: pointer`/hover и на `<img>` без `alt` — мягкое напоминание.
- **Тест-гейт.** Pre-push хук (Задание 5) гоняет `test:all` и блокирует push при красных тестах.

Рецепт «добавь свой хук»: опиши AI событие (`PreToolUse`/`PostToolUse` + matcher вроде `Edit|Write`), что проверять (grep-паттерн или условие по пути) и реакцию (warning в stderr / `exit 1` для блокировки) — он создаст скрипт в `.claude/hooks/`, зарегистрирует в `.claude/settings.json` (обёртки в корне воркспейса) и допишет `../../product/docs/rules/hooks-guardrails.md`. Принцип: PreToolUse — когда действие нужно **запретить** (опасная команда, секрет); PostToolUse — когда достаточно **предупредить** (хардкод, security-зона, a11y), чтобы AI ещё мог показать diff.

---

## Edge cases

- Hook видит файл по пути в первом аргументе. Если структура отличается (например, `app/` без `src/`) — поправь паттерн в case
- Если правка идёт в файле, который не UI (например, `prisma/schema.prisma`) — hook ничего не делает, exit 0
- Hook **не блокирует** правку — это PostToolUse. Если хочется блокировать — это PreToolUse (но тогда Claude не сможет показать diff пользователю)
- `pre-read-suggest.sh` работает на эвристике по именам слов — может давать нерелевантные подсказки. Это нормально: лишняя подсказка лучше чем пропущенный ADR

