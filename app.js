import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.181.1/examples/jsm/webxr/ARButton.js';

const $ = s => document.querySelector(s);
let saved = null;
try { saved = JSON.parse(localStorage.getItem('arPetSave') || 'null'); } catch {}
const state = Object.assign({ name:'Mochi', hunger:82, mood:86, energy:74, clean:90, last:Date.now(), sound:true, vibration:true }, saved || {});
let scene, camera, renderer, pet, floor, clock, reticle, hitTestSource = null, hitTestSourceRequested = false, placed = false, toastTimer, arButton;
const basePetY = .05;
const AR_PET_HEIGHT_METERS = 0.10; // altura-alvo: 10 cm no mundo AR
let AR_PET_SCALE = 0.05; // recalculada pela caixa real do modelo depois da criação
let placeButton, repositionButton, followAimButton, surfaceFound = false, repositioning = false;
let cameraFollowMode = false;
let lastFloorMatrix = new THREE.Matrix4();
let hasLastFloorMatrix = false;

function save(){ state.last=Date.now(); localStorage.setItem('arPetSave',JSON.stringify(state)); }
function decay(){ const h=Math.min(24,Math.max(0,(Date.now()-state.last)/3600000)); state.hunger=Math.max(0,state.hunger-h*4); state.mood=Math.max(0,state.mood-h*2); state.energy=Math.max(0,state.energy-h*3); state.clean=Math.max(0,state.clean-h*1.5); save(); updateUI(); }
function updateUI(){ ['hunger','mood','energy','clean'].forEach(k=>$('#'+k+'Value').textContent=Math.round(state[k])); $('#statusText').textContent=`${state.name} está pronto para brincar`; }
function vibrate(ms=20){ if(state.vibration && navigator.vibrate) navigator.vibrate(ms); }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400); }
function tone(){ if(!state.sound)return; try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=520;g.gain.setValueAtTime(.035,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.12);o.onended=()=>c.close();}catch{} }

function createPet(){
  const group = new THREE.Group();
  // Generate lightweight feather-pattern textures locally (no external image downloads).
  const featherTexture = (base, highlight, shadow) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    for (let y = -16; y < 280; y += 24) {
      for (let x = -12; x < 280; x += 22) {
        const ox = x + ((Math.floor(y / 24) % 2) * 11);
        ctx.beginPath();
        ctx.moveTo(ox, y + 18);
        ctx.quadraticCurveTo(ox + 2, y + 2, ox + 11, y - 4);
        ctx.quadraticCurveTo(ox + 20, y + 3, ox + 22, y + 18);
        ctx.quadraticCurveTo(ox + 12, y + 12, ox, y + 18);
        ctx.fillStyle = shadow; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ox + 3, y + 15);
        ctx.quadraticCurveTo(ox + 6, y + 4, ox + 11, y);
        ctx.quadraticCurveTo(ox + 16, y + 5, ox + 18, y + 15);
        ctx.quadraticCurveTo(ox + 11, y + 10, ox + 3, y + 15);
        ctx.fillStyle = highlight; ctx.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.5, 1.5);
    return texture;
  };
  const material = (color, options={}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.72, metalness: 0.01, ...options
  });
  const greenTexture = featherTexture('#168448', '#35bd60', '#0c6038');
  const redTexture = featherTexture('#c92e36', '#f15b50', '#8e202b');
  const wingTexture = featherTexture('#075d38', '#1e9b51', '#043e2a');
  const green = material(0xffffff, {map: greenTexture});
  const wingGreen = material(0xffffff, {map: wingTexture});
  const featherGreen = material(0xffffff, {map: greenTexture});
  const red = material(0xffffff, {map: redTexture});
  const yellow = material(0xffc928, {roughness: 0.48});
  const orange = material(0xff8517, {roughness: 0.42});
  const black = material(0x20212a, {roughness: 0.58});
  const white = material(0xf5f1df, {roughness: 0.62});
  const eyeBlack = material(0x11131a, {roughness: 0.22, metalness: 0.03});

  const oval = (name, colorMat, position, scale, segments=20) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), colorMat);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    group.add(mesh);
    return mesh;
  };
  const cylinder = (name, colorMat, radiusTop, radiusBottom, height, position, radial=20) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial), colorMat);
    mesh.name = name;
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };

  // Round parrot body, with a red chest and a proud, slightly oversized head.
  oval('Parrot body', green, [0, .39, 0], [.34, .43, .29]);
  oval('Red chest', red, [0, .37, .247], [.235, .30, .075]);
  oval('Parrot head', green, [0, .76, .015], [.285, .285, .265]);
  oval('Red forehead', red, [0, .94, .075], [.19, .115, .205]);

  // Curved-looking wings and layered tail feathers.
  for (const side of [-1, 1]) {
    const wing = oval('Wing', wingGreen, [side * .285, .43, -.015], [.12, .29, .20]);
    wing.rotation.z = side * -.18;
    oval('Wing highlight', featherGreen, [side * .325, .43, .13], [.065, .20, .07]);
    const foot = oval('Golden foot', yellow, [side * .13, .075, .09], [.105, .065, .13]);
    foot.rotation.z = side * .12;
  }
  for (let i = 0; i < 3; i++) {
    const tail = oval('Tail feather', i === 1 ? red : wingGreen, [(i-1)*.105, .17, -.31], [.075, .28, .075]);
    tail.rotation.x = -.28;
    tail.rotation.z = (i-1)*.18;
  }

  // Distinct, individually modeled feather layers (not just a flat color texture).
  // Shoulder/wing rows create visible feather edges and depth when viewed close-up.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) {
      for (let feather = 0; feather < 4; feather++) {
        const y = .55 - row * .075 - feather * .018;
        const z = .105 + feather * .012;
        const f = oval('Layered wing feather', feather % 2 ? featherGreen : wingGreen,
          [side * (.30 + row * .008), y, z],
          [.045, .105 - row * .008, .028], 12);
        f.rotation.z = side * (-.22 + feather * .075);
        f.rotation.x = -.12;
      }
    }
  }
  // Small crown/cheek feathers give the head a parrot silhouette.
  for (let i = 0; i < 5; i++) {
    const crest = oval('Green crest feather', i % 2 ? wingGreen : green,
      [(i - 2) * .055, 1.005 + (2 - Math.abs(i - 2)) * .018, -.015],
      [.035, .105, .027], 12);
    crest.rotation.z = (i - 2) * -.22;
  }
  // A few overlapping red breast feathers make the chest visibly sculpted.
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col <= 1; col++) {
      oval('Breast feather', red,
        [col * .085, .48 - row * .075, .302 - Math.abs(col) * .012],
        [.052, .085, .022], 12);
    }
  }

  // White eye patches, dark eyes and a hooked orange beak facing the camera.
  for (const side of [-1, 1]) {
    oval('Eye patch', white, [side * .105, .79, .244], [.085, .105, .045], 16);
    oval('Eye', eyeBlack, [side * .105, .79, .284], [.043, .058, .025], 14);
    oval('Eye sparkle', white, [side * .118, .812, .305], [.013, .016, .009], 10);
  }
  // Sculpted 3D hooked beak: rounded base, tapered upper hook and separate lower mandible.
  oval('Beak base', orange, [0, .687, .292], [.105, .085, .09], 16);
  // Hooked parrot beak built from a curved 3D tube plus a broad base.
  const beakCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .70, .335),
    new THREE.Vector3(0, .665, .405),
    new THREE.Vector3(0, .615, .432),
    new THREE.Vector3(0, .575, .405)
  ]);
  const beak = new THREE.Mesh(new THREE.TubeGeometry(beakCurve, 16, .047, 10, false), orange);
  beak.name = 'Sculpted hooked upper beak';
  group.add(beak);
  oval('Beak side plate left', orange, [-.055, .66, .37], [.045, .055, .055], 12);
  oval('Beak side plate right', orange, [.055, .66, .37], [.045, .055, .055], 12);
  oval('Lower beak', yellow, [0, .615, .345], [.067, .027, .055], 14);
  for (const side of [-1, 1]) {
    oval('Beak nostril', black, [side * .042, .706, .365], [.009, .012, .008], 8);
  }

  // Tiny pirate hat: brim, crown, skull and crossed bones.
  const brim = cylinder('Pirate hat brim', black, .30, .30, .055, [0, 1.025, .015], 24);
  brim.scale.z = .78;
  const crown = cylinder('Pirate hat crown', black, .205, .245, .19, [0, 1.135, .005], 24);
  crown.scale.z = .76;
  oval('Skull', white, [0, 1.14, .174], [.07, .062, .025], 12);
  oval('Skull eye left', black, [-.025, 1.15, .197], [.012, .016, .008], 8);
  oval('Skull eye right', black, [.025, 1.15, .197], [.012, .016, .008], 8);
  // Crossbones as small white rods beneath the skull.
  for (const side of [-1, 1]) {
    const bone = cylinder('Crossbone', white, .012, .012, .12, [side * .018, 1.105, .19], 8);
    bone.rotation.z = side * .72;
  }

  group.traverse(node => {
    if (node.isMesh) {
      node.frustumCulled = false;
      node.renderOrder = 10;
    }
  });
  return group;
}

function init3D(){
  if(renderer)return;
  scene=new THREE.Scene();
  // A transparent scene is essential: during immersive AR, the device camera must show through.
  scene.background=null;
  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.01,100);
  camera.position.set(0,.65,1.8);
  renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:true,premultipliedAlpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setSize(innerWidth,innerHeight);
  renderer.setClearColor(0x000000,0);
  renderer.setClearAlpha(0);
  renderer.domElement.style.backgroundColor='transparent';
  renderer.domElement.style.opacity='1';
  renderer.xr.enabled=true;
  clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0xdde7ff,0x394052,2.2));
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(2,4,2);scene.add(key);
  const fill=new THREE.DirectionalLight(0xffd9a6,1.25);fill.position.set(-2,1,3);scene.add(fill);
  const rim=new THREE.DirectionalLight(0x6ed9ff,1.1);rim.position.set(0,2,-3);scene.add(rim);
  floor=new THREE.Mesh(new THREE.CircleGeometry(4,64),new THREE.MeshStandardMaterial({color:0x202b3d,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.42;scene.add(floor);
  pet=createPet();
  // Escala por dimensão medida, não por uma suposição sobre as unidades do modelo.
  // WebXR usa metros; isto limita a altura física do papagaio a cerca de 6,5 cm.
  const petBounds = new THREE.Box3().setFromObject(pet);
  const petSize = petBounds.getSize(new THREE.Vector3());
  AR_PET_SCALE = AR_PET_HEIGHT_METERS / Math.max(petSize.y, 0.001);
  pet.scale.setScalar(AR_PET_SCALE);
  pet.userData.targetHeightMeters = AR_PET_HEIGHT_METERS;
  pet.position.set(0,basePetY,0);
  scene.add(pet);
  reticle=new THREE.Mesh(new THREE.RingGeometry(.07,.085,32),new THREE.MeshBasicMaterial({color:0x9b8cff,transparent:true,opacity:.9}));
  reticle.rotation.x=-Math.PI/2;reticle.matrixAutoUpdate=false;reticle.visible=false;scene.add(reticle);
  placeButton=$('#placePetBtn');
  repositionButton=$('#repositionPetBtn');
  followAimButton=$('#followAimBtn');
  placeButton?.addEventListener('click',placePet);
  repositionButton?.addEventListener('click',repositionPet);
  followAimButton?.addEventListener('click',toggleCameraFollowMode);
  renderer.xr.addEventListener('sessionstart',()=>{
    $('#game').classList.add('immersive-ar');
    document.body.classList.add('immersive-ar-active');
    // Reassert a fully transparent WebGL surface for the AR camera passthrough.
    renderer.setClearColor(0x000000,0);
    renderer.setClearAlpha(0);
    renderer.domElement.style.backgroundColor='transparent';
    $('#arFallback').classList.add('hidden');
    floor.visible=false;
    placed=false;
    repositioning=false;
    surfaceFound=false;
    cameraFollowMode=false;
    hasLastFloorMatrix=false;
    pet.visible=false;
    reticle.visible=false;
    if(placeButton)placeButton.classList.add('hidden');
    // Keep a manual recovery control available throughout AR, even before hit-test
    // detects a surface. Tapping it can bring the pet into view if placement stalls.
    if(repositionButton){
      repositionButton.textContent='📍 Mostrar / reposicionar pet';
      repositionButton.classList.remove('hidden');
    }
    if(followAimButton){followAimButton.classList.add('hidden');followAimButton.textContent='🎯 Seguir mira: desligado';}
    hitTestSource=null;hitTestSourceRequested=false;
    const session=renderer.xr.getSession();
    session.addEventListener('select',placePet);
    session.addEventListener('end',()=>{
      $('#game').classList.remove('immersive-ar');
      document.body.classList.remove('immersive-ar-active');
      floor.visible=true;pet.visible=true;pet.position.set(0,basePetY,0);
      reticle.visible=false;hitTestSource=null;hitTestSourceRequested=false;placed=false;repositioning=false;surfaceFound=false;cameraFollowMode=false;
      if(placeButton)placeButton.classList.add('hidden');
      if(repositionButton)repositionButton.classList.add('hidden');
      if(followAimButton)followAimButton.classList.add('hidden');
    },{once:true});
    $('#statusText').textContent='Procure o chão movendo o celular devagar';
    toast('Aponte para o chão e mova o celular lentamente');
  });
  renderer.setAnimationLoop(render);
}

function beginReposition(){
  if(!renderer?.xr.isPresenting || !placed || !pet)return;
  repositioning=true;
  placed=false;
  surfaceFound=false;
  pet.visible=false;
  reticle.visible=false;
  if(placeButton){
    placeButton.textContent='🔎 Procurando nova posição…';
    placeButton.classList.add('hidden');
  }
  $('#statusText').textContent='Aponte para o local desejado e mova o celular devagar';
  toast('Escolha o novo local do pet; toque em “Colocar pet aqui” quando aparecer');
}

function placePet(){
  if(!renderer?.xr.isPresenting || !reticle?.visible || placed || !pet)return;
  const wasRepositioning = repositioning;

  // Hit-test returns the surface origin (normally the floor), while this model's
  // origin is at its center. Raise it by half its measured model height so it
  // stands above the detected surface instead of intersecting the floor.
  const surface = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  pet.scale.setScalar(AR_PET_SCALE);
  // The parrot model is built from the floor upward, so place its feet directly on the detected surface.
  pet.position.copy(surface);
  pet.position.y += 0.012;
  pet.quaternion.identity();
  pet.renderOrder = 10;

  // Make the placement immediately visible and ensure every mesh is renderable.
  pet.traverse(node => {
    if(node.isMesh){
      node.visible = true;
      node.frustumCulled = false;
      if(node.material){
        node.material.depthWrite = true;
        node.material.needsUpdate = true;
      }
    }
  });
  pet.visible = true;
  pet.updateMatrixWorld(true);
  placed = true;
  repositioning = false;
  reticle.visible = false;
  surfaceFound = false;
  if(placeButton)placeButton.classList.add('hidden');
  if(repositionButton)repositionButton.classList.remove('hidden');
  if(followAimButton){followAimButton.textContent=`🎯 Seguir mira: ${cameraFollowMode?'ligado':'desligado'}`;followAimButton.classList.remove('hidden');}
  vibrate(35);tone();toast(wasRepositioning ? `${state.name} foi reposicionado! 🐾` : `${state.name} chegou! 🐾`);
  $('#statusText').textContent = `${state.name} está no seu espaço — olhe para o ponto onde tocou`;
}

function toggleCameraFollowMode(){
  if(!renderer?.xr.isPresenting || !pet || !placed)return;
  if(!cameraFollowMode){
    cameraFollowMode=true;
    hasLastFloorMatrix=false;
    pet.visible=true;
    toast('🎯 Modo Centro contínuo ativado — mire onde quiser');
  }else{
    cameraFollowMode=false;
    const xrCamera=renderer.xr.getCamera(camera);
    const viewCamera=xrCamera.cameras?.[0] || xrCamera;
    viewCamera.updateMatrixWorld(true);
    const direction=new THREE.Vector3();
    viewCamera.getWorldDirection(direction).normalize();
    if(hasLastFloorMatrix && direction.y < -0.48){
      const floorPoint=new THREE.Vector3().setFromMatrixPosition(lastFloorMatrix);
      pet.position.copy(floorPoint);
      pet.position.y+=0.012;
      pet.rotation.set(0,0,0);
      pet.visible=true;
      pet.updateMatrixWorld(true);
      toast('🐾 Mochi encaixado na superfície detectada!');
    }else{
      toast('🐾 Modo Normal ativado — Mochi ficou neste local');
    }
  }
  if(followAimButton){
    followAimButton.textContent=cameraFollowMode?'🎯 Modo: Centro contínuo':'📍 Modo: Normal';
    followAimButton.setAttribute('aria-pressed',String(cameraFollowMode));
  }
}
function repositionPet(){
  if(!renderer?.xr.isPresenting || !pet)return;
  // Use the active XR eye camera when available; its transform matches the live view.
  const xrCamera=renderer.xr.getCamera(camera);
  const viewCamera=xrCamera.cameras?.[0] || xrCamera;
  viewCamera.updateMatrixWorld(true);
  const cameraPosition=new THREE.Vector3();
  const cameraDirection=new THREE.Vector3();
  viewCamera.getWorldPosition(cameraPosition);
  viewCamera.getWorldDirection(cameraDirection);
  if(cameraDirection.lengthSq()<0.0001)cameraDirection.set(0,0,-1);
  cameraDirection.normalize();

  // Keep the pet along the actual viewing ray. Flattening the direction made it
  // leave the camera view when the phone was pointed down at the floor.
  cameraFollowMode=false;
  pet.position.copy(cameraPosition).addScaledVector(cameraDirection,0.72);
  pet.position.y=Math.max(0.06,pet.position.y-0.04);
  pet.scale.setScalar(AR_PET_SCALE);
  pet.rotation.set(0,0,0);
  pet.rotation.y=Math.atan2(cameraPosition.x-pet.position.x,cameraPosition.z-pet.position.z);
  pet.traverse(node=>{if(node.isMesh){node.visible=true;node.frustumCulled=false;}});
  pet.visible=true;
  pet.updateMatrixWorld(true);
  placed=true;
  repositioning=false;
  reticle.visible=false;
  surfaceFound=false;
  if(placeButton)placeButton.classList.add('hidden');
  if(repositionButton){repositionButton.textContent='📍 Mostrar / reposicionar pet';repositionButton.classList.remove('hidden');}
  if(followAimButton){followAimButton.textContent='🎯 Seguir mira: desligado';followAimButton.classList.remove('hidden');}
  vibrate(35);tone();toast('🐾 Pet reposicionado na sua visão!');
  $('#statusText').textContent=`${state.name} está à sua frente — toque em reposicionar quando quiser`;
}

function render(time,frame){
  const s=clock.getElapsedTime();
  if(renderer.xr.isPresenting && frame){
    // Guard against any placement/fallback path accidentally restoring a larger scale.
    if (pet && pet.userData.targetHeightMeters) {
      pet.scale.setScalar(AR_PET_SCALE);
    }
    const ref=renderer.xr.getReferenceSpace();
    if(!hitTestSourceRequested){
      const session=renderer.xr.getSession();
      session.requestReferenceSpace('viewer')
        .then(viewer=>session.requestHitTestSource({space:viewer}))
        .then(source=>{hitTestSource=source;})
        .catch(err=>{console.warn('Hit-test indisponível:',err);$('#statusText').textContent='Detecção de chão indisponível; preparando pet à frente';});
      hitTestSourceRequested=true;
    }
    if(!placed && ref){
      let surfaceMatrix=null;
      if(hitTestSource){
        try{
          const hits=frame.getHitTestResults(hitTestSource);
          if(hits.length){
            const pose=hits[0].getPose(ref);
            if(pose)surfaceMatrix=new THREE.Matrix4().fromArray(pose.transform.matrix);
          }
        }catch(err){console.warn('Falha ao ler hit-test:',err);}
      }
      if(surfaceMatrix){
        reticle.matrix.copy(surfaceMatrix);
        reticle.visible=true;
        surfaceFound=true;

        // When the player deliberately points the phone down, place the pet
        // directly on the detected floor. This avoids requiring a horizon view
        // or an extra tap just to make the pet appear in public spaces.
        let viewerPose=null;
        try{viewerPose=frame.getViewerPose(ref);}catch(err){console.warn('Viewer pose indisponível:',err);}
        let lookingDown=false;
        if(viewerPose){
          const q=viewerPose.transform.orientation;
          const cameraRotation=new THREE.Quaternion(q.x,q.y,q.z,q.w);
          const forward=new THREE.Vector3(0,0,-1).applyQuaternion(cameraRotation);
          lookingDown=forward.y < -0.48;
        }

        if(lookingDown && !repositioning){
          placePet();
        }else{
          if(placeButton){
            placeButton.textContent='🐾 Colocar pet aqui';
            placeButton.classList.remove('hidden');
          }
          $('#statusText').textContent='Superfície encontrada — toque para colocar o pet';
        }
      }else{
        // If the phone is aimed down at the floor, don't make the player wait for
        // hit-test tracking: place the tiny pet in the lower camera view as a fallback.
        // This makes discreet, floor-facing use practical in public places.
        let viewerPose=null;
        try{viewerPose=frame.getViewerPose(ref);}catch(err){console.warn('Viewer pose indisponível:',err);}
        if(viewerPose){
          const p=viewerPose.transform.position;
          const q=viewerPose.transform.orientation;
          const cameraPosition=new THREE.Vector3(p.x,p.y,p.z);
          const cameraRotation=new THREE.Quaternion(q.x,q.y,q.z,q.w);
          const forward=new THREE.Vector3(0,0,-1).applyQuaternion(cameraRotation);
          const lookingDown=forward.y < -0.48;

          // During an explicit reposition request, keep the existing safe behavior
          // unless the user is clearly aiming down, in which case use the fallback.
          if(repositioning && !lookingDown){
            if(placeButton)placeButton.classList.add('hidden');
            $('#statusText').textContent='Procurando uma superfície para reposicionar… mova o celular devagar';
            return renderer.render(scene,camera);
          }

          const distance=lookingDown ? 0.62 : 1.0;
          const targetPosition=cameraPosition.clone().add(forward.multiplyScalar(distance));
          targetPosition.y=Math.max(0.05,targetPosition.y-(lookingDown ? 0.02 : 0.28));
          pet.position.copy(targetPosition);
          pet.scale.setScalar(AR_PET_SCALE);
          pet.rotation.set(0,0,0);
          pet.visible=true;
          placed=true;
          repositioning=false;
          reticle.visible=false;
          if(placeButton)placeButton.classList.add('hidden');
          if(repositionButton)repositionButton.classList.remove('hidden');
          if(followAimButton){followAimButton.textContent=`🎯 Seguir mira: ${cameraFollowMode?'ligado':'desligado'}`;followAimButton.classList.remove('hidden');}
          $('#statusText').textContent=lookingDown
            ? '🐾 Pet apareceu no modo de visão para o chão!'
            : '🐾 Pet apareceu à sua frente!';
        }else{
          $('#statusText').textContent='Aguardando posição da câmera AR…';
        }
      }
    }
  }
  if(renderer.xr.isPresenting && frame && placed && cameraFollowMode){
    const refSpace=renderer.xr.getReferenceSpace();
    let pose=null;
    try{pose=refSpace ? frame.getViewerPose(refSpace) : null;}catch(err){console.warn('Não foi possível atualizar a mira AR:',err);}
    if(pose){
      const p=pose.transform.position;
      const q=pose.transform.orientation;
      const cameraPosition=new THREE.Vector3(p.x,p.y,p.z);
      const cameraRotation=new THREE.Quaternion(q.x,q.y,q.z,q.w);
      const forward=new THREE.Vector3(0,0,-1).applyQuaternion(cameraRotation).normalize();
      // Follow the full 3D viewing ray: pitch (vertical) and yaw (horizontal).
      pet.position.copy(cameraPosition).addScaledVector(forward,0.72);
      pet.scale.setScalar(AR_PET_SCALE);
      pet.rotation.set(0,0,0);
      pet.rotation.y=Math.atan2(cameraPosition.x-pet.position.x,cameraPosition.z-pet.position.z);
      pet.visible=true;
      pet.updateMatrixWorld(true);
    }
  }
  if(pet && pet.visible){
    if(!placed)pet.position.y=basePetY+Math.sin(s*2.1)*.018;
    if(!cameraFollowMode && !placed)pet.rotation.y=Math.sin(s*.45)*.08;
  }
  renderer.render(scene,camera);
}
async function startAR(){
  init3D();
  $('#home').classList.add('hidden');$('#game').classList.remove('hidden');
  $('#arFallback').classList.add('hidden');
  try{
    if(!navigator.xr)throw Error('WebXR não existe neste navegador');
    if(!await navigator.xr.isSessionSupported('immersive-ar'))throw Error('AR imersivo não suportado');
    if(!arButton){
      // Do not make hit-test mandatory: some compatible mobile AR sessions
      // can start without surface detection, and render() already has a safe
      // camera-forward placement fallback for those devices.
      arButton=ARButton.createButton(renderer,{
        optionalFeatures:['hit-test','dom-overlay','local-floor'],
        domOverlay:{root:document.body}
      });
      arButton.id='xrButton';
      arButton.setAttribute('aria-label','Iniciar sessão de realidade aumentada');
      document.body.appendChild(arButton);
    }
    toast('Toque em “START AR” para abrir a câmera em realidade aumentada');
    $('#statusText').textContent='Pronto para iniciar AR';
  }catch(e){
    console.warn(e);
    $('#arFallback').classList.remove('hidden');
    toast('AR indisponível neste navegador — use o modo de teste 3D');
  }
}
function preview(){
  init3D();$('#home').classList.add('hidden');$('#game').classList.remove('hidden');
  $('#game').classList.remove('immersive-ar');document.body.classList.remove('immersive-ar-active');$('#arFallback').classList.remove('hidden');
  floor.visible=true;pet.visible=true;pet.position.set(0,basePetY,0);placed=false;
  toast('Modo de teste 3D iniciado');
}
function action(type){
  tone();vibrate();
  if(type==='feed'){state.hunger=Math.min(100,state.hunger+18);state.mood=Math.min(100,state.mood+3);toast(`${state.name} adorou a comida! 🍎`);}
  if(type==='play'){if(state.energy<10){toast(`${state.name} está cansado 😴`);return;}state.mood=Math.min(100,state.mood+16);state.energy=Math.max(0,state.energy-8);toast(`${state.name} se divertiu! 🎾`);}
  if(type==='pet'){state.mood=Math.min(100,state.mood+12);toast(`${state.name} ganhou carinho ❤️`);}
  if(type==='clean'){state.clean=Math.min(100,state.clean+24);state.mood=Math.min(100,state.mood+4);toast(`${state.name} está limpinho! 🫧`);}
  save();updateUI();
}

$('#startBtn').onclick=startAR;
$('#previewBtn').onclick=preview;
$('#exitBtn').onclick=()=>{if(renderer?.xr.isPresenting)renderer.xr.getSession()?.end();$('#game').classList.add('hidden');$('#home').classList.remove('hidden');};
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));
$('#settingsBtn').onclick=()=>$('#settings').classList.remove('hidden');
$('#closeSettings').onclick=()=>$('#settings').classList.add('hidden');
$('#petName').value=state.name;
$('#petName').oninput=e=>{state.name=e.target.value.trim()||'Mochi';save();updateUI();};
$('#soundToggle').checked=state.sound;$('#soundToggle').onchange=e=>{state.sound=e.target.checked;save();};
$('#vibrationToggle').checked=state.vibration;$('#vibrationToggle').onchange=e=>{state.vibration=e.target.checked;save();};
$('#resetBtn').onclick=()=>{localStorage.removeItem('arPetSave');location.reload();};
addEventListener('resize',()=>{if(camera&&renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}});
decay();updateUI();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
