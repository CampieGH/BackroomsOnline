// ============================================================
//  Backrooms Online — WebSocket relay server
//  Запуск:   npm run server
//  Стоп:     Ctrl + C
// ============================================================

const { WebSocketServer } = require('ws');
const os  = require('os');

const PORT          = process.env.PORT || 3000;
const MAX_MSG_BYTES = 4096;   // максимальный размер одного сообщения
const MAX_ROOM_SIZE = 8;      // максимум игроков в комнате

// rooms: code (string) -> { peers: Map<peerId, ws> }
const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

// ── helpers ────────────────────────────────────────────────
function broadcast(room, msg, exceptId = null) {
  const json = JSON.stringify(msg);
  for (const [id, ws] of room.peers) {
    if (id !== exceptId && ws.readyState === 1 /* OPEN */) {
      ws.send(json);
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function gen4() {
  return String(1000 + Math.floor(Math.random() * 9000));
}

function localIPs() {
  const nets = os.networkInterfaces();
  const out  = [];
  for (const iface of Object.values(nets)) {
    for (const n of iface) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

// ── startup banner ─────────────────────────────────────────
console.log('');
console.log('┌─────────────────────────────────────────────┐');
console.log('│         BACKROOMS ONLINE — SERVER            │');
console.log('└─────────────────────────────────────────────┘');
console.log(`  Слушаю порт: ${PORT}`);
console.log('');
const ips = localIPs();
if (ips.length) {
  console.log('  Адреса для подключения:');
  console.log(`    Локально (этот ПК):  ws://localhost:${PORT}`);
  for (const ip of ips) {
    console.log(`    По сети (LAN):       ws://${ip}:${PORT}`);
  }
} else {
  console.log(`  ws://localhost:${PORT}`);
}
console.log('');
console.log('  Ctrl+C — остановить сервер');
console.log('─────────────────────────────────────────────────');
console.log('');

// ── connection handler ─────────────────────────────────────
wss.on('connection', (ws) => {
  let peerId   = null;   // UUID, устанавливается один раз при host/join
  let roomCode = null;   // устанавливается один раз при host/join

  ws.on('message', (raw, isBinary) => {
    // ── защита: только текст, лимит размера ─────────────
    if (isBinary) return;
    if (raw.length > MAX_MSG_BYTES) {
      console.warn(`[!] Слишком большое сообщение (${raw.length} bytes), сброс`);
      return;
    }

    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (typeof msg !== 'object' || msg === null) return;

    const type = msg.type;

    // ── уже в комнате — игнорируем повторный host/join ──
    if (peerId !== null) {
      if (type === 'host' || type === 'join') return;
      // relay всего остального
      const room = rooms.get(roomCode);
      if (!room) return;
      msg.from = peerId;   // server задаёт отправителя, клиент не может подделать
      broadcast(room, msg, peerId);
      return;
    }

    // ── host: создать комнату ────────────────────────────
    if (type === 'host') {
      const clientId = String(msg.id ?? '').slice(0, 64);
      if (!clientId) return;

      peerId   = clientId;
      roomCode = gen4();
      while (rooms.has(roomCode)) roomCode = gen4();

      rooms.set(roomCode, { peers: new Map([[peerId, ws]]) });
      console.log(`[Room ${roomCode}] Создана игроком ${peerId.slice(0, 6)}`);
      send(ws, { type: 'hosted', code: roomCode });
      return;
    }

    // ── join: войти в комнату ────────────────────────────
    if (type === 'join') {
      const clientId = String(msg.id   ?? '').slice(0, 64);
      const code     = String(msg.code ?? '').trim();
      if (!clientId || !code) return;

      const room = rooms.get(code);
      if (!room) {
        send(ws, { type: 'error', text: `Комната ${code} не найдена` });
        return;
      }
      if (room.peers.size >= MAX_ROOM_SIZE) {
        send(ws, { type: 'error', text: `Комната заполнена (макс. ${MAX_ROOM_SIZE})` });
        return;
      }

      peerId   = clientId;
      roomCode = code;

      // сообщить существующим пирам о новом игроке
      broadcast(room, { type: 'peer_joined', id: peerId });
      // сообщить новому игроку о каждом существующем
      for (const [pid] of room.peers) {
        send(ws, { type: 'peer_joined', id: pid });
      }
      room.peers.set(peerId, ws);
      send(ws, { type: 'joined', code: roomCode });
      console.log(`[Room ${roomCode}] ${peerId.slice(0, 6)} подключился (${room.peers.size} игр.)`);
      return;
    }

    // неизвестное сообщение до регистрации — игнорируем
  });

  ws.on('close', () => {
    if (!roomCode || !peerId) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.peers.delete(peerId);
    console.log(`[Room ${roomCode}] ${peerId.slice(0, 6)} отключился (${room.peers.size} игр.)`);
    broadcast(room, { type: 'peer_left', id: peerId });
    if (room.peers.size === 0) {
      rooms.delete(roomCode);
      console.log(`[Room ${roomCode}] Пустая — удалена`);
    }
  });

  ws.on('error', (e) => {
    console.error(`WS ошибка: ${e.message}`);
  });
});
