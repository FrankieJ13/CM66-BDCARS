# Auto Search Assistant

Самостоятельная frontend-страница ассистента для поиска авто по CSV из Google Sheets.

## Зачем отдельный репозиторий

Такой формат удобно держать отдельно от CRM:

- можно публиковать ассистента на GitHub Pages;
- в CRM подключать как отдельную страницу или iframe;
- словарь марок, моделей и городов развивать независимо;
- не нужно переписывать основной dashboard.

## Как вынести в отдельный GitHub repo

Из папки `assistant-chat-source`:

```bash
git init
git add .
git commit -m "Create auto search assistant"
gh repo create auto-search-assistant --public --source=. --remote=origin --push
```

После этого включите GitHub Pages в настройках репозитория: `Settings -> Pages -> Deploy from branch -> main / root`.

## Запуск

```bash
python3 -m http.server 8000
```

Откройте:

```text
http://127.0.0.1:8000/assistant-chat-source/
```

## Подключение Google Sheets

Сейчас `js/config.js` уже привязан к таблице:

```text
https://docs.google.com/spreadsheets/d/1Ad27O54xpAS4vcHPA9Ds4e4pyAMN7SLgz6w0kgo44iU/edit?gid=0#gid=0
```

Вкладка: `BD`.

Ожидаемые колонки:

```text
brand | model | title | year | price | city | mileage | transmission | url | updated_at
```

Важно: чтобы GitHub Pages мог читать таблицу напрямую, таблица должна быть доступна по ссылке или опубликована как CSV. Если таблица закрыта, ассистент временно покажет демо-базу из `sample-data/cars.csv`.

## Установка Google Apps Script парсера

Да, таблицу нужно наполнить через Google Apps Script. Готовый скрипт лежит здесь:

```text
apps-script/crystal-motors-to-bd.gs
```

Как поставить:

1. Откройте таблицу `CM BD`.
2. Перейдите в `Extensions -> Apps Script`.
3. Удалите пустой код и вставьте содержимое `apps-script/crystal-motors-to-bd.gs`.
4. Нажмите Save.
5. В выпадающем списке функций выберите `setupAndRefreshCrystalMotorsSync`.
6. Нажмите Run и выдайте права.
7. Дождитесь завершения выполнения.

После этого:

- вкладка `BD` наполнится строками авто;
- вкладка `sync_log` покажет статус синхронизации или ошибку;
- обновление будет идти раз в 30 минут.

Если вы уже запускали `setupCrystalMotorsSync` и в `sync_log` есть только строка `setup / OK`, просто выберите функцию `refreshCrystalMotorsCatalog` и нажмите Run. Именно она наполняет `BD`.

Для быстрой проверки парсера можно запустить функцию `testCrystalMotorsParser`: она запишет результат в `sync_log` и вернет первые найденные авто в Apps Script execution log.

Также CSV можно передать через URL:

```text
https://yourname.github.io/auto-search-assistant/?csv=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2Fe%2F...%2Fpub%3Foutput%3Dcsv
```

Стартовый запрос тоже можно передать через URL:

```text
https://yourname.github.io/CM66-BDCARS/?q=камри
```

## Интеграция в CRM

Вариант 1: отдельная страница CRM

```html
<iframe
  src="https://yourname.github.io/auto-search-assistant/?csv=ENCODED_CSV_URL"
  style="width: 100%; height: 100vh; border: 0;"
></iframe>
```

Вариант 2: скопировать папку ассистента внутрь CRM и открыть `/assistant/`.

## Что редактировать

- `js/search-dictionary.js` - словарь марок, моделей, городов, разговорных вариантов.
- `js/config.js` - источник CSV и лимит результатов.
- `css/chat.css` - внешний вид чата.
