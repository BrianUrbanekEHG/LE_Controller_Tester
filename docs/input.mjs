import { clamp, rayToViewport } from './targeting.mjs';

const bindings = {
  Digit1: 'fireball', Digit2: 'slash', Digit3: 'meteor', Digit4: 'glyph',
  Space: 'dodge', KeyF: 'potion', KeyP: 'pause'
};
const gamepadButtons = { 0: 'dodge', 1: 'potion', 4: 'slash', 5: 'fireball', 6: 'glyph', 7: 'meteor', 9: 'pause' };
const controls = new Set([...Object.keys(bindings), 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

function stick(x = 0, y = 0, deadZone = 0) {
  const raw = clamp(Math.hypot(x, y), 0, 1);
  const strength = raw > deadZone ? (raw - deadZone) / (1 - deadZone) : 0;
  return { raw, strength, angle: Math.atan2(y, x), active: strength > 0 };
}

export class Input {
  keys = new Set();
  actions = [];
  buttons = [];
  padIndex = null;
  pointer = null;
  lastKeyAngle = null;

  constructor(canvas) {
    window.addEventListener('keydown', event => {
      if (!controls.has(event.code) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target.closest?.('input, select, button, textarea, [contenteditable]')) return;
      event.preventDefault();
      this.keys.add(event.code);
      if (!event.repeat && bindings[event.code]) this.actions.push(bindings[event.code]);
    });
    window.addEventListener('keyup', event => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    const readPointer = event => {
      if (!(event.buttons & 2)) return;
      const box = canvas.getBoundingClientRect();
      this.pointer = { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
    };
    canvas.addEventListener('pointerdown', event => {
      if (event.button === 0 || event.button === 2) canvas.focus({ preventScroll: true });
      readPointer(event);
    });
    canvas.addEventListener('pointermove', readPointer);
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    window.addEventListener('pointerup', event => { if (!(event.buttons & 2)) this.pointer = null; });
  }

  clear() {
    this.keys.clear();
    this.actions.length = 0;
    this.pointer = null;
    this.lastKeyAngle = null;
  }

  poll(settings, viewport) {
    let pad;
    try {
      pad = Array.from(navigator.getGamepads?.() ?? []).find(item => item?.connected && item.mapping === 'standard');
    } catch {
      // Embedded hosts can restrict gamepad access. Keyboard input still works.
    }
    if ((pad?.index ?? null) !== this.padIndex) this.buttons = [];
    this.padIndex = pad?.index ?? null;
    const pressed = index => Boolean(pad?.buttons[index]?.pressed || pad?.buttons[index]?.value > .55);
    for (const [index, action] of Object.entries(gamepadButtons)) {
      const down = pressed(index);
      if (down && !this.buttons[index]) this.actions.push(action);
      this.buttons[index] = down;
    }
    const axis = (positive, negative) => Number(this.keys.has(positive)) - Number(this.keys.has(negative));
    const shifted = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const padLeft = stick(pad?.axes[0], pad?.axes[1], settings.leftDeadZone);
    const padRight = stick(pad?.axes[2], pad?.axes[3], settings.deadZone);
    const keyLeft = stick(axis('KeyD', 'KeyA'), axis('KeyS', 'KeyW'));
    const keyRight = stick(axis('ArrowRight', 'ArrowLeft'), shifted ? 0 : axis('ArrowDown', 'ArrowUp'));
    if (keyRight.active) this.lastKeyAngle = keyRight.angle;
    const left = keyLeft.active ? keyLeft : padLeft;
    let right = keyRight.active ? keyRight : padRight;
    if (this.pointer && !right.active) {
      const { x, y } = this.pointer;
      const radius = Math.hypot(x, y);
      if (radius > 2) {
        const angle = Math.atan2(y, x);
        const edge = rayToViewport(angle, viewport, 16);
        const max = Math.min(edge, settings.reticleMax);
        const min = Math.min(max, settings.reticleMin);
        right = { active: true, angle, raw: 0, strength: clamp((radius - min) / Math.max(1, max - min), 0, 1), direct: true };
      }
    }
    if (shifted && !right.active && this.lastKeyAngle !== null) {
      right = { raw: 0, active: true, angle: this.lastKeyAngle, strength: 0 };
    }
    return {
      holdRadius: shifted && !right.direct && !padRight.active,
      left, right: { ...right, retract: pressed(11) }, padLeft, padRight,
      manual: shifted ? axis('ArrowUp', 'ArrowDown') : 0,
      device: pad?.id ?? '', actions: this.actions.splice(0)
    };
  }
}
