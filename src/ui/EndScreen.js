import { bus, EVT } from '../core/EventBus.js';

export class EndScreen {
  constructor() {
    this.root    = document.getElementById('end-screen');
    this.titleEl = document.getElementById('end-title');
    this.textEl  = document.getElementById('end-text');
    this.btn     = this.root.querySelector('button[data-action="main-menu"]');
    this.btn.addEventListener('click', () => bus.emit(EVT.GAME_EXIT));
  }

  show(type, extra = {}) {
    this.root.className = `overlay end-screen--${type}`;
    if (type === 'quota_success') {
      this.titleEl.textContent = '[ КВОТА ВЫПОЛНЕНА ]';
      this.textEl.textContent  = `Вы вышли. Итого: ${extra.score ?? 0} ед. за ${extra.levels ?? 0} уровней.`;
    } else if (type === 'quota_fail') {
      this.titleEl.textContent = '[ КВОТА НЕ ВЫПОЛНЕНА ]';
      this.textEl.textContent  = `Не хватило ${extra.remaining ?? 0} ед. Backrooms забрали вас.`;
    } else if (type === 'stabilization') {
      this.titleEl.textContent = '[ STABILIZED ]';
      this.textEl.textContent  = 'Reality holds. For now.';
    } else {
      this.titleEl.textContent = '[ SINGULARITY ]';
      this.textEl.textContent  = 'The Backrooms consumed everything.';
    }
    this.root.classList.remove('hidden');
  }

  hide() { this.root.classList.add('hidden'); }
}
