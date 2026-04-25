🧠 TECH SPEC — NODE-BASED DRIFT WORLD (STRICT)
0. ЦЕЛЬ

Реализовать:

бесконечный процедурный мир из node-комнат,
где drift влияет на генерацию, а не только на визуал.

1. ❌ ЗАПРЕЩЕНО
❌ Нет Level0 как “основного мира”
❌ Нет фиксированной карты/лабиринта
❌ Нет overlay-only biome
❌ Нет scene switching
❌ Нет “вся игра в одной геометрии”
2. 🧱 БАЗОВАЯ ЕДИНИЦА
Node {
  id,
  seed,
  type,
  stability,
  connections: {N,S,E,W}
}
3. 🌐 ГЕНЕРАЦИЯ
При движении игрока:
move(direction):
  if (!nodeExists):
     createNode(seed + directionHash)
  loadNode()
ВАЖНО:
нет глобальной карты
только локальные node
генерация детерминирована seed
4. 🧠 BIOME = TYPE NODE
types = [
  "urban",
  "ocean",
  "void",
  "corridor",
  "hazard"
]
❗ НЕ ВИЗУАЛ

type влияет на:

геометрию
освещение
события
вероятность spawn
5. 🌪 DRIFT ВЛИЯЕТ НА ГЕНЕРАЦИЮ
if (drift < 30):
  type = mostly "corridor"

if (drift 30–60):
  mix types

if (drift > 60):
  allow "void", "ocean", unstable nodes
drift НЕ ТОЛЬКО события

Он влияет на:

node.type
node.stability
eventChance
6. 🧩 СТАБИЛЬНОСТЬ NODE
node.stability = 0..1
высокая → нормальная комната
низкая → искажения / collapse
7. 🎯 ФРАГМЕНТЫ
spawn if node.stability > 0.7
не привязаны к Level0
не фиксированы по карте
генерируются динамически
if collected >= 5:
   triggerStabilization()
8. 🏃 RUN EVENT
if hazard OR high drift:
  lockDirectionForward()
  speedUp()
  disableBacktracking()
комнаты позади исчезают
генерация ускоряется
9. 🌌 SKY / FALL

НЕ уровень

if node.type == "void":
   enableLowGravity()
   allowVerticalTransition()
10. 🌊 OCEAN / CITY

НЕ overlay

urban_high → здания, крыши  
ocean → вода + обломки  
11. 🚪 PORTAL

НЕ teleport

onUsePortal:
   forceNextNodeType("urban" | "void" | etc)
12. 🧍 LEVEL 0
маленькая зона
фиксированная
без drift
exit → enableNodeSystem()
13. 🧠 SANITY
low sanity:
  increase drift chance
  allow fake nodes
14. 👥 MULTIPLAYER

синхронизация:

seed
globalDrift
player positions

НЕ синхронизируется:

визуальные искажения
фейковые комнаты
15. 💀 СИНГУЛЯРНОСТЬ
if drift >= 100:
   nodes lose structure
   connections randomize
⚡ КРИТИЧЕСКОЕ ПРАВИЛО

Любая новая механика должна работать через node или drift.
Если она работает “сама по себе” → она запрещена.
