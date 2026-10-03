# Lesson 3 — Промт 07: PreToolUse hooks (защита от опасных команд и записи секретов)

> **Universal AI prompt.** Hooks — кросс-тул механизм, а не фишка одного редактора. Они есть в Claude Code (`.claude/settings.json` + `.claude/hooks/`), в OpenAI Codex (`.codex/hooks.json` или `[hooks]` в `.codex/config.toml` — имена событий почти один-в-один: `PreToolUse`, `PostToolUse`, `SessionStart`, `PreCompact`) и в Cursor 1.7+ (`.cursor/hooks.json` — события `beforeShellExecution`, `afterFileEdit`, `preToolUse`/`postToolUse`, `sessionStart`). Сами shell-скрипты ниже переносятся между ними почти без изменений — меняется путь конфига и способ регистрации. Для редких инструментов совсем без хуков — текстовый fallback через `AGENTS.md`. Смотри блок «Шаг 0 — Определи окружение» ниже.

> **Цель (Claude Code / Codex / Cursor):** лежат два shell-hook'а: блокировка опасных команд (`rm -rf /`, `git push --force main`) и блокировка записи секретов (`sk-`, `ghp_`, `AKIA...`) в код. Один и тот же скрипт, разный файл конфига.

> **Цель (инструмент без хуков):** в `AGENTS.md` добавлены строгие правила-эквиваленты, которые AI читает в начале каждой сессии и применяет как блокировку.

> **Универсальный слой поверх всех:** git-хук `pre-commit` (наш spec-gate из промта `02-git-github.md`) срабатывает при любом коммите независимо от AI. Туда же вешается секрет-сканер `gitleaks` — это защита, которую нельзя обойти, не отключив её руками.

---

## Шаг 0 — Определи окружение

| Если ты | Делай |
|---|---|
| **Claude Code** | Полный workflow ниже: создай shell-хуки в `.claude/hooks/`, зарегистрируй в `.claude/settings.json` (событие `PreToolUse`, matcher `Bash` / `Edit\|Write`). |
| **OpenAI Codex** | Те же shell-хуки, но зарегистрируй их в `.codex/hooks.json` (или `[hooks]` в `.codex/config.toml`). События и matcher почти как у Claude Code: `PreToolUse` + matcher `"Bash"`. Блокировка — `exit 2` или JSON `permissionDecision: "deny"`. После добавления подтверди хуки через `/hooks`. |
| **Cursor (1.7+)** | Те же shell-хуки, конфиг `.cursor/hooks.json`. События называются иначе: `beforeShellExecution` (вместо bash-проверки), `afterFileEdit`/`preToolUse` (вместо write-проверки). Блокировка — `exit 2` или JSON `{"permission":"deny"}`. Можно выставить `"failClosed": true`, чтобы блокировать даже при падении самого хука. |
| **Другой AI совсем без hooks** | Пропусти shell-файлы. Добавь в корневой `AGENTS.md` секцию «Hard rules» с правилами-эквивалентами (см. альтернативу в конце промта). Эффект тот же, но через инструкцию AI, а не через детерминированный shell-блок — слой слабее. |

---

## Промт (для Claude Code)

```
Hooks — детерминированный слой защиты. Правило в CLAUDE.md можно проигнорировать
в шуме длинной сессии. Hook — shell-скрипт, выполняется всегда, без вариантов.

Создай два hook'а.

ШАГ 1 — ../../.claude/hooks/pre-tool-use-bash.sh

#!/usr/bin/env bash
set -euo pipefail

BLOCKED_PATTERNS=(
  'rm -rf /'
  'rm -rf ~'
  'rm -rf \.\.'
  'rm -rf /var'
  'rm -rf /etc'
  'rm -rf /usr'
  'rm -rf /home'
  'git push --force.*main'
  'git push -f.*main'
  'git push --force.*master'
  'git push -f.*master'
  'git reset --hard.*origin/main'
  'git reset --hard.*origin/master'
  ':(){ :|:& };:'
  'mkfs\.|dd if=.*of=/dev/'
  'chmod -R 777 /'
  'chown -R'
)

CMD="$1"

for pattern in "${BLOCKED_PATTERNS[@]}"; do
  if echo "$CMD" | grep -qE "$pattern"; then
    echo "🔴 BLOCKED by hook: команда содержит опасный паттерн '$pattern'"
    echo "   Если действие действительно нужно — попроси пользователя"
    echo "   выполнить руками."
    exit 1
  fi
done

exit 0

chmod +x ../../.claude/hooks/pre-tool-use-bash.sh

ШАГ 2 — ../../.claude/hooks/pre-tool-use-write.sh

#!/usr/bin/env bash
set -euo pipefail

CONTENT="$2"

SECRET_PATTERNS=(
  'sk-[A-Za-z0-9]{20,}'
  'sk_live_[A-Za-z0-9]{24,}'
  'sk_test_[A-Za-z0-9]{24,}'
  'pk_live_[A-Za-z0-9]{24,}'
  'ghp_[A-Za-z0-9]{36}'
  'gho_[A-Za-z0-9]{36}'
  'github_pat_[A-Za-z0-9_]{82}'
  'AKIA[0-9A-Z]{16}'
  'ASIA[0-9A-Z]{16}'
  'glpat-[A-Za-z0-9_-]{20}'
  'xox[bp]-[0-9]+-[A-Za-z0-9]+'
  'AIzaSy[A-Za-z0-9_-]{33}'
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  if echo "$CONTENT" | grep -qE "$pattern"; then
    echo "🔴 BLOCKED by hook: попытка записать секрет в файл"
    echo "   Найден паттерн '$pattern'"
    echo "   Секреты живут в .env.local / .env.production, не в коде."
    echo "   Если это пример или тестовый ключ — закодируй его иначе"
    echo "   (placeholder в README, не реальный ключ)."
    exit 1
  fi
done

exit 0

chmod +x ../../.claude/hooks/pre-tool-use-write.sh

ШАГ 3 — Зарегистрируй в ../../.claude/settings.json:

{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-bash.sh\"" }] },
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-write.sh\"" }] }
    ]
  }
}

⚠️ Схема обязательно ВЛОЖЕННАЯ: `matcher` + массив `hooks` с `type: "command"`.
Плоский вариант (`"command"` прямо на matcher'е, без `hooks[]`) Claude Code **молча
игнорирует** — хук не зарегистрируется и не сработает. Путь — через `$CLAUDE_PROJECT_DIR`
(абсолютный от корня воркспейса), а не голый `.claude/...`: голый путь резолвится от cwd
запуска и ломается, если Claude открыт не из корня.

(Если SessionStart hook был зарегистрирован раньше — оставь, добавь PreToolUse
к существующей структуре hooks в той же вложенной схеме.)

ШАГ 4 — Тест.

Тест опасных команд:

1. Попроси Claude выполнить `rm -rf /tmp/non-existent-dir-test` — должно ВЫПОЛНИТЬСЯ
   (нет паттерна `rm -rf /` или `rm -rf ~`)

2. Попроси Claude выполнить `rm -rf ..` — должен ЗАБЛОКИРОВАТЬ hook

3. Попроси Claude выполнить `git push --force origin main` — должен ЗАБЛОКИРОВАТЬ

Тест секретов:

1. Попроси Claude временно записать в файл ../../product/src/test.ts строку:
   `const key = "sk-test-thisIsLongEnoughToTrigger12345678";`
   Должен ЗАБЛОКИРОВАТЬ запись

2. Откати файл если был создан

Покажи мне вывод hook'ов в обоих случаях.

ШАГ 5 — Создай ../../product/docs/rules/hooks-guardrails.md с описанием:

# Hooks — детерминированная защита

## Принцип
Hook — shell-скрипт, выполняется системой Claude Code в ключевых точках:
- SessionStart — при старте сессии (загрузка памяти)
- PreToolUse — перед выполнением tool (Bash / Edit / Write)
- PostToolUse — после выполнения (на этапе защиты от регрессий добавим post-tool-use-edit для grep на хардкод)

Срабатывает ВСЕГДА. Не зависит от того, прочитал ли AI правило в шуме длинного контекста.

## Текущие hooks

### .claude/hooks/session-start.sh
Лёгкий статус памяти при старте. Подсвечивает state / INDEX / context, не делает cat.

### .claude/hooks/pre-tool-use-bash.sh
Блокирует опасные команды (rm -rf /, git push --force main, dd if=, ...).
exit 1 → команда не выполняется.

### .claude/hooks/pre-tool-use-write.sh
Блокирует запись секретов в код (sk-, ghp_, AKIA, и т.д.).

## Когда ослаблять
Если hook ложно блокирует (например, нужно реально записать sk-test для документации) —
выйди из проекта в другую папку или временно закомментируй паттерн в hook (с
обязательным восстановлением после).

НЕ отключай hook через --no-verify или подобное — это бьёт по защите везде.

ПОКАЖИ МНЕ:
- Содержимое ../../.claude/settings.json (чтобы убедиться что hooks зарегистрированы корректно)
- tree ../../.claude/hooks/
```

---

## Дополнительные hooks: снимок состояния и защита от потери контекста

Два hook'а для более долгих сессий — когда работа идёт часами и есть риск, что Claude
«забудет» что было в начале сессии из-за компрессии контекста.

```
Добавь ещё два hook'а.

ШАГ 6 — ../../.claude/hooks/pre-compact-snapshot.sh
(срабатывает перед тем как Claude Code сжимает контекст сессии)

#!/usr/bin/env bash
# Сохраняет снимок состояния проекта перед компрессией контекста.
# Следующая сессия может прочитать снимок и понять что изменилось.

# Корень воркспейса: при запуске хука Claude'ом — $CLAUDE_PROJECT_DIR; при ручном
# прогоне из shell — на два уровня выше самого хука (.claude/hooks/ → ../.. = корень).
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

SNAPSHOT_DIR="$ROOT/product/docs/memory/snapshots"
mkdir -p "$SNAPSHOT_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
OUTFILE="$SNAPSHOT_DIR/$TIMESTAMP.json"

# state.md продукта — в студенческой раскладке единственный, фиксированный путь
STATE_FILE="$ROOT/product/docs/memory/state.md"

STATE_CONTENT=""
if [ -n "$STATE_FILE" ] && [ -f "$STATE_FILE" ]; then
  STATE_CONTENT=$(head -c 8000 "$STATE_FILE" | sed 's/"/\\"/g; s/$/\\n/' | tr -d '\n')
fi

# Последние 10 коммитов
GIT_LOG=$(git log --oneline -10 2>/dev/null | sed 's/"/\\"/g' | tr '\n' '|')

# Незакоммиченные файлы
DIRTY=$(git status --short 2>/dev/null | tr '\n' '|')

# Текущая ветка
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

cat > "$OUTFILE" <<EOF
{
  "timestamp": "$TIMESTAMP",
  "branch": "$BRANCH",
  "state_file": "$STATE_FILE",
  "state_content": "$STATE_CONTENT",
  "git_log": "$GIT_LOG",
  "dirty_files": "$DIRTY"
}
EOF

echo "📸 Снимок сохранён: $OUTFILE"

# LRU: оставляем последние 10 снимков
ls -t "$SNAPSHOT_DIR"/*.json 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

exit 0

chmod +x ../../.claude/hooks/pre-compact-snapshot.sh

ШАГ 7 — ../../.claude/hooks/context-alert.sh
(срабатывает после каждого инструмента; следит за длиной сессии и напоминает
сохранить прогресс, если сессия стала длинной)

#!/usr/bin/env bash
# После каждого Edit/Write/Bash — инкрементируем счётчик сессии.
# При достижении порога выводим напоминание обновить state.md.

COUNTER_FILE="/tmp/claude-session-call-count"
THRESHOLD=40   # после 40 инструментов в одной сессии

# Читаем текущий счётчик
COUNT=0
if [ -f "$COUNTER_FILE" ]; then
  COUNT=$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)
fi

COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

# Напоминание при достижении порога и далее каждые 20 вызовов
if [ "$COUNT" -eq "$THRESHOLD" ] || { [ "$COUNT" -gt "$THRESHOLD" ] && [ $(( (COUNT - THRESHOLD) % 20 )) -eq 0 ]; }; then
  echo ""
  echo "⏱️  НАПОМИНАНИЕ: сессия длинная ($COUNT инструментов)."
  echo "   Обнови product/docs/memory/state.md — что сделано, что осталось."
  echo "   Это позволит восстановить контекст если сессия прервётся."
  echo ""
fi

exit 0

chmod +x ../../.claude/hooks/context-alert.sh

ШАГ 8 — Добавь новые hooks в ../../.claude/settings.json:

{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"" }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-compact-snapshot.sh\"" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-bash.sh\"" }] },
      { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-use-write.sh\"" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|Bash", "hooks": [{ "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/context-alert.sh\"" }] }
    ]
  }
}

ШАГ 9 — Добавь ../../product/docs/memory/snapshots/ в ../../product/.gitignore:

echo "../../product/docs/memory/snapshots/" >> ../../product/.gitignore

ШАГ 10 — Проверь что всё работает:

1. Запусти Claude Code в проекте, сделай несколько вещей (Edit / Bash)

2. Когда достигнешь 40 вызовов — должно появиться напоминание обновить state.md

3. В Claude Code: /compact — должен сработать PreCompact hook и появиться файл
   ../../product/docs/memory/snapshots/<timestamp>.json

4. Проверь содержимое снимка: cat ../../product/docs/memory/snapshots/*.json | tail -1 | python3 -m json.tool

ПОКАЖИ МНЕ:
- tree ../../.claude/hooks/
- Содержимое ../../.claude/settings.json
- Список файлов в ../../product/docs/memory/snapshots/ после первого компакта
```

Обнови `../../product/docs/rules/hooks-guardrails.md` — добавь два новых hook'а в раздел «Текущие hooks»:

```
### .claude/hooks/pre-compact-snapshot.sh
Срабатывает перед компрессией контекста (PreCompact). Сохраняет:
- содержимое state.md активного проекта
- последние 10 коммитов git log
- список незакоммиченных файлов
- текущую ветку

Хранит в ../../product/docs/memory/snapshots/<timestamp>.json. Автоматически удаляет
старые снимки, оставляя последние 10. Папка snapshots/ в .gitignore —
снимки локальные, не синхронизируются.

### .claude/hooks/context-alert.sh
PostToolUse: после каждого Edit/Write/Bash инкрементирует счётчик в /tmp.
После 40 вызовов (и каждые 20 после) — выводит напоминание обновить state.md.
Это прокси-метрика длины сессии, не точный счётчик токенов.
```

---

## Хуки-напоминалки: вовремя прогнать `/security-check`

> **Зачем, если блокирующие хуки уже есть.** Блокирующие хуки выше ловят катастрофу по шаблону (`rm -rf`, секрет в коде). Логические дыры — обход прав, доступ к чужим данным, инъекции — шаблоном не ловятся: их находит скилл `/security-check` (а в Claude Code ещё и плагин `security-guidance`, который платный и работает только в Claude Code). Про аудит легко забыть в потоке работы. Эти два хука ничего не блокируют — они **напоминают** прогнать `/security-check`, когда правок в чувствительных местах накопилось много или перед коммитом. Тот же механизм хуков, что выше, — значит работает в любом AI, и на Codex это вообще основной автоматический слой (плагина там нет).

```
Добавь ещё два хука-напоминалки и маркер-обёртку. Они НЕ блокируют, только пишут напоминание.

ШАГ 11 — ../../.claude/scripts/security-check-mark.sh
(маркер «аудит прогнан недавно»; скилл /security-check вызывает его в конце,
маркер глушит напоминания на 10 минут, чтобы не дёргали сразу после аудита)

#!/usr/bin/env bash
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
mkdir -p "$ROOT/.claude/.cache"
date +%s > "$ROOT/.claude/.cache/security-check-mark"
exit 0

chmod +x ../../.claude/scripts/security-check-mark.sh

ШАГ 12 — ../../.claude/hooks/pre-tool-use-security-reminder.sh
(PreToolUse matcher Bash; перед git commit/push смотрит, идут ли в коммит
security-relevant файлы, и если аудит давно не прогоняли — напоминает)

#!/usr/bin/env bash
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
CMD="${1:-}"
echo "$CMD" | grep -qE 'git (commit|push)' || exit 0

MARK="$ROOT/.claude/.cache/security-check-mark"
if [ -f "$MARK" ]; then
  AGE=$(( $(date +%s) - $(cat "$MARK" 2>/dev/null || echo 0) ))
  [ "$AGE" -lt 600 ] && exit 0
fi

FILES=$(git diff --cached --name-only 2>/dev/null || true)
if echo "$FILES" | grep -qE '\.(ts|tsx|py|prisma|sql|env|sh)$'; then
  echo "🟡 В коммит идут security-relevant правки, а /security-check давно не прогоняли."
  echo "   Прогони /security-check по diff перед коммитом."
fi
exit 0   # никогда не блокирует — только напоминает

chmod +x ../../.claude/hooks/pre-tool-use-security-reminder.sh

ШАГ 13 — ../../.claude/hooks/post-tool-use-security-counter.sh
(PostToolUse matcher Edit|Write|MultiEdit; считает правки в чувствительных
местах и после 5 без аудита напоминает, не дожидаясь коммита)

#!/usr/bin/env bash
set -euo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
FILE="${1:-}"
echo "$FILE" | grep -qE 'src/app/|pages/api/|src/middleware|prisma/schema\.prisma|\.env' || exit 0

MARK="$ROOT/.claude/.cache/security-check-mark"
if [ -f "$MARK" ]; then
  AGE=$(( $(date +%s) - $(cat "$MARK" 2>/dev/null || echo 0) ))
  [ "$AGE" -lt 600 ] && exit 0
fi

mkdir -p "$ROOT/.claude/.cache"
CNT="$ROOT/.claude/.cache/security-edit-count"
N=$(( $(cat "$CNT" 2>/dev/null || echo 0) + 1 ))
echo "$N" > "$CNT"
if [ "$N" -ge 5 ]; then
  echo "🟡 Накопилось $N правок в security-relevant местах без /security-check."
  echo "   Прогони /security-check, не дожидаясь коммита."
  echo 0 > "$CNT"
fi
exit 0

chmod +x ../../.claude/hooks/post-tool-use-security-counter.sh

ШАГ 14 — зарегистрируй рядом с существующими хуками (НЕ вместо них):
- Claude Code → ../../.claude/settings.json:
    PreToolUse  matcher "Bash"                 → pre-tool-use-security-reminder.sh
    PostToolUse matcher "Edit|Write|MultiEdit" → post-tool-use-security-counter.sh
- Codex → ../../.codex/hooks.json (те же события), подтверди через /hooks
- Cursor → ../../.cursor/hooks.json (beforeShellExecution / afterFileEdit)
- Инструмент без хуков → пропусти скрипты, добавь в AGENTS.md правило:
    «после ≥5 security-relevant правок или перед коммитом — прогони /security-check».

ШАГ 15 — добавь .claude/.cache/ в ../../product/.gitignore (маркер и счётчик локальные):

echo ".claude/.cache/" >> ../../product/.gitignore

ПОКАЖИ МНЕ:
- tree ../../.claude/hooks/ ../../.claude/scripts/
- фрагмент ../../.claude/settings.json с напоминалками
```

Добавь оба хука в `../../product/docs/rules/hooks-guardrails.md` (раздел «Текущие hooks»):

```
### .claude/hooks/pre-tool-use-security-reminder.sh
PreToolUse (Bash): перед git commit/push, если в коммит идут security-relevant
файлы и /security-check давно не прогоняли — напоминает. Не блокирует.

### .claude/hooks/post-tool-use-security-counter.sh
PostToolUse (Edit|Write|MultiEdit): считает правки в src/app/, pages/api/,
src/middleware, prisma/schema.prisma. После 5 без аудита — напоминает. Маркер
.claude/.cache/security-check-mark (его обновляет /security-check) глушит
напоминания на 10 минут.
```

---

## Edge cases

- Hooks работают нативно в Claude Code, Codex и Cursor — у каждого свой файл конфига (`.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`). Только у редких инструментов совсем без хуков остаётся текстовый fallback через `AGENTS.md` (см. блок ниже).
- Если hook падает с синтаксической ошибкой shell — отлаживай через `bash -n ../../.claude/hooks/<file>.sh` локально
- Паттерны можно расширять. Но осторожно — слишком жёсткие → ложные срабатывания → пользователь начнёт обходить

---

## Альтернатива для AI совсем без hooks (fallback)

> У Claude Code, Codex и Cursor хуки есть нативно — для них используй блоки выше, а не этот fallback. Эта секция нужна только для инструментов, где хуков нет вообще.

Если у твоего инструмента нет поддержки hooks — собери эквивалентную защиту через правила в `AGENTS.md` корня проекта. AI читает `AGENTS.md` в начале каждой сессии и держит правила в контексте. Это самый слабый слой: правило можно пропустить в шуме длинной сессии. Поэтому продублируй критичное на уровне git — `pre-commit`-хук со spec-gate и секрет-сканером `gitleaks` срабатывает при любом коммите независимо от AI.

Добавь в `AGENTS.md` секцию:

```markdown
## Hard rules — никогда не нарушай

### Запрещённые команды (автоматическая блокировка)
Никогда не выполняй и не предлагай эти команды:
- `rm -rf /`, `rm -rf ~`, `rm -rf ~/` — катастрофические удаления
- `git push --force` в `main` / `master` — затирает чужие коммиты
- `git push -f origin main` — то же самое
- `git reset --hard origin/main` без явного подтверждения пользователя
- `sudo` без явного контекста зачем

Если пользователь явно запросил такую команду — переспроси «Ты уверен? Это деструктивно и необратимо» и продолжи только после двойного подтверждения.

### Запрещённая запись (защита от утечки секретов)
Никогда не записывай в файлы (Edit, Write, MultiEdit) значения соответствующие этим паттернам:
- `sk-[A-Za-z0-9]{20,}` — OpenAI/Stripe/Anthropic API ключи
- `ghp_[A-Za-z0-9]{36}` — GitHub Personal Access Token
- `gho_[A-Za-z0-9]{36}` — GitHub OAuth token
- `glpat-[A-Za-z0-9_-]{20}` — GitLab PAT
- `AKIA[0-9A-Z]{16}` — AWS Access Key ID
- `xox[bp]-[0-9]+-[A-Za-z0-9]+` — Slack token
- `sk_live_`, `pk_live_` — Stripe live keys

Если такой паттерн встретился — остановись, попроси пользователя положить значение в `.env*` (с правами 600) и используй вместо хардкода через `process.env.X`.

### Защита от перезаписи .env
Никогда не редактируй `.env`, `.env.local`, `.env.production` без явного подтверждения пользователя. Эти файлы содержат секреты и должны меняться руками.
```

Эта секция в AGENTS.md = текстовый эквивалент hooks. Качество защиты ниже (AI может «забыть» правило в шуме длинной сессии — hooks работают всегда без вариантов), но базовая защита есть.

Дополнительно для Codex (даже несмотря на нативные хуки) — настрой `approval_policy` для `rm`, `git push --force`, `sudo` (требовать всегда подтверждение). См. документацию Codex по approval levels.

Snapshot контекста и context-alert (Шаги 6-8) — Claude Code-specific, для других AI пропусти.


---

> 🛑 **СТОП — конец шага.** Этот промт выполнен. Не переходи к следующему промту или шагу, не предлагай «давай дальше сделаем X», не пересказывай, что идёт дальше по уроку. Темп задаёт пользователь — он сам откроет следующий шаг в `lesson.md`, когда будет готов. Сейчас покажи результат этого шага и остановись, дождись команды пользователя.
