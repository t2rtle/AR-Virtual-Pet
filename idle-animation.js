import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';

// Mochi's permanent procedural flight idle.
// The animation changes only child meshes, never the anchored AR root transform.
const originalAdd = THREE.Object3D.prototype.add;
let installed = false;

function installIdle(group) {
  if (installed || !group || group.userData.idleFlightInstalled) return;
  const body = group.getObjectByName('Parrot body');
  if (!body) return;

  installed = true;
  group.userData.idleFlightInstalled = true;

  const animated = [];
  const wings = [];
  const layeredWings = [];
  const wingHighlights = [];
  const tails = [];
  const base = new Map();

  group.traverse(node => {
    if (!node.isMesh) return;
    const snapshot = {
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      scale: node.scale.clone()
    };
    base.set(node, snapshot);

    if (node.name === 'Wing') wings.push(node);
    if (node.name === 'Layered wing feather') layeredWings.push(node);
    if (node.name === 'Wing highlight') wingHighlights.push(node);
    if (node.name === 'Tail feather') tails.push(node);
    animated.push(node);
  });

  const head = group.getObjectByName('Parrot head');
  const chest = group.getObjectByName('Red chest');
  const bodyMesh = group.getObjectByName('Parrot body');
  const hatBrim = group.getObjectByName('Pirate hat brim');
  const hatCrown = group.getObjectByName('Pirate hat crown');

  body.onBeforeRender = () => {
    const t = performance.now() * 0.001;

    // About 2.4 wingbeats/sec: continuous but readable on a small AR pet.
    const cycle = t * Math.PI * 4.8;
    const flap = Math.sin(cycle);
    const flapLift = Math.sin(cycle - Math.PI * 0.18);
    const wingUp = Math.max(0, flap);
    const wingDown = Math.max(0, -flap);
    const bodyBob = Math.sin(t * Math.PI * 2.4);
    const bodySway = Math.sin(t * Math.PI * 1.35);

    // Whole model breathes and gently rises/falls, while its root remains anchored.
    if (bodyMesh) {
      const b = base.get(bodyMesh);
      bodyMesh.position.y = b.position.y + bodyBob * 0.010;
      bodyMesh.rotation.z = b.rotation.z + bodySway * 0.018;
      bodyMesh.rotation.x = b.rotation.x + Math.sin(t * Math.PI * 2.4 + 0.7) * 0.012;
    }

    if (head) {
      const b = base.get(head);
      head.position.y = b.position.y + bodyBob * 0.008;
      head.rotation.z = b.rotation.z + bodySway * 0.035;
      head.rotation.x = b.rotation.x + Math.sin(cycle * 0.5 + 0.8) * 0.018;
    }

    if (chest) {
      const b = base.get(chest);
      chest.position.y = b.position.y + bodyBob * 0.007;
      chest.scale.set(
        b.scale.x * (1 + bodyBob * 0.008),
        b.scale.y * (1 + bodyBob * 0.020),
        b.scale.z * (1 + bodyBob * 0.008)
      );
    }

    // Main wings: strong downstroke, softer upstroke, with opposite mirrored rotation.
    wings.forEach((wing, i) => {
      const b = base.get(wing);
      const side = wing.position.x < 0 ? -1 : 1;
      const phase = i * 0.08;
      const wave = Math.sin(cycle + phase);
      const lift = Math.max(0, wave);
      wing.rotation.z = b.rotation.z + side * (wave * 0.58 + lift * 0.12);
      wing.rotation.x = b.rotation.x + flapLift * 0.11;
      wing.position.y = b.position.y + bodyBob * 0.010 + wingUp * 0.020;
      wing.position.z = b.position.z + wingDown * 0.012;
    });

    // Layered feathers follow the main wing with slight phase offsets, avoiding a rigid flap.
    layeredWings.forEach((feather, i) => {
      const b = base.get(feather);
      const side = feather.position.x < 0 ? -1 : 1;
      const phase = (i % 4) * 0.12 + Math.floor(i / 4) * 0.045;
      const wave = Math.sin(cycle + phase);
      feather.rotation.z = b.rotation.z + side * wave * (0.20 + (i % 3) * 0.018);
      feather.rotation.x = b.rotation.x + Math.sin(cycle + phase + 0.5) * 0.065;
      feather.position.y = b.position.y + bodyBob * 0.010 + Math.max(0, wave) * 0.014;
    });

    wingHighlights.forEach((highlight, i) => {
      const b = base.get(highlight);
      const side = highlight.position.x < 0 ? -1 : 1;
      const wave = Math.sin(cycle + 0.16 + i * 0.06);
      highlight.rotation.z = b.rotation.z + side * wave * 0.22;
      highlight.rotation.x = b.rotation.x + wave * 0.045;
      highlight.position.y = b.position.y + bodyBob * 0.010 + Math.max(0, wave) * 0.012;
    });

    // Tail feathers counterbalance every wingbeat.
    tails.forEach((tail, i) => {
      const b = base.get(tail);
      const phase = i * 0.35;
      tail.rotation.z = b.rotation.z + bodySway * (0.055 + i * 0.014) + Math.sin(cycle + phase) * 0.035;
      tail.rotation.x = b.rotation.x + Math.sin(cycle + phase + 0.8) * 0.045;
      tail.position.y = b.position.y + bodyBob * 0.009 - wingDown * 0.006;
    });

    // The pirate hat subtly reacts to the flight motion without losing its silhouette.
    [hatBrim, hatCrown].forEach(hat => {
      if (!hat) return;
      const b = base.get(hat);
      hat.position.y = b.position.y + bodyBob * 0.008;
      hat.rotation.z = b.rotation.z + bodySway * 0.025;
      hat.rotation.x = b.rotation.x + Math.sin(cycle * 0.5) * 0.012;
    });
  };
}

// app.js creates Mochi after this module is loaded. Hooking Object3D.add lets us
// detect the finished parrot group without exposing or changing app.js state.
THREE.Object3D.prototype.add = function (...objects) {
  const result = originalAdd.apply(this, objects);
  for (const object of objects) {
    if (!installed && object && object.isGroup && object.getObjectByName('Parrot body')) {
      installIdle(object);
    }
  }
  return result;
};
