import * as THREE from 'three';
import { Interactive } from './Interactive.js';

// Information board. Shows a canvas texture with player stats.
// Phase 1: just shows local player — updated each frame.

export class InfoBoard extends Interactive {
  constructor(position) {
    super({
      position,
      size: { x: 2.0, y: 1.2, z: 0.1 },
      label: 'Info Board',
      prompt: '(read)',
    });

    this._canvas = document.createElement('canvas');
    this._canvas.width = 512;
    this._canvas.height = 320;
    this._ctx = this._canvas.getContext('2d');
    this._texture = new THREE.CanvasTexture(this._canvas);
    this._texture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(2.0, 1.2);
    const mat = new THREE.MeshBasicMaterial({ map: this._texture });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(position.x, position.y + 0.6, position.z);
    // Assume board faces +Z by default; caller can rotate.

    this._repaint({ hp: 100, san: 100, battery: 100, nickname: 'Player' });
  }

  update(dt, ctx) {
    if (!ctx) return;
    const net = ctx.state?.network;
    const remotes = ctx.state?.remotes;
    this._repaint({
      hp: Math.floor(ctx.player.health),
      san: Math.floor(ctx.player.sanity.value),
      battery: Math.floor(ctx.player.flashlight?.battery ?? 0),
      net,
      remotes,
    });
  }

  _repaint(s) {
    const c = this._ctx;
    // Make the canvas taller if we want more lines later — for now keep 512x320.
    c.fillStyle = '#0d0d0d';
    c.fillRect(0, 0, 512, 320);

    c.fillStyle = '#ffc857';
    c.font = 'bold 22px monospace';
    c.fillText('— BACKROOMS ROSTER —', 90, 32);

    // Local player block
    c.fillStyle = '#e0e0e0';
    c.font = '16px monospace';
    c.fillText(`YOU   HP:${s.hp}  SAN:${s.san}  BAT:${s.battery}`, 20, 62);

    // Network info block
    const net = s.net;
    if (net) {
      c.fillStyle = net.isHost ? '#4aff7a' : '#4aaaff';
      c.font = 'bold 14px monospace';
      c.fillText(net.isHost ? '[HOSTING]' : '[CLIENT]', 20, 92);

      c.fillStyle = '#ffc857';
      c.font = '12px monospace';
      c.fillText('ROOM CODE (share with friends):', 20, 112);

      // Big code in a highlighted box — no ellipsis, easy to read across the room
      c.fillStyle = '#1a1a1a';
      c.fillRect(20, 120, 220, 56);
      c.strokeStyle = '#ffc857';
      c.lineWidth = 2;
      c.strokeRect(20, 120, 220, 56);
      c.fillStyle = '#4aaaff';
      c.font = 'bold 42px monospace';
      c.textAlign = 'center';
      c.fillText(net.code || '----', 130, 162);
      c.textAlign = 'start';

      // Peer list
      c.fillStyle = '#aaa';
      c.font = '13px monospace';
      const peerCount = (s.remotes?.size ?? 0);
      c.fillText(`Connected players: ${peerCount + 1}`, 260, 140);

      let y = 200;
      if (s.remotes && s.remotes.size > 0) {
        for (const id of s.remotes.keys()) {
          c.fillStyle = '#bbb';
          c.font = '12px monospace';
          c.fillText('• ' + id.slice(0, 16) + '…', 30, y);
          y += 16;
          if (y > 290) break;
        }
      } else {
        c.fillStyle = '#666';
        c.font = '12px monospace';
        c.fillText('(waiting for others to join)', 30, 200);
      }
    } else {
      c.fillStyle = '#777';
      c.font = '14px monospace';
      c.fillText('Singleplayer mode.', 20, 105);
      c.fillText('Host a room from the main menu', 20, 130);
      c.fillText('to play with friends.', 20, 150);
    }

    this._texture.needsUpdate = true;
  }

  _wrapText(c, text, x, y, maxW, lineH) {
    // Chunk by character so peer IDs (no spaces) wrap cleanly
    let line = '';
    let curY = y;
    for (let i = 0; i < text.length; i++) {
      const test = line + text[i];
      if (c.measureText(test).width > maxW && line.length > 0) {
        c.fillText(line, x, curY);
        line = text[i];
        curY += lineH;
      } else {
        line = test;
      }
    }
    if (line) c.fillText(line, x, curY);
  }
}
