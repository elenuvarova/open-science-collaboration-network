# Lesson 3 — Промт 05: Домен + nginx + HTTPS через Certbot

> **Цель:** сервис открывается по `https://<domain>`, замок зелёный, http → https редиректит.

---

## Промт

```
Доступ к серверу и домен ты читаешь из .env.deploy. Я ничего не ввожу в чат
и в терминал. На сервер подключаешься по SSH сам.

ШАГ 0 — Домен.

Если в .env.deploy ещё не заполнена строка DOMAIN=, скажи мне:
«открой .env.deploy и впиши DOMAIN= (например, my-service.example.com)».
Я впишу значение прямо в файл. Дальше бери домен и IP сервера из .env.deploy.

ШАГ 1 — DNS:

Спроси меня, какой хост сделать основным (каноническим):
- голый домен (example.com) — тогда www.example.com будет 301-редиректить на него;
- или www (www.example.com) — тогда наоборот, голый домен ведёт на www.
Единого «правильного» стандарта нет, оба валидны. Если я не отвечу — по умолчанию
с www. Важно одно: один хост основной, второй переадресует на него 301-м
(иначе для поиска это два разных сайта с раздвоенным весом).

Спроси, какой у меня регистратор домена / DNS-провайдер (где я покупал домен —
например Namecheap, Cloudflare, GoDaddy, Reg.ru, Timeweb, Beget и т.п.). По ответу:

- Подскажи точный путь, где в кабинете ИМЕННО этого регистратора лежат DNS-записи
  (раздел → вкладка → кнопка), чтобы я сам добавил записи. Если не уверен в текущем
  интерфейсе провайдера — сверься через context7 или справку провайдера, не выдумывай
  названия пунктов меню.
- Если у этого регистратора есть официальный API/CLI для управления DNS и я
  подтверждаю, что хочу автоматически — настрой записи за меня: скажи, какой токен
  нужен и с каким МИНИМАЛЬНЫМ правом (только редактирование DNS этой зоны, не весь
  аккаунт), я положу токен в .env.deploy (НЕ в чат и не в терминал), ты добавишь
  A-записи @ и www через API сам и проверишь dig. После настройки напомни мне отозвать
  токен, если он временный.

Делай автоматически ТОЛЬКО для провайдера, который ты точно знаешь и у которого есть
документированный API, и ТОЛЬКО после моего явного подтверждения. Если сомневаешься в
провайдере или в безопасности — оставайся на ручном варианте и просто дай мне точную
инструкцию, куда вставить записи.

Нужны ОБЕ записи — чтобы работали и сам домен, и вторая версия, с которой пойдёт
редирект. Поля в кабинете почти везде называются одинаково: Type / Host (Name) /
Value (Data) / TTL. Конкретно добавить:

  Type   Host (Name)   Value (Data)              TTL
  A      @             <SERVER_IP из .env.deploy>  Auto (или 3600)
  A      www           <SERVER_IP из .env.deploy>  Auto (или 3600)

Поясни мне поля, чтобы я не запутался:
- `@` в поле Host означает «сам домен» (apex — example.com без www). У некоторых
  регистраторов вместо `@` оставляют поле пустым или пишут сам домен — подскажи,
  как именно у моего провайдера.
- `www` — это поддомен www.example.com.
- Тип A связывает имя напрямую с IP. Поэтому Value — это IP сервера (SERVER_IP из
  .env.deploy), а не текст и не ссылка.
- Альтернатива для www: вместо `A www → IP` можно `CNAME www → example.com`
  (Type=CNAME, Host=www, Value=<domain>, у части провайдеров с точкой на конце).
  CNAME = «www это псевдоним голого домена», при смене IP его править не нужно.
  Для apex (`@`) CNAME нельзя — там только A.
- Если я делаю не голый домен, а поддомен (app.example.com) — тогда одна A-запись
  Host=app, отдельная www не нужна.
- Если у провайдера уже висят «парковочные» A/AAAA-записи на чужой IP или CNAME на
  заглушку — их надо удалить/заменить, иначе домен поведёт не на мой сервер.
- AAAA (IPv6) добавляй только если у сервера реально есть IPv6.

Дай мне записи именно в таком конкретном виде (Type / Host / Value / TTL) под мой
регистратор и точный путь, куда их вставить.

После того как записи добавлены (мной вручную или тобой через API), дождись
пропагации (проверяй сам по SSH):
  dig <domain> +short
  dig www.<domain> +short
Оба должны вернуть IP сервера. Если ещё не пропагандировано — подожди 5-30 минут.

ШАГ 2 — добавь домен к уже работающему nginx (подключись по SSH, доступ из .env.deploy):

nginx уже установлен в промте 05 (`prompts/05-vps-docker-compose.md`) и проксирует
приложение по IP — конфиг /etc/nginx/sites-available/<project-name> с заглушкой
`server_name _; listen 80 default_server;`. Здесь нужно только поставить certbot и
заменить заглушку на твой домен:

sudo apt-get install -y certbot python3-certbot-nginx

Открой /etc/nginx/sites-available/<project-name> и приведи server-блок к этому виду.
По сравнению с конфигом из промта 05 меняется только `server_name` (`_` → домен) и
убирается `default_server`; добавляется rate limiting. **proxy_pass НЕ трогай и не
подставляй 3000 вслепую** — оставь тот адрес, что уже стоит в конфиге из промта 05
(он указывает на реальный порт, на котором слушает приложение). Если всё же пишешь
блок с нуля — возьми адрес из docker-compose.yml (левая часть в `ports`, напр.
`127.0.0.1:8080:3000` → upstream `127.0.0.1:8080`) или подсмотри текущий:
  grep proxy_pass /etc/nginx/sites-available/<project-name>

  server {
      listen 80;
      server_name <domain> www.<domain>;

      location / {
          proxy_pass http://127.0.0.1:<APP_PORT из конфига промта 05, не хардкод 3000>;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_cache_bypass $http_upgrade;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }

      # Rate limiting от ботов (общий лимит на nginx-уровне)
      # Тонкая настройка — в Next.js middleware (Промт 06)
      limit_req_zone $binary_remote_addr zone=web:10m rate=30r/s;
      limit_req zone=web burst=50 nodelay;
  }

Симлинк в sites-enabled уже стоит с промта 05 — пересоздавать не нужно. Применить:
  sudo nginx -t
  sudo systemctl reload nginx

ШАГ 3 — HTTPS через Certbot:

  sudo certbot --nginx -d <domain> -d www.<domain>

Оба имени в одном сертификате — это нужно, чтобы https-редирект с www не упирался
в ошибку сертификата.

Certbot:
- Проверит, что nginx-конфиг корректный
- Получит сертификат от Let's Encrypt (на <domain> и www.<domain>)
- ОБНОВИТ конфиг nginx — добавит блоки listen 443 ssl, ssl_certificate, и
  редирект http → https
- Включит автоматическое продление через systemd-таймер

После certbot:
  sudo systemctl status certbot.timer    # должен быть active
  curl -I https://<domain>                # 200 + Strict-Transport-Security header

ШАГ 3.5 — Канонический редирект (www ↔ голый домен):

Сейчас обе версии открываются одинаково — для поиска это «два сайта». Сделай одну
основной (мой выбор из ШАГА 1, по умолчанию www), вторая пусть отдаёт 301.

Если основной — www: оставь в основном server-блоке server_name www.<domain>;
(убери оттуда голый домен), а голый домен вынеси в отдельный блок-редирект:

  server {
      listen 443 ssl;
      server_name <domain>;
      ssl_certificate     /etc/letsencrypt/live/<domain>/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/<domain>/privkey.pem;
      return 301 https://www.<domain>$request_uri;
  }

Если основной — голый домен: сделай зеркально (редиректь www на <domain>).

  sudo nginx -t && sudo systemctl reload nginx

ШАГ 4 — Security headers:

В nginx-конфиге (/etc/nginx/sites-available/<project-name>) внутри блока
server (HTTPS-блок, который добавил certbot) добавь:

  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "strict-origin-when-cross-origin" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
  # Strict-Transport-Security включает сам Certbot

Прогон:
  sudo nginx -t
  sudo systemctl reload nginx

ШАГ 4.5 — Кэш статики (чтобы при переходах не качалось заново):

Статика Next.js (JS-бандлы, CSS, шрифты в /_next/static/) собирается с хэшем в
имени файла и НИКОГДА не меняется без передеплоя. Значит, её можно отдавать
браузеру с «вечным» кэшем — тогда меню, шрифты, общий код приложения скачиваются
один раз, а при переключении страниц и повторных заходах берутся из кэша браузера,
а не качаются снова. Это убирает лишние сетевые запросы при навигации.

Добавь в основной (HTTPS) server-блок, выше `location /`:

  # Иммутабельная статика Next.js — хэш в имени файла, кэшируем надолго
  location /_next/static/ {
      proxy_pass http://127.0.0.1:<APP_PORT из конфига промта 05, не хардкод 3000>;
      proxy_set_header Host $host;
      add_header Cache-Control "public, max-age=31536000, immutable" always;
  }

  # Оптимизированные картинки next/image — кэшируем умеренно
  location /_next/image {
      proxy_pass http://127.0.0.1:<APP_PORT>;
      proxy_set_header Host $host;
      add_header Cache-Control "public, max-age=86400" always;
  }

ВАЖНО: HTML-страницы (`location /`) этим правилом НЕ накрываем — у них короткий хэш-
независимый URL, и долгий кэш заморозит обновления контента. Долгий immutable-кэш —
только для файлов с хэшем в имени (/_next/static/).

Включи сжатие (если ещё не включено глобально) — в http-блоке /etc/nginx/nginx.conf:

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;
  # brotli (если в сборке nginx есть модуль ngx_brotli) — ещё компактнее:
  # brotli on; brotli_types text/css application/javascript application/json image/svg+xml;

Прогон:
  sudo nginx -t
  sudo systemctl reload nginx

Проверка кэш-заголовков по SSH:
  curl -I https://<domain>/_next/static/  # должен быть Cache-Control: ...immutable
                                          # (точный путь к файлу возьми из исходника
                                          #  страницы — ссылки вида /_next/static/chunks/...)

ШАГ 5 — Проверка:

В браузере открой https://<domain> — должен:
- Открыться сайт
- Зелёный замок
- При попытке открыть http://<domain> — 301 на https
- При открытии не-канонической версии (www или голый домен) — 301 на основную

Проверка редиректов по SSH:
  curl -I http://<domain>          # 301 → https
  curl -I https://www.<domain>     # 301 → основная версия (или наоборот, если www основной)

Прогон через securityheaders.com (онлайн-сканер):
  curl https://securityheaders.com/?q=<domain>

Должна быть оценка минимум B (после security headers).

ПОКАЖИ МНЕ:
- curl -I https://<domain> (заголовки)
- curl -I https://www.<domain> (должен быть 301 на каноническую версию)
- Ответ securityheaders.com
- Скриншот / описание открытого сайта в браузере
```

---

## Edge cases

- Если certbot пишет «не вижу домен» — DNS ещё не пропагандировался; жди или попробуй с другого DNS-резолвера: `dig @8.8.8.8 <domain>`
- Если у Cloudflare включён proxy (оранжевая туча) — Certbot не работает напрямую. Варианты: временно отключить proxy на время выпуска, или использовать DNS challenge
- HSTS (Strict-Transport-Security) — после первой загрузки браузер запоминает «только HTTPS». На localhost не работает, на проде — критично
- www-редирект сработает только если выполнены оба условия: в DNS есть запись www и сертификат выпущен на оба имени (`-d <domain> -d www.<domain>`). Если сертификата на www нет — браузер на `https://www.<domain>` покажет ошибку сертификата раньше, чем дойдёт до 301
- Выбор канонического хоста (www или голый) должен совпадать с тем, что указано в `<meta rel="canonical">` и в sitemap приложения — иначе поиск получает противоречивые сигналы
- Автоматическая настройка DNS через API регистратора — только для провайдера с документированным API и только после подтверждения пользователя. Токен — с минимальным правом (правка DNS этой зоны, не весь аккаунт), в `.env.deploy` (не в чат), и отзывается после, если временный. Незнакомый или сомнительный провайдер — не автоматизируй, дай ручную инструкцию


---

> 🛑 **СТОП — конец шага.** Этот промт выполнен. Не переходи к следующему промту или шагу, не предлагай «давай дальше сделаем X», не пересказывай, что идёт дальше по уроку. Темп задаёт пользователь — он сам откроет следующий шаг в `lesson.md`, когда будет готов. Сейчас покажи результат этого шага и остановись, дождись команды пользователя.
