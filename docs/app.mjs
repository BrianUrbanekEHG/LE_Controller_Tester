import { Input } from './input.mjs';
import { Arena } from './render.mjs';
import { Simulation, SCENARIOS, SKILLS } from './simulation.mjs';
import { defaults, groups, validateConfig } from './settings.mjs';

const byId = id => document.getElementById(id);
const canvas = byId('arena');
const arena = new Arena(canvas);
const input = new Input(canvas);
const settings = { ...defaults };
const storageKey = 'gamepad-targeting-lab.config';
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) Object.assign(settings, validateConfig(JSON.parse(saved)));
} catch { /* The lab also runs with browser storage disabled. */ }
const sim = new Simulation(settings);

function saveSettings() {
  try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Settings remain usable in this session. */ }
}

const scenario = byId('scenario');
for (const [key, value] of Object.entries(SCENARIOS)) scenario.add(new Option(value.name, key));
scenario.value = sim.scenario;

function activateArena() {
  canvas.focus({ preventScroll: true });
}

function buttonAction(action) {
  input.actions.push(action);
  activateArena();
}

function resetArena() {
  sim.reset(scenario.value);
  byId('objective').textContent = SCENARIOS[scenario.value].objective;
  makeEnemyControls();
  activateArena();
}
scenario.addEventListener('change', resetArena);
byId('restart').addEventListener('click', resetArena);
byId('pause').addEventListener('click', () => buttonAction('pause'));
byId('collapse').addEventListener('click', event => {
  const panel = byId('panel');
  panel.hidden = !panel.hidden;
  event.currentTarget.setAttribute('aria-expanded', !panel.hidden);
  event.currentTarget.textContent = panel.hidden ? 'Expand' : 'Collapse';
});

let currentTab = 'tuning';
document.querySelectorAll('[data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    currentTab = button.dataset.tab;
    for (const tab of document.querySelectorAll('[data-tab]')) {
      const active = tab === button;
      tab.setAttribute('aria-pressed', active);
      byId(tab.dataset.tab).hidden = !active;
    }
  });
});

const skillButtons = {};
for (const [key, skill] of Object.entries(SKILLS)) {
  const button = document.createElement('button');
  button.className = 'skill';
  button.type = 'button';
  button.style.setProperty('--accent', skill.ink);
  button.style.setProperty('--wash', skill.wash);
  button.innerHTML = `<span class="skill-icon" aria-hidden="true">${skill.icon}</span><span><strong>${skill.name}</strong><small>${skill.key}</small></span>`;
  button.title = skill.kind;
  button.addEventListener('click', () => buttonAction(key));
  byId('skills').append(button);
  skillButtons[key] = button;
}

function group(parent, title) {
  const field = document.createElement('section');
  field.className = 'group';
  const heading = document.createElement('h3');
  heading.textContent = title;
  field.append(heading);
  parent.append(field);
  return field;
}
const settingsControls = {};
for (const [title, specs] of Object.entries(groups)) {
  const field = group(byId('tuning'), title);
  for (const [key, [label, initial, low, high, step, unit]] of Object.entries(specs)) {
    const row = document.createElement('div');
    const id = `setting-${key}`;
    if (typeof initial === 'boolean') {
      row.innerHTML = `<label class="toggle"><input type="checkbox" id="${id}">${label}</label>`;
    } else {
      row.className = 'row';
      row.innerHTML = `<label for="${id}">${label}${typeof initial === 'number' ? `<output id="${id}-value"></output>` : ''}</label>`;
      if (typeof initial === 'number') {
        const control = document.createElement('input');
        Object.assign(control, { id, type: 'range', min: low, max: high, step });
        row.append(control);
      } else {
        const control = document.createElement('select');
        control.id = id;
        for (const [value, text] of Object.entries(low)) control.add(new Option(text, value));
        row.append(control);
      }
    }
    field.append(row);
    const control = byId(id);
    settingsControls[key] = () => {
      if (typeof initial === 'boolean') control.checked = settings[key];
      else control.value = settings[key];
      if (typeof initial === 'number') byId(`${id}-value`).textContent = `${settings[key]}${unit}`;
    };
    control.addEventListener('input', () => {
      settings[key] = typeof initial === 'boolean' ? control.checked : typeof initial === 'number' ? Number(control.value) : control.value;
      if (key === 'reticleMin' && settings.reticleMin > settings.reticleMax) settings.reticleMax = settings.reticleMin;
      if (key === 'reticleMax' && settings.reticleMax < settings.reticleMin) settings.reticleMin = settings.reticleMax;
      syncSettings();
      saveSettings();
    });
  }
}
const reticleHint = document.createElement('p');
reticleHint.className = 'side-note';
reticleHint.textContent = 'In radial travel mode, hold an aim direction to extend and click RS while holding direction to retract. For keyboard distance, hold Shift after aiming and press ↑ or ↓. Hold right mouse to place directly.';
byId('setting-returnSpeed').closest('.group').append(reticleHint);

function syncSettings() {
  Object.values(settingsControls).forEach(sync => sync());
}
syncSettings();

byId('defaults').addEventListener('click', () => {
  Object.assign(settings, defaults);
  sim.highlights = {};
  syncSettings();
  saveSettings();
  byId('notice').textContent = 'Defaults restored.';
});
byId('import').addEventListener('click', () => byId('config-file').click());
byId('config-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    Object.assign(settings, validateConfig(JSON.parse(await file.text())));
    sim.highlights = {};
    syncSettings();
    saveSettings();
    byId('notice').textContent = 'Configuration imported.';
  } catch (error) {
    byId('notice').textContent = error.message;
  }
});
byId('export').addEventListener('click', () => {
  const file = URL.createObjectURL(new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = file;
  link.download = 'targeting-lab-settings.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(file), 1000);
  byId('notice').textContent = 'Configuration exported.';
});

function stat(field, name) {
  const row = document.createElement('div');
  row.className = 'stat';
  const label = document.createElement('span');
  const value = document.createElement('output');
  label.textContent = name;
  row.append(label, value);
  field.append(row);
  return value;
}
const diagnostic = {};
for (const [title, rows] of Object.entries({
  Input: { left: 'Left stick', right: 'Right stick', active: 'Effective aim input', movement: 'Movement orientation', aim: 'Targeting orientation', facing: 'Animation orientation' },
  Action: { skill: 'Active skill', lock: 'Animation lock', selected: 'Selected enemy', eligible: 'Eligible enemies', reticle: 'Reticle distance', pads: 'Placement pads hit' }
})) {
  const field = group(byId('diagnostics'), title);
  for (const [key, label] of Object.entries(rows)) diagnostic[key] = stat(field, label);
}
const degrees = angle => `${(Math.round(angle * 180 / Math.PI) + 360) % 360}°`;
const stickInfo = stick => stick.raw > 0 ? `${degrees(stick.angle)} / ${stick.raw.toFixed(2)}` : 'Neutral / 0.00';

let enemyReasons = {};
function makeEnemyControls() {
  enemyReasons = {};
  byId('enemies').replaceChildren();
  const field = group(byId('enemies'), 'Enemy state');
  for (const enemy of sim.enemies) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `<label for="enemy-${enemy.id}">Enemy E${enemy.id}<output></output></label>`;
    const select = document.createElement('select');
    select.id = `enemy-${enemy.id}`;
    for (const [value, label] of Object.entries({ idle: 'Visible · idle', aggressive: 'Visible · aggressive', hidden: 'Concealed / inactive', untargetable: 'Untargetable' })) {
      select.add(new Option(label, value));
    }
    select.value = enemy.state;
    select.addEventListener('change', () => { enemy.state = select.value; });
    enemyReasons[enemy.id] = row.querySelector('output');
    row.append(select);
    field.append(row);
  }
}

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function updateDiagnostics(frameInput) {
  const p = sim.player;
  const selection = sim.selection;
  const cast = sim.cast;
  const selected = cast ? cast.targetId : selection?.selected?.id;
  const values = {
    left: stickInfo(frameInput.padLeft),
    right: `${stickInfo(frameInput.padRight)} · ${frameInput.padRight.active ? 'active' : 'neutral'}`,
    active: frameInput.right.active ? `${degrees(frameInput.right.angle)} / ${frameInput.right.strength.toFixed(2)}` : 'Neutral · facing',
    movement: frameInput.left.active ? degrees(p.moveAngle) : 'Neutral',
    aim: degrees(p.aim),
    facing: degrees(p.facing),
    skill: cast ? SKILLS[cast.key].name : '—',
    lock: cast ? `${Math.max(0, cast.total - cast.elapsed).toFixed(2)} s` : 'Free',
    selected: selected ? `E${selected}${cast ? ' · committed' : ''}` : '—',
    eligible: selection ? String(selection.candidates.length) : 'Ground skill',
    reticle: `${Math.round(sim.reticle)} px`,
    pads: sim.pads.length ? `${sim.pads.filter(pad => pad.lit).length} / ${sim.pads.length}` : '—'
  };
  if (currentTab === 'diagnostics') {
    for (const [key, value] of Object.entries(values)) setText(diagnostic[key], value);
  }
  if (currentTab === 'enemies') {
    for (const enemy of sim.enemies) {
      const remaining = sim.respawnRemaining(enemy);
      const status = remaining === null ? selection?.reasons[enemy.id] ?? 'Ground skill' : `Respawns in ${Math.ceil(remaining)} s`;
      setText(enemyReasons[enemy.id], status);
    }
  }
  byId('arena-state').textContent = sim.paused ? 'SIMULATION PAUSED' : cast ? `CAST LOCK · ${SKILLS[cast.key].name.toUpperCase()}` : 'SIMULATION LIVE';
  byId('arena-detail').textContent = `HP ${p.health}  ·  ${selected ? `TARGET E${selected}` : 'NO TARGET'}`;
  byId('pause').textContent = sim.paused ? 'Resume' : 'Pause';
  byId('pause').setAttribute('aria-pressed', sim.paused);
  for (const [key, button] of Object.entries(skillButtons)) button.classList.toggle('active', cast?.key === key);
  const device = byId('device');
  if (device.title !== frameInput.device || !device.dataset.ready) {
    device.title = frameInput.device;
    device.dataset.ready = 'true';
    device.textContent = frameInput.device ? 'Gamepad connected' : 'Keyboard active';
    device.classList.toggle('connected', Boolean(frameInput.device));
  }
}

resetArena();
let last = 0;
let lastHud = -100;
function frame(time) {
  const dt = last ? Math.min(.025, (time - last) / 1000) : 0;
  last = time;
  const frameInput = input.poll(settings, arena.view);
  sim.step(dt, frameInput, arena.view);
  arena.render(sim);
  if (time - lastHud > 80) {
    updateDiagnostics(frameInput);
    lastHud = time;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
