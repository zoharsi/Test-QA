'use strict';
/* =========================================================
   UI — HUD, minimap, full map, menus and notifications
   ========================================================= */

const hex = n => '#' + n.toString(16).padStart(6, '0');

const UI = {
  el: {}, moneyShown: null, clockT: '', heatKey: '', objText: null, timerT: null, zone: '', zoneT: 0, hurtA: 0,
  fpsAcc: 0, fpsN: 0, timers: {},

  init() {
    const ids = ['loading', 'load-fill', 'load-status', 'load-tip', 'menu', 'hud', 'clock', 'money', 'money-delta', 'heat', 'minimap',
      'zone', 'zone-pop', 'speedo', 'sp-arc', 'sp-num', 'sp-gear', 'sp-hp', 'toasts', 'prompt', 'objective', 'mtimer', 'vname',
      'radio-pop', 'bust', 'hurt', 'fps', 'banner', 'b-title', 'b-sub', 'pause', 'bigmap', 'bigmap-c', 'fade', 'panel',
      'panel-title', 'panel-body', 'lock-hint', 'play-label'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.el.heat.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    this.pips = Array.from(this.el.heat.children);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.miniDpr = dpr;
    this.mini = this.el.minimap; this.mini.width = this.mini.height = Math.round(210 * dpr);
    this.miniCtx = this.mini.getContext('2d');
    this.big = this.el['bigmap-c']; this.bigCtx = this.big.getContext('2d');
    this.big.addEventListener('click', e => this.mapClick(e));
    this.big.addEventListener('contextmenu', e => { e.preventDefault(); Navigation.cancel(true); this.drawBigMap(); });
    document.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => { Sound.click(); Game.action(b.dataset.act); });
      b.addEventListener('mouseenter', () => Sound.hover());
    });
    this.el['load-tip'].textContent = pick(LOAD_TIPS);
  },

  loading(p, status) {
    this.el['load-fill'].style.transform = `scaleX(${clamp(p, 0, 1)})`;
    if (status) this.el['load-status'].textContent = status;
  },
  show(id) { this.el[id].classList.add('on'); },
  hide(id) { this.el[id].classList.remove('on'); },
  later(key, ms, fn) { clearTimeout(this.timers[key]); this.timers[key] = setTimeout(fn, ms); },

  toast(title, body, kind = 'info') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    const b = document.createElement('b'), s = document.createElement('span');
    b.textContent = title; s.textContent = body || '';
    d.append(b, s);
    this.el.toasts.prepend(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 4300);
    setTimeout(() => d.remove(), 4800);
  },
  banner(title, sub, kind = 'mission', ms = 3000) {
    const e = this.el.banner;
    this.el['b-title'].textContent = title;
    this.el['b-sub'].textContent = sub || '';
    e.className = 'on ' + kind;
    this.later('banner', ms, () => { e.className = kind; });
  },
  objective(t) {
    if (t === this.objText) return;
    this.objText = t;
    this.el.objective.textContent = t;
    this.el.objective.classList.toggle('on', !!t);
  },
  timer(sec) {
    const e = this.el.mtimer;
    if (sec == null) { e.classList.remove('on'); this.timerT = null; return; }
    const s = Math.max(0, Math.ceil(sec)), txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (txt !== this.timerT) { e.textContent = txt; this.timerT = txt; }
    e.classList.add('on'); e.classList.toggle('low', s <= 10);
  },
  vehicleName(name) {
    const e = this.el.vname; e.textContent = name; e.classList.add('on');
    this.later('vname', 2600, () => e.classList.remove('on'));
  },
  radio(st) {
    const e = this.el['radio-pop'];
    e.querySelector('.r-name').textContent = st ? st.name : 'Radio off';
    e.querySelector('.r-genre').textContent = st ? st.genre : 'Q to turn on';
    e.classList.add('on');
    this.later('radio', 2600, () => e.classList.remove('on'));
  },
  moneyDelta(n) {
    const e = this.el['money-delta'];
    e.textContent = (n >= 0 ? '+' : '−') + fmtMoney(Math.abs(n));
    e.classList.remove('on'); void e.offsetWidth; e.classList.add('on');
  },
  hurt(n) { this.hurtA = Math.min(0.85, this.hurtA + 0.2 + n / 40); },
  heatPulse() { const e = this.el.heat; e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); },
  fade(on) { this.el.fade.classList.toggle('on', on); },
  lockHint(on) { this.el['lock-hint'].classList.toggle('on', on); },

  update(dt) {
    const E = this.el;
    if (this.moneyShown === null) { this.moneyShown = Game.money; E.money.textContent = fmtMoney(Game.money); }
    if (this.moneyShown !== Game.money) {
      const d = Game.money - this.moneyShown;
      this.moneyShown = Math.abs(d) < 2 ? Game.money : this.moneyShown + d * Math.min(1, dt * 7);
      E.money.textContent = fmtMoney(this.moneyShown);
    }
    const h = Math.floor(World.time), m = Math.floor((World.time - h) * 60);
    const ct = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    if (ct !== this.clockT) { E.clock.textContent = ct; this.clockT = ct; }

    const L = Wanted.level, blink = L > 0 && !Wanted.seen && (performance.now() % 760 < 380);
    const hk = L + (blink ? 'b' : '');
    if (hk !== this.heatKey) {
      this.heatKey = hk;
      this.pips.forEach((p, i) => { p.className = i < L ? (blink ? 'on dim' : 'on') : ''; });
      E.heat.classList.toggle('active', L > 0);
    }

    const v = Player.mode === 'car' ? Player.vehicle : null;
    E.speedo.classList.toggle('on', !!v && !Player.dead);
    if (v) {
      const sp = Math.abs(v.vF);
      E['sp-num'].textContent = Math.round(sp * 3.6);
      const frac = clamp(sp / v.spec.maxSpeed, 0, 1);
      E['sp-arc'].setAttribute('stroke-dasharray', (263.9 * frac).toFixed(1) + ' 400');
      E['sp-arc'].style.opacity = frac > 0.01 ? 1 : 0;
      E['sp-gear'].textContent = Game.gearLabel;
      E['sp-hp'].style.transform = `scaleX(${clamp(v.health / 100, 0, 1)})`;
      E['sp-hp'].classList.toggle('low', v.health < 35);
    }

    const pr = Player.dead ? null : Game.prompt;
    if (pr !== this.promptT) { this.promptT = pr; if (pr) E.prompt.innerHTML = pr; E.prompt.classList.toggle('on', !!pr); }

    const bp = clamp(Game.bustT / 2.6, 0, 1);
    E.bust.classList.toggle('on', bp > 0.02);
    E.bust.firstElementChild.style.transform = `scaleX(${bp})`;

    this.zoneT -= dt;
    if (this.zoneT <= 0) {
      this.zoneT = 0.6;
      const P = Player.focus(), z = World.zoneName(P.x, P.z);
      if (z !== this.zone) {
        const first = !this.zone;
        this.zone = z; E.zone.textContent = z;
        if (!first) { E['zone-pop'].textContent = z; E['zone-pop'].classList.add('on'); this.later('zone', 2800, () => E['zone-pop'].classList.remove('on')); }
      }
    }

    const low = Player.health < 30 && !Player.dead ? 0.22 + Math.sin(performance.now() * 0.006) * 0.08 : 0;
    this.hurtA = damp(this.hurtA, low, 3, dt);
    E.hurt.style.opacity = this.hurtA.toFixed(3);

    this.lockHint(Game.state === 'playing' && !document.pointerLockElement && !Input.drag);

    if (Game.settings.fps) {
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { E.fps.textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsN = 0; }
    }
    this.drawMinimap();
  },

  /* ---------------- minimap ---------------- */
  drawMinimap() {
    const g = this.miniCtx, S = 210, R = S / 2, dpr = this.miniDpr;
    const P = Player.focus(), fx = P.x, fz = P.z, C = Game.cam;
    const camYaw = Player.mode === 'car' ? C.carYaw + Math.PI : C.yaw;
    const heading = Player.mode === 'car' && Player.vehicle ? Player.vehicle.heading : Player.facing;
    const sp = Player.speedNow(), ppm = clamp(0.62 - sp * 0.006, 0.34, 0.62);
    const theta = -Math.PI / 2 - Math.atan2(Math.cos(camYaw), Math.sin(camYaw));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 7, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0e2433'; g.fillRect(0, 0, S, S);
    g.translate(R, R); g.rotate(theta);
    const k = World.mapScale, ext = World.mapExtent;
    g.save(); g.scale(ppm / k, ppm / k); g.drawImage(World.mapCanvas, -(fx + ext) * k, -(fz + ext) * k); g.restore();

    const W = (x, z) => [(x - fx) * ppm, (z - fz) * ppm];
    if (Game.route.length > 1) {
      g.strokeStyle = '#b47cff'; g.lineWidth = 4; g.lineCap = g.lineJoin = 'round';
      g.beginPath();
      Game.route.forEach((p, i) => { const [X, Y] = W(p[0], p[1]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke();
    }
    const edge = R - 15;
    const blip = (x, z, color, r, clampEdge, shape) => {
      let [X, Y] = W(x, z);
      const d = Math.hypot(X, Y);
      if (d > edge) { if (!clampEdge) return; X *= edge / d; Y *= edge / d; }
      g.fillStyle = color; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1.5;
      g.beginPath();
      if (shape === 'diamond') { g.moveTo(X, Y - r); g.lineTo(X + r, Y); g.lineTo(X, Y + r); g.lineTo(X - r, Y); g.closePath(); }
      else if (shape === 'square') g.rect(X - r, Y - r, r * 2, r * 2);
      else g.arc(X, Y, r, 0, Math.PI * 2);
      g.fill(); g.stroke();
    };
    for (const p of Pickups.list) if (p.mesh.visible && p.type === 'cash') blip(p.x, p.z, '#ffc247', 2.2, false);
    if (!Missions.active) for (const gv of Missions.givers) blip(gv.x, gv.z, hex(gv.def.color), 5.5, true, 'diamond');
    const t = Missions.targetPos();
    if (t) blip(t.x, t.z, t.race ? '#3ee6c1' : '#ffc247', 6, true);
    else if (Game.waypoint) blip(Game.waypoint.x, Game.waypoint.z, '#b47cff', 6, true, 'diamond');
    const flash = performance.now() % 500 < 250;
    for (const v of Vehicles.all) if (v.ai instanceof PoliceDriver && !v.dead) blip(v.pos.x, v.pos.z, flash ? '#ff3b4a' : '#3b7bff', 4, true);
    if (Heli.active) blip(Heli.pos.x, Heli.pos.z, flash ? '#3b7bff' : '#ff3b4a', 4.5, true, 'square');
    g.restore();

    // player arrow
    g.save(); g.translate(R, R);
    g.rotate(theta + Math.atan2(Math.cos(heading), Math.sin(heading)) + Math.PI / 2);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.stroke();
    g.restore();

    // rim: health ring + north marker
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.arc(R, R, R - 4, 0, Math.PI * 2); g.stroke();
    const hp = clamp(Player.health / 100, 0, 1);
    g.strokeStyle = hp < 0.3 ? '#ff3b4a' : '#7be38f';
    g.beginPath(); g.arc(R, R, R - 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hp); g.stroke();
    const nA = -Math.PI / 2 + theta, nx = R + Math.cos(nA) * (R - 15), ny = R + Math.sin(nA) * (R - 15);
    g.fillStyle = 'rgba(8,10,16,0.85)'; g.beginPath(); g.arc(nx, ny, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '700 11px Heebo, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
  },

  /* ---------------- full map ---------------- */
  openMap() { this.el.bigmap.classList.add('on'); this.drawBigMap(); },
  closeMap() { this.el.bigmap.classList.remove('on'); },
  drawBigMap() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight, c = this.big, g = this.bigCtx;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#071722'; g.fillRect(0, 0, W, H);
    const size = Math.min(W, H) * 0.9, ox = (W - size) / 2, oy = (H - size) / 2, E = World.mapExtent, px = size / (2 * E);
    this.bigT = { size, ox, oy };
    g.drawImage(AerialMap.canvas || World.mapCanvas, ox, oy, size, size);
    const X = x => ox + (x + E) * px, Y = z => oy + (z + E) * px;

    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 ${Math.max(11, size * 0.017)}px Heebo, Arial, sans-serif`;
    g.fillStyle = 'rgba(244,241,232,0.75)';
    const labels = [[0, 0, 'Downtown'], [0, -270, 'North Hill'], [0, 270, 'Harbor District'], [270, 0, 'East Side'], [-270, 0, 'Arts District'],
      [0, -440, 'Aurelio Hills'], [0, 440, 'Gold Coast'], [540, 65, 'Palm Vista'], [-540, -65, 'Sunset Flats']];
    if (Neighborhood.bounds) labels.push([CITY.CELL, Neighborhood.bounds.minZ + 35, 'London District']);
    g.strokeStyle = 'rgba(8,20,25,0.85)'; g.lineWidth = 3; g.lineJoin = 'round';
    for (const [x, z, t] of labels) { g.strokeText(t, X(x), Y(z)); g.fillText(t, X(x), Y(z)); }

    if (Game.route.length > 1) {
      g.strokeStyle = '#b47cff'; g.lineWidth = 4; g.lineCap = g.lineJoin = 'round'; g.beginPath();
      Game.route.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
      g.stroke();
    }
    const dot = (x, z, color, r, label) => {
      g.fillStyle = color; g.strokeStyle = '#071722'; g.lineWidth = 2;
      g.beginPath(); g.arc(X(x), Y(z), r, 0, Math.PI * 2); g.fill(); g.stroke();
      if (label) { g.fillStyle = '#f4f1e8'; g.font = '600 13px Heebo, Arial, sans-serif'; g.lineWidth = 3; g.strokeText(label, X(x), Y(z) - r - 10); g.fillText(label, X(x), Y(z) - r - 10); }
    };
    if (!Missions.active) for (const gv of Missions.givers) dot(gv.x, gv.z, hex(gv.def.color), 7, gv.def.title);
    const t = Missions.targetPos();
    if (t) dot(t.x, t.z, t.race ? '#3ee6c1' : '#ffc247', 8, 'Target');
    if (Game.waypoint) dot(Game.waypoint.x, Game.waypoint.z, '#b47cff', 7, 'Waypoint');
    for (const v of Vehicles.all) if (v.ai instanceof PoliceDriver && !v.dead) dot(v.pos.x, v.pos.z, '#ff3b4a', 4);
    const P = Player.focus(), hd = Player.mode === 'car' && Player.vehicle ? Player.vehicle.heading : Player.facing;
    g.save(); g.translate(X(P.x), Y(P.z)); g.rotate(Math.atan2(Math.cos(hd), Math.sin(hd)) + Math.PI / 2);
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath();
    g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#071722'; g.lineWidth = 2; g.stroke(); g.restore();
  },
  mapClick(e) {
    if (!this.bigT) return;
    const r = this.big.getBoundingClientRect(), { size, ox, oy } = this.bigT, E = World.mapExtent;
    const x = ((e.clientX - r.left - ox) / size) * 2 * E - E, z = ((e.clientY - r.top - oy) / size) * 2 * E - E;
    if ((Math.abs(x) > CITY.HALF + 8 || Math.abs(z) > CITY.HALF + 8) && !Neighborhood.contains(x, z) && !Neighborhood.onBridge(x, z)) return;
    Sound.click(); Navigation.travel(x, z);
    if (Game.state === 'map') this.drawBigMap();
  },

  /* ---------------- panels ---------------- */
  openPanel(kind) {
    const titles = { controls: 'Controls', settings: 'Settings', about: 'About' };
    this.el['panel-title'].textContent = titles[kind];
    this.el['panel-body'].innerHTML = this['panel_' + kind]();
    if (kind === 'settings') this.bindSettings();
    this.el.panel.classList.add('on');
    const x = this.el.panel.querySelector('.x'); if (x) x.focus();
  },
  closePanel() { this.el.panel.classList.remove('on'); },
  isPanelOpen() { return this.el.panel.classList.contains('on'); },

  panel_controls() {
    const row = (keys, label) => `<div class="kr"><span class="keys">${keys.map(k => `<kbd>${k}</kbd>`).join('')}</span><span>${label}</span></div>`;
    return `<div class="ctl-grid">
      <section><h3>On foot</h3>
        ${row(['W', 'A', 'S', 'D'], 'Move')}${row(['Shift'], 'Sprint')}${row(['Space'], 'Jump')}
        ${row(['Mouse'], 'Look around')}${row(['Click'], 'Punch / fire equipped weapon')}${row(['1', '2'], 'Equip M4 (first-person)')}${row(['R'], 'Reload')}${row(['0'], 'Holster / third-person')}${row(['F'], 'Enter / hijack vehicle')}${row(['E'], 'Start mission')}
      </section>
      <section><h3>In vehicle</h3>
        ${row(['W'], 'Accelerate')}${row(['S'], 'Brake / reverse')}${row(['A', 'D'], 'Steer')}${row(['Space'], 'Handbrake, drift')}
        ${row(['H'], 'Horn')}${row(['Q'], 'Switch radio station')}${row(['V'], 'Camera view')}${row(['C'], 'Look back')}${row(['F'], 'Exit vehicle')}
      </section>
      <section><h3>General</h3>
        ${row(['M'], 'Map: click to teleport on foot / auto-drive in car')}${row(['Esc'], 'Pause menu')}${row(['P'], 'Pause')}
        <p class="note">Arrow keys work too. If your browser blocks pointer lock, drag with the mouse button held to look around.</p>
      </section></div>`;
  },
  panel_settings() {
    const s = Game.settings, q = k => `<button class="seg${s.quality === k ? ' sel' : ''}" data-q="${k}">${{ low: 'Low', medium: 'Medium', high: 'High' }[k]}</button>`;
    const sl = (id, label, v, min, max, step) => `<label class="sl"><span>${label}</span><input type="range" id="set-${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
    return `<div class="set">
      <div class="set-row"><span class="set-l">Graphics quality</span><div class="segs" role="group">${q('low')}${q('medium')}${q('high')}</div></div>
      <p class="note">Low disables shadows and shortens draw distance. Recommended for laptops.</p>
      ${sl('sfx', 'Sound effects', s.sfx, 0, 1, 0.05)}${sl('music', 'Radio & music', s.music, 0, 1, 0.05)}${sl('sens', 'Mouse sensitivity', s.sens, 0.3, 2.5, 0.05)}
      <label class="chk"><input type="checkbox" id="set-fps"${s.fps ? ' checked' : ''}> Show FPS counter</label>
      <button class="text-btn" id="set-reset">Reset saved progress</button></div>`;
  },
  panel_about() {
    return `<div class="about">
      <p>San Aurelio is an original open-world game that runs entirely in the browser. The city, cars, sounds and music are generated in code on every load, with no media files.</p>
      <p>All names, brands and places are fictional. The game is not affiliated with any existing developer or game series.</p>
      <p class="note">Built with Three.js r128 and the Web Audio API.</p>
      <p class="note">M4 - FPS Weapon Animations Pack (v.1) by BarcodeGames, licensed under CC BY 4.0. <a href="https://sketchfab.com/3d-models/m4-fps-weapon-animations-pack-v1-662fc74dda2646cfb48fc610705768ef" target="_blank" rel="noopener">Original model</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">License</a>. The two uploaded versions contain the same model.</p>
      <p class="note">Trees: <a href="https://sketchfab.com/3d-models/willow-tree-7bd70b487fae4f3eb70d4e69394e97b4" target="_blank" rel="noopener">Willow Tree</a> by vervoortward and <a href="https://sketchfab.com/3d-models/tree-animate-f0f9eb5e6c104bbb8e1f41c97019e6f2" target="_blank" rel="noopener">Tree Animate</a> by RandyGF, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Runtime scaling, foliage cutouts and instancing applied.</p></div>`;
  },
  bindSettings() {
    const s = Game.settings, body = this.el['panel-body'];
    body.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      s.quality = b.dataset.q; body.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('sel', x === b));
      Game.applySettings(); Game.save(); Sound.click();
    }));
    for (const id of ['sfx', 'music', 'sens']) {
      const i = body.querySelector('#set-' + id);
      i.addEventListener('input', () => { s[id] = parseFloat(i.value); Game.applySettings(); });
      i.addEventListener('change', () => Game.save());
    }
    body.querySelector('#set-fps').addEventListener('change', e => { s.fps = e.target.checked; Game.applySettings(); Game.save(); });
    body.querySelector('#set-reset').addEventListener('click', () => {
      Game.money = 2500; Game.completed = []; Game.save();
      this.toast('Progress reset', 'Cash restored to ' + ltr('$2,500') + '.', 'ok');
    });
  },
};
