/**
 * Minimal HUD manager.
 * All DOM queries happen once at construction - no per-frame querySelector calls.
 */
export class UIManager {
  constructor() {
    this._bar = document.getElementById('health-bar');
    this._healthText = document.getElementById('health-text');
    this._playerCnt = document.getElementById('player-count');
    this._kdaTracker = document.getElementById('kda-tracker');
    this._overlay = document.getElementById('overlay');
    this._status = document.getElementById('overlay-status');
    this._killFeed = document.getElementById('kill-feed');
    this._damageNumbers = document.getElementById('damage-numbers');
    this._spellIndicator = document.getElementById('spell-indicator');
    this._effectStatus = document.getElementById('effect-status');
    this._scoreboard = document.getElementById('scoreboard');
    this._scoreBody = document.getElementById('scoreboard-body');
    this._scoreboardVisible = false;
  }

  setHealth(hp) {
    const pct = Math.max(0, Math.min(100, hp));
    this._bar.style.width = pct + '%';
    this._healthText.textContent = Math.ceil(hp) + ' HP';

    if (pct > 60) this._bar.style.backgroundColor = '#2ecc71';
    else if (pct > 30) this._bar.style.backgroundColor = '#f39c12';
    else this._bar.style.backgroundColor = '#e74c3c';
  }

  setPlayerCount(n) {
    this._playerCnt.textContent = 'Players: ' + n;
  }

  setKDA(kills = 0, deaths = 0, assists = 0) {
    this._kdaTracker.textContent = `K/D/A: ${kills} / ${deaths} / ${assists}`;
  }

  setOverlayStatus(text) {
    this._status.textContent = text;
  }

  showOverlay(visible) {
    this._overlay.style.display = visible ? 'flex' : 'none';
  }

  setSpell(spell) {
    const labels = {
      fire: '🔥 Fire',
      ice: '❄️ Ice',
      lightning: '⚡ Lightning',
      air: '💨 Air',
      earth: '🪨 Earth',
    };
    this._spellIndicator.textContent = labels[spell] || spell;
    this._spellIndicator.dataset.spell = spell;
  }

  setEffect(effect) {
    const labels = {
      burn: '🔥 Burning!',
      slow: '❄️ Slowed!',
      silence: '⚡ Silenced!',
      ground: '🪨 Grounded!',
    };
    this._effectStatus.textContent = effect ? labels[effect] : '';
    this._effectStatus.dataset.effect = effect || '';
  }

  toggleScoreboard() {
    this._scoreboardVisible = !this._scoreboardVisible;
    this._scoreboard.style.display = this._scoreboardVisible ? 'flex' : 'none';
  }

  hideScoreboard() {
    this._scoreboardVisible = false;
    this._scoreboard.style.display = 'none';
  }

  updateScoreboard(scores, localActorId, getPlayerLabel = null) {
    const rows = [...scores.entries()].sort((a, b) => b[1].kills - a[1].kills);

    this._scoreBody.innerHTML = '';
    rows.forEach(([id, s], i) => {
      const tr = document.createElement('tr');
      const isLocal = id === localActorId;
      if (isLocal) tr.classList.add('local-row');
      const label = getPlayerLabel ? getPlayerLabel(id, isLocal) : (isLocal ? '⚔ You' : 'Wizard ' + id);
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${label}</td>
        <td>${s.kills}</td>
        <td>${s.deaths}</td>
      `;
      this._scoreBody.appendChild(tr);
    });
  }

  addKillEntry(msg) {
    const el = document.createElement('div');
    el.className = 'kill-entry';
    el.textContent = msg;
    this._killFeed.prepend(el);
    setTimeout(() => el.remove(), 3200);
  }

  addDamageNumber(amount, variant = 'dealt') {
    const el = document.createElement('div');
    const spreadX = (Math.random() - 0.5) * 80;
    const spreadY = Math.random() * 36;
    el.className = `damage-number damage-${variant}`;
    el.textContent = Math.round(amount);
    el.style.left = `calc(50% + ${spreadX}px)`;
    el.style.top = `calc(42% + ${spreadY}px)`;
    this._damageNumbers.appendChild(el);

    setTimeout(() => el.remove(), 820);
  }
}
