# Финальный save — MVP готов

Цель: зафиксировать что работа над MVP завершена, всё в памяти.

## Шаг 1 — Обновить state.md

`../../product/docs/memory/state.md`:

```markdown
# State

## Активная работа
**Статус:** MVP v1.0 готов, опубликован.

## Что сделано
- Инструменты настроены
- spec.md готов
- Прототип на моках собран
- Задеплоен на VPS
- Реальные данные и аккаунты подключены
- AI / админка / интеграции (что было нужно)
- Тесты и память проекта зафиксированы
- Финальная упаковка (если делал)

## Ключевые артефакты
- Публичный URL: https://your-domain.com
- Репо: github.com/...
- spec.md: docs/spec.md
- Память: ../../product/docs/memory/INDEX.md

## Следующие шаги (на свой выбор)
- Запуск маркетинга
- Сбор feedback
- Версия 1.1: [то что хочется добавить]
```

## Шаг 2 — /save-session

```
Прочитай ../../modules/development/prompts/save-session.md (или эталон-шаблон) и выполни. Создай запись в ../../product/docs/memory/sessions/YYYY-MM-DD-mvp-готов.md с полным описанием:

- Что сделано в работе
- Список реализованных фич
- Какие выборы сделали (ссылки на ADR)
- Куда дальше двигаемся
```

## Шаг 3 — README продукта

> Полную сеть README (корневой + по ключевым папкам) вы собрали на **Шаге 8.5** через `prompts/14-readme.md`. Здесь только сверьте, что корневой `README.md` актуален: правильный публичный URL, стек и команда запуска. Если README ещё нет — соберите его по шаблону ниже, затем вернитесь к `14-readme.md` за README по папкам.

`README.md`:

```markdown
# <Product Name>

<Одно предложение про продукт>

## Live
https://your-domain.com

## Stack
- Frontend: Next.js + Tailwind + shadcn
- Backend: Next.js API routes + Prisma
- DB: PostgreSQL на VPS
- Hosting: VPS + docker-compose + Caddy

## Развёртывание

См. `../../product/docs/memory/infrastructure.md` для деталей.

\`\`\`bash
git pull
./deploy.sh
\`\`\`

## Документация
- `docs/spec.md` — полная спецификация
- `docs/test-cases.md` — тест-кейсы
- `../../product/docs/memory/INDEX.md` — память проекта (ADR, findings, sessions)
```

## Шаг 4 — Поздравь себя

Работа над MVP завершена. У тебя есть:
- Работающий публичный сервис
- Полная документация
- Тесты
- Память проекта работает между сессиями
- Личная библиотека модулей для будущих проектов

