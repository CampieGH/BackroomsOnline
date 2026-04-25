import { bus, EVT } from '../core/EventBus.js';

// Main and pause menus. Thin wrapper around the DOM elements in index.html.

export class Menu {
  constructor() {
    this.main = document.getElementById('menu');
    this.pause = document.getElementById('pause');
    this.codeBox = document.getElementById('room-code-box');
    this.codeLabel = document.getElementById('room-code-label');
    this.codeDisplay = document.getElementById('room-code-display');
    this.codeText = document.getElementById('room-code-text');
    this.codeCopy = document.getElementById('room-code-copy');
    this.codeInput = document.getElementById('room-code-input');
    this.codeGo = document.getElementById('room-code-go');

    this.main.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._onMain(btn.dataset.action));
    });
    this.pause.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this._onPause(btn.dataset.action));
    });
    this.codeGo.addEventListener('click', () => {
      const code = this.codeInput.value.trim();
      if (code) bus.emit(EVT.GAME_START, { mode: 'join', code });
    });
    this.codeCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(this.codeText.textContent).then(
        () => { this.codeCopy.textContent = 'Copied!'; setTimeout(() => { this.codeCopy.textContent = 'Copy'; }, 1500); }
      );
    });
  }

  showCode(id) {
    this.codeBox.classList.remove('hidden');
    this.codeLabel.textContent = 'Share this code with friend:';
    this.codeText.textContent = id;
    this.codeDisplay.classList.remove('hidden');
    this.codeInput.classList.add('hidden');
    this.codeGo.classList.add('hidden');
  }
  askCode() {
    this.codeBox.classList.remove('hidden');
    this.codeLabel.textContent = 'Enter room code:';
    this.codeDisplay.classList.add('hidden');
    this.codeInput.classList.remove('hidden');
    this.codeGo.classList.remove('hidden');
    this.codeInput.focus();
  }
  hideCode() { this.codeBox.classList.add('hidden'); }

  showMain()  { this.main.classList.remove('hidden'); }
  hideMain()  { this.main.classList.add('hidden'); }
  showPause() { this.pause.classList.remove('hidden'); }
  hidePause() { this.pause.classList.add('hidden'); }

  _onMain(action) {
    if (action === 'singleplayer') bus.emit(EVT.GAME_START, { mode: 'singleplayer' });
    if (action === 'host')         bus.emit(EVT.GAME_START, { mode: 'host' });
    if (action === 'join')         this.askCode();
  }

  _onPause(action) {
    if (action === 'resume') bus.emit(EVT.GAME_RESUME);
    if (action === 'main-menu') bus.emit(EVT.GAME_EXIT);
  }
}
