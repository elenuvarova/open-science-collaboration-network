# Lesson 3 — Промт 06: Базовая безопасность — SSH-ключи, UFW, fail2ban, rate limiting

> **Цель:** SSH только по ключам, открыты только нужные порты, fail2ban защищает от перебора, rate limiting на API.

> **Что важно понять до настройки:** SSH-ключи на VPS — **тот же механизм**, что использовался для GitHub в Промте 01. Один ключ можно использовать для обоих, или сделать отдельные ключи для разных серверов. Концептуально — это пара "замок (публичный) + ключ (приватный)". Сервер хранит замок в ~/.ssh/authorized_keys, ноут хранит ключ в ~/.ssh/id_ed25519.

---

## Почему SSH-ключи безопаснее логин/пароля (если кратко)

Когда подключаешься к VPS через `ssh user@<IP>` без ключа — сервер просит пароль. Что плохо:
- Бот сканирует сеть, видит открытый 22 порт, начинает перебирать популярные пароли (root/root, admin/admin, root/123456). Час-два — найдёт слабый.
- Если пароль сложный — атака замедляется, но не блокируется. fail2ban помогает, но не панацея.
- Пароль передаётся при каждом подключении (даже зашифрованным каналом — в момент проверки на сервере он расшифровывается).

С SSH-ключом:
- Сервер хранит только **публичный** ключ — даже если БД сервера утечёт, атакующий не сможет войти.
- Приватный ключ **никогда не передаётся** по сети — только криптографическая подпись.
- Перебор практически невозможен — ed25519 ключ ~256 бит, компьютеру не хватит времени до конца Вселенной.

**Дополнительная защита:** passphrase на ключе. Если ноут потеряли — атакующему нужен и приватный ключ, и passphrase к нему.

---

## Промт

```
Настрой базовую безопасность сервера. Это 4 блока — пройди по очереди.
Доступ к серверу ты читаешь из .env.deploy и подключаешься по SSH сам.
Я ничего не ввожу в чат и в терминал, только заполняю значения в файлах.

БЛОК 1 — SSH только по ключам.

Перед началом убедись, что у меня уже есть SSH-ключ ~/.ssh/id_ed25519
(должен был сгенерироваться в Промте про GitHub; если нет — сгенерируй сам
командой ssh-keygen -t ed25519). Можно использовать тот же ключ что для
GitHub, или сделать отдельный для VPS — посоветуй.

Ключ, скорее всего, уже стоит на сервере — мы поставили его при настройке VPS
(prompts/05-vps-docker-compose.md, ШАГ 0.5), и в .env.deploy уже есть строка
SERVER_PASSWORD с паролем от провайдера. Сначала просто проверь вход по ключу.

1. Если вход по ключу уже работает (БЕЗ пароля) — сразу переходи к шагу 3
   (отключение пароля). Если ключа на сервере ещё нет (этот промт запущен без
   настройки VPS) — поставь его по паролю:
   - в .env.deploy должна быть строка SERVER_PASSWORD= с паролем root/sudo-юзера
     (его выдал провайдер). Если её нет — попроси меня вписать, в чат я пароль
     не пишу;
   - скопируй мой публичный ключ (sshpass, чтобы не вводить пароль руками; поставь
     sshpass сам, если его нет):
     sshpass -p "$SERVER_PASSWORD" ssh-copy-id -i <SSH_KEY_PATH>.pub <SERVER_USER>@<SERVER_IP>
   Это добавит мой публичный ключ в ~/.ssh/authorized_keys на сервере с правильными
   правами.

2. Проверь вход по ключу (подключись сам, без пароля):
   ssh по ключу должен пустить БЕЗ запроса пароля.

   Если просит пароль — проверь:
   - права на сервере: chmod 700 ~/.ssh; chmod 600 ~/.ssh/authorized_keys
   - права на ноуте: chmod 600 ~/.ssh/id_ed25519

3. Только после того как вход по ключу работает — выключи пароль.
   В /etc/ssh/sshd_config на сервере:
   PasswordAuthentication no
   PermitRootLogin no             # если работаем под root — сначала создай sudo-юзера, переключись
   PubkeyAuthentication yes
   Protocol 2

4. sudo systemctl restart ssh

5. КРИТИЧНО: НЕ ЗАКРЫВАЙ рабочую SSH-сессию пока не проверишь новым
   подключением, что вход по ключу всё ещё работает. Если нет — почини из
   ещё открытой сессии.

6. Проверь, что пароль больше не работает (попытка входа по паролю должна
   получить "Permission denied"). После проверки сам удали строку SERVER_PASSWORD
   из .env.deploy — теперь вход только по ключу, временный пароль больше не нужен.

БЛОК 2 — UFW (firewall).

  sudo apt-get install -y ufw
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'   # 80 + 443
  sudo ufw --force enable        # --force: без интерактивного y/n (ты ставишь по SSH, TTY нет)
  sudo ufw status

ВАЖНО: используй именно `ufw --force enable`. Обычный `ufw enable` спрашивает
"Proceed (y|n)?" — по SSH без терминала подтверждение не придёт, и UFW останется
ВЫКЛЮЧЕННЫМ (частая причина «прошёл урок, а ufw status = inactive»).
После команды `sudo ufw status` ОБЯЗАН показать "Status: active". Если показывает
"inactive" — повтори `sudo ufw --force enable` и проверь снова.

Должно быть открыто только: 22 (SSH), 80, 443. Остальное закрыто.

Проверь сам с локальной машины (IP бери из .env.deploy):
  nc -zv <SERVER_IP> 22    # success
  nc -zv <SERVER_IP> 80    # success
  nc -zv <SERVER_IP> 443   # success
  nc -zv <SERVER_IP> 5432  # refused (PostgreSQL — закрыт, появится на этапе БД)

БЛОК 3 — fail2ban (защита от перебора).

  sudo apt-get install -y fail2ban
  sudo systemctl enable --now fail2ban

Конфиг по умолчанию защищает SSH. Для nginx — добавь в /etc/fail2ban/jail.d/nginx.conf:

  [nginx-http-auth]
  enabled = true

  [nginx-limit-req]
  enabled = true
  filter = nginx-limit-req

  sudo systemctl restart fail2ban
  sudo fail2ban-client status

БЛОК 4 — Rate limiting в Next.js middleware.

В локальном проекте создай ../../product/src/middleware.ts:

  import { NextRequest, NextResponse } from 'next/server'

  // Простой in-memory rate limiter (для одного контейнера хватит).
  // Для масштабирования на 2+ контейнеров — нужен Redis (например, @upstash/ratelimit).

  const limits = new Map<string, { count: number; resetAt: number }>()

  function rateLimit(ip: string, max: number, windowMs: number): boolean {
    const now = Date.now()
    const entry = limits.get(ip)
    if (!entry || entry.resetAt < now) {
      limits.set(ip, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= max) return false
    entry.count++
    return true
  }

  export function middleware(request: NextRequest) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0] ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (request.nextUrl.pathname.startsWith('/api/auth')) {
      // Жёстче для auth — защита от перебора паролей
      if (!rateLimit(`auth:${ip}`, 5, 60_000)) {
        return new NextResponse('Too many requests', { status: 429 })
      }
    } else if (request.nextUrl.pathname.startsWith('/api/')) {
      // Общий лимит на API
      if (!rateLimit(`api:${ip}`, 30, 60_000)) {
        return new NextResponse('Too many requests', { status: 429 })
      }
    }

    return NextResponse.next()
  }

  export const config = {
    matcher: ['/api/:path*'],
  }

ПОСЛЕ ВСЕХ БЛОКОВ:

ПОКАЖИ МНЕ:
- sudo ufw status  (должно быть "Status: active" и в списке 22/80/443; если "inactive" — `sudo ufw --force enable`)
- sudo systemctl status fail2ban (active)
- вход по ключу пускает, по паролю отказ (проверь сам, доступ из .env.deploy)
- 6 подряд запросов на /api/auth/test → последний 429
```

---

## Edge cases

- Если на сервере уже стояло что-то на порту 22 (нестандартный SSH) — UFW настрой соответственно
- На in-memory rate limiter не масштабируется на несколько контейнеров. Для одного — OK. Если в будущем горизонтальное масштабирование — Redis
- Если работаешь только под root и боишься создавать sudo-юзера — обязательно создай. Один раз, потом всегда работаешь под ним. Root SSH — это половина риска


---

> 🛑 **СТОП — конец шага.** Этот промт выполнен. Не переходи к следующему промту или шагу, не предлагай «давай дальше сделаем X», не пересказывай, что идёт дальше по уроку. Темп задаёт пользователь — он сам откроет следующий шаг в `lesson.md`, когда будет готов. Сейчас покажи результат этого шага и остановись, дождись команды пользователя.
