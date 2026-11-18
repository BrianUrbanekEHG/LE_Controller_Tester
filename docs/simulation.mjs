import { angleBetween, arenaSize, bearing, distance, enemyOverlapsSector, polar, radians, rayToViewport, reticleRadius, selectTarget, wrapPoint } from './targeting.mjs';

export const SKILLS = {
  fireball: { name: 'Fireball', kind: 'Projectile', key: '1 / RB', icon: '✦', color: '#ff9d75', ink: '#9e3926', wash: '#f8e8dc', range: Infinity, lock: 1, release: .42, damage: 32 },
  slash: { name: 'Sword Slash', kind: 'Melee', key: '2 / LB', icon: '◒', color: '#9af0bc', ink: '#28654a', wash: '#e6f0e5', range: 88, lock: .8, release: .35, damage: 42, halfSweep: radians(48) },
  meteor: { name: 'Meteor', kind: 'Ground impact', key: '3 / RT', icon: '✷', color: '#ffd188', ink: '#835614', wash: '#f7ecd7', radius: 54, lock: 1.75, release: .8, damage: 55 },
  glyph: { name: 'Glyph of Dominion', kind: 'Persistent zone', key: '4 / LT', icon: '◇', color: '#b9adff', ink: '#5148a0', wash: '#eee9f8', radius: 45, lock: 1.15, release: .55, damage: 12 }
};

export const SCENARIOS = {
  precision: { name: 'Long-range precision', objective: 'Compare the near cone’s side coverage with the far cone’s narrow lane. Switch priorities to see which enemy wins.', enemies: [[61, -66], [58, 69], [144, -26], [217, 37], [246, -89], [286, 128], [-137, 72], [-126, -87], [85, 155]] },
  kiting: { name: 'Kiting', objective: 'Move away with WASD or the left stick while aiming back at the pursuing pack. Fireball commits to its target when you cast.', enemies: [[99, -42, 'aggressive'], [151, 10, 'aggressive'], [173, -80, 'aggressive'], [186, 76, 'aggressive'], [232, 24, 'aggressive']] },
  swarm: { name: 'Close-range swarm', objective: 'Use Sword Slash to test which nearby enemies the wide cone acquires and which fall within the actual sweep.', enemies: [[66, 5], [49, 58], [49, -59], [9, 77], [0, -72], [-54, 39], [-65, -22], [166, 4]] },
  ground: { name: 'Ground placement', objective: 'Center Meteor or Glyph on the marked pads. Hold the right mouse button to aim directly, or adjust distance with Shift + ↑/↓.', enemies: [[-119, -95, 'aggressive'], [190, 33], [125, 102]], pads: [[146, -105], [197, 91], [-146, 89]] },
  hidden: { name: 'Hidden enemies', objective: 'Aim straight at the row. In Enemies, reveal or disable individual targets and watch acquisition respond immediately.', enemies: [[73, 0, 'hidden'], [125, 0, 'untargetable'], [174, 0], [235, 18, 'hidden'], [200, -50], [76, -67, 'aggressive']] },
  alternating: { name: 'Alternating movement and casts', objective: 'Hold A + → or point the sticks in opposite directions. Cast with 1 or RB while holding both, then try the same cast while stationary.', enemies: [[135, 1], [224, 18], [-149, -2], [-225, 45], [62, 57]] }
};

export class Simulation {
  constructor(settings) {
    this.settings = settings;
    this.reset('precision');
  }

  reset(key) {
    this.scenario = key;
    this.player = { x: 0, y: 0, moveAngle: 0, aim: 0, facing: 0, health: 100 };
    this.enemies = SCENARIOS[key].enemies.map(([x, y, state = 'idle'], index) => ({
      x, y, spawn: { x, y }, state, id: index + 1, hp: 100, flash: 0, attack: .5 + index * .1, defeatedAt: null
    }));
    this.pads = (SCENARIOS[key].pads ?? []).map(([x, y]) => ({ x, y, lit: false }));
    this.effects = [];
    this.projectiles = [];
    this.zones = [];
    this.reticle = this.settings.reticleMin;
    this.inspectSkill = 'fireball';
    this.highlights = {};
    this.selection = null;
    this.cast = null;
    this.dodge = null;
    this.potion = 0;
    this.paused = false;
    this.time = 0;
  }

  target(viewport, aim, key = this.inspectSkill, remember = true) {
    const skill = SKILLS[key];
    if (skill.range === undefined) return null;
    const result = selectTarget(this.enemies, this.player, aim, viewport, this.settings, skill, this.highlights[key], this.world);
    if (remember) this.highlights[key] = result.selected?.id;
    return result;
  }

  step(dt, input, viewport) {
    this.input = input;
    if (this.viewport?.width !== viewport.width || this.viewport?.height !== viewport.height) {
      this.world = arenaSize(viewport);
      Object.assign(this.player, wrapPoint(this.player, this.world));
      this.viewport = viewport;
    }
    if (input.actions.includes('pause')) this.paused = !this.paused;
    if (this.paused) {
      this.selection = this.target(viewport, this.player.aim);
      this.reticle = Math.min(this.reticle, this.settings.reticleMax, rayToViewport(this.player.aim, viewport, 16));
      return;
    }
    this.time += dt;
    const p = this.player;
    if (input.left.active) p.moveAngle = input.left.angle;
    if (!this.cast && !this.dodge && input.left.active) p.facing = p.moveAngle;
    this.updateAim(dt, input, viewport);
    for (const action of input.actions) {
      if (!this.cast && !this.dodge && SKILLS[action]) this.startCast(action, viewport);
      if (action === 'dodge' && !this.cast && !this.dodge) {
        this.dodge = { time: .19, angle: input.left.active ? p.moveAngle : p.facing };
        p.facing = this.dodge.angle;
      }
      if (action === 'potion' && this.potion === 0) {
        p.health = Math.min(100, p.health + 35);
        this.potion = .85;
        this.effect('heal', p, 27, .45, '#8ef4bc');
      }
    }
    this.potion = Math.max(0, this.potion - dt);
    const lockedTime = this.cast ? Math.min(dt, this.cast.total - this.cast.elapsed) : 0;
    const dodgedTime = this.dodge ? Math.min(dt, this.dodge.time) : 0;
    if (this.cast) {
      this.cast.elapsed += dt;
      if (!this.cast.fired && this.cast.elapsed >= this.cast.trigger) this.execute(this.cast);
      if (this.cast.elapsed >= this.cast.total) this.cast = null;
    }
    if (this.dodge) {
      this.move(this.dodge.angle, 590 * dodgedTime);
      this.dodge.time -= dt;
      if (this.dodge.time <= 0) this.dodge = null;
    }
    if (input.left.active) {
      const moveTime = dt - dodgedTime - lockedTime * (1 - this.settings.lockMovement);
      this.move(p.moveAngle, moveTime * input.left.strength * this.settings.moveSpeed);
      if (!this.cast && !this.dodge) p.facing = p.moveAngle;
    }
    this.updateAim(0, input, viewport);
    this.tickWorld(dt);
    this.selection = this.target(viewport, p.aim);
  }

  move(angle, length) {
    Object.assign(this.player, wrapPoint(polar(this.player, angle, length), this.world));
  }

  updateAim(dt, input, viewport) {
    this.player.aim = input.right.active ? input.right.angle : this.player.facing;
    const limit = rayToViewport(this.player.aim, viewport, 16);
    this.reticle = reticleRadius(this.reticle, input.right, input.manual, dt, this.settings, limit, input.holdRadius);
  }

  startCast(key, viewport) {
    const p = this.player;
    const skill = SKILLS[key];
    this.inspectSkill = key;
    const selected = this.target(viewport, p.aim, key)?.selected;
    const angle = selected && distance(p, selected, this.world) > .1 ? bearing(p, selected, this.world) : p.aim;
    const total = this.settings.castDuration * skill.lock;
    this.cast = {
      key, angle, targetId: selected?.id, destination: wrapPoint(polar(p, p.aim, this.reticle), this.world),
      elapsed: 0, total, trigger: total * skill.release, fired: false
    };
    p.facing = angle;
  }

  execute(cast) {
    cast.fired = true;
    const skill = SKILLS[cast.key];
    const p = this.player;
    if (cast.key === 'fireball') {
      const nose = wrapPoint(polar(p, cast.angle, 15), this.world);
      this.projectiles.push({ ...nose, angle: cast.angle, life: 1.55 });
      this.effect('burst', nose, 15, .2, skill.color);
    } else if (cast.key === 'slash') {
      this.effect('slash', p, skill.range, .26, skill.color, cast.angle);
      for (const enemy of this.enemies) {
        if (!this.hittable(enemy)) continue;
        const range = distance(p, enemy, this.world);
        const offset = range === 0 ? 0 : angleBetween(bearing(p, enemy, this.world), cast.angle);
        if (enemyOverlapsSector(range, offset, skill.halfSweep, skill.range)) this.damage(enemy, skill.damage);
      }
    } else {
      const point = cast.destination;
      this.pads.forEach(pad => { if (distance(pad, point, this.world) <= 23) pad.lit = true; });
      if (cast.key === 'meteor') {
        this.effect('burst', point, skill.radius, .55, skill.color);
        this.hitArea(point, skill.radius, skill.damage);
      } else {
        this.zones.push({ ...point, radius: skill.radius, life: 8, pulse: .3 });
        this.effect('burst', point, skill.radius, .3, skill.color);
      }
    }
  }

  effect(kind, point, radius, life, color, angle = 0) {
    this.effects.push({ kind, x: point.x, y: point.y, radius, life, total: life, color, angle });
  }

  damage(enemy, amount) {
    enemy.hp = Math.max(0, enemy.hp - amount);
    enemy.flash = .19;
    if (enemy.hp === 0) enemy.defeatedAt = this.time;
  }

  respawnRemaining(enemy) {
    if (enemy.defeatedAt === null) return null;
    return Math.max(0, this.settings.respawnDelay - (this.time - enemy.defeatedAt));
  }

  hittable(enemy) {
    return enemy.hp > 0 && enemy.state !== 'hidden' && enemy.state !== 'untargetable';
  }

  hitArea(point, radius, amount) {
    this.enemies.forEach(enemy => {
      if (this.hittable(enemy) && distance(enemy, point, this.world) <= radius) this.damage(enemy, amount);
    });
  }

  tickWorld(dt) {
    const p = this.player;
    for (const enemy of this.enemies) {
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.defeatedAt !== null) {
        if (this.respawnRemaining(enemy) <= 1e-8) {
          Object.assign(enemy, wrapPoint(enemy.spawn, this.world), {
            hp: 100, flash: 0, attack: .5 + (enemy.id - 1) * .1, defeatedAt: null
          });
          if (enemy.state !== 'hidden') this.effect('burst', enemy, 23, .35, '#9af0bc');
        }
        continue;
      }
      if (enemy.state !== 'aggressive') continue;
      const gap = distance(enemy, p, this.world);
      if (gap > 30) {
        const next = polar(enemy, bearing(enemy, p, this.world), Math.min(gap - 30, dt * 57));
        Object.assign(enemy, wrapPoint(next, this.world));
      }
      if (gap < 37) {
        enemy.attack -= dt;
        if (enemy.attack <= 0) {
          enemy.attack = .95;
          if (!this.dodge) p.health = Math.max(0, p.health - 7);
          this.effect('burst', enemy, 24, .2, '#f98278');
        }
      }
    }
    for (const shot of this.projectiles) {
      const next = wrapPoint(polar(shot, shot.angle, 610 * dt), this.world);
      const hit = this.enemies.find(enemy => this.hittable(enemy) && distance(next, enemy, this.world) <= 15);
      Object.assign(shot, next);
      shot.life -= dt;
      if (hit) {
        this.damage(hit, SKILLS.fireball.damage);
        this.effect('burst', hit, 22, .24, SKILLS.fireball.color);
        shot.life = 0;
      }
    }
    for (const zone of this.zones) {
      zone.life -= dt;
      zone.pulse -= dt;
      if (zone.pulse <= 0 && zone.life > 0) {
        zone.pulse += .65;
        this.hitArea(zone, zone.radius, SKILLS.glyph.damage);
      }
    }
    for (const effect of this.effects) effect.life -= dt;
    this.projectiles = this.projectiles.filter(shot => shot.life > 0);
    this.effects = this.effects.filter(effect => effect.life > 0);
    this.zones = this.zones.filter(zone => zone.life > 0);
  }
}
