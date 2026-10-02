# Cavalry Bridge для Claude

Позволяет Claude **видеть, править и просматривать вашу сцену в [Cavalry](https://cavalry.studio)**: читать слои и связи, менять атрибуты через JavaScript, соединять узлы, переключать распределение у Duplicator и рендерить кадр, чтобы проверить результат.

[English](README.md) | Русский

## Установка (2 шага, без терминала)

1. **Скачайте** `cavalry-claude-bridge.mcpb` из [последнего релиза](../../releases/latest) и **дважды кликните по файлу**. Claude Desktop покажет окно установки: нажмите **Install**.
   (Или: Claude Desktop → Settings → Extensions → перетащите файл.)
2. **В Cavalry** запустите **Scripts → Stallion**. В окне должно быть `Listening on 127.0.0.1:8080`.

Теперь напишите Claude: *«Покажи мою сцену в Cavalry»*. Перед каждым вызовом инструмента Claude спросит разрешение.

Node.js ставить **не нужно** и конфиги править не нужно: в Claude Desktop есть свой Node.js, а `.mcpb` содержит весь сервер в одном файле.

## Требования

| Что | Примечание |
|---|---|
| Cavalry со скриптами JavaScript | В Cavalry скрипты доступны с лицензией Professional; на Starter запускаются только зашифрованные скрипты ([документация](https://docs.cavalry.scenegroup.co/tech-info/scripting/getting-started)). |
| Запущенный Stallion в Cavalry | `Scripts → Stallion`. Если пункта нет, смотрите проект [Stallion](https://github.com/scenery-io/stallion). |
| Claude Desktop (Windows или macOS) | Работает с бесплатным аккаунтом Claude. На macOS автор не проверял. |

## Что умеет Claude

| Инструмент | Что делает |
|---|---|
| `cavalry_get_scene` | Снимок сцены: иерархия, изменённые атрибуты, выражения, анимация, **связи между узлами**. |
| `cavalry_execute_script` | Выполняет JavaScript в Cavalry и возвращает результат, вывод `console.log` и понятные ошибки. |
| `cavalry_connect` | Соединяет два узла: создаёт недостающие слоты, заменяет занятый вход и **проверяет результат** (родной `api.connect` в Cavalry при неудаче молчит). |
| `cavalry_set_distribution` | Меняет тип распределения у Duplicator (circle, fibonacci, grid, linear, ...). |
| `cavalry_render_frame` | Рендерит текущий кадр в PNG, чтобы Claude увидел результат. |
| `cavalry_api_search` | Ищет функции установленного API Cavalry по имени, чтобы Claude не гадал. |
| `cavalry_help` | Короткие проверенные заметки об API и его ловушках по темам ([`knowledge/api-notes.md`](knowledge/api-notes.md)). |

Примеры: *«Поставь Duplicator с распределением Fibonacci на круг и добавь Random на позиции клонов»*, *«Какие слои связаны с Duplicator?»*, *«Отрендери кадр и скажи, что выглядит не так»*.

### Как тратить меньше токенов
- Называйте слои по id (`duplicator#1`), тогда Claude не тратит шаги на поиск.
- Заметки об API Claude читает сам через `cavalry_help`, вставлять их в чат не нужно.
- Рендер по умолчанию в 50% размера; больший просите, только когда нужны детали.

## Если что-то не работает

| Симптом | Что делать |
|---|---|
| «Cannot reach Cavalry at http://127.0.0.1:8080» | Запустите `Scripts → Stallion` в Cavalry. Если в окне другой порт, укажите его в Claude Desktop → Settings → Extensions → Cavalry Bridge → **Stallion port**. |
| «Timeout: no response from Cavalry» | Возможно, лицензия блокирует скрипты, либо скрипт ещё выполняется. |
| Инструменты не появились | Полностью закройте Claude Desktop (значок в трее → Quit) и запустите заново. |
| `Argument count does not match function definition` | Функция API есть, но вызвана с неверным числом аргументов. Попросите Claude воспользоваться `cavalry_api_search`. |

## Безопасность

Claude может выполнять **любой JavaScript внутри Cavalry**, в том числе удалять слои. Это не ограничено сценой: собственный API Cavalry умеет делать исходящие сетевые запросы, открывать произвольные URL или локальные `file://` пути и поднимать свой HTTP-сервер — всё это с вашего компьютера. **Сохраняйте сцену** перед крупными правками и читайте запросы разрешений. Сам Stallion слушает только `127.0.0.1`; запускайте его, когда он нужен.

## Другие MCP-клиенты (Claude Code, Cursor, ...)

`.mcpb` это обычный zip: распакуйте его и используйте `server/index.js`, либо соберите из исходников (ниже).

```json
{
  "mcpServers": {
    "cavalry": {
      "command": "node",
      "args": ["/абсолютный/путь/к/server/index.js"],
      "env": { "CAVALRY_PORT": "8080" }
    }
  }
}
```

## Как это устроено

```
Claude Desktop ──stdio (MCP)──> server/index.js ──HTTP POST──> Stallion (в Cavalry, 127.0.0.1:8080)
                                       ^                              │ выполняет скрипт и
                                       └──────── временный JSON <──── api.writeToFile(результат)
```

Stallion принимает скрипты, но не возвращает результат. Поэтому каждый скрипт оборачивается: выполняется в `try/catch`, перехватывает `console.log` и пишет JSON-файл с результатом, который сервер читает. API Cavalry бросает ошибки обычными строками, обёртка превращает их в читаемые сообщения.

## Сборка из исходников

```bash
git clone <этот репозиторий> && cd cavalry-claude-bridge
npm install
npm run build      # проверка типов + сборка в server/index.js
npm test           # сквозной тест на поддельном Cavalry
npm run pack       # dist/cavalry-claude-bridge.mcpb
```

Выпуск версии: поднимите `version` в `manifest.json` и `package.json`, затем отправьте тег `vX.Y.Z`. Workflow соберёт, протестирует и приложит `.mcpb` к релизу на GitHub.

Заметки об API лежат в [`knowledge/api-notes.md`](knowledge/api-notes.md) (делятся на темы по заголовкам `##` и отдаются через `cavalry_help`). Исправления приветствуются: каждая строка должна быть проверена на реальной сцене.

Дополнительно: [`extras/skill`](extras/skill) это Claude Skill с теми же заметками для тарифов, где скиллы поддерживаются. Расширению он не нужен.

## Благодарности

- [Stallion](https://github.com/scenery-io/stallion) от scenery.io: мост внутри Cavalry.
- [kacperchlebowicz/Cavalry-mcp](https://github.com/kacperchlebowicz/Cavalry-mcp): более ранний MCP-сервер для Cavalry (MIT), с которого начался этот проект.

Проект не связан с Scene Group (Cavalry) и Anthropic.

## Лицензия

MIT, см. [LICENSE](LICENSE).
