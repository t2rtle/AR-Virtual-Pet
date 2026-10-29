import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';

// Pisco — procedural character animation rig.
// The AR root stays compatible with anchors; only the character parts animate.
const originalAdd = THREE.Object3D.prototype.add;
let installed = false;

function installIdle(group) {
  if (installed || !group || group.userData.idleFlightInstalled) return;
  const body = group.getObjectByName('Parrot body');
  if (!body) return;

  installed = true;
  group.userData.idleFlightInstalled = true;

  const base = new Map();
  const wings = [], layeredWings = [], wingHighlights = [], tails = [], feet = [];
  const eyes = [], sparkles = [], headParts = [], lowerBeaks = [], breastFeathers = [];

  group.traverse(node => {
    if (!node.isMesh) return;
    base.set(node, {
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      scale: node.scale.clone()
    });
    if (node.name === 'Wing') wings.push(node);
    if (node.name === 'Layered wing feather') layeredWings.push(node);
    if (node.name === 'Wing highlight') wingHighlights.push(node);
    if (node.name === 'Tail feather') tails.push(node);
    if (node.name === 'Golden foot') feet.push(node);
    if (node.name === 'Eye') eyes.push(node);
    if (node.name === 'Eye sparkle') sparkles.push(node);
    if (node.name === 'Lower beak') lowerBeaks.push(node);
    if (node.name === 'Breast feather') breastFeathers.push(node);
    if (/^(Eye patch|Eye|Eye sparkle|Red forehead|Green crest feather|Beak|Sculpted hooked upper beak|Beak side plate|Lower beak|Beak nostril|Pirate hat|Skull|Crossbone)/.test(node.name)) headParts.push(node);
  });

  const head = group.getObjectByName('Parrot head');
  const chest = group.getObjectByName('Red chest');
  const bodyMesh = group.getObjectByName('Parrot body');
  const hatBrim = group.getObjectByName('Pirate hat brim');
  const hatCrown = group.getObjectByName('Pirate hat crown');
  const headPivot = new THREE.Vector3(0, .76, .015);
  const headPosition = new THREE.Vector3();
  const headDelta = new THREE.Quaternion();
  const headEuler = new THREE.Euler();
  const headOffset = new THREE.Vector3();
  const headPartQuaternion = new THREE.Quaternion();

  let reactionUntil = 0;
  let reactionType = '';
  let lastTap = 0;
  let nextSpecial = performance.now() * .001 + 4 + Math.random() * 4;
  let specialUntil = 0;
  let specialType = '';

  function triggerReaction(type, seconds) {
    reactionType = type;
    reactionUntil = performance.now() * .001 + seconds;
  }

  function triggerSpecial(t) {
    const choices = ['lookout', 'salute', 'happy', 'stretch'];
    specialType = choices[Math.floor(Math.random() * choices.length)];
    specialUntil = t + (specialType === 'stretch' ? 2.0 : 1.55);
    nextSpecial = t + 5.5 + Math.random() * 8.5;
  }

  // Existing gameplay buttons become character interactions instead of merely changing stats.
  document.addEventListener('click', event => {
    const action = event.target?.closest?.('[data-action]')?.dataset?.action;
    if (!action) return;
    if (action === 'pet') triggerReaction('pet', 2.0);
    if (action === 'play') triggerReaction('play', 3.2);
    if (action === 'feed') triggerReaction('feed', 2.1);
    if (action === 'clean') triggerReaction('clean', 2.2);
  }, { passive: true });

  // Rename the old roaming label without touching AR placement logic. The underlying
  // three-state cycle remains: anchored -> follow aim -> roaming, now presented as Voar.
  const renameFlightUI = () => {
    const button = document.querySelector('#followAimBtn');
    if (button) {
      button.textContent = button.textContent.replace(/Modo:\s*Livre/g, 'Modo: Voar');
      button.setAttribute('aria-label', button.textContent.includes('Voar') ? 'Alternar modo de voo do Pisco' : 'Alternar modo AR');
    }
    const toast = document.querySelector('#toast');
    if (toast && toast.textContent.includes('Modo Livre')) {
      toast.textContent = toast.textContent
        .replace('Modo Livre ativado — Pisco vai explorar, andar e voar!', 'Modo Voar ativado — Pisco vai explorar os céus! 🦜💨');
    }
  };
  const uiObserver = new MutationObserver(renameFlightUI);
  uiObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: false });
  renameFlightUI();

  body.onBeforeRender = () => {
    const t = performance.now() * .001;
    if (t >= nextSpecial && t >= specialUntil && !reactionUntil) triggerSpecial(t);

    const reaction = t < reactionUntil;
    const special = t < specialUntil;
    const flying = !!group.userData.roamFlying;
    const flight = flying || (reactionType === 'play' && reaction);
    const flightStrength = flying ? 1 : (reactionType === 'play' && reaction ? .82 : 0);

    // Calm breathing becomes a buoyant body rhythm in flight.
    const bodyBob = Math.sin(t * Math.PI * 2.2);
    const bodySway = Math.sin(t * Math.PI * 1.25);
    const flightBob = flight ? Math.sin(t * 8.5) * .028 * flightStrength : 0;
    const flightTilt = flight ? Math.sin(t * 5.7) * .10 * flightStrength : 0;

    if (bodyMesh) {
      const b = base.get(bodyMesh);
      bodyMesh.position.y = b.position.y + bodyBob * .010 + flightBob;
      bodyMesh.rotation.z = b.rotation.z + bodySway * .018 + flightTilt;
      bodyMesh.rotation.x = b.rotation.x + (flight ? Math.sin(t * 8.5) * .035 : Math.sin(t * 2.4 + .7) * .012);
    }

    let headDeltaZ = bodySway * .035 + Math.sin(t * 1.17) * .055;
    let headDeltaX = Math.sin(t * .85) * .012;
    const nod = Math.pow(Math.max(0, Math.sin(t * .73 + 1.2)), 10) * .075;
    const sleepyNod = !reaction && !flight && (t % 19) > 16.8 ? Math.sin((t % 19 - 16.8) * 1.5) * .12 : 0;
    headDeltaX += nod + sleepyNod;

    if (reaction) {
      headDeltaZ += Math.sin(t * (reactionType === 'play' ? 11 : 8)) * (reactionType === 'play' ? .10 : .055);
      if (reactionType === 'pet') headDeltaX -= .07;
      if (reactionType === 'feed') headDeltaX += .045;
      if (reactionType === 'clean') headDeltaZ += Math.sin(t * 13) * .08;
    }

    if (special) {
      if (specialType === 'lookout') headDeltaZ += Math.sin((t - (specialUntil - 1.55)) * 3.8) * .18;
      if (specialType === 'salute') headDeltaZ += Math.sin(t * 7) * .08;
      if (specialType === 'happy') headDeltaX += Math.abs(Math.sin(t * 6)) * .08;
      if (specialType === 'stretch') headDeltaX -= .10;
    }

    if (head) {
      const b = base.get(head);
      head.position.y = b.position.y + bodyBob * .008 + flightBob * .45;
      head.rotation.z = b.rotation.z + headDeltaZ;
      head.rotation.x = b.rotation.x + headDeltaX;
    }

    // Lightweight facial rig: eyes, beak, crest and hat follow the head pivot.
    if (head) {
      const hb = base.get(head);
      headPosition.set(headPivot.x, hb.position.y + bodyBob * .008 + flightBob * .45, headPivot.z);
      headEuler.set(headDeltaX, 0, headDeltaZ, 'XYZ');
      headDelta.setFromEuler(headEuler);
      headParts.forEach(part => {
        const b = base.get(part);
        headOffset.set(b.position.x - headPivot.x, b.position.y - headPivot.y, b.position.z - headPivot.z).applyQuaternion(headDelta);
        part.position.copy(headPosition).add(headOffset);
        headPartQuaternion.setFromEuler(b.rotation).premultiply(headDelta);
        part.quaternion.copy(headPartQuaternion);
      });
    }

    // Tiny talking/squawking beak motion during playful reactions.
    lowerBeaks.forEach(beak => {
      const b = base.get(beak);
      const talking = reaction && (reactionType === 'play' || reactionType === 'feed')
        ? Math.max(0, Math.sin(t * 13)) * .014 : 0;
      beak.position.y = b.position.y - talking;
      beak.scale.y = b.scale.y * (1 + talking * 3);
    });

    if (chest) {
      const b = base.get(chest);
      const pulse = 1 + bodyBob * .008 + (flight ? Math.sin(t * 8.5) * .018 : 0);
      chest.position.y = b.position.y + bodyBob * .007 + flightBob * .4;
      chest.scale.set(b.scale.x * pulse, b.scale.y * (1 + (pulse - 1) * 2), b.scale.z * pulse);
    }

    // Blinks + occasional quick double blink make the eyes feel alive.
    const blinkPhase = t % 5.1;
    const blink = blinkPhase < .18 ? Math.sin(Math.PI * blinkPhase / .18) : (blinkPhase > .34 && blinkPhase < .46 ? Math.sin(Math.PI * (blinkPhase - .34) / .12) * .62 : 0);
    eyes.forEach(eye => {
      const b = base.get(eye);
      eye.scale.y = b.scale.y * (1 - blink * .92);
    });
    sparkles.forEach(sparkle => {
      const b = base.get(sparkle);
      sparkle.scale.y = b.scale.y * (1 - blink * .9);
    });

    // Wing choreography: calm idle, energetic play, and a true continuous flight flap.
    const cycleSpeed = flight ? 10.5 : (reaction ? 8.0 : 4.6);
    const cycle = t * cycleSpeed;
    const wave = Math.sin(cycle);
    const wingAmplitude = flight ? 1 : (reaction ? 1 : .12);
    const lift = Math.max(0, wave);
    const down = Math.max(0, -wave);

    wings.forEach((wing, i) => {
      const b = base.get(wing);
      const side = wing.position.x < 0 ? -1 : 1;
      const w = Math.sin(cycle + i * .10);
      wing.rotation.z = b.rotation.z + side * w * (.64 * wingAmplitude);
      wing.rotation.x = b.rotation.x + Math.sin(cycle - .45) * .13 * wingAmplitude;
      wing.position.y = b.position.y + bodyBob * .010 + lift * (flight ? .034 : .020);
      wing.position.z = b.position.z + down * (flight ? .022 : .012);
    });

    layeredWings.forEach((feather, i) => {
      const b = base.get(feather);
      const side = feather.position.x < 0 ? -1 : 1;
      const phase = (i % 4) * .15 + Math.floor(i / 4) * .05;
      const w = Math.sin(cycle + phase);
      feather.rotation.z = b.rotation.z + side * w * (.22 + (i % 3) * .022) * wingAmplitude;
      feather.rotation.x = b.rotation.x + Math.sin(cycle + phase + .5) * .08 * wingAmplitude;
      feather.position.y = b.position.y + bodyBob * .010 + Math.max(0, w) * (flight ? .020 : .014);
    });

    wingHighlights.forEach((highlight, i) => {
      const b = base.get(highlight);
      const side = highlight.position.x < 0 ? -1 : 1;
      const w = Math.sin(cycle + .18 + i * .08);
      highlight.rotation.z = b.rotation.z + side * w * .25 * wingAmplitude;
      highlight.rotation.x = b.rotation.x + w * .05 * wingAmplitude;
      highlight.position.y = b.position.y + bodyBob * .010 + Math.max(0, w) * (flight ? .018 : .012);
    });

    // Tail acts as a rudder: it counters turns and bounces with each wingbeat.
    tails.forEach((tail, i) => {
      const b = base.get(tail);
      const phase = i * .35;
      tail.rotation.z = b.rotation.z + bodySway * (.055 + i * .014) + Math.sin(cycle + phase) * (flight ? .085 : .035);
      tail.rotation.x = b.rotation.x + Math.sin(cycle + phase + .8) * (flight ? .08 : .045);
      tail.position.y = b.position.y + bodyBob * .009 + flightBob - down * (flight ? .010 : .006);
    });

    // Feet tuck in during flight and bounce during playful land-based actions.
    feet.forEach((foot, i) => {
      const b = base.get(foot);
      const tuck = flight ? .035 + Math.max(0, Math.sin(cycle)) * .012 : 0;
      const hop = reactionType === 'play' && reaction ? Math.max(0, Math.sin(t * 10)) * .012 : 0;
      foot.position.y = b.position.y + hop + bodyBob * .002 + tuck;
      foot.rotation.z = b.rotation.z + (i === 0 ? -1 : 1) * (reaction ? Math.sin(t * 8) * .035 : 0);
    });

    // Feather shimmer: tiny scale pulses on the breast during happy moments.
    breastFeathers.forEach((feather, i) => {
      const b = base.get(feather);
      const pulse = reactionType === 'pet' && reaction ? 1 + Math.max(0, Math.sin(t * 9 + i)) * .035 : 1;
      feather.scale.set(b.scale.x * pulse, b.scale.y * pulse, b.scale.z * pulse);
    });

    // Pirate hat gets a playful little bounce in flight and during reactions.
    [hatBrim, hatCrown].forEach((hat, i) => {
      if (!hat) return;
      const b = base.get(hat);
      hat.position.y = b.position.y + (flight ? Math.max(0, Math.sin(cycle - .5)) * .018 : 0) + (reaction ? Math.sin(t * 7 + i) * .008 : 0);
    });

    // Extra personality: a very subtle wing stretch after landing.
    if (!flight && specialType === 'stretch' && special) {
      wings.forEach((wing, i) => {
        const b = base.get(wing);
        const stretch = Math.sin((t - (specialUntil - 2)) * 2.8) * .16;
        wing.rotation.z = b.rotation.z + (i ? -stretch : stretch);
      });
    }

    // Double-tap-style timing hook for future pointer interactions.
    if (t - lastTap > 12 && special && specialType === 'happy') lastTap = t;
  };
}

// app.js creates Pisco after this module is loaded. Hooking Object3D.add lets us
// animate the finished procedural parrot without changing the AR placement system.
THREE.Object3D.prototype.add = function (...objects) {
  const result = originalAdd.apply(this, objects);
  for (const object of objects) {
    if (!installed && object && object.isGroup && object.getObjectByName('Parrot body')) installIdle(object);
  }
  return result;
};
