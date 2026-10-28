import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.181.1/examples/jsm/webxr/ARButton.js';

const $ = s => document.querySelector(s);
let saved = null;
try { saved = JSON.parse(localStorage.getItem('arPetSave') || 'null'); } catch {}
const state = Object.assign({ name:'Mochi', hunger:82, mood:86, energy:74, clean:90, last:Date.now(), sound:true, vibration:true }, saved || {});
let scene, camera, renderer, pet, floor, clock, reticle, hitTestSource = null, hitTestSourceRequested = false, placed = false, toastTimer, arButton;
const basePetY = .05;

function save(){ state.last=Date.now(); localStorage.setItem('arPetSave',JSON.stringify(state)); }
function decay(){ const h=Math.min(24,Math.max(0,(Date.now()-state.last)/3600000)); state.hunger=Math.max(0,state.hunger-h*4); state.mood=Math.max(0,state.mood-h*2); state.energy=Math.max(0,state.energy-h*3); state.clean=Math.max(0,state.clean-h*1.5); save(); updateUI(); }
function updateUI(){ ['hunger','mood','energy','clean'].forEach(k=>$('#'+k+'Value').textContent=Math.round(state[k])); $('#statusText').textContent=`${state.name} está pronto para brincar`; }
function vibrate(ms=20){ if(state.vibration && navigator.vibrate) navigator.vibrate(ms); }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2400); }
function tone(){ if(!state.sound)return; try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=520;g.gain.setValueAtTime(.035,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.12);o.onended=()=>c.close();}catch{} }

function createPet(){
  const group=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0x9d8cff,roughness:.62});
  const belly=new THREE.Mesh(new THREE.SphereGeometry(.42,24,18),mat); belly.scale.set(1,.9,.82); group.add(belly);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.31,24,18),mat); head.position.y=.43; group.add(head);
  const earGeo=new THREE.SphereGeometry(.13,16,12);
  [-1,1].forEach(x=>{const e=new THREE.Mesh(earGeo,mat);e.position.set(x*.2,.64,0);e.scale.set(1,.9,.55);group.add(e);});
  const eyeMat=new THREE.MeshBasicMaterial({color:0x11131a}),eyeGeo=new THREE.SphereGeometry(.035,12,8);
  [-1,1].forEach(x=>{const e=new THREE.Mesh(eyeGeo,eyeMat);e.position.set(x*.105,.47,.285);group.add(e);});
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshBasicMaterial({color:0x332a3e}));nose.position.set(0,.39,.3);group.add(nose);
  const footGeo=new THREE.SphereGeometry(.11,16,10);
  [-.22,.22].forEach(x=>{const f=new THREE.Mesh(footGeo,mat);f.position.set(x,-.28,.15);f.scale.set(1,.7,1.2);group.add(f);});
  return group;
}

function init3D(){
  if(renderer)return;
  scene=new THREE.Scene();
  // A transparent scene is essential: during immersive AR, the device camera must show through.
  scene.background=null;
  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.01,100);
  camera.position.set(0,.65,1.8);
  renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.setSize(innerWidth,innerHeight);
  renderer.setClearColor(0x000000,0);
  renderer.xr.enabled=true;
  clock=new THREE.Clock();
  scene.add(new THREE.HemisphereLight(0xdde7ff,0x394052,2.2));
  const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(2,4,2);scene.add(key);
  floor=new THREE.Mesh(new THREE.CircleGeometry(4,64),new THREE.MeshStandardMaterial({color:0x202b3d,roughness:1}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.42;scene.add(floor);
  pet=createPet();pet.position.set(0,basePetY,0);scene.add(pet);
  reticle=new THREE.Mesh(new THREE.RingGeometry(.07,.085,32),new THREE.MeshBasicMaterial({color:0x9b8cff,transparent:true,opacity:.9}));
  reticle.rotation.x=-Math.PI/2;reticle.matrixAutoUpdate=false;reticle.visible=false;scene.add(reticle);
  renderer.xr.addEventListener('sessionstart',()=>{
    $('#game').classList.add('immersive-ar');
    $('#arFallback').classList.add('hidden');
    floor.visible=false;
    placed=false;
    pet.visible=false;
    reticle.visible=false;
    hitTestSource=null;hitTestSourceRequested=false;
    const session=renderer.xr.getSession();
    session.addEventListener('select',placePet);
    session.addEventListener('end',()=>{
      $('#game').classList.remove('immersive-ar');
      floor.visible=true;pet.visible=true;pet.position.set(0,basePetY,0);
      reticle.visible=false;hitTestSource=null;hitTestSourceRequested=false;placed=false;
    },{once:true});
    $('#statusText').textContent='AR ativo — mova o celular para encontrar uma superfície';
    toast('Mova o celular devagar para encontrar o chão');
  });
  renderer.setAnimationLoop(render);
}

function placePet(){
  if(!renderer?.xr.isPresenting || !reticle?.visible || placed)return;
  pet.position.setFromMatrixPosition(reticle.matrix);
  pet.visible=true;placed=true;reticle.visible=false;
  vibrate(35);tone();toast(`${state.name} chegou! 🐾`);
  $('#statusText').textContent=`${state.name} está no seu espaço`;
}

function render(time,frame){
  const s=clock.getElapsedTime();
  if(renderer.xr.isPresenting && frame){
    const ref=renderer.xr.getReferenceSpace();
    if(!hitTestSourceRequested){
      const session=renderer.xr.getSession();
      session.requestReferenceSpace('viewer')
        .then(viewer=>session.requestHitTestSource({space:viewer}))
        .then(source=>{hitTestSource=source;})
        .catch(err=>{console.warn('Hit-test indisponível:',err);toast('Não foi possível detectar superfícies neste dispositivo.');});
      hitTestSourceRequested=true;
    }
    if(hitTestSource && ref){
      const hits=frame.getHitTestResults(hitTestSource);
      if(hits.length && !placed){
        const pose=hits[0].getPose(ref);
        if(pose){reticle.visible=true;reticle.matrix.fromArray(pose.transform.matrix);}
      }else reticle.visible=false;
    }
  }
  if(pet && pet.visible){pet.position.y=placed?pet.position.y:basePetY+Math.sin(s*2.1)*.018;pet.rotation.y=Math.sin(s*.45)*.08;}
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
      arButton=ARButton.createButton(renderer,{
        requiredFeatures:['hit-test'],
        optionalFeatures:['dom-overlay','local-floor'],
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
  $('#game').classList.remove('immersive-ar');$('#arFallback').classList.remove('hidden');
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
