export const groups = {
  'Targeting cones': {
    farAngle: ['Far cone angle', 12, 5, 160, 1, '°'],
    farSetback: ['Far cone apex setback', 145, 0, 300, 5, ' px'],
    nearAngle: ['Near cone angle', 120, 15, 360, 1, '°'],
    nearRange: ['Near cone range', 105, 25, 260, 1, ' px']
  },
  'Target selection': {
    priority: ['Priority', 'weighted', { nearest: 'Nearest', angular: 'Closest to centerline', weighted: 'Weighted' }],
    angularWeight: ['Angular weight', .6, 0, 1, .01, ''],
    hysteresis: ['Switch hysteresis', .025, 0, .22, .005, '']
  },
  'Enemies': {
    respawnDelay: ['Respawn delay', 5, 1, 30, 1, ' s']
  },
  'Reticle': {
    radialMode: ['Distance control', 'magnitude', { magnitude: 'Analog magnitude', travel: 'Radial travel' }],
    radialSpeed: ['Radial speed', 215, 40, 520, 5, ' px/s'],
    reticleMin: ['Minimum distance', 34, 12, 160, 1, ' px'],
    reticleMax: ['Maximum distance', 370, 80, 900, 1, ' px'],
    returnMode: ['On release', 'snap', { snap: 'Snap back', drift: 'Drift back' }],
    returnSpeed: ['Return speed', 225, 25, 650, 5, ' px/s']
  },
  'Input and movement': {
    deadZone: ['Right-stick dead zone', .15, 0, .5, .01, ''],
    leftDeadZone: ['Left-stick dead zone', .16, 0, .5, .01, ''],
    moveSpeed: ['Movement speed', 185, 60, 420, 5, ' px/s'],
    castDuration: ['Base cast lock', .31, .06, 1.1, .01, ' s'],
    lockMovement: ['Speed during cast lock', 0, 0, .65, .05, '×']
  },
  'Overlays': {
    showCones: ['Show both cones', true],
    showVectors: ['Show orientation vectors', true],
    showSelected: ['Highlight selected target', true]
  }
};

const schema = Object.assign({}, ...Object.values(groups));
export const defaults = Object.fromEntries(Object.entries(schema).map(([key, spec]) => [key, spec[1]]));

export function validateConfig(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw Error('Expected a JSON settings object.');
  const result = { ...defaults };
  for (const [key, value] of Object.entries(candidate)) {
    const spec = schema[key];
    if (!spec) continue;
    const [, initial, low, high] = spec;
    const valid = typeof initial === 'boolean' ? typeof value === 'boolean'
      : typeof initial === 'number' ? Number.isFinite(value) && value >= low && value <= high
      : typeof value === 'string' && Object.hasOwn(low, value);
    if (!valid) throw Error(`Invalid setting for ${spec[0]}.`);
    result[key] = value;
  }
  if (result.reticleMin > result.reticleMax) throw Error('Minimum reticle distance exceeds maximum distance.');
  return result;
}
