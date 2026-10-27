/**
 * On-screen controls for phones and tablets, feeding the same Controls object the keyboard and mouse use.
 * Left side: a floating joystick wherever the thumb lands. Right side: drag to look.
 * Buttons: cast (hold to keep casting, and drag it to aim), jump, aim, scores and pause.
 * Pointer events rather than touch events, so it can also be tried with a mouse via ?touch=1.
 */

const STICK_RADIUS = 56;     // px the knob can travel from where the thumb landed
const STICK_DEAD_ZONE = 0.15;
const STICK_ZONE = 0.42;     // share of the screen width (from the left) that starts the joystick
const LOOK_SCALE = 3;        // touch drags turn ~3x more per pixel than the mouse does

// Button icons are drawn as SVG: font glyphs like ⤒ and ❚❚ render as plain boxes on some phones
const icon = (size, body) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const SCOPE_ICON = icon(26, '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>');
const HOME_ICON = icon(22, '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10"/>');
const ULT_ICON = icon(28, '<path d="M12 2.5l2.3 7.2 7.2 2.3-7.2 2.3L12 21.5l-2.3-7.2-7.2-2.3 7.2-2.3z" fill="currentColor" stroke="none"/>');
const JUMP_ICON = icon(28, '<path d="M6 14l6-6 6 6"/><path d="M6 19l6-6 6 6" opacity=".55"/>');

const BUTTONS = [
  { key: 'pause', label: HOME_ICON, title: 'Back to the menu' },
  { key: 'scores', label: '🏆', title: 'Scores' },
  { key: 'aim', label: SCOPE_ICON, title: 'Aim' },
  { key: 'jump', label: JUMP_ICON, title: 'Jump' },
  { key: 'ult', label: ULT_ICON, title: 'Ultimate' },
  { key: 'cast', label: '🪄', title: 'Cast' },
];

export function attachTouchControls(controls, { onScores, onPause }) {
  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.innerHTML = `
    <div class="tc-stick" hidden><div class="tc-stick-knob"></div></div>
    ${BUTTONS.map((b) => `<button class="tc-btn tc-${b.key}" data-btn="${b.key}" type="button" aria-label="${b.title}">${b.label}</button>`).join('')}`;
  document.getElementById('ui').append(root);

  const stickEl = root.querySelector('.tc-stick');
  const knobEl = root.querySelector('.tc-stick-knob');
  const aimBtn = root.querySelector('.tc-aim');
  const castBtn = root.querySelector('.tc-cast');
  const ultBtn = root.querySelector('.tc-ult');

  let stickId = null;
  let stickOrigin = { x: 0, y: 0 };
  // Touches that turn the camera: the right-side drag, and the cast button while held
  const lookTouches = new Map(); // pointerId -> last { x, y }
  let castId = null;
  let scoresId = null;

  const resetStick = () => {
    stickId = null;
    controls.stick.x = 0;
    controls.stick.y = 0;
    stickEl.hidden = true;
  };

  const releaseAll = () => {
    resetStick();
    lookTouches.clear();
    castId = null;
    controls.fireHeld = false;
    castBtn.classList.remove('is-held');
    if (scoresId !== null) onScores(false);
    scoresId = null;
    aimBtn.classList.remove('is-on');
  };
  controls.onTouchRelease = releaseAll;

  root.addEventListener('pointerdown', (e) => {
    if (!controls.isLocked) return;
    e.preventDefault();
    const btn = e.target.closest('[data-btn]')?.dataset.btn;
    const point = { x: e.clientX, y: e.clientY };

    if (btn === 'cast') {
      castId = e.pointerId;
      controls.fireHeld = true;
      castBtn.classList.add('is-held');
      lookTouches.set(e.pointerId, point);
    } else if (btn === 'jump') {
      controls.pressJump();
    } else if (btn === 'ult') {
      controls.pressUlt();
    } else if (btn === 'aim') {
      controls.isAiming = !controls.isAiming;
      aimBtn.classList.toggle('is-on', controls.isAiming);
    } else if (btn === 'scores') {
      scoresId = e.pointerId;
      onScores(true);
    } else if (btn === 'pause') {
      onPause();
      return;
    } else if (e.clientX < window.innerWidth * STICK_ZONE && stickId === null) {
      stickId = e.pointerId;
      stickOrigin = point;
      stickEl.style.left = `${point.x}px`;
      stickEl.style.top = `${point.y}px`;
      knobEl.style.transform = 'translate(-50%, -50%)';
      stickEl.hidden = false;
    } else {
      lookTouches.set(e.pointerId, point);
    }
  });

  root.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickOrigin.x;
      let dy = e.clientY - stickOrigin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK_RADIUS) {
        dx *= STICK_RADIUS / dist;
        dy *= STICK_RADIUS / dist;
      }
      knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      const mag = Math.min(1, dist / STICK_RADIUS);
      const scale = mag < STICK_DEAD_ZONE ? 0 : 1 / STICK_RADIUS;
      controls.stick.x = dx * scale;
      controls.stick.y = dy * scale;
      return;
    }
    const last = lookTouches.get(e.pointerId);
    if (!last) return;
    controls.addLookDelta((e.clientX - last.x) * LOOK_SCALE, (e.clientY - last.y) * LOOK_SCALE);
    last.x = e.clientX;
    last.y = e.clientY;
  });

  const end = (e) => {
    if (e.pointerId === stickId) resetStick();
    lookTouches.delete(e.pointerId);
    if (e.pointerId === castId) {
      castId = null;
      controls.fireHeld = false;
      castBtn.classList.remove('is-held');
    }
    if (e.pointerId === scoresId) {
      scoresId = null;
      onScores(false);
    }
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);
  // Long-presses would otherwise open the browser's context menu over the game
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  /** Swap the cast button's icon to the selected spell's. */
  return {
    setSpellIcon(icon) {
      castBtn.textContent = icon;
    },
    /** Fill the ultimate button's ring to `charge` (0..1); it lights up when full. */
    setUlt(charge) {
      ultBtn.style.setProperty('--charge', String(charge));
      ultBtn.classList.toggle('is-ready', charge >= 1);
    },
  };
}
