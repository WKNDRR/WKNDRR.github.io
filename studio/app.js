// weekender studio — interface : calques d'effets, looks, import et export.
import { Engine, FX, defaults } from './engine.js';

const $ = (s) => document.querySelector(s);
const PREVIEW = 1800; // grand côté de l'aperçu, en pixels
const RAW = /\.(cr2|cr3|nef|arw|dng|raf|orf|rw2|pef|srw)$/i;

const view = $('#view');
let engine;
try { engine = new Engine(view); } catch (e) { engine = null; }

const state = { layers: [], sel: null };
const doc = { bitmap: null, name: 'photo' };
const hist = { stack: ['[]'], i: 0 };
let uid = 1, dirty = false, before = false, busy = false;

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const k in props) {
    if (k === 'class') n.className = props[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
    else if (k === 'html') n.innerHTML = props[k];
    else if (props[k] !== false && props[k] != null) n.setAttribute(k, props[k] === true ? '' : props[k]);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}
const icon = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

let toastTimer;
function toast(msg, ms = 2600, action) {
  const t = $('#toast');
  t.replaceChildren(msg);
  if (action) t.append(el('button', { class: 'toast-act', onclick: () => { t.hidden = true; action.run(); } }, action.label));
  t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), action ? Math.max(ms, 5000) : ms);
}

// ---------- Rendu ----------
let ambientAt = 0;
function draw() {
  if (dirty || !doc.bitmap) return;
  dirty = true;
  requestAnimationFrame(() => {
    dirty = false;
    if (busy) return;
    try { engine.render(state.layers, before); } catch (e) { console.error(e); toast(`Erreur de rendu : ${e.message}`); return; }
    const now = performance.now();
    if (now - ambientAt > 300) {
      ambientAt = now;
      $('#ambient').getContext('2d').drawImage(view, 0, 0, 32, 32);
    }
    placeHandle();
  });
}

// ---------- Historique ----------
function commit() {
  const s = JSON.stringify(state.layers);
  if (hist.stack[hist.i] === s) return;
  hist.stack.splice(hist.i + 1); hist.stack.push(s);
  if (hist.stack.length > 80) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  syncButtons();
}
function travel(d) {
  const i = hist.i + d;
  if (i < 0 || i >= hist.stack.length) return;
  hist.i = i; state.layers = JSON.parse(hist.stack[i]);
  if (!state.layers.some((l) => l.id === state.sel)) state.sel = null;
  renderPanel(); draw(); syncButtons();
}
function syncButtons() {
  $('[data-act=undo]').disabled = hist.i <= 0;
  $('[data-act=redo]').disabled = hist.i >= hist.stack.length - 1;
}

// ---------- Calques ----------
function makeLayer(fx, over = {}) {
  const { p, ...rest } = over;
  return { id: `l${uid++}`, fx, on: true, opacity: 1, zone: 'all', zpos: 0.5, zfe: 0.1, pt: [0.5, 0.5], ...rest, p: { ...defaults(fx), ...p } };
}
function addLayer(fx) {
  const L = makeLayer(fx);
  state.layers.push(L); state.sel = L.id;
  commit(); renderPanel(); draw();
  requestAnimationFrame(() => $('#layers').lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function slider(label, min, max, step, value, fmt, onInput) {
  const out = el('output', {}, fmt(value));
  const input = el('input', { type: 'range', min, max, step, value });
  const fill = () => input.style.setProperty('--p', `${((input.value - min) / (max - min)) * 100}%`);
  fill();
  input.addEventListener('input', () => { const v = +input.value; out.textContent = fmt(v); fill(); onInput(v); draw(); });
  input.addEventListener('change', commit);
  return el('div', { class: 'param' }, el('div', { class: 'param-head' }, el('span', {}, label), out), input);
}
function select(label, options, value, onChange) {
  const s = el('select', {}, ...options.map(([v, t]) => el('option', { value: v, selected: v === value }, t)));
  s.addEventListener('change', () => { onChange(s.value); commit(); renderPanel(); draw(); });
  return el('label', { class: 'row' }, el('span', {}, label), s);
}

function paramControl(L, d) {
  const p = L.p;
  if (d.when && !d.when(p)) return null;
  if (d.type === 'range') {
    const node = slider(d.label, d.min, d.max, d.step, p[d.k], d.fmt || String, (v) => (p[d.k] = v));
    node.lastChild.addEventListener('dblclick', () => { p[d.k] = d.def; commit(); renderPanel(); draw(); });
    node.lastChild.title = 'Double-clic pour réinitialiser';
    return node;
  }
  if (d.type === 'select') return select(d.label, d.options, p[d.k], (v) => (p[d.k] = v));
  if (d.type === 'color') {
    const c = el('input', { type: 'color', value: p[d.k] });
    c.addEventListener('input', () => { p[d.k] = c.value; draw(); });
    c.addEventListener('change', commit);
    return el('label', { class: 'row' }, el('span', {}, d.label), c);
  }
  if (d.type === 'toggle') {
    const c = el('input', { type: 'checkbox', class: 'switch', checked: p[d.k] });
    c.addEventListener('change', () => { p[d.k] = c.checked; commit(); draw(); });
    return el('label', { class: 'row' }, el('span', {}, d.label), c);
  }
  if (d.type === 'image') {
    const key = L.id + (d.slot || ''), has = engine.assets.has(key);
    return el('div', { class: 'row' }, el('span', {}, `${d.label} : ${has ? 'image chargée' : d.slot ? 'même photo' : 'aucune image'}`),
      el('button', { class: 'btn', onclick: () => { pickFor = key; $('#file2').click(); } }, has ? 'Remplacer' : 'Choisir…'));
  }
  return null;
}

const ZONE_OPTS = [['all', 'Toute l’image'], ['left', 'Gauche'], ['right', 'Droite'], ['top', 'Haut'], ['bottom', 'Bas'], ['center', 'Autour du point'], ['edges', 'Hors du point']];

function renderPanel() {
  syncSave();
  const box = $('#layers');
  box.replaceChildren();
  if (!state.layers.length) {
    box.append(el('div', { class: 'placeholder' }, 'Ajoutez un effet avec le bouton +, ou choisissez un look en bas de l’écran.'));
    placeHandle(); return;
  }
  state.layers.forEach((L, i) => {
    const fx = FX[L.fx], open = L.id === state.sel;
    const sw = el('input', { type: 'checkbox', class: 'switch', checked: L.on, title: 'Activer', onclick: (e) => e.stopPropagation() });
    sw.addEventListener('change', () => { L.on = sw.checked; commit(); renderPanel(); draw(); });
    const tool = (title, d, fn, disabled) => el('button', { class: 'icon small', title, disabled, html: icon(d), onclick: (e) => { e.stopPropagation(); fn(); commit(); renderPanel(); draw(); } });
    const head = el('div', { class: 'layer-head', onclick: () => { state.sel = open ? null : L.id; renderPanel(); } },
      el('span', { class: 'layer-name' }, fx.name),
      el('span', { class: 'layer-tools' },
        tool('Monter', 'm6 14 6-6 6 6', () => state.layers.splice(i - 1, 0, state.layers.splice(i, 1)[0]), i === 0),
        tool('Descendre', 'm6 10 6 6 6-6', () => state.layers.splice(i + 1, 0, state.layers.splice(i, 1)[0]), i === state.layers.length - 1),
        tool('Supprimer', 'M6 6l12 12M18 6 6 18', () => { state.layers.splice(i, 1); if (open) state.sel = null; })),
      sw);
    const card = el('div', { class: `layer${open ? ' open' : ''}${L.on ? '' : ' off'}` }, head);
    if (open) {
      const body = el('div', { class: 'layer-body' });
      for (const d of fx.params) body.append(paramControl(L, d) || '');
      if (fx.point) body.append(el('div', { class: 'row' }, el('span', {}, 'Déplacez le point sur l’image pour choisir le centre.')));
      body.append(el('div', { class: 'subhead' }, 'Fusion'));
      body.append(slider('Opacité', 0, 100, 1, Math.round(L.opacity * 100), String, (v) => (L.opacity = v / 100)));
      body.append(select('Zone', ZONE_OPTS, L.zone, (v) => (L.zone = v)));
      if (L.zone !== 'all') {
        body.append(slider(L.zone === 'center' || L.zone === 'edges' ? 'Taille' : 'Position', 0, 100, 1, Math.round(L.zpos * 100), String, (v) => (L.zpos = v / 100)));
        body.append(slider('Transition', 0, 100, 1, Math.round(L.zfe * 100), String, (v) => (L.zfe = v / 100)));
      }
      card.append(body);
    }
    box.append(card);
  });
  placeHandle();
}

// ---------- Point de contrôle sur l'image ----------
const handle = $('#handle');
function handleLayer() {
  const L = state.layers.find((l) => l.id === state.sel);
  return L && L.on && (FX[L.fx].point || L.zone === 'center' || L.zone === 'edges') ? L : null;
}
function placeHandle() {
  const L = handleLayer();
  handle.hidden = !L || !doc.bitmap || before;
  if (handle.hidden) return;
  const r = view.getBoundingClientRect();
  handle.style.left = `${r.left + L.pt[0] * r.width}px`;
  handle.style.top = `${r.top + L.pt[1] * r.height}px`;
}
handle.addEventListener('pointerdown', (e) => {
  handle.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const L = handleLayer(); if (!L) return;
    const r = view.getBoundingClientRect();
    L.pt = [Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))];
    placeHandle(); draw();
  };
  const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); commit(); };
  handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
});
window.addEventListener('resize', placeHandle);

// ---------- Menu d'ajout ----------
function buildAddMenu() {
  const menu = $('#add'), groups = {};
  for (const id in FX) (groups[FX[id].group] ||= []).push(id);
  for (const g in groups) {
    menu.append(el('div', { class: 'group-title' }, g));
    for (const id of groups[g]) menu.append(el('button', { class: 'fx-item', onclick: () => { menu.hidden = true; addLayer(id); } }, el('b', {}, FX[id].name), el('small', {}, FX[id].hint)));
  }
}

// ---------- Looks ----------
const LOOKS = [
  ['Moyen format', [['medium']]],
  ['35 mm', [['film35', { p: { border: true, format: '135' } }]]],
  ['Instax', [['instax']]],
  ['Sérigraphie', [['serig'], ['grain', { p: { amt: 25, col: 0 } }]]],
  ['Stroboscope', [['strobe'], ['tone', { p: { fade: 30, sat: 90 } }], ['grain', { p: { amt: 65, size: 18 } }]]],
  ['Raster bleu', [['tone', { p: { con: 30, exp: -8 } }], ['raster', { p: { style: 'line', lines: 85, col: '#1e9bff', rel: 35, glow: 60 } }]]],
  ['Points', [['tone', { p: { con: 25 } }], ['raster', { p: { style: 'dot', lines: 110, gain: 85, col: '#6ee7ff', angle: 12, glow: 45, bg: 22, rel: 15 } }]]],
  ['CRT', [['crt'], ['chroma', { p: { amt: 22 } }], ['grain', { p: { amt: 25 } }]]],
  ['Fuite de lumière', [['film35', { p: { stock: 'portra', grain: 40 } }], ['texture', { p: { type: 'leak', amt: 75, angle: -30 } }]]],
  ['Rideau', [['tone', { p: { sat: 0, con: 30 } }], ['motion', { p: { shutter: 7, move: 55 }, zone: 'left', zpos: 0.62, zfe: 0.01 }], ['grain', { p: { amt: 35, col: 0 } }]]],
  ['Ultraviolet', [['ghost', { p: { count: 3, dist: 0, scale: 112, decay: 85, mode: 'lighten' } }], ['gel', { p: { a: '#2a18ff', b: '#12e6a0', angle: -40, spread: 70 } }], ['glow', { p: { thr: 40, radius: 30, int: 40 } }], ['grain', { p: { amt: 25 } }]]],
  ['Balayage rose', [['smear', { p: { len: 85, band: 55, irr: 90, lines: 0, angle: 0 } }], ['duotone', { p: { a: '#1d1d1b', b: '#ff2fa3', con: 95 } }], ['grain', { p: { amt: 65, size: 18, col: 0 } }]]],
  ['Néon', [['gel', { p: { a: '#1438ff', b: '#00d5ff', mode: 'light', int: 75, angle: 60 } }], ['glow', { p: { thr: 45, radius: 50, int: 60, tint: '#ff5a8a' } }], ['chroma', { p: { amt: 35 } }], ['grain', { p: { amt: 30 } }]]],
  ['Prisme', [['prism', { p: { facets: 6, amount: 45, core: 15, soft: 45, disp: 30 } }], ['glow', { p: { thr: 55, radius: 30, int: 40 } }], ['tone', { p: { sat: 120, con: 12 } }], ['grain', { p: { amt: 35 } }]]],
  ['Spectre', [['motion', { p: { shutter: 7, move: 45, trail: 60, flash: 45 } }], ['duotone', { p: { a: '#06191c', b: '#eafcff', con: 35 } }], ['glow', { p: { thr: 55, radius: 35, int: 45 } }], ['grain', { p: { amt: 50, size: 15, col: 0 } }]]],
  ['Balayage', [['tone', { p: { sat: 0, con: 35 } }], ['smear', { p: { len: 60, angle: 180, band: 25, irr: 90, lines: 70 } }], ['grain', { p: { amt: 50, col: 0 } }]]],
  ['Thermique', [['thermal', { p: { pal: 'rainbow', steps: 7, dither: 70, mix: 68, con: 10 } }], ['grain', { p: { amt: 35 } }]]],
  ['Film abîmé', [['tone', { p: { sat: 0, con: 45, exp: -10 } }], ['ghost', { p: { count: 2, dist: 16, angle: 40, decay: 85, mode: 'lighten' } }], ['texture', { p: { type: 'scratch', amt: 60 } }], ['grain', { p: { amt: 55, col: 0 } }]]],
  ['Glitch bleu', [['motion', { p: { shutter: 6, move: 35 } }], ['glitch', { p: { n: 18, amt: 40, prob: 40, soft: 55 } }], ['duotone', { p: { a: '#0a10c8', b: '#ebbaff', con: 20 } }], ['glow', { p: { thr: 30, radius: 55, int: 60 } }]]],
];
// Looks enregistrés par l'utilisateur (stockés dans ce navigateur).
const STORE = 'wkndr-studio-looks';
let saved = [];
try {
  const v = JSON.parse(localStorage.getItem(STORE) || '[]');
  if (Array.isArray(v)) saved = v.filter((s) => s && typeof s.name === 'string' && Array.isArray(s.layers));
} catch { saved = []; }
function persistSaved() { try { localStorage.setItem(STORE, JSON.stringify(saved)); return true; } catch { return false; } }
const snapshot = () => state.layers.map(({ id, ...rest }) => JSON.parse(JSON.stringify(rest)));
const hasAssets = (L) => FX[L.fx].params.some((d) => d.type === 'image' && engine.assets.has(L.id + (d.slot || '')));
const applySaved = (i) => applyLook(saved[i].layers.filter((l) => FX[l.fx]).map(({ fx, ...rest }) => [fx, rest]));

function removeSaved(i) {
  const [gone] = saved.splice(i, 1);
  persistSaved(); renderLooks();
  toast(`« ${gone.name} » supprimé`, 5000, { label: 'Annuler', run: () => { saved.splice(i, 0, gone); persistSaved(); renderLooks(); } });
}
function openSave() {
  if (!state.layers.length) { toast('Ajoutez d’abord un ou plusieurs effets'); return; }
  const box = $('#save'); box.hidden = !box.hidden;
  $('#add').hidden = true; $('#export').hidden = true;
  if (box.hidden) return;
  const n = state.layers.length;
  $('#save-count').textContent = `${n} effet${n > 1 ? 's' : ''} : ${state.layers.map((l) => FX[l.fx].name).join(', ')}`;
  $('#save-name').value = ''; $('#save-name').placeholder = `Look ${saved.length + 1}`;
  $('#save-note').hidden = !state.layers.some(hasAssets);
  setTimeout(() => $('#save-name').focus(), 30);
}
function commitSave() {
  const input = $('#save-name'), name = (input.value.trim() || input.placeholder).slice(0, 28);
  const at = saved.findIndex((s) => s.name.toLowerCase() === name.toLowerCase());
  if (at >= 0) saved.splice(at, 1);
  saved.unshift({ name, layers: snapshot() });
  const ok = persistSaved();
  $('#save').hidden = true; renderLooks();
  $('#looks').scrollTo({ left: 0, behavior: 'smooth' });
  toast(ok ? `« ${name} » ${at >= 0 ? 'mis à jour' : 'enregistré'}` : 'Enregistrement impossible sur ce navigateur : le look reste disponible jusqu’à la fermeture', ok ? 2600 : 4500);
}
function syncSave() {
  const b = $('#save-btn'); if (!b) return;
  b.disabled = !state.layers.length;
  b.title = state.layers.length ? 'Enregistrer cette combinaison' : 'Ajoutez un effet pour enregistrer une combinaison';
}

function renderLooks() {
  const nav = $('#looks'); nav.replaceChildren();
  nav.append(el('button', { class: 'icon', id: 'save-btn', 'data-act': 'save-menu', 'aria-label': 'Enregistrer cette combinaison', html: icon('M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1zM12 8v5M9.5 10.5h5') }));
  nav.append(el('button', { class: 'look reset', onclick: () => applyLook([]) }, 'Original'));
  saved.forEach((s, i) => nav.append(el('span', { class: 'look mine' },
    el('button', { class: 'look-main', onclick: () => applySaved(i) }, s.name),
    el('button', { class: 'look-del', title: 'Supprimer', 'aria-label': `Supprimer ${s.name}`, html: icon('M7 7l10 10M17 7 7 17'), onclick: () => removeSaved(i) }))));
  if (saved.length) nav.append(el('span', { class: 'look-sep' }));
  for (const [name, layers] of LOOKS) nav.append(el('button', { class: 'look', onclick: () => applyLook(layers) }, name));
  syncSave();
}
function applyLook(layers) {
  state.layers = layers.map(([fx, over]) => makeLayer(fx, over));
  state.sel = state.layers[0]?.id ?? null;
  commit(); renderPanel(); draw();
}

// ---------- Import ----------
// Les fichiers RAW embarquent un aperçu JPEG : on retient le plus grand.
function rawPreview(buf) {
  const b = new Uint8Array(buf), n = b.length;
  let best = null;
  for (let i = 0; i < n - 4; i++) {
    if (b[i] !== 0xff || b[i + 1] !== 0xd8 || b[i + 2] !== 0xff) continue;
    let j = i + 2;
    for (let guard = 0; guard < 64 && j < n - 9 && b[j] === 0xff; guard++) {
      const m = b[j + 1], len = (b[j + 2] << 8) | b[j + 3];
      if (m >= 0xc0 && m <= 0xc2) {
        const h = (b[j + 5] << 8) | b[j + 6], w = (b[j + 7] << 8) | b[j + 8];
        if (!best || w * h > best.area) best = { pos: i, area: w * h };
        break;
      }
      if (m === 0xda || len < 2) break;
      j += 2 + len;
    }
  }
  if (!best || best.area < 640 * 480) throw new Error('Aucun aperçu exploitable dans ce RAW');
  return new Blob([b.subarray(best.pos)], { type: 'image/jpeg' });
}

async function decode(file) {
  let blob = file;
  if (RAW.test(file.name || '')) blob = rawPreview(await file.arrayBuffer());
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}
function scaled(bitmap, edge) {
  const s = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  if (s >= 1) return Promise.resolve(bitmap);
  return createImageBitmap(bitmap, { resizeWidth: Math.round(bitmap.width * s), resizeHeight: Math.round(bitmap.height * s), resizeQuality: 'high' });
}

async function setDocument(bitmap, name) {
  doc.bitmap = bitmap; doc.name = name;
  const small = await scaled(bitmap, PREVIEW);
  engine.setSource(small);
  if (small !== bitmap) small.close();
  document.body.classList.add('has-doc');
  draw();
}
async function openFile(file) {
  if (!file || !engine) return;
  try {
    const bitmap = await decode(file);
    await setDocument(bitmap, (file.name || 'photo').replace(/\.[^.]+$/, ''));
    if (RAW.test(file.name || '')) toast('RAW ouvert via son aperçu JPEG intégré');
  } catch (e) {
    console.error(e);
    toast(e.message?.startsWith('Aucun') ? e.message : 'Impossible de lire ce fichier');
  }
}
async function rotate() {
  const b = doc.bitmap; if (!b) return;
  const c = el('canvas', { width: b.height, height: b.width }), ctx = c.getContext('2d');
  ctx.translate(b.height, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(b, 0, 0);
  await setDocument(await createImageBitmap(c), doc.name);
}

// ---------- Export ----------
async function exportImage() {
  if (busy || !doc.bitmap) return;
  const type = $('#ex-type').value, quality = +$('#ex-q').value / 100;
  let edge = +$('#ex-size').value || Infinity;
  const cap = Math.min(engine.maxTex, 16384);
  if (Math.min(edge, Math.max(doc.bitmap.width, doc.bitmap.height)) > cap) { edge = cap; toast(`Taille limitée à ${cap} px par cet appareil`); }
  busy = true; $('#export').hidden = true;
  const btn = $('[data-act=export-menu]'); btn.disabled = true; btn.textContent = 'Export…';
  await new Promise((r) => setTimeout(r, 30));
  try {
    const full = await scaled(doc.bitmap, edge);
    const blob = await engine.export(full, state.layers, type, quality);
    if (full !== doc.bitmap) full.close();
    const url = URL.createObjectURL(blob);
    if (window.STUDIO_NO_DOWNLOAD) {
      // Page intégrée sans téléchargement direct : on affiche le résultat à enregistrer à la main.
      $('#result img').src = url; $('#result').hidden = false;
    } else {
      el('a', { href: url, download: `${doc.name}-studio.${type.split('/')[1].replace('jpeg', 'jpg')}` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast('Image exportée');
    }
  } catch (e) {
    console.error(e); toast('Export impossible à cette taille — essayez une taille plus petite', 4200);
  } finally {
    busy = false; btn.disabled = false; btn.textContent = 'Exporter'; draw();
  }
}

// ---------- Événements ----------
let pickFor = null;
const actions = {
  open: () => $('#file').click(),
  sample: async () => { try { const r = await fetch('exemple.jpg'); await setDocument(await createImageBitmap(await r.blob()), 'exemple'); } catch { toast('Exemple indisponible'); } },
  rotate, undo: () => travel(-1), redo: () => travel(1),
  add: () => { $('#add').hidden = !$('#add').hidden; $('#export').hidden = true; $('#save').hidden = true; },
  'save-menu': openSave,
  'export-menu': () => { $('#export').hidden = !$('#export').hidden; $('#add').hidden = true; $('#save').hidden = true; },
  export: exportImage,
};
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) { actions[b.dataset.act](); return; }
  for (const id of ['#add', '#export', '#save']) if (!e.target.closest(id)) $(id).hidden = true;
});
$('#result').addEventListener('click', (e) => { if (e.target.tagName !== 'IMG') $('#result').hidden = true; });
$('#file').addEventListener('change', (e) => { openFile(e.target.files[0]); e.target.value = ''; });
$('#file2').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !pickFor) return;
  try {
    const bm = await scaled(await decode(f), 2400);
    engine.setAsset(pickFor, bm); renderPanel(); draw();
  } catch { toast('Impossible de lire ce fichier'); }
});
$('#save').addEventListener('submit', (e) => { e.preventDefault(); commitSave(); });
$('#ex-q').addEventListener('input', (e) => ($('#ex-q-out').textContent = e.target.value));
$('#ex-type').addEventListener('change', (e) => ($('#ex-q-row').hidden = e.target.value === 'image/png'));

const setBefore = (v) => { if (before !== v) { before = v; draw(); } };
const cmp = $('#compare');
cmp.addEventListener('pointerdown', () => setBefore(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) cmp.addEventListener(ev, () => setBefore(false));

document.addEventListener('keydown', (e) => {
  const typing = /^(SELECT|TEXTAREA)$/.test(e.target.tagName) || (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox');
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); travel(e.shiftKey ? 1 : -1); }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); actions.open(); }
  else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); if (doc.bitmap) actions['export-menu'](); }
  else if (e.key === 'Escape') { $('#save').hidden = true; $('#add').hidden = true; $('#export').hidden = true; $('#result').hidden = true; }
  else if ((e.code === 'Space' || e.key.toLowerCase() === 'a') && !mod && !typing && !e.repeat) { e.preventDefault(); setBefore(true); }
});
document.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.key.toLowerCase() === 'a') setBefore(false); });

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging'); openFile(e.dataTransfer.files[0]); });
window.addEventListener('paste', (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) openFile(f); });

if (!engine) {
  $('#empty h1').textContent = 'WebGL 2 indisponible';
  $('#empty p').textContent = 'Ce navigateur ne permet pas le rendu accéléré nécessaire au studio.';
  $('.empty-actions').remove();
} else {
  buildAddMenu(); renderLooks(); renderPanel(); syncButtons();
}
