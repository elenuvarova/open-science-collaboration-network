# Lesson 4 — Промт 05: Auth — регистрация, логин, защита роутов

> **Цель:** реализована авторизация через better-auth (или NextAuth, если выбрано в ADR-004). Регистрация и логин по email + пароль работают локально и на проде. Сессии в БД, не JWT-only.

---

## Промт

```
ШАГ 0 — Зафиксируй выбор библиотеки в ADR-004.

Создай ../../product/docs/memory/decisions/ADR-004-auth-library.md.
По умолчанию рекомендую better-auth (современная, активно развивается, удобнее
для фронт-проектов чем NextAuth). Если есть причины выбрать NextAuth — обоснуй.

Формат ADR — как в предыдущих (Context, Decision, Consequences, Alternatives,
Status, Date). Альтернативы: NextAuth, Clerk, Supabase Auth, свой auth.

Добавь строку в INDEX.

ШАГ 1 — Установка и базовая конфигурация (далее — для better-auth; если
NextAuth — Claude адаптирует команды и API).

  npm install better-auth

ШАГ 2 — Дополни ../../product/prisma/schema.prisma моделями для сессий.

  model User {
    // ... существующие поля
    sessions      Session[]
    accounts      Account[]   // для будущего OAuth
  }

  model Session {
    id        String   @id @default(cuid())
    userId    String
    expiresAt DateTime
    token     String   @unique
    ipAddress String?
    userAgent String?
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@index([userId])
  }

  model Account {
    id            String  @id @default(cuid())
    userId        String
    provider      String  // 'email', 'google', 'github'
    providerId    String
    accessToken   String?
    refreshToken  String?
    expiresAt     DateTime?
    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
    @@unique([provider, providerId])
    @@index([userId])
  }

  model Verification {
    id         String   @id @default(cuid())
    identifier String   // email/ключ, к которому привязан токен
    value      String   // сам токен
    expiresAt  DateTime
    createdAt  DateTime @default(now())
    updatedAt  DateTime @updatedAt
    @@index([identifier])
  }

ОБЯЗАТЕЛЬНО заведи модель Verification — без неё не работают подтверждение
email, восстановление пароля и вход по коду (их включает Промт 06). Не пропускай.

Надёжнее всего получить точную схему под вашу версию better-auth его официальным
генератором — он создаст ровно нужные модели (user/session/account/verification)
под Prisma:

  npx @better-auth/cli generate

Сверь с моделями выше и применяй миграцию.

Миграция:
  npx prisma migrate dev --name auth-schema

ШАГ 3 — Конфиг ../../product/src/shared/lib/auth.ts:

  import { betterAuth } from 'better-auth'
  import { prismaAdapter } from 'better-auth/adapters/prisma'
  import { db } from '@/shared/db'

  export const auth = betterAuth({
    database: prismaAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Подтверждение email при регистрации. Спроси меня и реши по spec.md:
      // true — у сервиса публичная регистрация и нужны подтверждённые адреса
      //        (письмо verify-email настроим в Промте 06);
      // false — закрытый/админский доступ или регистрация без email-подтверждения.
      requireEmailVerification: false,
      // Колбэки sendVerificationEmail и sendResetPassword подключаются в Промте 06,
      // когда настроены письма аккаунта (verify / password-reset / password-changed).
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,  // 30 дней
      updateAge: 60 * 60 * 24,        // продлевать каждые 24 часа активности
      cookieCache: { enabled: true },
    },
    secret: process.env.NEXTAUTH_SECRET!,  // или AUTH_SECRET — по конвенции better-auth
    baseURL: process.env.NEXTAUTH_URL!,
  })

ШАГ 4 — API-routes.

  app/api/auth/[...all]/route.ts:

  import { auth } from '@/shared/lib/auth'
  import { toNextJsHandler } from 'better-auth/next-js'
  export const { GET, POST } = toNextJsHandler(auth)

(better-auth обрабатывает все /api/auth/* — sign-up, sign-in, sign-out, session.)

ШАГ 5 — Сгенерируй секреты.

В ../../product/.env.local:
  NEXTAUTH_SECRET=<openssl rand -base64 32>
  NEXTAUTH_URL=http://localhost:3000

В /var/www/<project-name>/.env.production на сервере:
  NEXTAUTH_SECRET=<другой openssl rand -base64 32>
  NEXTAUTH_URL=https://<domain>

ШАГ 6 — Обнови features/login и features/register — реальные вызовы.

В ../../product/src/features/login/api/loginRequest.ts (или новый login-action.ts):

  import { authClient } from '@/shared/lib/auth-client'   // создай файл клиента — see better-auth docs

  export async function login(email: string, password: string) {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: '/dashboard',
    })
    if (error) throw new Error(error.message)
    return data
  }

Аналогично для register — authClient.signUp.email(...).

В UI компонентах (LoginForm, RegisterForm):
- Валидация email формат, пароль ≥8 символов
- При ошибке от API — показать конкретное сообщение (не "Ошибка")
- Loading-состояние во время запроса
- При успехе — редирект на /dashboard (better-auth умеет через callbackURL)

ШАГ 7 — Middleware защиты роутов.

Дополни ../../product/src/middleware.ts (был с этапа деплоя для rate limiting):

  import { NextRequest, NextResponse } from 'next/server'
  // ... rate limit код с этапа деплоя

  export async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname

    // Rate limiting (с этапа деплоя) — оставляем как было

    // Защита роутов
    const isAuthRoute = path.startsWith('/login') || path.startsWith('/register')
    const isAppRoute = path.startsWith('/dashboard') || path.startsWith('/settings') ||
                        path.startsWith('/<feature>')

    // Получи сессию (better-auth даёт middleware-helper):
    const session = await getSession(request)

    if (isAppRoute && !session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    if (isAuthRoute && session) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return NextResponse.next()
  }

  export const config = {
    matcher: ['/dashboard/:path*', '/settings/:path*', '/login', '/register', '/api/:path*'],
  }

(Используй точный helper better-auth для middleware — в их доке actuаl API.)

ШАГ 8 — Тест:

1. Локально: npm run dev
   - Зарегистрируйся (новый email + пароль) → должен попасть на /dashboard
   - Перезагрузи страницу — остался залогинен
   - Выйди (через UserMenu в Header или /api/auth/sign-out) → редирект на /
   - Попробуй открыть /dashboard — редирект на /login

2. Прогон деплоя на сервер:
   ./scripts/deploy-remote.sh

3. На проде проверь то же самое: регистрация, логин, выход, редирект.

ПОКАЖИ МНЕ:
- ADR-004 (финальный)
- Скриншот успешной регистрации (email + пароль → /dashboard)
- Скриншот после logout
- Скриншот неавторизованного редиректа на /login
```

---

## Edge cases

- Если better-auth конфликтует с существующим routing — следуй официальной доке, она обновляется быстрее этого промта
- На проде `NEXTAUTH_URL` обязательно `https://<domain>`, не `http://`. Иначе cookie не выставится
- Если cookie не выставляется в браузере — проверь, что nginx передаёт Set-Cookie (он должен по умолчанию, но иногда `proxy_pass_header Set-Cookie` нужен явно)

