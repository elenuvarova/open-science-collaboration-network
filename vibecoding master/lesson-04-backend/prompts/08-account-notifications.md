# Lesson 4 — Промт 08: Личный кабинет, настройки и центр уведомлений

> **Цель:** на `/dashboard` и `/settings` пользователь видит только свои данные (IDOR закрыт), управляет профилем/безопасностью, и есть базовый центр уведомлений **только in-app** (внутри сервиса). Это ядро аккаунта — оно должно работать сразу.

---

## Промт

```
ШАГ 1 — Привязка данных к пользователю.

В ../../product/prisma/schema.prisma у предметных сущностей (Task, Note, Order, и т.д.) должно быть
поле userId с FK к User. Если ещё нет — добавь и сделай миграцию:

  model <Entity> {
    id        String   @id @default(cuid())
    userId    String
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    // ... остальные поля
    @@index([userId])
  }

ВАЖНО про существующие демо-данные (чтобы миграция прошла с одного раза).
userId — обязательное (non-null) поле, а в предметных таблицах уже лежат
демо-записи из seed (Задание 3) без владельца. Если просто добавить поле,
миграция упрётся в эти строки. Поэтому по порядку:

  1. Обнови ../../product/prisma/seed.ts — демо-записи создавай с userId демо-пользователя
     (demo-admin, которого seed уже создаёт в Задании 3).
  2. Пересоздай базу одной командой. Реальных пользователей ещё нет — в базе
     только seed-данные, терять нечего. Перед запуском объясни мне в одной
     фразе, что она делает: удаляет базу → создаёт заново → применяет все
     миграции → запускает seed:

       npx prisma migrate reset

     ⚠️ Это безопасно ТОЛЬКО сейчас, пока нет реальных данных. После запуска
     продукта `reset` на боевой базе делать нельзя (сотрёт данные людей) —
     там только `npx prisma migrate deploy` после бэкапа (уже в deploy.sh).

Если в предметной таблице демо-записей нет, достаточно обычной
`npx prisma migrate dev --name add-user-relation` — reset не нужен.

ШАГ 2 — Обнови entities/<entity>/api/ — фильтрация по userId.

В каждой функции, которая читает/пишет данные пользователя, обязательный
параметр userId или взятие из сессии:

  export async function listEntities(userId: string, params?: {...}) {
    return db.entity.findMany({
      where: { userId, ...params },
      // ...
    })
  }

  export async function createEntity(userId: string, data: ...) {
    return db.entity.create({ data: { ...data, userId } })
  }

  export async function getEntityById(userId: string, id: string) {
    const entity = await db.entity.findUnique({ where: { id } })
    if (!entity || entity.userId !== userId) return null  // IDOR-защита
    return entity
  }

  export async function updateEntity(userId: string, id: string, data: ...) {
    // Проверяем владельца перед обновлением
    const entity = await db.entity.findUnique({ where: { id } })
    if (!entity || entity.userId !== userId) throw new Error('Not found')
    return db.entity.update({ where: { id }, data })
  }

  export async function deleteEntity(userId: string, id: string) {
    const entity = await db.entity.findUnique({ where: { id } })
    if (!entity || entity.userId !== userId) throw new Error('Not found')
    await db.entity.delete({ where: { id } })
  }

ВАЖНО: возвращаем null (или 404) при чужом ресурсе, не "Forbidden". Это защита
от утечки информации (атакующий не должен знать, существует ли ресурс с таким id).

ШАГ 3 — На страницах используй сессию для userId.

В ../../product/src/pages/dashboard/ui/DashboardScreen.tsx (Server Component):

  import { auth } from '@/shared/lib/auth'
  import { headers } from 'next/headers'
  import { listEntities } from '@/entities/<entity>'

  export async function DashboardScreen() {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session) redirect('/login')   // дополнительный guard, помимо middleware

    const items = await listEntities(session.user.id)

    return <DashboardUI items={items} />
  }

(Точный API getSession зависит от better-auth — следуй доке. NextAuth — getServerSession.)

ШАГ 4 — Settings-страница.

../../product/src/pages/settings/ui/SettingsScreen.tsx:

- Раздел "Профиль": email (read-only — менять через отдельный flow с подтверждением),
  name (можно редактировать через PATCH /api/users/me)
- Раздел "Безопасность": кнопка "Сменить пароль" → форма с current + new password
- Раздел "Опасная зона": кнопка "Удалить аккаунт" с confirm-модалкой
  (требует ввести email для подтверждения; после удаления — выход + редирект на /)

API-routes:
- app/api/users/me/route.ts (GET — данные профиля; PATCH — обновление имени)
- app/api/users/me/password/route.ts (POST — смена пароля)
- app/api/users/me/route.ts (DELETE — удаление аккаунта)

ШАГ 5 — Тест IDOR.

Создай два аккаунта (A и B). Каждым залогинься поочерёдно и создай по одной
записи (например, задаче).

Под аккаунтом A:
- Получи id записи B (через DevTools или Prisma Studio)
- Попробуй открыть /<feature>/<id-B> по URL → должно быть 404 / "Не найдено"
- Попробуй DELETE /api/<entity>/<id-B> через curl с куки A → должно быть 404 / 403

Под аккаунтом B:
- Те же тесты на ресурсах A

Если хоть в одном случае пробивается — это IDOR. Найти и починить.

ПОКАЖИ МНЕ:
- Скриншот /dashboard для двух разных аккаунтов — данные разные
- Подтверждение что попытка IDOR (открыть чужой ресурс по URL) → 404
- Тест удаления через curl с чужой кукой → 404
```

---

## Центр уведомлений (только in-app — внутри сервиса)

Это базовая часть аккаунта, делаем здесь же, рядом с настройками. Уведомления-центр — **только in-app** (колокольчик в шапке + страница): одна функция `notify` принимает событие и пишет его в БД, пользователь видит его внутри сервиса. **Email сюда НЕ подключаем** — он платный и упирается в лимиты, а in-app бесплатен и мгновенный. Важные транзакционные письма (заказ, инвайт, сброс пароля) отправляются **напрямую** при событии через `sendEmail` (Промты 06/07), а не как канал этого центра. Telegram — owner-only канал из Урока 5, тоже не сюда.

```
Собери центр in-app уведомлений (только внутри сервиса, без email-канала).

ШАГ 1 — Модели в ../../product/prisma/schema.prisma (+ миграция):
  Notification { id, userId, type, title, body, data Json?, readAt DateTime?, createdAt }  @@index([userId])
  NotificationPreference { id, userId @unique, muted Json }  // список выключенных типов, напр. ["digest"]

ШАГ 2 — Функция notify(userId, event):
  создаёт запись Notification (in-app), если этот тип не выключен в NotificationPreference.
  Никакого email/Telegram fanout здесь нет — это чисто in-app.

ШАГ 3 — UI:
  - NotificationBell в шапке: счётчик непрочитанных, dropdown/Sheet с историей;
  - страница /notifications — центр со списком, «отметить все прочитанными»;
  - real-time без перезагрузки: polling (useQuery refetchInterval) — простой вариант,
    SSE/WS — если нужен мгновенный.

ШАГ 4 — Настройки на /settings/notifications:
  переключатели «какие типы уведомлений показывать» (мьют по типу). Каналов нет — всё in-app.

ШАГ 5 — Подключи к триггерам из spec.md через notify(). Транзакционные письма
  (заказ/инвайт/сброс) — отдельно, прямым sendEmail при событии, НЕ через notify.
  Зафиксируй ADR (центр уведомлений — in-app only).

В конце: событие → колокольчик показывает непрочитанное; на /notifications видно историю;
выключенный тип в настройках перестаёт показываться.
```

> Если уведомлений в `spec.md` нет вообще — этот блок можно пропустить. Но базовый колокольчик + страница уведомлений почти всегда полезны, поэтому по умолчанию делаем.

---

## Edge cases

- Если ресурс публичный (например, "share by link") — IDOR-проверка через токен в URL, не через userId. Это отдельный сценарий, обсуди со пользователем
- Если в системе ролей есть admin — admin имеет право видеть/менять чужие ресурсы. Тогда IDOR-проверка: `entity.userId !== userId && session.user.role !== 'admin'`. Это появится при добавлении админки
- При удалении аккаунта Cascade в Prisma удалит зависимые данные. Убедись, что cascade описан в schema (`onDelete: Cascade`)

