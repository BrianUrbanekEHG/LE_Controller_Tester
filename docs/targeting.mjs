export const ENEMY_RADIUS = 11;

export const radians = degrees => degrees * Math.PI / 180;
export const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
export const polar = (origin, angle, distance) => ({
  x: origin.x + Math.cos(angle) * distance,
  y: origin.y + Math.sin(angle) * distance
});
export function arenaSize(viewport) {
  return { width: viewport.width * Math.SQRT2, height: viewport.height * Math.SQRT2 };
}

function wrapAxis(value, span) {
  const half = span / 2;
  if (value >= -half && value < half) return value;
  return ((value + half) % span + span) % span - half;
}

export function wrapPoint(point, world) {
  return world ? { x: wrapAxis(point.x, world.width), y: wrapAxis(point.y, world.height) } : point;
}

export function relativePosition(origin, point, world) {
  return wrapPoint({ x: point.x - origin.x, y: point.y - origin.y }, world);
}

export function bearing(origin, point, world) {
  const { x, y } = relativePosition(origin, point, world);
  return Math.atan2(y, x);
}

export function distance(a, b, world) {
  const { x, y } = relativePosition(a, b, world);
  return Math.hypot(x, y);
}
export const angleBetween = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

export function rayToViewport(angle, viewport, inset = 0) {
  const halfWidth = Math.max(0, viewport.width / 2 - inset);
  const halfHeight = Math.max(0, viewport.height / 2 - inset);
  return Math.min(halfWidth / Math.max(Math.abs(Math.cos(angle)), Number.EPSILON), halfHeight / Math.max(Math.abs(Math.sin(angle)), Number.EPSILON));
}

export function enemyOverlapsSector(centerDistance, angularOffset, halfAngle, range) {
  const excessAngle = angularOffset - halfAngle;
  if (excessAngle <= 1e-9) return centerDistance <= range + ENEMY_RADIUS;
  // The nearest point lies on one of the sector's straight sides.
  const alongSide = centerDistance * Math.cos(excessAngle);
  const acrossSide = centerDistance * Math.sin(excessAngle);
  const closest = clamp(alongSide, 0, range);
  return Math.hypot(alongSide - closest, acrossSide) <= ENEMY_RADIUS + 1e-9;
}

export function compositeCone(player, aim, enemy, farAngle, nearAngle, nearRange, viewport, world) {
  const { x: dx, y: dy } = relativePosition(player, enemy, world);
  const range = Math.hypot(dx, dy);
  const offset = range === 0 ? 0 : angleBetween(Math.atan2(dy, dx), aim);
  const onScreen = Math.abs(dx) <= viewport.width / 2 && Math.abs(dy) <= viewport.height / 2;
  const inFar = onScreen && enemyOverlapsSector(range, offset, radians(farAngle / 2), Infinity);
  const inNear = onScreen && enemyOverlapsSector(range, offset, radians(nearAngle / 2), nearRange);
  return { inFar, inNear, eligible: inFar || inNear, distance: range, offset, onScreen };
}

export function selectTarget(enemies, player, aim, viewport, settings, skill, previousId, world) {
  const candidates = [];
  const reasons = {};
  for (const enemy of enemies) {
    const geo = compositeCone(player, aim, enemy, settings.farAngle, settings.nearAngle, settings.nearRange, viewport, world);
    const rejection = enemy.hp <= 0 ? 'Defeated'
      : enemy.state === 'hidden' ? 'Concealed'
      : enemy.state === 'untargetable' ? 'Untargetable'
      : !geo.onScreen ? 'Outside viewport'
      : !geo.eligible ? 'Outside both cones'
      : geo.distance > skill.range + ENEMY_RADIUS ? 'Beyond skill range'
      : '';
    if (rejection) {
      reasons[enemy.id] = rejection;
      continue;
    }
    const radial = geo.distance / Math.min(skill.range, Math.hypot(viewport.width / 2, viewport.height / 2));
    const angular = geo.offset / Math.PI;
    const weight = settings.angularWeight;
    const score = settings.priority === 'nearest' ? radial
      : settings.priority === 'angular' ? angular
      : radial * (1 - weight) + angular * weight;
    candidates.push({ enemy, geo, score });
    reasons[enemy.id] = geo.inFar && geo.inNear ? 'Both cones' : geo.inFar ? 'Far cone' : 'Near cone';
  }
  candidates.sort((a, b) => a.score - b.score || a.enemy.id - b.enemy.id);
  const prior = candidates.find(({ enemy }) => enemy.id === previousId);
  const best = candidates[0];
  const selected = prior && prior.score <= best.score + settings.hysteresis ? prior : best;
  return { selected: selected?.enemy ?? null, candidates, reasons };
}

export function reticleRadius(current, intent, manual, dt, settings, limit, hold = false) {
  const max = Math.max(0, Math.min(settings.reticleMax, limit));
  const min = Math.min(settings.reticleMin, max);
  if (manual) return clamp(current + manual * settings.radialSpeed * dt, min, max);
  if (hold) return clamp(current, min, max);
  if (intent.active) {
    if (settings.radialMode === 'magnitude' || intent.direct) {
      return min + intent.strength * (max - min);
    }
    return clamp(current + (intent.retract ? -1 : 1) * intent.strength * settings.radialSpeed * dt, min, max);
  }
  return settings.returnMode === 'snap' ? min : clamp(current - settings.returnSpeed * dt, min, max);
}
