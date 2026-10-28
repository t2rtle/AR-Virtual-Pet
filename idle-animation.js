import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';

// Lightweight procedural idle flight animation for Mochi.
// It animates only the model's child meshes, never the anchored root transform.
const originalAdd = THREE.Object3D.prototype.add;
let hooked = false;

function installIdle(group) {
  if (hooked || !group || group.userData.idleFlightInstalled) return;
  const body = group.getObjectByName('Parrot body');
  if (!body) return;
  hooked = true;
  group.userData.idleFlightInstalled = true;

  const wings = [];
  const layered = [];
  const tails = [];
  const base = new Map();
  group.traverse(node => {
    if (!node.isMesh) return;
    base.set(node, {
      position: node.position.clone(),
      rotation: node.rotation.clone()
    });
    if (node.name === 'Wing') wings.push(node);
    else if (node.name === 'Layered wing feather') layered.push(node);
    else if (node.name === 'Tail feather') tails.push(node);
  });
  const head = group.getObjectByName('Parrot head');
  const chest = group.getObjectByName('Red chest');
  const hat = group.getObjectByName('Pirate hat crown');

  // Use a rendered mesh as the per-frame hook so AR and normal rendering stay synchronized.
  body.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    const flap = Math.sin(t * Math.PI * 4.8);
    const flapSmooth = Math.sin(t * Math.PI * 4.8 + Math.PI * 0.35);
    const breathing = Math.sin(t * Math.PI * 2.0);
    const sway = Math.sin(t * Math.PI * 1.35);

    wings.forEach((wing, i) => {
      const b = base.get(wing);
      wing.rotation.z = b.rotation.z + (i ? -1 : 1) * flap * 0.52;
      wing.rotation.x = b.rotation.x + flapSmooth * 0.10;
      wing.position.y = b.position.y + Math.abs(flap) * 0.018;
    });

    layered.forEach((feather, i) => {
      const b = base.get(feather);
      const side = feather.position.x < 0 ? -1 : 1;
      const phase = (i % 4) * 0.16;
      feather.rotation.z = b.rotation.z + side * Math.sin(t * Math.PI * 4.8 + phase) * 0.25;
      feather.rotation.x = b.rotation.x + Math.sin(t * Math.PI * 4.8 + phase) * 0.06;
    });

    tails.forEach((tail, i) => {
      const b = base.get(tail);
      tail.rotation.z = b.rotation.z + sway * (0.055 + i * 0.012);
      tail.rotation.x = b.rotation.x + Math.sin(t * Math.PI * 2.7 + i) * 0.045;
    });

    if (head) {
      const b = base.get(head);
      head.rotation.z = b.rotation.z + sway * 0.035;
      head.position.y = b.position.y + breathing * 0.006;
    }
    if (chest) {
      const b = base.get(chest);
      chest.scale.y = 1 + breathing * 0.018;
      chest.position.y = b.position.y + breathing * 0.004;
    }
    if (hat) {
      const b = base.get(hat);
      hat.rotation.z = b.rotation.z + sway * 0.025;
      hat.position.y = b.position.y + breathing * 0.006;
    }
  };
}

THREE.Object3D.prototype.add = function (...objects) {
  const result = originalAdd.apply(this, objects);
  for (const object of objects) {
    if (!hooked && object && object.isGroup && object.getObjectByName('Parrot body')) {
      installIdle(object);
    }
  }
  return result;
};
