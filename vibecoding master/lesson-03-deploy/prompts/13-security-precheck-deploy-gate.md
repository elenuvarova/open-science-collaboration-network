# Lesson 3 — Промт 11: Pre-deploy security gate (`security-precheck.sh`)

> **Цель:** в `../../product/scripts/security-precheck.sh` лежит быстрый bash-скрипт, который запускается до деплоя и блокирует его при найденных секретах в коде, .env в репо, опасных next.config флагах. Аналогия с `npm run build` — стало стандартом, никто не сомневается; security-precheck должен быть таким же стандартом.

> **Не путать с `/security-check`:** AI-полный аудит — глубокий ручной (Промт 10). Pre-check — быстрый автоматический. Они дополняют друг друга.

---

## Промт

```
Установи в проект быстрый pre-deploy gate безопасности.

ШАГ 1 — Создай ../../product/scripts/security-precheck.sh со следующим содержимым:

  #!/usr/bin/env bash
  # Pre-deploy security gate. Запускается до деплоя. Exit 1 → деплой блокируется.
  # 6 проверок:
  #  1. Секреты в коде (API keys, tokens, AWS, GitHub PAT)
  #  2. .env файлы НЕ в репо
  #  3. console.log / debugger в production коде
  #  4. Права на .env.production (≤ 600)
  #  5. Опасные next.config флаги (ignoreBuildErrors / ignoreDuringBuilds)
  #  6. Незакрытые TODO про security

  set -e

  ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  cd "$ROOT"

  ERRORS=0
  WARNINGS=0

  echo "🔍 Security pre-check — $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""

  # ---- 1. Секреты в коде ----
  echo "▶  1. Секреты в коде"
  SECRET_PATTERNS=(
    'sk-[A-Za-z0-9]{20,}'
    'sk_live_[A-Za-z0-9]{24,}'
    'pk_live_[A-Za-z0-9]{24,}'
    'ghp_[A-Za-z0-9]{36}'
    'gho_[A-Za-z0-9]{36}'
    'github_pat_[A-Za-z0-9_]{82}'
    'AKIA[0-9A-Z]{16}'
    'glpat-[A-Za-z0-9_-]{20}'
    'xox[bp]-[0-9]+-[A-Za-z0-9]+'
    'AIzaSy[A-Za-z0-9_-]{33}'
  )
  SCAN_PATHS="src app pages lib components scripts"
  for pattern in "${SECRET_PATTERNS[@]}"; do
    HITS=$(grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' --include='*.json' \
      --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
      "$pattern" $SCAN_PATHS 2>/dev/null || true)
    if [ -n "$HITS" ]; then
      echo "  🔴 Найден секрет (паттерн: $pattern):"
      echo "$HITS" | head -5 | sed 's/^/      /'
      ERRORS=$((ERRORS+1))
    fi
  done

  # ---- 2. .env в репо ----
  echo "▶  2. .env в git"
  ENV_IN_REPO=$(git ls-files | grep -E '^\.env(\..*)?$' | grep -v '^\.env\.example$' || true)
  if [ -n "$ENV_IN_REPO" ]; then
    echo "  🔴 .env-файлы в git: $ENV_IN_REPO"
    echo "      → удали через git rm --cached <file>"
    ERRORS=$((ERRORS+1))
  else
    echo "  ✅ .env не закоммичены"
  fi

  # ---- 3. console.log / debugger в production коде ----
  echo "▶  3. Debug-код"
  DEBUG_HITS=$(grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git --exclude-dir=tests --exclude-dir=__tests__ \
    'console\.(log|debug)|debugger;' src app pages 2>/dev/null || true)
  if [ -n "$DEBUG_HITS" ]; then
    COUNT=$(echo "$DEBUG_HITS" | wc -l | tr -d ' ')
    echo "  ⚠️  Найдено $COUNT мест с console.log/debugger"
    echo "$DEBUG_HITS" | head -3 | sed 's/^/      /'
    WARNINGS=$((WARNINGS+1))
  else
    echo "  ✅ Без debug-кода"
  fi

  # ---- 4. Права на .env.production ----
  echo "▶  4. Права на .env.production"
  if [ -f .env.production ]; then
    PERMS=$(stat -c '%a' .env.production 2>/dev/null || stat -f '%Lp' .env.production 2>/dev/null)
    if [ "$PERMS" != "600" ] && [ "$PERMS" != "400" ]; then
      echo "  🔴 .env.production имеет права $PERMS, нужно 600"
      echo "      → chmod 600 .env.production"
      ERRORS=$((ERRORS+1))
    else
      echo "  ✅ Права .env.production: $PERMS"
    fi
  else
    echo "  ✅ .env.production отсутствует (это нормально для локалки)"
  fi

  # ---- 5. Опасные next.config флаги ----
  echo "▶  5. Опасные флаги в next.config"
  if [ -f next.config.js ] || [ -f next.config.mjs ] || [ -f next.config.ts ]; then
    DANGER_FLAGS=$(grep -rEn 'ignoreBuildErrors\s*:\s*true|ignoreDuringBuilds\s*:\s*true' next.config.* 2>/dev/null || true)
    if [ -n "$DANGER_FLAGS" ]; then
      echo "  🔴 Опасные флаги (отключают TS/lint в проде):"
      echo "$DANGER_FLAGS" | sed 's/^/      /'
      ERRORS=$((ERRORS+1))
    else
      echo "  ✅ Опасных флагов нет"
    fi
  fi

  # ---- 6. TODO про security ----
  echo "▶  6. Незакрытые TODO про security"
  SEC_TODOS=$(grep -rEn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
    --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.git \
    'TODO.*(?:security|auth|XSS|CSRF|inject|sanitize|escape|IDOR)' src app pages 2>/dev/null || true)
  if [ -n "$SEC_TODOS" ]; then
    echo "  ⚠️  TODO про security в коде (закрой до прода):"
    echo "$SEC_TODOS" | head -5 | sed 's/^/      /'
    WARNINGS=$((WARNINGS+1))
  else
    echo "  ✅ Нет открытых security-TODO"
  fi

  echo ""
  echo "─────────────────────────────────────"
  if [ $ERRORS -gt 0 ]; then
    echo "🔴 BLOCKED: $ERRORS критичных проблем — деплой остановлен."
    echo "   Почини и попробуй снова, или запусти /security-check для глубокого аудита."
    exit 1
  fi
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  $WARNINGS предупреждений — деплой продолжается. Разберись после."
  else
    echo "✅ Все проверки прошли."
  fi
  exit 0

После создания:
  chmod +x ../../product/scripts/security-precheck.sh

ШАГ 2 — Подключи к локальному ../../product/scripts/deploy-remote.sh.

В начало файла (ДО ssh-команды) добавь pre-check. Доступ к серверу скрипт
читает из .env.deploy, не хардкодит:

  echo "🔍 Local pre-check..."
  ./scripts/security-precheck.sh || exit 1

  echo "🚀 Triggering remote deploy..."
  set -a; source "$(dirname "$0")/../.env.deploy"; set +a
  ssh -i "${SSH_KEY_PATH/#\~/$HOME}" "$SERVER_USER@$SERVER_IP" "/var/www/<project>/deploy.sh"

ШАГ 3 — Подключи к remote /var/www/<project>/deploy.sh на сервере.

Подключись по SSH сам (доступ из .env.deploy, я ничего не набираю в терминал)
и отредактируй /var/www/<project>/deploy.sh.

В начало (ДО `docker compose up`) добавь блок. Если в `deploy.sh` есть `git pull`, ставь pre-check после обновления кода и до сборки. Если код доставляется иначе — после доставки кода и до сборки:

  #!/usr/bin/env bash
  set -euo pipefail
  cd /var/www/<project>

  git pull  # если стратегия деплоя использует git-based обновление

  # Pre-deploy security gate (новое)
  ./scripts/security-precheck.sh || {
    echo "❌ Security pre-check failed. Aborting deploy."
    exit 1
  }

  docker compose up -d --build
  docker compose exec -T web npx prisma migrate deploy
  echo "Deployed at $(date)"

ШАГ 4 — Тест (прогоняешь сам, я не набираю команды).

Локально запусти (из ../../product):
  (cd ../../product && ./scripts/security-precheck.sh)
  → должно пройти (если проект в норме)

Проверь, что блокировка работает: сам создай временный файл с фейковым
секретом, прогони precheck, убедись что он упал с 🔴 «Найден секрет», и убери
файл за собой:
  (создай) ../../product/src/test-security.ts со строкой const k = "sk-test12345678901234567890";
  (cd ../../product && ./scripts/security-precheck.sh)   → должно упасть
  (удали) ../../product/src/test-security.ts

Деплой (тоже сам):
  (cd ../../product && ./scripts/deploy-remote.sh)
  → security pre-check пройдёт локально, потом на сервере, потом docker compose

ШАГ 5 — Документируй в ../../product/docs/memory/infrastructure.md.

В разделе «Деплой» добавь:
  - Pre-deploy gate: ./scripts/security-precheck.sh (быстрая bash-проверка)
  - Полный AI-аудит: /security-check (по запросу)

ПОКАЖИ МНЕ:
- Содержимое ../../product/scripts/security-precheck.sh
- Обновлённый deploy.sh (фрагмент с гейтом)
- Обновлённый ../../product/scripts/deploy-remote.sh
- Результат прогона (✅ или 🔴/⚠️ с разбором)
- Тест с фейковым секретом — подтверждение что блокировка работает
```

---

## Зачем это сейчас

На этапе деплоя у пользователя впервые появляется `deploy.sh`. Это самый правильный момент встроить security gate — пока структура простая. Если оставить на финал, будет искушение «потом, когда всё работает» — и оно никогда не наступит.

В обычной разработке `npm run build` стал гейтом сам собой — никто не спорит. `security-precheck.sh` должен встать рядом.

## Edge cases

- На macOS `stat -c` не работает, на Linux работает. Скрипт пробует обе формы — должен работать на обеих ОС
- На больших репах (10k+ файлов) скрипт может занять 5-10 секунд. Это всё ещё быстрее чем `npm run build` — приемлемо
- Если в legitimate коде есть строка похожая на секрет (документация ключа или плейсхолдер) — false positive. Решение: сделать ключ короче 20 символов в плейсхолдере, или добавить исключение в pattern

## Связь с `/security-check` и месячным cron

Три механизма **дополняют** друг друга, не дублируют:

| | `security-precheck.sh` | `/security-check` | месячный cron |
|---|---|---|---|
| Тип | Bash, быстрый | AI, глубокий | Bash, серверный |
| Время | секунды | минуты | секунды |
| Запуск | автоматически (deploy gate) | вручную (по запросу) | автоматически (раз в месяц) |
| Покрывает | 6 типовых ошибок | 14 разделов чек-листа | 8 серверных проверок + регрессии |
| Чинит? | Нет, блокирует | Да, с подтверждением | Нет, шлёт отчёт |

Pre-check ловит 80% типовых проблем за секунды. AI-аудит ловит остальные 20% — архитектурные нюансы, IDOR, mass assignment. Месячный cron ловит регрессии (потерялись права, открылся порт) между ручными прогонами.


---

> 🛑 **СТОП — конец шага.** Этот промт выполнен. Не переходи к следующему промту или шагу, не предлагай «давай дальше сделаем X», не пересказывай, что идёт дальше по уроку. Темп задаёт пользователь — он сам откроет следующий шаг в `lesson.md`, когда будет готов. Сейчас покажи результат этого шага и остановись, дождись команды пользователя.
