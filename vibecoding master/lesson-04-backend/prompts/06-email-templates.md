# Lesson 4 — Промт 06: Письма аккаунта (подтверждение, восстановление, смена пароля)

> **Universal AI prompt.** Любой AI (Claude Code, Codex, Cursor) читает и выполняет.

> **Цель:** в проекте есть папка `../../product/src/emails/` с шаблонами писем АККАУНТА: welcome, verify-email (подтверждение регистрации), login code, password-reset (восстановление пароля), password-changed (уведомление о смене пароля). Каждый шаблон — TSX-файл, который можно открыть и отредактировать как обычную страницу. Resend подключён и отправляет письма.

> Когда применять: сразу после auth (Промт 05), если у сервиса есть регистрация/логин по email. Это не «реклама», а обязательная часть auth: подтверждение адреса, восстановление и уведомление о смене пароля. Пропустить можно только если входа по email нет вообще (только OAuth или закрытый админ-доступ).

> **Это письма аккаунта, не продуктовые.** Событийные уведомления продукта (новый заказ, ответ на комментарий, дайджест) — отдельная тема Урока 5 (Блок Email). Там переиспользуется этот же `../../product/src/lib/email.ts`, заново провайдер не настраивается.

---

## Что узнаешь

- React Email — фреймворк где каждое письмо это JSX-компонент
- Динамические места (имя, код, ссылка) защищены типами — не сотрёшь случайно
- Live preview через `npm run email:dev` — открываешь localhost:3000 и видишь как выглядит письмо
- Общие части (Layout, Footer) выносятся в компоненты — правишь в одном месте, меняется во всех письмах
- Resend нативно поддерживает React-компоненты как письма

---

## Промт

```md
Помоги мне добавить email-шаблоны в проект через React Email + Resend.
AI генерирует все файлы — мне не нужно ничего копировать из внешних репозиториев.

ШАГ 1 — Проверь что Resend подключён.
Открой ../../product/.env.local (и ../../product/.env.production) — должна быть переменная RESEND_API_KEY.

Если строки нет, заведи её сам с пустым значением:
  - в ../../product/.env.local добавь строку: RESEND_API_KEY=
  - в ../../product/.env.production добавь строку: RESEND_API_KEY=
Затем скажи мне, в какой файл и в какую строку вписать ключ из кабинета
resend.com. Я впишу значение прямо в файл (не в чат и не в терминал), ты ключ
не видишь, только читаешь из env при отправке.

Если у меня ещё нет аккаунта, напомни создать его на resend.com и
верифицировать домен (TXT, DKIM, MX через DNS-провайдера). Объясни, какие записи
добавить. API-ключ я возьму в кабинете и впишу в ../../product/.env.local / ../../product/.env.production
сам, тебе его не передаю.

ШАГ 2 — Установи React Email:

  npm install @react-email/components react-email

ШАГ 3 — Сгенерируй базовую структуру ../../product/src/emails/ в моём проекте:

  ../../product/src/emails/
  ├── components/
  │   ├── Layout.tsx       — общая обёртка письма (Html, Head, Body, Container)
  │   │                       + дизайн-токены (цвета/шрифты из моего DESIGN.md)
  │   ├── Heading.tsx      — заголовок письма
  │   ├── Paragraph.tsx    — абзац текста
  │   ├── Button.tsx       — CTA-кнопка (для ссылок в письме)
  │   └── Footer.tsx       — подвал (имя продукта, контакты, копирайт)
  ├── welcome.tsx          — welcome-письмо после регистрации
  ├── verify-email.tsx     — подтверждение адреса при регистрации (ссылка-подтверждение)
  ├── login-code.tsx       — письмо с кодом для magic link / OTP
  ├── password-reset.tsx   — письмо с ссылкой на сброс пароля
  └── password-changed.tsx — уведомление «ваш пароль изменён» (безопасность)

  Требования к шаблонам:
  - Все письма импортируют общий Layout и Footer (один источник для всех)
  - Стили писем совместимы с почтовыми клиентами (inline styles или
    @react-email/components, не внешний CSS — Gmail/Outlook его режут)
  - Динамические данные через типизированные props:
    welcome → { name, productUrl }
    verify-email → { verifyUrl, expiresInHours }
    login-code → { code, expiresInMinutes }
    password-reset → { resetUrl, expiresInHours }
    password-changed → { name, supportEmail, changedAt }
  - Тексты на русском (или язык моего продукта)
  - Цвета/шрифты бери из ../../product/docs/DESIGN.md если он есть

ШАГ 4 — Добавь в ../../product/package.json скрипт:

  "scripts": {
    "email:dev": "email dev --dir src/emails",
    ...
  }

ШАГ 5 — Запусти live preview:

  cd ../../product && npm run email:dev

  Откроется http://localhost:3000 с галереей всех писем.
  Покажи мне результат — должны быть видны 3 шаблона.

ШАГ 6 — Заполни Footer.tsx моими данными:
  - Реальное имя продукта (спроси у меня если не знаешь)
  - Мой support-email
  - При необходимости — логотип / ссылки

  Footer — один компонент, который импортируют все письма. Правишь его —
  меняется во всех письмах сразу.

ШАГ 7 — Создай функцию отправки в ../../product/src/lib/email.ts:

  import { Resend } from 'resend';
  import WelcomeEmail from '@/emails/welcome';
  import VerifyEmail from '@/emails/verify-email';
  import LoginCodeEmail from '@/emails/login-code';
  import PasswordResetEmail from '@/emails/password-reset';
  import PasswordChangedEmail from '@/emails/password-changed';

  const resend = new Resend(process.env.RESEND_API_KEY!);

  export async function sendWelcomeEmail(user: { name: string; email: string }) {
    await resend.emails.send({
      from: '<Моё имя продукта> <noreply@<мой-домен>>',
      to: user.email,
      subject: 'Добро пожаловать!',
      react: WelcomeEmail({
        name: user.name,
        productUrl: process.env.NEXT_PUBLIC_APP_URL!,
      }),
    });
  }

  export async function sendLoginCodeEmail(email: string, code: string) {
    await resend.emails.send({
      from: '<Моё имя продукта> <noreply@<мой-домен>>',
      to: email,
      subject: `Код для входа: ${code}`,
      react: LoginCodeEmail({ code, expiresInMinutes: 10 }),
    });
  }

  export async function sendPasswordResetEmail(email: string, resetUrl: string) {
    await resend.emails.send({
      from: '<Моё имя продукта> <noreply@<мой-домен>>',
      to: email,
      subject: 'Восстановление пароля',
      react: PasswordResetEmail({ resetUrl, expiresInHours: 1 }),
    });
  }

  export async function sendVerificationEmail(email: string, verifyUrl: string) {
    await resend.emails.send({
      from: '<Моё имя продукта> <noreply@<мой-домен>>',
      to: email,
      subject: 'Подтвердите email',
      react: VerifyEmail({ verifyUrl, expiresInHours: 24 }),
    });
  }

  export async function sendPasswordChangedEmail(user: { name: string; email: string }) {
    await resend.emails.send({
      from: '<Моё имя продукта> <noreply@<мой-домен>>',
      to: user.email,
      subject: 'Ваш пароль изменён',
      react: PasswordChangedEmail({
        name: user.name,
        supportEmail: '<мой support-email>',
        changedAt: new Date().toLocaleString('ru-RU'),
      }),
    });
  }

ШАГ 8 — Подключи в auth-flow:

  Подтверждение email (если в Промте 05 requireEmailVerification: true):
    в better-auth emailAndPassword пропиши колбэк
    sendVerificationEmail: ({ user, url }) => sendVerificationEmail(user.email, url)
    — better-auth сам генерит ссылку и зовёт колбэк при регистрации.

  Welcome после регистрации (/api/auth/signup или onboarding-хук):
    после createUser() → await sendWelcomeEmail({ name: user.name, email: user.email });

  Логин с magic link:
    после generateCode() → await sendLoginCodeEmail(email, code);

  Восстановление пароля (better-auth forgetPassword):
    пропиши колбэк sendResetPassword: ({ user, url }) =>
      sendPasswordResetEmail(user.email, url)

  Уведомление о смене пароля (безопасность):
    после успешной смены/сброса пароля (changePassword и завершение resetPassword) →
    await sendPasswordChangedEmail({ name: user.name, email: user.email });
    — чтобы человек узнал, если пароль сменил не он.

ШАГ 9 — Протестируй отправку:
  - Зарегистрируйся в приложении со своим тестовым email
  - Письмо должно прийти в inbox (не Junk) в течение 10 секунд
  - Если в Junk — проверь DKIM/SPF/DMARC в DNS-зоне

ШАГ 10 — Закоммить:

  cd ../../product && git add src/emails/ src/lib/email.ts package.json src/app/api/auth/
  git commit -m "<project> (feat): email-шаблоны (welcome / login / reset) через React Email + Resend"
  git push

ПОКАЖИ МНЕ:
- В DevTools браузера → Network: запрос на /api/auth/signup вернул 200
- В Resend Dashboard → Emails: видно отправленное письмо со статусом Delivered
- В моём Gmail / тестовом ящике: получено письмо с правильным дизайном
- Скриншот email:dev галереи с 3 шаблонами

ЕСЛИ ПОЗЖЕ ПОПРОШУ новый email-шаблон (например order-confirmation.tsx):
- Создай его прямо в ../../product/src/emails/ по образцу существующих
- Используй тот же Layout и Footer (общие компоненты)
- Те же дизайн-токены, тот же стиль
- Добавь функцию отправки в ../../product/src/lib/email.ts
```

---

## Edge cases

- **Если у пользователя ещё нет домена** → можно использовать Resend onboarding-домен `onboarding@resend.dev` для тестов, но реальные письма от него приходят только на подтверждённый email. Для боевой отправки нужна DNS-настройка домена.
- **Если письма попадают в Junk** → проверить DKIM (TXT-запись в DNS), SPF, DMARC. На новом домене первые недели часть писем в Junk — нормально, пока репутация наработается.
- **Если используется magic link** → в письме не код, а ссылка. Адаптируй `login-code.tsx` или попроси AI создать `login-magic-link.tsx` по образцу.
- **Если бэкенд не Next.js** → React Email работает в любой Node.js среде. SDK Resend тоже универсальный.

