'use strict';
/* =========================================================
   Main — input, camera, game state machine and the loop
   ========================================================= */

const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

const Input = {
  keys: new Set(), pressed: new Set(), mx: 0, my: 0, clicked: false, drag: false,
  init(canvas) {
    addEventListener('keydown', e => {
      if (Game.state === 'playing' && GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      Game.onKey(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.drag = false; });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === canvas || this.drag) { this.mx += e.movementX || 0; this.my += e.movementY || 0; }
    });
    canvas.addEventListener('mousedown', e => {
      if (Game.state !== 'playing') return;
      if (document.pointerLockElement !== canvas) { Game.lock(); this.drag = true; }
      if (e.button === 0) this.clicked = true;
    });
    addEventListener('mouseup', () => { this.drag = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  },
  down(...codes) { for (const c of codes) if (this.keys.has(c)) return true; return false; },
  hit(code) { return this.pressed.has(code); },
  endFrame() { this.pressed.clear(); this.mx = this.my = 0; this.clicked = false; },
};

const Game = {
  state: 'loading', money: 2500, completed: [], waypoint: null, route: [], routeT: 0, prompt: null,
  settings: { quality: 'high', sfx: 0.8, music: 0.55, sens: 1, fps: false },
  cam: { yaw: -Math.PI / 2, pitch: 0.16, carYaw: 0, orbit: 0, orbitT: 0, pitchCar: 0, mode: 0, lookBack: false, shake: 0, menuA: 0.7 },
  camLambda: 3, slow: 1, slowT: 0, bustT: 0, lastCar: null, started: false, gearLabel: 'N', pausedAt: 0,
  ignoreUnlock: false, radioLevel: -1, saveT: 30, policeHitT: 0,
  _tmpV: new THREE.Vector3(), _des: new THREE.Vector3(), _look: new THREE.Vector3(), _lookCur: new THREE.Vector3(0, 30, 0),
  START: { x: -70, z: 19 },

  async init() {
    UI.init();
    this.load();
    const canvas = (this.canvas = document.getElementById('game'));
    let r;
    try {
      r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      UI.loading(0, 'This browser does not support WebGL. Try a recent Chrome, Edge or Firefox.');
      return;
    }
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 4200);
    this.camera.position.set(260, 120, 160);
    Input.init(canvas);

    await Assets.load(p => UI.loading(p * 0.18, 'טוען מודלים'));
    await World.build(this.scene, (p, s) => UI.loading(0.18 + p * 0.82, s));
    FX.init(this.scene);
    Weapons.init();
    Heli.build();
    UI.loading(0.84, 'Loading player model');
    await Player.init();
    Player.pos.set(this.START.x, 0.25, this.START.z); Player.facing = -Math.PI / 2;
    const starter = new Vehicle('sports', -73.45, 28, Math.PI, 0xff3b1f);
    starter.parked = true; starter.input.handbrake = true; this.lastCar = starter;

    UI.loading(0.88, 'Spawning traffic and pedestrians'); await wait(30);
    const Q = QUALITY[this.settings.quality] || QUALITY.high, F = Player.focus();
    Traffic.target = Q.traffic; Traffic.parkedTarget = Math.round(Q.traffic * 0.4);
    for (let k = 0, n = 0; k < Q.traffic * 6 && n < Q.traffic; k++) if (Traffic.spawn(F.x, F.z, true)) n++;
    for (let k = 0, n = 0; k < 80 && n < Traffic.parkedTarget; k++) if (Traffic.spawnParked(F.x, F.z, true)) n++;
    Peds.init(Q.peds, F.x, F.z);
    Missions.init(); Pickups.init();
    this.wpBeacon = makeBeacon(0xb47cff, 60, 2); this.wpBeacon.visible = false;
    this.applySettings();

    UI.loading(0.96, 'Warming up the engine'); await wait(30);
    try { r.compile(this.scene, this.camera); } catch (e) { /* optional warm-up */ }
    UI.loading(1, 'Ready'); await wait(300);

    addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !this.ignoreUnlock) this.pause();
      this.ignoreUnlock = false;
    });
    addEventListener('pointerdown', () => Sound.init(), { once: true });
    addEventListener('keydown', () => Sound.init(), { once: true });
    addEventListener('beforeunload', () => this.save());

    this.toMenu();
    UI.hide('loading');
    this.clock = new THREE.Clock();
    this.loop();
  },

  /* ---------------- state machine ---------------- */
  action(a) {
    if (a === 'play') this.play();
    else if (a === 'resume') this.resume();
    else if (a === 'controls' || a === 'settings' || a === 'about') UI.openPanel(a);
    else if (a === 'close-panel') UI.closePanel();
    else if (a === 'map') this.openMap();
    else if (a === 'quit') { UI.hide('pause'); this.save(); this.toMenu(); }
  },
  toMenu() {
    this.state = 'menu';
    UI.hide('hud'); UI.hide('pause'); UI.closeMap(); UI.show('menu');
    this.camLambda = 2; this.muteLoops();
  },
  play() {
    Sound.init(); Sound.applyVolume();
    if (!this.started) {
      this.started = true;
      UI.el['play-label'].textContent = 'Continue';
      setTimeout(() => {
        UI.toast('Welcome to San Aurelio', 'A red sports car is parked right next to you. Walk up and press F.', 'mission');
        UI.toast('Three missions available', 'Look for colored light beams on the map (M).', 'info');
      }, 900);
    }
    UI.hide('menu'); UI.show('hud'); UI.closePanel();
    this.state = 'playing'; this.camLambda = 1.4;
    this.lock();
  },
  lock() {
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not available */ }
  },
  unlock() {
    if (document.pointerLockElement) { this.ignoreUnlock = true; document.exitPointerLock(); }
  },
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; this.pausedAt = performance.now();
    UI.show('pause'); this.muteLoops();
    if (Sound.ready) Radio.setLevel(0.3, 700);
    this.radioLevel = -1;
    this.unlock(); this.save();
  },
  resume() {
    if (this.state !== 'paused' && this.state !== 'map') return;
    UI.hide('pause'); UI.closePanel(); UI.closeMap();
    this.state = 'playing';
    this.lock();
  },
  openMap() {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    UI.hide('pause'); this.unlock(); this.muteLoops();
    this.state = 'map'; this.updateRoute(); UI.openMap();
  },
  closeMap() { UI.closeMap(); this.state = 'paused'; this.resume(); },
  onKey(code) {
    if (UI.isPanelOpen()) { if (code === 'Escape') UI.closePanel(); return; }
    if (this.state === 'playing') {
      if (code === 'KeyM') this.openMap();
      else if (code === 'KeyP' || (code === 'Escape' && !document.pointerLockElement)) this.pause();
    } else if (this.state === 'paused') {
      if ((code === 'Escape' || code === 'KeyP') && performance.now() - this.pausedAt > 350) this.resume();
    } else if (this.state === 'map') {
      if (code === 'KeyM' || code === 'Escape') this.closeMap();
    }
  },
  muteLoops() {
    Sound.updateEngine(false, 0, 0); Sound.setSiren(0); Sound.setScreech(0); Sound.setHorn(false); Sound.setHeli(0);
  },

  /* ---------------- loop ---------------- */
  loop() {
    requestAnimationFrame(() => this.loop());
    const frameTime = this.clock.getDelta();
    Vehicles.sampleFrame(frameTime);
    const rdt = Math.min(frameTime, 0.05);
    if (this.state === 'playing' || this.state === 'menu') {
      if (this.slowT > 0) { this.slowT -= rdt; this.slow = damp(this.slow, 0.28, 6, rdt); }
      else this.slow = damp(this.slow, 1, 4, rdt);
      this.update(rdt * this.slow, rdt, frameTime * this.slow);
    }
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    Weapons.render(this.renderer);
    Input.endFrame();
  },

  update(dt, rdt, weaponDt = dt) {
    const playing = this.state === 'playing';
    this.prompt = null;
    if (playing) this.handleInput();
    const F = Player.focus();
    World.update(dt, F, this.camera);
    if (playing && Player.mode === 'foot' && !Player.dead) Player.updateFoot(dt, this.footInput(), this.cam.yaw);
    else if (Player.mode === 'foot') Player.ch.animate(dt, 0);

    Traffic.update(dt, F.x, F.z);
    for (const v of Vehicles.all) v.update(dt);
    Vehicles.collide();
    for (const v of Vehicles.all) v.updateVisual(dt);
    if (Player.mode === 'car' && Player.vehicle) Player.pos.set(Player.vehicle.pos.x, 0, Player.vehicle.pos.z);

    this.collideCharacters();
    Peds.update(dt, F.x, F.z);
    if (playing) {
      Wanted.update(dt);
      this.checkBusted(dt);
      Missions.update(dt);
      Pickups.update(dt);
      this.interactions();
      this.routeT -= rdt;
      if (this.routeT <= 0) this.updateRoute();
      const showWp = !!this.waypoint && !Missions.targetPos();
      this.wpBeacon.visible = showWp;
      if (showWp) { this.wpBeacon.position.set(this.waypoint.x, 0.05, this.waypoint.z); animateBeacon(this.wpBeacon, dt); }
      this.policeHitT -= dt;
      this.saveT -= rdt; if (this.saveT <= 0) { this.saveT = 30; this.save(); }
    }
    Heli.update(dt);
    FX.update(dt);
    Weapons.update(weaponDt);
    this.updateCamera(rdt);
    Player.ch.root.visible = Player.mode === 'foot' && !Weapons.firstPerson;
    this.updateAudio();
    if (playing) UI.update(rdt);
  },

  /* ---------------- player input ---------------- */
  handleInput() {
    const I = Input, C = this.cam, sens = 0.0023 * this.settings.sens;
    if (Player.mode === 'foot') {
      C.yaw -= I.mx * sens;
      C.pitch = clamp(C.pitch + I.my * sens, -0.4, 1.15);
    } else if (I.mx || I.my) {
      C.orbit -= I.mx * sens; C.orbitT = 1.5;
      C.pitchCar = clamp(C.pitchCar + I.my * sens, -0.2, 0.6);
    }
    if (Player.dead) return;
    if (Player.mode === 'car') {
      const v = Player.vehicle, inp = v.input;
      inp.throttle = I.down('KeyW', 'ArrowUp') ? 1 : 0;
      inp.brake = I.down('KeyS', 'ArrowDown') ? 1 : 0;
      inp.steer = (I.down('KeyA', 'ArrowLeft') ? 1 : 0) - (I.down('KeyD', 'ArrowRight') ? 1 : 0);
      inp.handbrake = I.down('Space');
      const horn = I.down('KeyH');
      Sound.setHorn(horn);
      if (horn && Math.random() < 0.08) Peds.scareAround(v.pos.x, v.pos.z, 14);
      if (I.hit('KeyQ')) UI.radio(Radio.nextStation());
      if (I.hit('KeyV')) C.mode = (C.mode + 1) % 3;
      C.lookBack = I.down('KeyC');
      if (v.speed > 8 && World.sidewalkAt(v.pos.x, v.pos.z) && Math.random() < 0.3) Peds.scareAround(v.pos.x, v.pos.z, 9);
      if (I.hit('KeyF') || I.hit('Enter')) this.exitVehicle();
    } else {
      if (I.hit('KeyF') || I.hit('Enter')) this.tryEnter();
      if (I.hit('Digit1')) Weapons.equip(0);
      if (I.hit('Digit2')) Weapons.equip(1);
      if (I.hit('Digit0')) Weapons.equip(-1);
      if (I.hit('KeyR')) Weapons.reload();
      if (I.clicked) { if (Weapons.firstPerson) Weapons.fire(); else Player.punch(); }
    }
  },
  footInput() {
    const I = Input;
    return {
      fwd: I.down('KeyW', 'ArrowUp'), back: I.down('KeyS', 'ArrowDown'),
      left: I.down('KeyA', 'ArrowLeft'), right: I.down('KeyD', 'ArrowRight'),
      sprint: I.down('ShiftLeft', 'ShiftRight'), jump: I.hit('Space'),
    };
  },
  nearestCar(r = 3.8) {
    let best = null, bd = r;
    for (const v of Vehicles.all) {
      if (v.dead) continue;
      const d = Math.hypot(v.pos.x - Player.pos.x, v.pos.z - Player.pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  },
  interactions() {
    if (Player.mode !== 'foot' || Player.dead || this.prompt) return;
    const v = this.nearestCar();
    if (v) this.prompt = `<kbd>F</kbd> ${v.driver ? 'Hijack ' : 'Enter '}${ltr(v.spec.name)}`;
  },
  tryEnter() {
    const v = this.nearestCar();
    if (!v || v.speed > 7) return;
    if (v.driver === 'npc' || v.driver === 'police') {
      const f = v.fwd();
      Peds.eject(v.pos.x + f.z * 2.4, v.pos.z - f.x * 2.4, Player.pos.x, Player.pos.z);
      Wanted.crime(v.type === 'police' ? 6 : 1, v.type !== 'police');
      Sound.punch();
    }
    Player.enter(v);
    Sound.door();
    UI.vehicleName(v.spec.name);
    this.lastCar = v;
    this.cam.carYaw = this.cam.yaw + Math.PI; this.cam.orbit = 0;
    if (Radio.current) setTimeout(() => { if (Player.vehicle === v) UI.radio(Radio.current); }, 700);
  },
  exitVehicle() {
    const v = Player.exit();
    if (!v) return;
    this.cam.yaw = v.heading; this.cam.pitch = 0.16;
    Sound.door(); Sound.updateEngine(false, 0, 0);
  },

  /* ---------------- physics glue ---------------- */
  collideCharacters() {
    for (const v of Vehicles.all) {
      const sp = v.speed, f = v.fwd(), hl = v.halfL + 0.35, hw = v.halfW + 0.35;
      for (const p of Peds.list) {
        if (p.state === 'down') continue;
        const q = p.ch.root.position, dx = q.x - v.pos.x, dz = q.z - v.pos.z;
        if (dx * dx + dz * dz > 14) continue;
        const lz = dx * f.x + dz * f.z, lx = dx * f.z - dz * f.x;
        if (Math.abs(lz) > hl || Math.abs(lx) > hw) continue;
        if (sp > 3.5) {
          p.hit(v.vel.x / sp, v.vel.y / sp, sp);
          FX.dust(q.x, q.z);
          v.vel.multiplyScalar(0.92);
          if (v.driver === 'player') { Wanted.crime(2, true); this.shake(0.12); }
          Peds.scareAround(q.x, q.z, 20);
        } else {
          const s = Math.sign(lx) || 1, push = hw - Math.abs(lx);
          q.x += f.z * s * push; q.z -= f.x * s * push;
        }
      }
      if (Player.mode === 'foot' && !Player.dead) {
        const q = Player.pos, dx = q.x - v.pos.x, dz = q.z - v.pos.z;
        if (dx * dx + dz * dz < 14) {
          const lz = dx * f.x + dz * f.z, lx = dx * f.z - dz * f.x, pz = hl - Math.abs(lz), px = hw - Math.abs(lx);
          if (pz > 0 && px > 0) {
            const towards = v.vel.x * dx + v.vel.y * dz > 0;
            if (sp > 4.5 && towards && Player.invuln <= 0) {
              Player.takeDamage(sp * 2.2); Player.invuln = 0.8;
              Player.vel.set(v.vel.x * 0.6, v.vel.y * 0.6); Player.vy = 3.5;
              this.shake(0.3); Sound.thud();
            }
            if (px < pz) { const s = Math.sign(lx) || 1; q.x += f.z * s * px; q.z -= f.x * s * px; }
            else { const s = Math.sign(lz) || 1; q.x += f.x * s * pz; q.z += f.z * s * pz; }
          }
        }
      }
    }
  },
  onImpact(v, imp, x, z) {
    if (imp > 6) v.damage((imp - 6) * 1.6);
    FX.sparks(x, 0.6, z, Math.min(10, Math.floor(imp / 2)));
    if (v.driver === 'player') {
      Sound.crash(imp / 25); this.shake(Math.min(0.6, imp / 35));
      if (imp > 20) Player.takeDamage((imp - 20) * 0.8, true);
    } else if (this.near(x, z, 60)) Sound.crash(imp / 60);
  },
  onCarCrash(a, b, imp, x, z) {
    if (imp > 6) { a.damage((imp - 6) * 1.4); b.damage((imp - 6) * 1.4); }
    FX.sparks(x, 0.7, z, Math.min(12, Math.floor(imp)));
    const pa = a.driver === 'player', pb = b.driver === 'player';
    if (pa || pb) {
      const other = pa ? b : a;
      other.lastHitByPlayer = true;
      Sound.crash(imp / 22); this.shake(Math.min(0.7, imp / 30));
      if (imp > 22) Player.takeDamage((imp - 22) * 0.6, true);
      // only count it as assaulting police when the player was the one driving into them
      const me = pa ? a : b, nx = other.pos.x - me.pos.x, nz = other.pos.z - me.pos.z, nl = Math.hypot(nx, nz) || 1;
      const myPush = (me.vel.x * nx + me.vel.y * nz) / nl, theirPush = -(other.vel.x * nx + other.vel.y * nz) / nl;
      if (other.type === 'police' && other.driver && myPush > 4 && myPush > theirPush && this.policeHitT <= 0) { this.policeHitT = 2.5; Wanted.crime(3, false); }
      if (other.ai instanceof TrafficDriver) { other.ai.bumped = 1.6; if (imp > 2.5) Sound.tone(400, 0.4, 'square', 0.04); }
    } else if (this.near(x, z, 60)) Sound.crash(imp / 50);
  },
  explosionAt(x, z, src) {
    FX.explosion(x, z);
    const cp = this.camera.position, cd = Math.hypot(cp.x - x, cp.z - z);
    Sound.explosion(clamp(1 - cd / 220, 0.12, 1));
    this.shake(clamp(1 - cd / 70, 0, 1) * 0.9);
    for (const v of Vehicles.all) {
      if (v === src || v.dead) continue;
      const d = Math.hypot(v.pos.x - x, v.pos.z - z);
      if (d < 9) { v.damage(75 * (1 - d / 9)); const k = (10 * (1 - d / 9)) / (d || 1); v.vel.x += (v.pos.x - x) * k; v.vel.y += (v.pos.z - z) * k; }
    }
    for (const p of Peds.list) {
      const q = p.ch.root.position, d = Math.hypot(q.x - x, q.z - z);
      if (d < 9) p.hit((q.x - x) / (d || 1), (q.z - z) / (d || 1), 12);
      else if (d < 40) p.scare(x, z);
    }
    if (!Player.dead && this.state === 'playing') {
      if (src && src === Player.vehicle) Player.takeDamage(100, true);
      else {
        const P = Player.focus(), d = Math.hypot(P.x - x, P.z - z);
        if (d < 8) Player.takeDamage((Player.mode === 'car' ? 35 : 80) * (1 - d / 8), true);
      }
    }
    if (src && src.lastHitByPlayer) Wanted.crime(3, true);
  },
  policeShot(v, dist) {
    const f = v.fwd();
    FX.muzzle(v.pos.x + f.z * 1.1, 1.5, v.pos.z - f.x * 1.1);
    Sound.gunshot(clamp(0.55 - dist / 90, 0.08, 0.55));
    Peds.scareAround(v.pos.x, v.pos.z, 30);
    if (Math.random() < 0.3) {
      if (Player.mode === 'car') { Player.vehicle.damage(rand(2, 4)); Player.takeDamage(rand(1, 3), true); }
      else Player.takeDamage(rand(5, 10), true);
    }
  },
  near(x, z, r) { const P = Player.focus(); return Math.hypot(P.x - x, P.z - z) < r; },
  shake(a) { this.cam.shake = Math.max(this.cam.shake, a); },
  addMoney(n) {
    if (!n) return;
    this.money = Math.max(0, this.money + n);
    UI.moneyDelta(n);
  },

  /* ---------------- arrest / death ---------------- */
  checkBusted(dt) {
    if (Wanted.level === 0 || Player.dead) { this.bustT = 0; return; }
    const P = Player.focus(), slow = Player.speedNow() < (Player.mode === 'foot' ? 2.2 : 1.6);
    let near = false;
    for (const v of Vehicles.all) {
      if (v.ai instanceof PoliceDriver && !v.dead && v.speed < 3.5 && Math.hypot(v.pos.x - P.x, v.pos.z - P.z) < 8) { near = true; break; }
    }
    this.bustT = near && slow ? this.bustT + dt : Math.max(0, this.bustT - dt * 2);
    if (this.bustT > 2.6) this.busted();
  },
  wasted() {
    if (Player.dead) return;
    Player.dead = true; this.slowT = 3;
    this.canvas.classList.add('fx-dead');
    if (Player.vehicle) { const i = Player.vehicle.input; i.throttle = i.brake = i.steer = 0; }
    Missions.abort();
    UI.banner('WASTED', 'Hospital bill: ' + ltr('−' + fmtMoney(250)), 'dead', 3600);
    Sound.wasted();
    setTimeout(() => this.respawn('hospital', 250), 3800);
  },
  busted() {
    if (Player.dead) return;
    const cost = Math.round(Math.min(this.money, 150 + Wanted.level * 150));
    Player.dead = true; this.slowT = 2;
    this.canvas.classList.add('fx-busted');
    if (Player.vehicle) { const i = Player.vehicle.input; i.throttle = i.brake = i.steer = 0; i.handbrake = true; }
    Missions.abort();
    UI.banner('BUSTED', 'Bail cost ' + ltr(fmtMoney(cost)), 'busted', 3400);
    Sound.failed();
    setTimeout(() => this.respawn('police', cost), 3600);
  },
  respawn(where, cost) {
    UI.fade(true);
    setTimeout(() => {
      if (Player.mode === 'car') Player.exit();
      const [x, z] = where === 'hospital' ? sidewalkCorner(3, 5) : sidewalkCorner(8, 6);
      Player.pos.set(x, 0.25, z); Player.y = 0.25; Player.vel.set(0, 0); Player.vy = 0;
      Player.health = 100; Player.ch.stand(); Player.ch.root.visible = true;
      this.addMoney(-Math.min(this.money, cost));
      Wanted.clear(true); Heli.reset(); this.bustT = 0;
      for (let k = Vehicles.all.length - 1; k >= 0; k--) if (Vehicles.all[k].ai instanceof PoliceDriver) Vehicles.remove(Vehicles.all[k]);
      World.time = (World.time + 5) % 24;
      this.canvas.classList.remove('fx-dead', 'fx-busted');
      this.cam.yaw = Math.PI / 4; this.camLambda = 40; this.slowT = 0; this.slow = 1;
      Player.dead = false; Player.invuln = 2;
      UI.fade(false); this.save();
    }, 700);
  },

  /* ---------------- navigation ---------------- */
  updateRoute() {
    this.routeT = 0.5;
    const m = Missions.targetPos(), t = m || this.waypoint;
    if (!t) { this.route = []; return; }
    const P = Player.focus();
    if (!m && Math.hypot(P.x - t.x, P.z - t.z) < 14) { this.waypoint = null; this.route = []; UI.toast('Destination reached', 'Waypoint removed.', 'ok'); return; }
    const inLondon = p => Neighborhood.contains(p.x, p.z) || Neighborhood.onBridge(p.x, p.z);
    const fromLondon = inLondon(P), toLondon = inLondon(t);
    if (fromLondon && toLondon) { this.route = [[P.x, P.z], [t.x, t.z]]; return; }
    const bridge = Neighborhood.bridge;
    const junction = bridge ? { x: bridge.x, z: -CITY.HALF } : null;
    const a = fromLondon ? junction : P, b = toLondon ? junction : t;
    const nodes = World.path(World.nearestNode(a.x, a.z), World.nearestNode(b.x, b.z));
    const grid = nodes.map(n => [nodeCoord(n[0]), nodeCoord(n[1])]);
    this.route = [[P.x, P.z], ...(fromLondon ? [[bridge.x, bridge.minZ], [junction.x, junction.z]] : []),
      ...grid, ...(toLondon ? [[junction.x, junction.z], [bridge.x, bridge.minZ]] : []), [t.x, t.z]];
  },

  /* ---------------- camera ---------------- */
  updateCamera(dt) {
    const C = this.cam, cam = this.camera, des = this._des, look = this._look;
    let fov = 60, ox = 0, oz = 0, collide = true, k;
    if (this.state === 'menu') {
      C.menuA += dt * 0.04;
      des.set(-20 + Math.cos(C.menuA) * 250, 100 + Math.sin(C.menuA * 0.7) * 22, 20 + Math.sin(C.menuA) * 250);
      look.set(-20, 38, 20);
      collide = false; fov = 52; k = this.camLambda;
    } else if (Player.mode === 'car' && Player.vehicle) {
      const v = Player.vehicle, sp = v.speed;
      if (C.orbitT > 0) C.orbitT -= dt;
      else { C.orbit = damp(C.orbit, 0, 3, dt); C.pitchCar = damp(C.pitchCar, 0, 3, dt); }
      const base = v.heading + (C.lookBack ? 0 : Math.PI) + C.orbit;
      if (C.mode === 2 && !C.lookBack) {
        C.carYaw = base;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
        des.set(v.pos.x + fx * 0.4, v.spec.hgt + 0.3, v.pos.z + fz * 0.4);
        look.set(v.pos.x + fx * 30, 1.3, v.pos.z + fz * 30);
        collide = false; k = 90;
      } else {
        C.carYaw = dampAngle(C.carYaw, base, C.lookBack ? 20 : 4.5, dt);
        const P = C.mode === 1 ? { d: 11.5, h: 4 } : { d: 7, h: 2.5 };
        const d = P.d + Math.min(sp, 50) * 0.05, h = P.h + v.spec.hgt * 0.3 + Math.min(sp, 50) * 0.01 + C.pitchCar * 6;
        des.set(v.pos.x + Math.sin(C.carYaw) * d, h, v.pos.z + Math.cos(C.carYaw) * d);
        look.set(v.pos.x - Math.sin(C.carYaw) * 3, 1.1 + v.spec.hgt * 0.35, v.pos.z - Math.cos(C.carYaw) * 3);
      }
      fov = 60 + Math.min(sp, 55) * 0.3;
      ox = v.pos.x; oz = v.pos.z;
    } else if (Weapons.firstPerson) {
      const p = Player.pos, cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
      des.set(p.x, p.y + 1.6, p.z);
      look.copy(des).add(new THREE.Vector3(Math.sin(C.yaw) * cp, -sp, Math.cos(C.yaw) * cp));
      cam.position.copy(des); this._lookCur.copy(look);
      collide = false; k = 90;
    } else {
      const p = Player.pos, fx = Math.sin(C.yaw), fz = Math.cos(C.yaw), rx = -fz, rz = fx;
      const tx = p.x + rx * 0.55, ty = p.y + 1.6, tz = p.z + rz * 0.55, dist = 4.4, cp = Math.cos(C.pitch), sp = Math.sin(C.pitch);
      des.set(tx - fx * dist * cp, ty + dist * sp, tz - fz * dist * cp);
      look.set(tx + fx * 1.5, ty, tz + fz * 1.5);
      ox = p.x; oz = p.z;
    }
    if (this.state !== 'menu' && Player.mode === 'car' && Player.vehicle) {
      des.y += Player.vehicle.pos.y; look.y += Player.vehicle.pos.y;
    }
    if (k === undefined) { this.camLambda = Math.min(26, this.camLambda + dt * 9); k = this.camLambda; }
    if (collide) {
      const oy = 1.7 + World.groundHeight(ox, oz);
      for (let s = 1; s <= 12; s++) {
        const u = s / 12, x = lerp(ox, des.x, u), y = lerp(oy, des.y, u), z = lerp(oz, des.z, u);
        if (World.pointBlocked(x, z, 0.4, y, true)) {
          const t = Math.max(0.12, (s - 1) / 12);
          des.set(lerp(ox, des.x, t), lerp(oy, des.y, t), lerp(oz, des.z, t));
          k = Math.max(k, 30);
          break;
        }
      }
      des.y = Math.max(des.y, 0.6);
    }
    cam.position.set(damp(cam.position.x, des.x, k, dt), damp(cam.position.y, des.y, k, dt), damp(cam.position.z, des.z, k, dt));
    const lc = this._lookCur;
    lc.set(damp(lc.x, look.x, k, dt), damp(lc.y, look.y, k, dt), damp(lc.z, look.z, k, dt));
    const s = C.shake;
    C.shake = damp(C.shake, 0, 5, dt);
    cam.lookAt(lc.x + rand(-s, s) * 0.5, lc.y + rand(-s, s) * 0.5, lc.z + rand(-s, s) * 0.5);
    const nf = damp(cam.fov, fov, 4, dt);
    if (Math.abs(nf - cam.fov) > 0.01) { cam.fov = nf; cam.updateProjectionMatrix(); }
    this.renderer.toneMappingExposure = World.exposure;
  },

  /* ---------------- audio mix ---------------- */
  updateAudio() {
    if (!Sound.ready) return;
    const playing = this.state === 'playing', v = Player.mode === 'car' ? Player.vehicle : null;
    if (v && playing && !v.dead) {
      const gs = v.spec.maxSpeed / 4.7, sp = Math.abs(v.vF), gear = Math.min(5, Math.floor(sp / gs));
      let rpm = 0.16 + ((sp - gear * gs) / gs) * 0.84;
      if (sp < 2) rpm = 0.16 + v.input.throttle * 0.35;
      Sound.updateEngine(true, clamp(rpm, 0, 1.05), v.input.throttle);
      Sound.setScreech(v.slip > 4.5 && v.speed > 5 ? clamp((v.slip - 4.5) / 9, 0, 0.22) : 0);
      this.gearLabel = v.vF < -0.5 ? 'R' : sp < 0.4 ? 'N' : String(gear + 1);
    } else { Sound.updateEngine(false, 0, 0); Sound.setScreech(0); }
    let sd = 1e9;
    const P = Player.focus();
    for (const o of Vehicles.all) if (o.siren && !o.dead) sd = Math.min(sd, Math.hypot(o.pos.x - P.x, o.pos.z - P.z));
    Sound.setSiren(playing ? clamp(1 - sd / 170, 0, 1) * 0.16 : 0);
    Sound.setAmbient(this.state === 'menu' ? 0.015 : 0.028);
    const lvl = this.state === 'menu' ? 0.85 : playing && v && !Player.dead ? 1 : 0;
    if (lvl !== this.radioLevel) { this.radioLevel = lvl; Radio.setLevel(lvl); }
  },

  /* ---------------- settings & saves ---------------- */
  applySettings() {
    const s = this.settings, Q = QUALITY[s.quality] || QUALITY.high, sun = World.sun;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
    this.renderer.setSize(innerWidth, innerHeight);
    if (s.quality !== 'low') this.setupBloom();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); this.bloom.enabled = s.quality !== 'low'; }
    sun.castShadow = Q.shadows > 0;
    if (Q.shadows && sun.shadow.mapSize.x !== Q.shadows) {
      sun.shadow.mapSize.set(Q.shadows, Q.shadows);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.scene.fog.far = Q.fog; this.scene.fog.near = Q.fog * 0.18;
    Traffic.target = Q.traffic; Traffic.parkedTarget = Math.round(Q.traffic * 0.4);
    if (Peds.list.length) { const F = Player.focus(); Peds.setTarget(Q.peds, F.x, F.z); }
    Sound.vol.sfx = s.sfx; Sound.vol.music = s.music; Sound.applyVolume();
    UI.el.fps.classList.toggle('on', !!s.fps);
  },
  setupBloom() {
    if (!THREE.EffectComposer || this.composer) return;
    const c = this.composer = new THREE.EffectComposer(this.renderer);
    c.addPass(new THREE.RenderPass(this.scene, this.camera));
    this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.5, 0.82);
    c.addPass(this.bloom);
  },
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    if (this.state === 'map') UI.drawBigMap();
  },
  save() {
    try { localStorage.setItem('sanaurelio.v1', JSON.stringify({ money: Math.round(this.money), completed: this.completed, settings: this.settings })); } catch (e) { /* storage unavailable */ }
  },
  load() {
    try {
      const d = JSON.parse(localStorage.getItem('sanaurelio.v1') || 'null');
      if (!d) return;
      if (typeof d.money === 'number') this.money = d.money;
      if (Array.isArray(d.completed)) this.completed = d.completed;
      if (d.settings) Object.assign(this.settings, d.settings);
    } catch (e) { /* ignore corrupt save */ }
  },
};

window.addEventListener('error', e => {
  if (Game.state === 'loading') UI.loading(0, 'Loading error: ' + (e.message || 'unknown') + '. Refresh the page.');
});
Game.init();
