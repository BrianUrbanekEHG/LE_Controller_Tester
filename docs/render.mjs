import { ENEMY_RADIUS, arenaSize, farConeHalfWidth, polar, radians, rayToViewport, relativePosition } from './targeting.mjs';
import { SKILLS } from './simulation.mjs';

const colors = { far: '#9da8ff', near: '#68d3ad', reticle: '#f6d294', chosen: '#ff997e', movement: '#83e4cf', facing: '#edeffe' };

export class Arena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { width: 800, height: 500 };
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.view = { width: Math.max(width, 1), height: Math.max(height, 1) };
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(width * scale));
    this.canvas.height = Math.max(1, Math.round(height * scale));
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  circle(x, y, radius, stroke, fill, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    this.paint(stroke, fill, width);
  }

  paint(stroke, fill, width = 1) {
    const c = this.ctx;
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = width; c.strokeStyle = stroke; c.stroke(); }
  }

  line(x1, y1, x2, y2, color, width = 1) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    this.paint(color, null, width);
  }

  text(text, x, y, color, size = 11) {
    const c = this.ctx;
    c.font = `600 ${size}px ui-monospace, monospace`;
    c.fillStyle = color;
    c.fillText(text, x, y);
  }

  sector(x, y, angle, half, radius, stroke, fill) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, radius, angle - half, angle + half);
    c.closePath();
    this.paint(stroke, fill);
  }

  farCone(aim, halfAngle, setback) {
    const c = this.ctx;
    const depth = Math.hypot(this.view.width, this.view.height);
    const mouth = farConeHalfWidth(0, halfAngle, setback);
    const end = farConeHalfWidth(depth, halfAngle, setback);
    c.save();
    c.rotate(aim);
    c.beginPath();
    c.moveTo(0, -mouth);
    c.lineTo(depth, -end);
    c.lineTo(depth, end);
    c.lineTo(0, mouth);
    c.closePath();
    this.paint('#a1aaff88', '#8492ff29');
    c.restore();
  }

  vector(angle, length, color, label) {
    const tip = polar({ x: 0, y: 0 }, angle, length);
    const start = polar({ x: 0, y: 0 }, angle, 18);
    const a = polar(tip, angle + 2.65, 7);
    const b = polar(tip, angle - 2.65, 7);
    this.line(start.x, start.y, tip.x, tip.y, color, 1.5);
    this.line(tip.x, tip.y, a.x, a.y, color, 1.5);
    this.line(tip.x, tip.y, b.x, b.y, color, 1.5);
    const labelPos = polar(tip, angle, 10);
    this.text(label, labelPos.x - 4, labelPos.y + 4, color, 9);
  }

  grid(p, world) {
    const c = this.ctx;
    const { width: w, height: h } = this.view;
    const left = p.x - w / 2, top = p.y - h / 2;
    c.fillStyle = '#191b27';
    c.fillRect(-w / 2, -h / 2, w, h);
    const dark = c.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * .65);
    dark.addColorStop(0, '#252637');
    dark.addColorStop(1, '#12141d');
    c.fillStyle = dark;
    c.fillRect(-w / 2, -h / 2, w, h);
    // A whole number of major grid intervals fits each wrapped axis.
    const columns = world.width / (4 * Math.max(1, Math.round(world.width / 128)));
    const rows = world.height / (4 * Math.max(1, Math.round(world.height / 128)));
    for (let i = Math.ceil(left / columns); i * columns < left + w; i++) {
      const x = i * columns - p.x;
      this.line(x, -h / 2, x, h / 2, i % 4 === 0 ? '#3a3c50' : '#2c2e40');
    }
    for (let i = Math.ceil(top / rows); i * rows < top + h; i++) {
      const y = i * rows - p.y;
      this.line(-w / 2, y, w / 2, y, i % 4 === 0 ? '#3a3c50' : '#2c2e40');
    }
    this.circle(0, 0, 112, '#3e4053', null);
    this.circle(0, 0, 176, '#343648', null);
  }

  render(sim) {
    const c = this.ctx;
    const { width: w, height: h } = this.view;
    const p = sim.player, s = sim.settings;
    const world = sim.world ?? arenaSize(this.view);
    const project = point => relativePosition(p, point, world);
    c.save();
    c.translate(w / 2, h / 2);
    this.grid(p, world);
    if (s.showCones) {
      this.farCone(p.aim, radians(s.farAngle / 2), s.farSetback);
      this.sector(0, 0, p.aim, radians(s.nearAngle / 2), s.nearRange, '#7af0be8c', '#54cf9938');
    }
    if (s.showVectors) {
      const end = polar({ x: 0, y: 0 }, p.aim, rayToViewport(p.aim, this.view));
      c.setLineDash([4, 6]);
      this.line(0, 0, end.x, end.y, '#b2baff77');
      c.setLineDash([]);
    }
    for (const pad of sim.pads) {
      const { x, y } = project(pad);
      c.setLineDash([4, 4]);
      this.circle(x, y, 23, pad.lit ? '#77e1af' : '#e5c786', pad.lit ? '#77e1af35' : '#e5c78615');
      c.setLineDash([]);
      this.text(pad.lit ? 'HIT' : 'PAD', x - 9, y + 4, pad.lit ? '#9cecc6' : '#f0d99c', 9);
    }
    for (const zone of sim.zones) {
      const { x, y } = project(zone);
      this.circle(x, y, zone.radius, '#b9adff', '#9684ef38', 1.5);
      this.circle(x, y, zone.radius - 6, '#b9adff71', null);
      this.line(x - 8, y, x + 8, y, '#b9adff');
      this.line(x, y - 8, x, y + 8, '#b9adff');
    }
    const eligible = new Set(sim.selection?.candidates.map(candidate => candidate.enemy.id));
    const selected = sim.cast ? sim.cast.targetId : sim.selection?.selected?.id;
    for (const enemy of sim.enemies) {
      this.enemy(enemy, project(enemy), eligible.has(enemy.id), s.showSelected && enemy.id === selected, sim.respawnRemaining(enemy));
    }
    for (const shot of sim.projectiles) {
      const { x, y } = project(shot);
      const tail = polar({ x, y }, shot.angle, -23);
      this.line(tail.x, tail.y, x, y, '#fa8154', 4);
      this.circle(x, y, 6, '#ffb787', '#fff1c5', 2);
    }
    if (sim.cast && !sim.cast.fired && SKILLS[sim.cast.key].radius) {
      const { x, y } = project(sim.cast.destination);
      c.setLineDash([5, 4]);
      this.circle(x, y, SKILLS[sim.cast.key].radius, SKILLS[sim.cast.key].color, '#fbc2781c', 2);
      c.setLineDash([]);
    }
    for (const effect of sim.effects) {
      const { x, y } = project(effect);
      const fade = effect.life / effect.total;
      c.globalAlpha = fade;
      if (effect.kind === 'slash') {
        this.sector(x, y, effect.angle, SKILLS.slash.halfSweep, effect.radius, effect.color, '#88ffb144');
      } else {
        this.circle(x, y, effect.radius * (1 - fade * .55), effect.color, effect.color + '2b', 2);
        this.circle(x, y, Math.max(2, effect.radius * (1 - fade) * .55), effect.color, null);
      }
      c.globalAlpha = 1;
    }
    const target = polar({ x: 0, y: 0 }, p.aim, sim.reticle);
    this.circle(target.x, target.y, 10, colors.reticle, null, 1.6);
    this.circle(target.x, target.y, 2, null, colors.reticle);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const a = polar(target, angle, 7), b = polar(target, angle, 15);
      this.line(a.x, a.y, b.x, b.y, colors.reticle, 1.5);
    }
    if (s.showVectors) {
      this.vector(p.aim, 77, colors.far, 'A');
      if (sim.input?.left.active) this.vector(p.moveAngle, 54, colors.movement, 'M');
      this.vector(p.facing, 34, colors.facing, 'F');
    }
    const skill = sim.cast ? SKILLS[sim.cast.key] : null;
    this.circle(0, 0, 21, skill?.color || '#717692', skill ? '#fcda8a25' : '#a9a8fc16', skill ? 2 : 1);
    c.save();
    c.rotate(p.facing);
    c.beginPath();
    c.moveTo(15, 0);
    c.lineTo(-9, -9);
    c.lineTo(-5, 0);
    c.lineTo(-9, 9);
    c.closePath();
    this.paint('#fff6e6', skill?.color || '#d5d7ff', 1.4);
    c.restore();
    this.text('YOU', -10, 37, '#ebebfa', 10);
    c.restore();
  }

  enemy(enemy, { x, y }, eligible, selected, remaining) {
    const c = this.ctx;
    if (Math.abs(x) > this.view.width / 2 + 33 || Math.abs(y) > this.view.height / 2 + 33) return;
    if (enemy.state === 'hidden') return;
    if (enemy.hp <= 0) {
      this.line(x - 5, y - 5, x + 5, y + 5, '#716579', 2);
      this.line(x + 5, y - 5, x - 5, y + 5, '#716579', 2);
      if (remaining !== null) this.text(`${Math.ceil(remaining)}s`, x - 6, y + 19, '#e1cbe1', 10);
      return;
    }
    const untargetable = enemy.state === 'untargetable';
    const aggressive = enemy.state === 'aggressive';
    const ink = untargetable ? '#9095b2' : aggressive ? '#ffaa90' : '#dba3bf';
    if (eligible || selected) this.circle(x, y, selected ? 23 : 18, selected ? colors.chosen : '#d2ccf17b', selected ? '#ff9c6920' : null, selected ? 2 : 1);
    if (untargetable) c.setLineDash([3, 3]);
    this.circle(x, y, ENEMY_RADIUS, ink, enemy.flash > 0 ? '#ffe6cc' : untargetable ? '#34394d' : aggressive ? '#7d403e' : '#603b58', 1.5);
    c.setLineDash([]);
    if (aggressive) this.circle(x, y, 3, null, '#ffc8a9');
    if (enemy.hp < 100) {
      this.line(x - 10, y - 16, x + 10, y - 16, '#424052', 2);
      this.line(x - 10, y - 16, x - 10 + enemy.hp / 5, y - 16, ink, 2);
    }
    if (selected) this.text(`E${enemy.id}`, x - 7, y + 34, '#ffc1a8', 10);
  }
}
