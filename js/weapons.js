'use strict';

// First-person view is rendered separately so nearby walls cannot clip the arms.
const Weapons = {
  slots: [], selected: -1, active: false, busy: '', remaining: 0,
  pendingHolster: false, shots: 0,
  init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x667080, 1.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(-2, 4, 3); this.scene.add(light);
    this.status = document.getElementById('weapon-status');
    this.hud = document.getElementById('weapon-hud');
    this.crosshair = document.getElementById('weapon-crosshair');
    this.buttons = [...document.querySelectorAll('[data-weapon]')];
    for (const button of this.buttons) button.addEventListener('click', () => {
      if (Game.state === 'playing' && Player.mode === 'foot' && !Player.dead) this.equip(Number(button.dataset.weapon));
    });
    this.slots = Assets.manifest.weapons.map(entry => {
      const asset = Assets.clone(entry);
      if (!asset) return null;
      const clips = {};
      // Sketchfab exported each action at its original offset on one timeline.
      for (const original of asset.animations) {
        const clip = original.clone();
        const start = Math.min(...clip.tracks.map(track => track.times[0]));
        for (const track of clip.tracks) for (let i = 0; i < track.times.length; i++) track.times[i] -= start;
        clip.resetDuration(); clips[clip.name] = clip;
      }
      const mixer = new THREE.AnimationMixer(asset.scene);
      const idle = clips.Draw.clone(); idle.name = 'Idle'; idle.duration = 1;
      for (const track of idle.tracks) {
        const stride = track.getValueSize();
        track.values = track.values.slice(track.values.length - stride);
        track.times = new Float32Array([0]);
      }
      clips.Idle = idle;
      mixer.clipAction(idle).play(); mixer.update(0);
      asset.scene.updateMatrixWorld(true);
      const reference = asset.scene.getObjectByName('FPS_Camera_j_01');
      const view = new THREE.Group();
      view.matrixAutoUpdate = false;
      // The joint inherits the FBX centimetre scale; invert only its pose,
      // otherwise the inverse would make the metre-scaled weapon 100x too big.
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      reference.matrixWorld.decompose(position, rotation, scale);
      view.matrix.compose(position, rotation, new THREE.Vector3(1, 1, 1)).invert();
      view.add(asset.scene); this.scene.add(view); view.visible = false;
      asset.scene.traverse(node => { if (node.isMesh) node.frustumCulled = false; });
      return { name: entry.name, view, mixer, clips, ammo: 30 };
    });
    this.buttons.forEach(button => {
      const index = Number(button.dataset.weapon);
      button.disabled = index >= 0 && !this.slots[index];
    });
    this.refresh();
  },
  get slot() { return this.slots[this.selected]; },
  get firstPerson() { return this.selected >= 0 && Player.mode === 'foot' && !Player.dead && Game.state !== 'menu'; },
  equip(index) {
    if (index >= 0 && !this.slots[index]) return;
    if (index === this.selected || this.pendingHolster) return;
    if (index < 0 && this.slot) {
      this.pendingHolster = true; this.play('Holster'); return;
    }
    if (this.slot) { this.slot.view.visible = false; this.slot.mixer.stopAllAction(); }
    this.selected = index; this.busy = ''; this.remaining = 0;
    if (this.slot) this.play('Draw');
    Game.cam.pitch = 0;
    this.refresh();
  },
  play(name, duration) {
    const slot = this.slot; if (!slot) return;
    const clip = slot.clips[name]; if (!clip) return;
    slot.mixer.stopAllAction();
    const action = slot.mixer.clipAction(clip);
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveTimeScale(duration ? clip.duration / duration : 1).play();
    this.busy = name; this.remaining = duration || clip.duration;
    this.refresh();
  },
  reload() {
    if (!this.slot || this.busy || this.slot.ammo === 30) return;
    this.play(this.slot.ammo ? 'Reload' : 'Reload_Empty');
  },
  fire() {
    if (!this.slot || this.busy || !this.firstPerson) return;
    if (!this.slot.ammo) { this.reload(); return; }
    this.slot.ammo--; this.shots++; this.play('Fire', 0.22);
    Sound.gunshot(0.65);
    const direction = new THREE.Vector3(); Game.camera.getWorldDirection(direction);
    const origin = Game.camera.position.clone();
    FX.muzzle(origin.x + direction.x * 0.8, origin.y + direction.y * 0.8 - 0.1, origin.z + direction.z * 0.8);
    // Reuse gameplay collision bounds; walls stop bullets before any target behind them.
    let range = 140;
    const point = new THREE.Vector3();
    for (let d = 0.5; d < range; d += 0.5) {
      point.copy(origin).addScaledVector(direction, d);
      if (point.y <= World.groundHeight(point.x, point.z) || World.pointBlocked(point.x, point.z, 0, point.y, true)) { range = d; break; }
    }
    const ray = new THREE.Ray(origin, direction), box = new THREE.Box3();
    let target = null, vehicleHit = false;
    for (const ped of Peds.list) {
      if (ped.state === 'down') continue;
      const p = ped.ch.root.position;
      box.min.set(p.x - 0.35, p.y, p.z - 0.35); box.max.set(p.x + 0.35, p.y + 1.85, p.z + 0.35);
      const hit = ray.intersectBox(box, point);
      if (hit && hit.distanceTo(origin) < range) { range = hit.distanceTo(origin); target = ped; vehicleHit = false; }
    }
    for (const vehicle of Vehicles.all) {
      if (vehicle.dead) continue;
      const transform = new THREE.Matrix4().makeRotationY(vehicle.heading);
      transform.setPosition(vehicle.pos); transform.invert();
      const local = ray.clone().applyMatrix4(transform);
      box.min.set(-vehicle.halfW, 0, -vehicle.halfL); box.max.set(vehicle.halfW, vehicle.spec.hgt, vehicle.halfL);
      const hit = local.intersectBox(box, point);
      if (hit && hit.distanceTo(local.origin) < range) { range = hit.distanceTo(local.origin); target = vehicle; vehicleHit = true; }
    }
    if (target) {
      if (vehicleHit) { target.lastHitByPlayer = true; target.damage(12); }
      else target.hit(direction.x, direction.z, 8);
      Wanted.crime(vehicleHit && target.type === 'police' ? 3 : 2, true);
    }
    Peds.scareAround(Player.pos.x, Player.pos.z, 35);
    this.refresh();
  },
  update(dt) {
    const foot = Player.mode === 'foot' && !Player.dead;
    this.active = Game.state === 'playing' && this.firstPerson;
    this.hud.hidden = !(Game.state === 'playing' && foot);
    this.crosshair.hidden = !this.active;
    for (let i = 0; i < this.slots.length; i++) if (this.slots[i]) this.slots[i].view.visible = this.active && i === this.selected;
    if (this.slot && foot && Game.state === 'playing') {
      this.slot.mixer.update(dt);
      if (this.busy) {
        this.remaining -= dt;
        if (this.remaining <= 0) {
          if (/^Reload/.test(this.busy)) this.slot.ammo = 30;
          this.slot.mixer.stopAllAction(); this.slot.mixer.clipAction(this.slot.clips.Idle).reset().play();
          this.busy = '';
          if (this.pendingHolster) { this.slot.view.visible = false; this.selected = -1; this.pendingHolster = false; }
          this.refresh();
        }
      }
    }
  },
  refresh() {
    this.status.textContent = this.slot ? `${this.slot.name} · ${this.slot.ammo} / ∞${/^Reload/.test(this.busy) ? ' · Reloading…' : ''}` : 'Unarmed';
    for (const button of this.buttons) button.setAttribute('aria-pressed', String(Number(button.dataset.weapon) === this.selected));
  },
  render(renderer) {
    if (!this.active) return;
    this.camera.aspect = Game.camera.aspect; this.camera.fov = Game.camera.fov; this.camera.updateProjectionMatrix();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false; renderer.clearDepth(); renderer.render(this.scene, this.camera); renderer.autoClear = autoClear;
  },
};
