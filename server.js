// ============================================================
//  Backrooms Online — WebSocket relay server
//  Запуск:   npm run server
//  Стоп:     Ctrl + C
// ============================================================
//  Игроки подключаются по адресу ws://<IP-этого-ПК>:3000
//  (или ws://localhost:3000 если все на одном компе)
// ============================================================

const { WebSocketServer } = require('ws');
const os  = require('os');
const PORT = process.env.PORT || 3000;

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
  let peerId   = null;
  let roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── host: create a new room ──────────────────────────
    if (msg.type === 'host') {
      peerId   = msg.id;
      roomCode = gen4();
      // ensure uniqueness
      while (rooms.has(roomCode)) roomCode = gen4();
      rooms.set(roomCode, { peers: new Map([[peerId, ws]]) });
      console.log(`[Room ${roomCode}] Создана игроком ${peerId.slice(0, 6)}`);
      ws.send(JSON.stringify({ type: 'hosted', code: roomCode }));
      return;
    }

    // ── join: enter existing room ────────────────────────
    if (msg.type === 'join') {
      peerId   = msg.id;
      roomCode = msg.code;
      const room = rooms.get(roomCode);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', text: `Комната ${roomCode} не найдена` }));
        return;
      }
      // tell every existing peer about the newcomer
      broadcast(room, { type: 'peer_joined', id: peerId });
      // tell newcomer about every existing peer
      for (const [pid] of room.peers) {
        ws.send(JSON.stringify({ type: 'peer_joined', id: pid }));
      }
      room.peers.set(peerId, ws);
      ws.send(JSON.stringify({ type: 'joined', code: roomCode }));
      console.log(`[Room ${roomCode}] ${peerId.slice(0, 6)} подключился (${room.peers.size} игр.)`);
      return;
    }

    // ── relay everything else to all room members ────────
    if (roomCode && peerId) {
      const room = rooms.get(roomCode);
      if (!room) return;
      msg.from = peerId;
      broadcast(room, msg, peerId);
    }
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
