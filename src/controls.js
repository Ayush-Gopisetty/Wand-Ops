/**
 * Keyboard + pointer-lock mouse controls.
 * Consumers call consumeMouseDelta() and consumeClick() each frame to get
 * accumulated input and reset the accumulators atomically.
 */
export class Controls {
  constructor() {
    this.keys    = {};
    this.isLocked = false;
    this.isAiming = false;

    // Accumulators — drained every frame
    this._dx = 0;
    this._dy = 0;
    this._click = false;
    this._jump  = false;

    // Bound handlers (kept so we can remove them)
    this._onKD  = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this._jump = true; }
    };
    this._onKU  = (e) => { this.keys[e.code] = false; };
    this._onMM  = (e) => {
      if (!this.isLocked) return;
      this._dx += e.movementX;
      this._dy += e.movementY;
    };
    this._onMD  = (e) => {
      if (e.button === 0 && this.isLocked) this._click = true;
      if (e.button === 2 && this.isLocked) {
        e.preventDefault();
        this.isAiming = true;
      }
    };
    this._onMU  = (e) => {
      if (e.button === 2) this.isAiming = false;
    };
    this._onCM  = (e) => {
      if (this.isLocked) e.preventDefault();
    };
    this._onPLC = () => {
      this.isLocked = document.pointerLockElement === document.body;
      if (!this.isLocked) this.isAiming = false;
    };

    document.addEventListener('keydown',          this._onKD);
    document.addEventListener('keyup',            this._onKU);
    document.addEventListener('mousemove',        this._onMM);
    document.addEventListener('mousedown',        this._onMD);
    document.addEventListener('mouseup',          this._onMU);
    document.addEventListener('contextmenu',      this._onCM);
    document.addEventListener('pointerlockchange', this._onPLC);
  }

  /** True while a key is held. */
  isDown(code) { return !!this.keys[code]; }

  /** Returns accumulated mouse delta and resets it. */
  consumeMouseDelta() {
    const dx = this._dx, dy = this._dy;
    this._dx = 0; this._dy = 0;
    return { dx, dy };
  }

  /** Returns true if a left-click happened since last call, then resets. */
  consumeClick() {
    const v = this._click;
    this._click = false;
    return v;
  }

  /** Returns true if Space was pressed since last call, then resets. */
  consumeJump() {
    const v = this._jump;
    this._jump = false;
    return v;
  }

  /** Request pointer lock (safe to call multiple times). */
  requestLock() {
    if (!this.isLocked) document.body.requestPointerLock();
  }

  destroy() {
    document.removeEventListener('keydown',          this._onKD);
    document.removeEventListener('keyup',            this._onKU);
    document.removeEventListener('mousemove',        this._onMM);
    document.removeEventListener('mousedown',        this._onMD);
    document.removeEventListener('mouseup',          this._onMU);
    document.removeEventListener('contextmenu',      this._onCM);
    document.removeEventListener('pointerlockchange', this._onPLC);
  }
}
