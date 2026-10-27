/**
 * Keyboard + pointer-lock mouse controls, plus the hooks touch-controls.js drives on phones.
 * Consumers call consumeMouseDelta() and consumeClick() each frame to get
 * accumulated input and reset the accumulators atomically.
 *
 * `isLocked` means "in a match": pointer lock on desktop, or Play tapped in touch mode.
 */
const isShift = (code) => code === 'ShiftLeft' || code === 'ShiftRight';

export class Controls {
  constructor({ touch = false } = {}) {
    this.isTouch = touch;
    this.keys    = {};
    this.isLocked = false;
    this.onLockChange = null;   // (locked) => void
    this.onTouchRelease = null; // set by touch-controls.js to drop held touches
    this.stick = { x: 0, y: 0 }; // virtual joystick, -1..1 on each axis (y down = backwards)
    this.fireHeld = false;       // touch cast button held: keep casting whenever ready
    this.isAiming = false;
    this.typing   = false; // set while the in-game chat box has focus

    // Accumulators — drained every frame
    this._dx = 0;
    this._dy = 0;
    this._click = false;
    this._jump  = false;

    // Bound handlers (kept so we can remove them)
    this._onKD  = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this._jump = true; }
      if (isShift(e.code) && this.isLocked && !this.typing) this.isAiming = true;
    };
    this._onKU  = (e) => {
      this.keys[e.code] = false;
      if (isShift(e.code)) this.isAiming = false;
    };
    this._onMM  = (e) => {
      if (!this.isLocked) return;
      this._dx += e.movementX;
      this._dy += e.movementY;
    };
    this._onMD  = (e) => {
      if (this.typing) return;
      if (e.button === 0 && this.isLocked) this._click = true;
    };
    this._onCM  = (e) => {
      if (this.isLocked) e.preventDefault();
    };
    this._onPLC = () => {
      if (!this.isTouch) this._setLocked(document.pointerLockElement === document.body);
    };
    // Switching apps on a phone should pause the match, like alt-tabbing out of pointer lock does
    this._onVis = () => {
      if (this.isTouch && document.hidden) this._setLocked(false);
    };

    document.addEventListener('keydown',          this._onKD);
    document.addEventListener('keyup',            this._onKU);
    document.addEventListener('mousemove',        this._onMM);
    document.addEventListener('mousedown',        this._onMD);
    document.addEventListener('contextmenu',      this._onCM);
    document.addEventListener('pointerlockchange', this._onPLC);
    document.addEventListener('visibilitychange', this._onVis);
  }

  _setLocked(locked) {
    if (locked === this.isLocked) return;
    this.isLocked = locked;
    if (!locked) {
      this.isAiming = false;
      this.fireHeld = false;
      this.onTouchRelease?.();
    }
    this.onLockChange?.(locked);
  }

  /** Adds a look movement in mouse pixels (touch drags come through here). */
  addLookDelta(dx, dy) {
    if (!this.isLocked) return;
    this._dx += dx;
    this._dy += dy;
  }

  /** Queues a jump, as Space does. */
  pressJump() {
    this._jump = true;
  }

  /** Releases every held key and pending action, e.g. when focus moves to the chat box. */
  clearInput() {
    this.keys = {};
    this._click = false;
    this._jump = false;
    this.isAiming = false;
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
    const v = this._click || this.fireHeld;
    this._click = false;
    return v;
  }

  /** Returns true if Space was pressed since last call, then resets. */
  consumeJump() {
    const v = this._jump;
    this._jump = false;
    return v;
  }

  /** Enter the match: pointer lock on desktop; on touch, go fullscreen where allowed (safe to call multiple times). */
  requestLock() {
    if (this.isLocked) return;
    if (!this.isTouch) {
      document.body.requestPointerLock();
      return;
    }
    // iPhone Safari has no element fullscreen; the game still works, just with the browser bars showing
    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    this._setLocked(true);
  }

  /** Leave the match back to the lobby. */
  exitLock() {
    if (this.isTouch) this._setLocked(false);
    else document.exitPointerLock();
  }

  destroy() {
    document.removeEventListener('keydown',          this._onKD);
    document.removeEventListener('keyup',            this._onKU);
    document.removeEventListener('mousemove',        this._onMM);
    document.removeEventListener('mousedown',        this._onMD);
    document.removeEventListener('contextmenu',      this._onCM);
    document.removeEventListener('pointerlockchange', this._onPLC);
    document.removeEventListener('visibilitychange', this._onVis);
  }
}
