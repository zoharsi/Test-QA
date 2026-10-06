'use strict';

// Small in-place gait for the supplied static ValveBiped/Mixamo rigs.
// Each cloned skeleton owns its rest poses; cached models stay untouched.
class CharacterMotion {
  constructor(scene) {
    this.joints = {};
    const patterns = {
      armL: /(?:Bip01_L_UpperArm|LeftArm)_/i,
      armR: /(?:Bip01_R_UpperArm|RightArm)_/i,
      legL: /(?:Bip01_L_Thigh|LeftUpLeg)_/i,
      legR: /(?:Bip01_R_Thigh|RightUpLeg)_/i,
      kneeL: /(?:Bip01_L_Calf|LeftLeg)_/i,
      kneeR: /(?:Bip01_R_Calf|RightLeg)_/i,
    };
    scene.updateMatrixWorld(true);
    const frame = scene.getWorldQuaternion(new THREE.Quaternion());
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(frame);
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(frame);
    scene.traverse(bone => {
      if (!bone.isBone) return;
      for (const [name, pattern] of Object.entries(patterns)) {
        if (!pattern.test(bone.name)) continue;
        const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        if (name.startsWith('arm')) {
          const child = bone.children.find(node => node.isBone && /forearm/i.test(node.name));
          if (child) {
            const direction = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
            const adjustment = new THREE.Quaternion().setFromUnitVectors(direction, down);
            const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(adjustment);
            bone.quaternion.copy(parent).multiply(world);
            scene.updateMatrixWorld(true);
          }
        }
        this.joints[name] = { bone, rest: bone.quaternion.clone(), axis: axis.clone().applyQuaternion(parent).normalize() };
      }
    });
    this.turn = new THREE.Quaternion();
  }
  rotate(name, angle) {
    const joint = this.joints[name];
    if (!joint) return;
    joint.bone.quaternion.copy(joint.rest).premultiply(this.turn.setFromAxisAngle(joint.axis, angle));
  }
  update(phase, amplitude, punch) {
    const swing = Math.sin(phase) * amplitude;
    this.rotate('legL', swing); this.rotate('legR', -swing);
    this.rotate('kneeL', Math.max(0, -Math.sin(phase)) * amplitude * 0.65);
    this.rotate('kneeR', Math.max(0, Math.sin(phase)) * amplitude * 0.65);
    this.rotate('armL', -swing * 0.75);
    this.rotate('armR', punch > 0 ? -1.5 * Math.sin((1 - punch / 0.3) * Math.PI) : swing * 0.75);
  }
}
