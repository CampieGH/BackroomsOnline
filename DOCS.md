# BackroomsOnline — Полная документация проекта

## Стек и архитектура

| Слой | Что используется |
|---|---|
| Рендер | Three.js r0.160.0 (CDN importmap, без сборщика) |
| Физика | Самописный AABB-коллайдер (`Physics.js`) |
| Аудио | WebAudio API, процедурный синтез |
| Сеть | Trystero (P2P через Nostr-релеи, lazy-import) |
| Текстуры | Canvas 2D API, процедурная генерация |
| Случайность | Mulberry32 seeded PRNG |

Точка входа — `index.html` → `src/main.js`. Никаких npm-сборщиков, всё работает напрямую в браузере через нативные ES-модули и importmap.

---

## Файловая структура

```
BackroomsOnline/
├── index.html              — HTML-каркас, importmap, все DOM-элементы HUD
├── style.css               — все стили: HUD, оверлеи, VHS-фильтры, grain, scanlines
├── src/
│   ├── main.js             — точка входа, главный цикл, wiring всех систем
│   ├── config.js           — все числовые константы игры
│   ├── textureConfig.js    — параметры процедурных текстур
│   ├── core/
│   │   ├── EventBus.js     — pub/sub шина событий
│   │   └── GameState.js    — глобальный контейнер состояния
│   ├── engine/
│   │   ├── Renderer.js     — Three.js сцена, камера, туман, ambient
│   │   ├── Physics.js      — AABB коллайдеры + floor segments
│   │   └── AudioEngine.js  — WebAudio: ambient hum, footsteps, blips
│   ├── player/
│   │   ├── Player.js       — движение, камера, здоровье, FX
│   │   ├── Controls.js     — клавиатура + pointer lock мышь
│   │   ├── Inventory.js    — 4 слота предметов
│   │   └── Sanity.js       — счётчик рассудка
│   ├── items/
│   │   ├── Item.js         — базовый класс предмета
│   │   ├── ItemRegistry.js — фабрика предметов по id
│   │   ├── Flashlight.js   — фонарик (батарея, overcharge, SpotLight)
│   │   ├── AlmondWater.js  — восстанавливает рассудок
│   │   ├── FirstAidKit.js  — восстанавливает здоровье
│   │   ├── RoyalRation.js  — восстанавливает здоровье
│   │   ├── OverchargedBattery.js — перезаряжает фонарик ×2
│   │   └── RealityFragment.js    — условие победы (нужно 5)
│   ├── net/
│   │   ├── NetworkManager.js — Trystero P2P, host/join, tick
│   │   ├── Protocol.js       — формат сетевых сообщений
│   │   └── RemotePlayer.js   — аватар удалённого игрока (интерполяция)
│   ├── entities/
│   │   └── Smiler.js         — враг: преследует игрока, боится фонарика
│   ├── fx/
│   │   └── CameraOverlay.js  — VHS-эффект на canvas-оверлее
│   ├── ui/
│   │   ├── Menu.js           — главное меню и пауза
│   │   ├── HUD.js            — HP/SAN/BAT бары, инвентарь, чат
│   │   ├── DeathScreen.js    — экран смерти + респаун
│   │   └── EndScreen.js      — финальный экран (победа/проигрыш)
│   ├── world/
│   │   ├── Hub.js            — стартовый офис (безопасная зона)
│   │   ├── Level0.js         — процедурный лабиринт (основной уровень)
│   │   └── objects/
│   │       ├── Interactive.js    — базовый интерактивный объект
│   │       ├── SupplyCrate.js    — ящик с лутом
│   │       ├── FragmentPickup.js — осколок реальности
│   │       ├── ChargerDock.js    — зарядная станция фонарика
│   │       ├── VendingMachine.js — автомат (Almond Water)
│   │       └── InfoBoard.js      — доска с информацией
│   └── utils/
│       ├── Helpers.js    — clamp, lerp, damp, mulberry32, hashString
│       ├── rng.js        — seededRNG (Mulberry32 PRNG)
│       └── textures.js   — процедурные Canvas текстуры
```

---

## Ядро (`core/`)

### `EventBus.js`
Минималистичный pub/sub без приоритетов и wildcards. Хранит слушателей в `Map<string, Set<fn>>`. `on()` возвращает функцию отписки. Все системы общаются через `bus.emit(EVT.XXX, payload)`.

**Ключевые события (`EVT`):**
- `GAME_START / PAUSE / RESUME / EXIT` — состояние игры
- `PLAYER_HP_CHANGED / SAN_CHANGED / DIED / RESPAWN` — здоровье
- `INVENTORY_CHANGED / SLOT_SELECTED / ITEM_PICKED / ITEM_USED` — инвентарь
- `FLASHLIGHT_TOGGLED / FLASHLIGHT_BATTERY` — фонарик
- `INTERACT_AVAILABLE / INTERACT_NONE` — подсветка взаимодействия
- `CHAT_MESSAGE` — системные и пользовательские сообщения в HUD
- `NETWORK_INFO / ZONE_PROGRESS` — мультиплеер

### `GameState.js`
Глобальный синглтон `state`. Содержит ссылки на `player`, `world`, `renderer`, `physics`, `audio`, текущий `mode` (MENU / PLAYING / PAUSED / DEAD / ENDED), счётчики `time` / `delta` / `frame`. Не содержит логики — только данные для чтения другими системами.

---

## Движок (`engine/`)

### `Renderer.js`
Создаёт `THREE.WebGLRenderer` с ACES filmic tone mapping (exposure 1.4), без shadow map (отключены для производительности). Сцена с туманом `THREE.Fog` (near/far из config). Камера `PerspectiveCamera(75°)`, добавлена прямо в сцену чтобы дочерние SpotLight'ы получали мировые матрицы. AmbientLight с цветом и интенсивностью из config. При resize обновляет aspect ratio.

### `Physics.js`
Самописный AABB-коллайдер без BVH. Два типа примитивов:
- **`colliders[]`** — оси-параллельные боксы (стены). Добавляются через `addBox(min, max)`, удаляются по ссылке через `removeBox(ref)`.
- **`floorSegments[]`** — горизонтальные прямоугольники на заданной высоте Y. Позволяют иметь дыры в полу (хаб → Level 0) и несколько уровней пола в одной сцене.

`moveAndSlide(pos, velocity, dt)` — сначала обрабатывает Y (гравитация/прыжок + floor snap), потом X и Z по отдельности. Туннелирование блокируется guard'ом `y >= s.y - 4`.

`raycastInteractables(origin, dir, maxDist, list)` — луч против AABB всех интерактивных объектов, возвращает ближайшее попадание. Используется для подсветки [E].

### `AudioEngine.js`
Всё процедурно, без файлов. Звуки:
- **Ambient** — sawtooth oscillator 60 Hz, gain 0.015 (электрический гул)
- **Footstep** — noise burst с lowpass фильтром 600 Hz, убывающий
- **click** — square 800 Hz, 30ms (UI клики)
- **pickup** — triangle 660 Hz, 120ms
- **drink** — sine 300 Hz, 250ms
- **deny** — sawtooth 200 Hz, 100ms (действие невозможно)

---

## Игрок (`player/`)

### `Player.js`
Главная сущность. Не является Three.js объектом — хранит `position: Vector3` и управляет камерой напрямую.

**Движение:**
- Нормальный режим: `wishX/Z` из `Controls.moveInput()` + yaw → `velocity` → `physics.moveAndSlide()`
- Fly mode (`dev.fly`): полное 3D движение по направлению взгляда
- Noclip: raw-телепортация без физики

**Падение:** отслеживает `_peakY`. При приземлении: `fallDist > 3m` → урон + shake(1.4), `fallDist > 0.4m` → shake(0.35).

**Camera FX** (`_updateCameraFX` + `_updateCamera`):
- **Head bob** — `sin(_bobPhase * 2) * 0.042` по Y, `sin(_bobPhase) * 0.016` крен. Амплитуда `_bobAmp` плавно нарастает при движении (`damp()`).
- **Дыхание** (всегда) — два независимых синуса разной частоты (0.61 и 1.07 Hz) по Y, (0.38 и 0.71 Hz) по X, крен 0.29 Hz. Никогда не выглядит периодично.
- **Shake** — `_shakeMag` затухает со скоростью 3.5/сек. Добавляется через `addShake(mag)` при уроне или приземлении. Random offset `±mag * 0.048` каждый кадр.

**Рассудок:** если `world.isSafe = false` (Level 0), делегирует в `sanity.update(dt, { inDark, alone })`.

### `Controls.js`
Keyboard state в `keys: Set` (удерживаемые), `pressed: Set` (одиночные нажатия, очищаются через `consumeKey()`). Pointer lock мышь: обновляет `yaw` и `pitch` (зажатый до ±89°). При `!enabled` блокирует все события.

### `Inventory.js`
4 слота (`INVENTORY.slots = 4`). Методы: `add(item)` → первый пустой слот; `dropActive()` / `useActive(ctx)` → вызывает `item.onDrop()` / `item.onUse(ctx)`. `snapshot()` возвращает `[{id, name}|null, ...]` для HUD. Эмитит `INVENTORY_CHANGED` и `ITEM_PICKED/DROPPED/USED` на каждое изменение.

### `Sanity.js`
Значение 0–100. Дрейфует вниз при:
- `inDark` (фонарик выключен): −0.08/сек (~20 минут до нуля)
- `alone` (нет игроков рядом) + после `aloneThresholdSec=60` ожидания: −0.04/сек

---

## Предметы (`items/`)

### `Item.js`
Базовый класс: `id`, `name`. Хуки: `onPickup()`, `onDrop()`, `onUse(ctx)` → возвращает `true` если предмет потреблён.

### `ItemRegistry.js`
Map-фабрика `id → constructor`. `ItemRegistry.create('almond_water')` → `new AlmondWater()`. Регистрируются все 6 типов при импорте модуля.

### `Flashlight.js`
SpotLight (angle π/5.5, penumbra 0.45, decay 1.1, intensity 42) прикреплён к камере. Батарея 100 → тратится 1.5/сек при включённом. Заряжается у ChargerDock. **Overcharge** (от OverchargedBattery): intensity ×2, drain ×2.5, длится `_overcharge` секунд. При батарее < 10 → случайное мигание (10% кадров). Эмитит `FLASHLIGHT_BATTERY` при каждом изменении целого числа.

### Расходники

| Предмет | Эффект |
|---|---|
| `AlmondWater` | +30 SAN |
| `FirstAidKit` | +50 HP |
| `RoyalRation` | +50 HP |
| `OverchargedBattery` | +100 battery + overcharge mode |
| `RealityFragment` | победный предмет (нужно 5) |

---

## Сеть (`net/`)

### `NetworkManager.js`
Trystero загружается через `dynamic import('https://esm.sh/trystero/nostr')` только при нажатии Host/Join (не блокирует старт игры). P2P через Nostr-релеи — не нужен собственный сервер.

- **Host**: генерирует 4-значный код, создаёт комнату, при подключении нового пира сразу шлёт `worldSeed` — тот строит тот же лабиринт.
- **Join**: подключается к коду, вызывает `waitForSeed()` — Promise с timeout 15 сек.
- **tick(dt, player)**: 20 раз/сек шлёт `makeStateMsg()` всем пирам.

### `Protocol.js`
Одна функция `makeStateMsg()`. Формат пакета:
```js
{ type, id, pos[3], rot[2], crouch, fl, vote, drift, hp, san, t }
```

### `RemotePlayer.js`
Capsule (тело) + Sphere (голова) + SpotLight (фонарик). Получает состояние через `applyState()`, интерполирует позицию и ротацию через `damp()` (коэффициент 14–16) для скрытия сетевого джиттера. Голова отдельно вращается по pitch.

---

## Мир (`world/`)

### `Hub.js`
Стартовый офис 20×20 м (hubFloorY = Y=30 в мировых координатах). Пол — визуально цельный, но физически разбит на 5 сегментов с дырой 3×3 в центре. `collapseFloor()` — убирает физику пола и визуальный меш (игрок проваливается на Level 0 при голосовании). Интерактивы: ChargerDock (запад), VendingMachine (СВ угол), InfoBoard (юг).

Свет: 5 PointLight'ов холодно-белый (~0xf0f4ff), intensity 9, очень слабое мерцание (±1.5%) — офисный гул ламп.

### `Level0.js`
Главный процедурный уровень. Бесконечный лабиринт делится на чанки.

**Константы:**

| Константа | Значение | Что означает |
|---|---|---|
| `CHUNK_CELLS` | 4 | ячеек по стороне чанка |
| `CELL_SIZE` | 8 м | ширина одного коридора |
| `CHUNK_SIZE` | 32 м | сторона чанка |
| `LOAD_R` | 1 | радиус загрузки (3×3 = 9 чанков) |
| `WALL_H` | 3 м | высота стен |
| `WALL_T` | 0.72 м | толщина стен |
| `DEBUG_STRUCTS` | true | показывать debug-обводку структур |

**Жизненный цикл чанка:**
1. `_loadAround(cx, cz)` — каждый кадр при смене чанка игрока
2. `_loadChunk(cx, cz)` — `seededRNG(seed ^ hash(cx, cz))` → `_genMaze(rng, cx, cz)` → `_buildGeometry()` → `_buildItems()`
3. `_unloadChunk()` — удаляет меши (dispose геометрий), физику, entities

**Хранение метаданных:** `_chunkMeta: Map<"cx,cz", { group, physBoxes[], physFloor, fixtures[], entities[], itemsBuilt }>`. Entities хранятся per-chunk для O(1) очистки.

**Генерация лабиринта (`_genMaze`):**
- Recursive backtracker DFS на 4×4 сетке
- Extra looping: 4 случайных E-стены сносятся после DFS (для не-дерева)
- Гарантированные проходы посередине каждой границы чанка (N/S/E/W)
- 6% шанс на структуру-площадь

**Геометрия (`_buildGeometry`):**
- Каждый чанк = 1 merged wall mesh (`mergeGeometries`), 2 plane mesh (пол/потолок), 1 InstancedMesh (световые панели), 2 PointLight'а
- Итого ~5 draw call на чанк, ≤45 на весь loaded area
- **Стены рендерятся только как N и W своей ячейки** — S/E-граница рендерится соседним чанком как его N/W. Это предотвращает Z-fighting.
- Физические AABB добавляются с `T/2` padding по всем сторонам для надёжных углов

**Структуры:**
- `_structPlaza` — открытая комната 3–4 ячейки (24–32 м), 6% шанс на чанк

**Debug-режим (`DEBUG_STRUCTS = true`):**
- Зелёная линия обводки на полу + canvas-спрайт с подписью "ПЛОЩАДЬ" в центре
- Полностью очищается при выгрузке чанка (Line + Sprite материалы dispose)

### Объекты мира (`objects/`)

**`Interactive.js`** — базовый класс. Хранит `aabb: {min, max}` для raycast. Абстрактный `onInteract(ctx)`.

**`SupplyCrate`** — ящик 0.8×0.6×0.8 м. Одноразовый. Лут-таблица задаётся при создании. При открытии выдаёт случайный предмет из таблицы (almond_water / royal_ration / overcharged_battery / first_aid). Визуально темнеет после опустошения.

**`FragmentPickup`** — вращающийся октаэдр с синим PointLight'ом. Пульсирует. При подборе исчезает. Нужно 5 штук для победы.

**`ChargerDock`** — зарядная станция фонарика в хабе. При удержании [E] заряжает батарею (2/сек).

**`VendingMachine`** — автомат с Almond Water в хабе. [E] выдаёт банку если инвентарь не полон.

**`InfoBoard`** — доска с правилами/подсказками и кодом комнаты. [E] выводит информацию в чат.

---

## Враги (`entities/`)

### `Smiler.js`
Чёрный силуэт с белой полоской-ртом и двумя глазами. Постоянно движется к игроку на XZ-плоскости.

**Поведение:**
- `smilerSpeed = 2.6 м/с` — преследование
- `smilerRetreatSpeed = 4.0 м/с` — отступление от фонарика
- Отступает если: `flashlight.on` И `dist < 9 м` И `dot(playerForward, dirToSmiler) > cos(π/7)` (в пределах луча)
- При контакте (`dist < 0.9 м`): −25 HP/сек и −8 SAN/сек (тики каждые 0.5 сек)
- Использует `physics._collidesXZ()` — ходит по стенам как игрок

---

## Эффекты (`fx/`, `style.css`)

### `CameraOverlay.js`
Canvas-оверлей поверх всей сцены (z-index 46). Каждый кадр:
1. **Scan flicker** — 1–2 тонких горизонтальных полосы, opacity 0.025–0.075
2. **Glitch event** (раз в 3.5–12.5 сек): 3–7 цветных полос (тёплые/холодные), добавляет CSS-класс `.vhs-glitch` на `#game-canvas` на время события
3. **VHS roll** (40% от glitch): яркая горизонтальная полоса + тёмная тень под ней
4. **Pixel pop** (0.8%/кадр): одна белая строка

### `style.css` эффекты
- `#game-canvas` — базовый фильтр: `contrast(1.07) saturate(0.80) brightness(0.94)` — ретро-камерный тон
- `.vhs-glitch` — `contrast(1.35) saturate(0.28) brightness(1.08) translateX(3px)` — сигнал-дропаут
- `#corner-vignette` — постоянная тёмная радиальная виньетка по углам
- `#grain` — SVG feTurbulence noise, opacity 0.07, анимация 7fps с random offset
- `#scanlines` — repeating-linear-gradient (тонкие горизонтальные полосы 1/4px, opacity 0.09)

---

## UI (`ui/`)

### `HUD.js`
Слушает EVT-события и обновляет DOM:
- HP-бар (зелёный), SAN-бар (жёлтый), BAT-бар (синий) — `width: X%`
- SAN < 50 → красная виньетка на `#vignette` (box-shadow inset)
- Инвентарь — 4 слота, активный подсвечен золотым
- Чат — последние сообщения снизу-слева, исчезают через 5 сек
- `#level-name` — название биома по центру сверху
- `#zone-counter` — прогресс голосования за destabilize

### `Menu.js`
Показывает/прячет `#menu` и `#pause`. Обрабатывает кнопки → `bus.emit(EVT.GAME_START, { mode })`. Для Join показывает поле ввода кода.

### `DeathScreen.js` / `EndScreen.js`
Управляют `#death` и `#end-screen`. DeathScreen: таймер респауна 5 сек, кнопка немедленного респауна. EndScreen: два типа — `stabilization` (синий) и `singularity` (красный пульсирующий).

---

## Утилиты (`utils/`)

### `Helpers.js`
- `clamp(v, lo, hi)` — ограничение значения
- `lerp(a, b, t)` — линейная интерполяция
- `damp(a, b, lambda, dt)` — экспоненциальное сглаживание: `lerp(a, b, 1 - e^(-λ·dt))`. Используется везде для плавного движения без зависимости от FPS.
- `mulberry32(seed)` — детерминированный PRNG
- `hashString(str)` — FNV-1a хеш строки → uint32

### `rng.js`
`seededRNG(seed)` — тот же Mulberry32, но в отдельном файле. Используется исключительно для генерации мира: одинаковый seed → одинаковый лабиринт на всех клиентах.

### `textures.js`
6 процедурных текстур (все параметры в `textureConfig.js`):

| Функция | Где используется | Что генерирует |
|---|---|---|
| `makeWallTexture()` | Level0 стены | градиент + горизонтальные полосы + пятна |
| `makeFloorTexture()` | Level0 пол | ворс ковра + сырые пятна |
| `makeCeilingTexture()` | Level0 потолок | перфорированные панели + разводы |
| `makeOfficePlasterTexture()` | Hub стены | штукатурка: швы гипрока + разводы |
| `makeOfficeCarpetTexture()` | Hub пол | офисный ковёр с сеткой плиток |
| `makeCautionTexture()` | Hub (дыра) | жёлто-чёрная предупреждающая лента |

Все текстуры: `RepeatWrapping`, anisotropy 8, `SRGBColorSpace`, добавляется шум пикселей + random spots.

---

## Главный цикл (`main.js`)

```
requestAnimationFrame → frame(now)
  dt = clamp(now - lastT, 0, 50ms)   ← cap 20 FPS minimum
  if PLAYING:
    handleInput()         ← consume one-shot keys
    updateNearbyPeers()   ← считает игроков в радиусе 8м
    player.update(dt)     ← движение, камера, рассудок
    world.update(dt, ctx) ← Hub + Level0 (chunk load/unload, entities)
    updateInteraction()   ← raycast → показать/скрыть [E] промпт
    checkVote()           ← голосование за обрушение пола хаба
    checkEndConditions()  ← 5 фрагментов → победа
    network.tick(dt)      ← отправить state 20 Hz
  remotes.forEach(rp.update)   ← интерполяция удалённых игроков
  cameraOverlay.update(dt)     ← VHS эффекты
  renderer.render()
```

**Голосование `checkVote()`:** все игроки (локальный + удалённые) должны нажать [V] рядом с дырой в хабе. При 100% голосов → `hub.collapseFloor()` → физика пола удаляется → все проваливаются на Level 0 (hubFloorY Y=30 → level0FloorY Y=10, падение 20 м).

**Dev-панель ([`` ` ``]):** 4 пункта — Яркость, Полёт, No-clip, Ускорение ×4. Навигация стрелками, Enter — toggle.

---

## Конфигурация (`config.js`)

Все игровые числа централизованы. Основные:

| Группа | Ключевые параметры |
|---|---|
| `PLAYER` | walkSpeed 4, sprintSpeed 6.5, crouchSpeed 2, jumpVelocity 7, gravity 20 |
| `SANITY` | max 100, darkLossPerSec 0.08, aloneLossPerSec 0.04, aloneThreshold 60s |
| `HEALTH` | max 100, fallDamageMin 2m, fallDamageAmount 10 |
| `FLASHLIGHT` | batteryMax 100, drainPerSec 1.5, chargePerSec 2, intensity 42 |
| `WORLD` | tileSize 4, wallHeight 3, fogNear 6, fogFar 38, hubFloorY 30, level0FloorY 10 |
| `LIGHT` | flickerHz 1.1, fixtureIntensity 9, ambientIntensity 1.5 |
| `ENTITY` | smilerSpeed 2.6, smilerFlashRange 9, smilerDPS 25 |
| `BIOMES` | backrooms / poolrooms / ruins — цвета стен, тумана, света |
