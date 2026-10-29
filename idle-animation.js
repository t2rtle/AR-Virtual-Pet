import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';

// Pisco's lightweight procedural personality animation.
// Only child meshes move; the anchored AR root transform is never modified.
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
  const eyes = [];
  const sparkles = [];
  group.traverse(node => {
    if (node.isMesh && node.name === 'Eye') eyes.push(node);
    if (node.isMesh && node.name === 'Eye sparkle') sparkles.push(node);
  });
  let reactionUntil = 0;
  let reactionType = '';
  const onPetAction = event => {
    const action = event.target?.closest?.('[data-action]')?.dataset?.action;
    if (action === 'pet' || action === 'play') {
      reactionType = action;
      reactionUntil = performance.now() * 0.001 + (action === 'play' ? 2.6 : 1.8);
    }
  };
  document.addEventListener('click', onPetAction, { passive: true });

  body.onBeforeRender = () => {
    const t = performance.now() * 0.001;

    // Pisco rests most of the time, then does a short flutter or reacts to play.
    const reaction = t < reactionUntil;
    const idlePhase = t % 6.4;
    const flutter = reaction || idlePhase > 5.05;
    const cycle = t * Math.PI * (reactionType === 'play' && reaction ? 7.2 : 4.8);
    const flap = Math.sin(cycle) * (flutter ? 1 : 0.12);
    const flapLift = Math.sin(cycle - Math.PI * 0.18) * (flutter ? 1 : 0.12);
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
      const curiousTilt = Math.sin(t * 1.17) * 0.055;
      const excitedTilt = reaction ? Math.sin(t * 11) * 0.10 : 0;
      head.rotation.z = b.rotation.z + bodySway * 0.035 + curiousTilt + excitedTilt;
      head.rotation.x = b.rotation.x + Math.sin(cycle * 0.5 + 0.8) * 0.018 + (reactionType === 'pet' && reaction ? -0.06 : 0);
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

    // Natural blinks: squash the dark eye meshes briefly without moving the face.
    const blinkPhase = t % 4.9;
    const blink = blinkPhase < 0.19 ? Math.sin(Math.PI * blinkPhase / 0.19) : 0;
    eyes.forEach(eye => {
      const b = base.get(eye);
      eye.scale.y = b.scale.y * (1 - blink * 0.91);
    });
    sparkles.forEach(sparkle => {
      const b = base.get(sparkle);
      sparkle.scale.y = b.scale.y * (1 - blink * 0.88);
    });

    // Main wings: mirrored flutter bursts, folded and calm between them.
    wings.forEach((wing, i) => {
      const b = base.get(wing);
      const side = wing.position.x < 0 ? -1 : 1;
      const phase = i * 0.08;
      const wave = Math.sin(cycle + phase);
      const lift = Math.max(0, wave);
      const amplitude = flutter ? 1 : 0.12;
      wing.rotation.z = b.rotation.z + side * (wave * 0.58 + lift * 0.12) * amplitude;
      wing.rotation.x = b.rotation.x + flapLift * 0.11 * amplitude;
      wing.position.y = b.position.y + bodyBob * 0.010 + wingUp * 0.020;
      wing.position.z = b.position.z + wingDown * 0.012;
    });

    // Layered feathers follow the main wing with slight phase offsets, avoiding a rigid flap.
    layeredWings.forEach((feather, i) => {
      const b = base.get(feather);
      const side = feather.position.x < 0 ? -1 : 1;
      const phase = (i % 4) * 0.12 + Math.floor(i / 4) * 0.045;
      const wave = Math.sin(cycle + phase);
      const amplitude = flutter ? 1 : 0.14;
      feather.rotation.z = b.rotation.z + side * wave * (0.20 + (i % 3) * 0.018) * amplitude;
      feather.rotation.x = b.rotation.x + Math.sin(cycle + phase + 0.5) * 0.065 * amplitude;
      feather.position.y = b.position.y + bodyBob * 0.010 + Math.max(0, wave) * 0.014;
    });

    wingHighlights.forEach((highlight, i) => {
      const b = base.get(highlight);
      const side = highlight.position.x < 0 ? -1 : 1;
      const wave = Math.sin(cycle + 0.16 + i * 0.06);
      const amplitude = flutter ? 1 : 0.14;
      highlight.rotation.z = b.rotation.z + side * wave * 0.22 * amplitude;
      highlight.rotation.x = b.rotation.x + wave * 0.045 * amplitude;
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
      hat.rotation.z = b.rotation.z + bodySway * 0.025 + (reaction ? Math.sin(t * 8) * 0.025 : 0);
      hat.rotation.x = b.rotation.x + Math.sin(cycle * 0.5) * 0.012;
    });
  };
}

// app.js creates Pisco after this module is loaded. Hooking Object3D.add lets us
// animate the finished parrot without changing the AR placement/anchor logic.
THREE.Object3D.prototype.add = function (...objects) {
  const result = originalAdd.apply(this, objects);
  for (const object of objects) {
    if (!installed && object && object.isGroup && object.getObjectByName('Parrot body')) {
      installIdle(object);
    }
  }
  return result;
};
