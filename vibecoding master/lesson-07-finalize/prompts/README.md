# Промты — Финал: защита, консолидация, библиотека (Урок 7)

## Шаги по порядку (01–15)

Номер файла = порядок выполнения в уроке. Колонка «Шаг/Задание» показывает, откуда промт вызывается.

| № | Файл | Шаг / Задание | Что делает |
|---|---|---|---|
| 01 | [01-app-map.md](01-app-map.md) | Шаг 1 / Зад. 1 | `../../product/docs/01-app-map.md` — карта маршрутов + mermaid-диаграмма переходов; плюс `app-map.html` — та же карта как интерактивная страница в браузере |
| 02 | [02-screens-spec.md](02-screens-spec.md) | Шаг 2 / Зад. 2 | Спеки экранов в `../../product/docs/screens/<screen>.md` (состояния, элементы, сообщения, валидация) |
| 03 | [03-global-spec.md](03-global-spec.md) | Шаг 2 / Зад. 3 | `../../product/docs/screens/_global.md` — auth guard, роли, ошибки сети, шаблоны |
| 04 | [04-test-cases.md](04-test-cases.md) | Шаг 3–4 / Зад. 4, 5 | `../../product/docs/test-cases.md` — 3-5 BDD-сценариев + авто-тесты (Playwright/Vitest) против регрессий |
| 05 | [05-post-tool-edit-hook.md](05-post-tool-edit-hook.md) | Шаг 4 / Зад. 5 | PostToolUse hook против хардкода в UI + как добавлять хуки безопасности/a11y/тест-гейта |
| 06 | [06-memory-setup.md](06-memory-setup.md) | Шаг 4 / Зад. 5 | Консолидация ADR в `../../product/docs/memory/decisions/` + IMPL-теги + ADR-005 «spec→test→код» + обновление `INDEX.md` |
| 07 | [07-rules-setup.md](07-rules-setup.md) | Шаг 4 / Зад. 5 | 5 базовых правил в `../../product/docs/rules/` + строки в таблицу триггеров `../../product/AGENTS.md` |
| 08 | [08-feature-registry.md](08-feature-registry.md) | Шаг 4 / Зад. 5 | `../../product/docs/memory/feature-registry.md` — каталог реализованных фич; теперь часть единой финальной консолидации (Задание 5), запускается вместе с памятью/ADR |
| 09 | [09-build-modules-library.md](09-build-modules-library.md) | Шаг 6 / Зад. 7 | Собрать библиотеку модулей на уровне воркспейса (продукт → `projects/<name>/`, `modules/` + `_INDEX.md` + чекер + hook, git на выбор) |
| 10 | [10-maintain-modules.md](10-maintain-modules.md) | Шаг 6 / Зад. 8 | Обновлять и пополнять библиотеку: вынести свою наработку, вобрать подход из чужого проекта по git-ссылке |
| 11 | [11-install-power-skills.md](11-install-power-skills.md) | Шаг 7 / Зад. 11 | 6 готовых скиллов сообщества в библиотеку (опц) |
| 12 | [12-hide-style-guide.md](12-hide-style-guide.md) | Шаг 8 / Зад. 12 | Прячем `/style-guide` и dev-страницы с прода (404 в production, рабочие в dev) |
| 13 | [13-build-ux-testing-skill.md](13-build-ux-testing-skill.md) | Шаг 9 / Зад. 13 | Собрать скилл `/ux-testing` — инструмент для ручного прогона критичных путей в браузере по необходимости (smoke, визуальная сверка); постоянная защита путей — автотесты из Зад. 5 |
| 14 | [14-readme.md](14-readme.md) | Шаг 10 / Зад. 15 | Сеть README по сервису: корневой + по ключевым папкам (`../../product/docs/`, `../../product/development/`, `../../.claude/`, `../../modules/`) |
| 15 | [15-final-save.md](15-final-save.md) | Шаг 11 / Зад. 16 | Финальный `/save-session`: отметка «MVP v1.0 готов» |

## Шаблоны скиллов и справочники (без номера, вызываются по месту)

Это не пошаговые промты, а переиспользуемые шаблоны/справочники — поэтому без номера.

- [memory-search.md](memory-search.md) — шаблон промта `/memory-search` (поиск по памяти проекта с progressive disclosure). Демонстрируется в Шаге 4 / Зад. 5
- [save-session.md](save-session.md) — шаблон промта `/save-session` (закрыть сессию, обновить state, создать session-файл). Вызывается финальным `15-final-save.md`
- [memory-system.md](memory-system.md) — справочник объединённой системы памяти: файловое ядро + опциональный движок `agentmemory`. Опциональное чтение в Шаге 4

## Методичка

- [_HOW-TO-BUILD-YOUR-PROMPT.md](_HOW-TO-BUILD-YOUR-PROMPT.md) — методичка сборки собственных промтов. Используется при сборке своих скиллов
