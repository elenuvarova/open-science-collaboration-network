# Реестр функций `memory/feature-registry.md`

> **Цель:** в `feature-registry.md` лежит каталог реализованных фич сервиса со ссылками на спеки. Используется Claude'ом для ответа «есть ли уже X?» — экономит токены вместо чтения всего PRD.

---

## Промт

```
Создай ../../product/docs/memory/feature-registry.md.

Этот файл — реестр того, что уже реализовано в сервисе. Hook не печатает его при
старте, но Claude читает целиком когда вопрос: «есть ли уже фича X?», «что уже
сделано из X?», «нужно ли реализовать Y или это уже есть?».

ШАБЛОН:

# Feature Registry — <project-name>

> Каталог реализованных фич. Используется на вопросы «есть ли уже X?».
> Обновляется в конце каждого этапа.

## Auth
- Регистрация по email + пароль → spec: docs/screens/auth.md
- Логин → spec: docs/screens/auth.md
- Защита роутов через middleware → spec: docs/screens/_global.md (Auth Guard)
- Сессии в БД (модель Session), длительность 30 дней
- Cookie HttpOnly + Secure + SameSite=Lax
- Rate limiting на /api/auth/*: 5/мин на IP, 3/час на регистрацию
- IDOR закрыт на всех ресурсах через проверку userId

## Сущности
- User → src/entities/user/, schema.prisma
- <Entity> → src/entities/<entity>/, schema.prisma
- (по списку из docs/PRD.md, раздел Схема данных)

## Действия пользователя (фичи)
- Login → src/features/login/
- Register → src/features/register/
- EditProfile → src/features/edit-profile/
- <main-action> → src/features/<...>/
- (по docs/PRD.md, раздел Ключевые фичи)

## Личный кабинет
- /dashboard — главный экран авторизованного, видит свои данные
- /settings — профиль, смена пароля, удаление аккаунта

## UI-кит
- src/shared/ui/: Button, Card, Input, Select, Textarea, Checkbox, Radio,
  Switch, Badge, Avatar, Modal, Dialog, Tabs, Tooltip, Toast, Skeleton,
  EmptyState, ErrorState

## Документация
- docs/PRD.md
- docs/DESIGN.md (Google Labs формат)
- docs/01-app-map.md
- docs/screens/<screens>.md — спеки экранов
- docs/screens/_global.md — глобальная логика
- docs/test-cases.md — BDD-сценарии

## Инфраструктура
- VPS, домен, HTTPS, docker-compose, deploy.sh — детали в memory/infrastructure.md
- PostgreSQL контейнер, бэкапы — в memory/infrastructure.md (раздел БД)

## Что НЕ реализовано (планы)
- Админка
- AI / OpenRouter
- Загрузка файлов и видео
- Telegram-бот
- Email / in-app / Telegram уведомления
- PWA
- (опц.) GitHub Actions CI/CD

ПОСЛЕ:

1. Адаптируй раздел «Сущности», «Действия» под РЕАЛЬНЫЙ список из проекта.
   Не оставляй <Entity> и <main-action> placeholders.

2. Добавь строку в ../../product/docs/memory/INDEX.md в раздел «Реестр функций»:
   - [feature-registry.md](feature-registry.md) — «Что уже реализовано» по модулям

3. Покажи мне финальный feature-registry.md.
```

---

## Edge cases

- Если фич много — структурируй по модулям / разделам сервиса
- Не дублируй PRD — в registry только что **уже реализовано**, не план
- Каждая запись со ссылкой на spec / файл — это L2-fetch путь, по которому Claude найдёт детали

