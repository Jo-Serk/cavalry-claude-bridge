# Проверенные факты об API Cavalry

Всё ниже проверено на живой сцене через Stallion.

## Содержание
- Слои и иерархия
- Атрибуты и значения
- Связи
- Создание и удаление
- Duplicator и Random
- Тип распределения (Distribution)
- Рендер и файлы

## Слои и иерархия

- `api.getAllSceneLayers()` без аргументов возвращает все узлы, включая `compNode#1` и служебные узлы (`random`, `value2Array` и т. п.).
- `api.getCompLayers(x)` принимает один аргумент и возвращает содержимое композиции.
- Не существуют: `getLayerIds`, `getLayerName`, `getNodeType`, `writeTextFile`, `print`.
- Работают: `getNiceName(id)`, `getLayerType(id)`, `getParent(id)`, `getChildren(id)`, `getActiveComp()`, `getFrame()`, `getSelection()`.
- `getBoundingBox(id, worldSpace)` требует два аргумента.

## Атрибуты и значения

- `getAttributes(id)`, `get(id, attr)`, `set(id, { attr: value })`, `isAttrDefault`, `getAttrType`, `getAttributeDefinition`.
- Векторы это `{x, y}` или `{x, y, z}`, цвета `{r, g, b, a}` в диапазоне 0–255.
- Массивы: `addArrayIndex(id, "shapes")`, `getArrayCount`, `getAttrChildren`; элементы называются `shapes.0`, `shapes.1` и т. д.
- `getAttributeDefinition(...)` даёт тип, значение по умолчанию, `numericInfo` (hardMin, softMin, softMax, step) и `enumValues`. `enumValues` бывает неполным: у старого атрибута `generator.distributionMode` там только 2 значения.

## Связи

- Читать: `getInConnectedAttributes(id)`, `getInConnection(id, attr)` (строка вида `node.attr`), `getOutConnectedAttributes(id)`, `getOutConnections(id, attr)` (массив).
- Создать: `api.connect(fromId, "id", toId, attr)`. Разорвать: `api.disconnectInput(id, attr)`.
- `connect` не бросает ошибку и молча ничего не делает, если слот массива ещё не создан (сначала `addArrayIndex`) или вход уже занят (сначала `disconnectInput`). Всегда проверяй `getInConnection`.
- Инструмент `cavalry_connect` делает эти шаги сам (создаёт слот, снимает занятый вход, проверяет результат).
- После удаления узла-драйвера атрибут сохраняет его последнее значение, его нужно сбросить вручную.
- У атрибута один вход. Слоты Behaviour Mixer составные (`behaviour.N.id`), и массив `value2Array` в них не подключился.

## Создание и удаление

- `api.create("тип", "Имя")` возвращает id. Типы: `api.getAllLayerTypes(true)` даёт массив `{name, type}` (например `duplicator`, `random`, `value2Array`, `behaviourMixer`, `basicShape`).
- `api.deleteLayer(id)`, `api.layerExists(id)`.

## Duplicator и Random

- Исходная фигура подключается как `shape.id → duplicator.shapes.0` (сначала `addArrayIndex(dup, "shapes")`).
- Поклонные атрибуты: `shapePosition`, `shapeRotation`, `shapeScale`, `shapeSkew`, `shapeOpacity` и др.
- Узел `random` (атрибуты `minimum`, `maximum`, `seed`, `strength`, `separateChannels`, `useIndex`, `offset`) подключается как `random.id → duplicator.shapePosition`. `separateChannels: true` даёт независимый разброс по X и Y.

## Тип распределения (Distribution) у Duplicator

- Распределение хранится как отдельный узел-генератор. Менять его нужно через API, а не через `generator.distributionMode`.
- Сменить: `api.setGenerator(dupId, "generator", "circleDistribution")`. Проверить: `api.getCurrentGeneratorType(dupId, "generator")` (имя типа) и `api.getCurrentGenerator(dupId, "generator")` (id узла, например `circleDistribution#1`). `api.getGenerators(layerId)` возвращает группы генераторов слоя (`generator`, `material`, `stroke`).
- **Неизвестное имя типа не вызывает ошибку, генератор просто остаётся прежним.** Всегда сверяйся с `getCurrentGeneratorType`.
- Типы, подтверждённые на живой сцене: `arrayDistribution`, `circleDistribution`, `customDistribution`, `fibonacciDistribution`, `gridDistribution`, `linearDistribution`, `maskDistribution`, `mathDistribution`, `particleDistribution`, `pathDistribution`, `pointDistribution`, `randomDistribution`, `roseDistribution`, `shuffleDistribution`, `sortDistribution`, `transformDistribution`, `voxelizeDistribution`. Для пунктов Intersections, Shape Edges, Shape Points и Sub-Mesh имена по шаблону `<имя>Distribution` не подошли.
- После смены типа набор атрибутов `generator.*` перестраивается и получает значения по умолчанию нового типа. Circle: `angle`, `count` (3), `flip`, `includeEnd`, `radius` (200), `startAngle`, `travel`, `useIndex`, `calculateRotations`. Fibonacci: `angle` (360), `count` (50), `radius` (250). Grid: `count`, `direction`, `offset`, `size`. Linear: `count`, `direction`, `size`.

## Рендер и файлы

- `api.renderPNGFrame(path, scale)` работает синхронно; `scale` в процентах (100 = полный размер, 0.5 даст крошечную картинку).
- Вспомогательные: `getTempFolder()`, `filePathExists`, `deleteFilePath`, `writeToFile`, `readFromFile`.
