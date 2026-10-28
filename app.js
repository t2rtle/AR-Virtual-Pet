import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.181.1/examples/jsm/webxr/ARButton.js';

const $=s=>document.querySelector(s); const saved=JSON.parse(localStorage.getItem('arPetSave')||'null');
const state=Object.assign({name:'Mochi',hunger:82,mood:86,energy:74,clean:90,last:Date.now(),sound:true,vibration:true},saved||{});
let scene,camera,renderer,pet,clock,ar=false,reticle,toastTimer;

function save(){state.last=Date.now();localStorage.setItem('arPetSave',JSON.stringify(state));}
function decay(){const hours=Math.min(24,(Date.now()-state.last)/3600000);state.hunger=Math.max(0,state.hunger-hours*4);state.mood=Math.max(0,state.mood-hours*2);state.energy=Math.max(0,state.energy-hours*3);state.clean=Math.max(0,state.clean-hours*1.5);save();updateUI()}
function updateUI(){['hunger','mood','energy','clean'].forEach(k=>$('#'+k+'Value').textContent=Math.round(state[k]));$('#statusText').textContent=`${state.name} está pronto para brincar`}
function vibrate(ms=20){if(state.vibration&&navigator.vibrate)navigator.vibrate(ms)}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1800)}
function tone(){if(!state.sound)return;try{const C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=520;g.gain.setValueAtTime(.035,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.12);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.12)}catch{}}

function createPet(){const group=new THREE.Group();
 const mat=new THREE.MeshStandardMaterial({color:0x9d8cff,roughness:.62,metalness:.02});
 const belly=new THREE.Mesh(new THREE.SphereGeometry(.42,24,18),mat);belly.scale.set(1,.9,.82);group.add(belly);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.31,24,18),mat);head.position.y=.43;group.add(head);
 const earGeo=new THREE.SphereGeometry(.13,16,12);[-1,1].forEach(x=>{const e=new THREE.Mesh(earGeo,mat);e.position.set(x*.2,.64,0);e.scale.set(1,.9,.55);group.add(e)});
 const eyeMat=new THREE.MeshBasicMaterial({color:0x11131a});const eyeGeo=new THREE.SphereGeometry(.035,12,8);[-1,1].forEach(x=>{const e=new THREE.Mesh(eyeGeo,eyeMat);e.position.set(x*.105,.47,.285);group.add(e)});
 const nose=new THREE.Mesh(new THREE.SphereGeometry(.04,12,8),new THREE.MeshBasicMaterial({color:0x332a3e}));nose.position.set(0,.39,.3);group.add(nose);
 const footGeo=new THREE.SphereGeometry(.11,16,10);[-.22,.22].forEach(x=>{const f=new THREE.Mesh(footGeo,mat);f.position.set(x,-.28,.15);f.scale.set(1,.7,1.2);group.add(f)});
 group.userData.baseY=0;return group}

function init3D(){scene=new THREE.Scene();scene.background=new THREE.Color(0x111827);camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.01,100);camera.position.set(0,.65,1.8);renderer=new THREE.WebGLRenderer({canvas:$('#scene'),antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setSize(innerWidth,innerHeight);renderer.xr.enabled=true;renderer.shadowMap.enabled=true;clock=new THREE.Clock();
 scene.add(new THREE.HemisphereLight(0xdde7ff,0x394052,2.2));const key=new THREE.DirectionalLight(0xffffff,3);key.position.set(2,4,2);key.castShadow=true;scene.add(key);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(4,64),new THREE.MeshStandardMaterial({color:0x202b3d,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.42;floor.receiveShadow=true;scene.add(floor);
 pet=createPet();pet.position.set(0,.05,0);pet.castShadow=true;pet.traverse(o=>{if(o.isMesh)o.castShadow=true});scene.add(pet);
 reticle=new THREE.Mesh(new THREE.RingGeometry(.07,.085,32),new THREE.MeshBasicMaterial({color:0x9b8cff,transparent:true,opacity:.9}));reticle.rotation.x=-Math.PI/2;reticle.matrixAutoUpdate=false;reticle.visible=false;scene.add(reticle);
 renderer.setAnimationLoop(render);}
function render(){const t=clock.getElapsedTime();if(pet){pet.position.y=.05+Math.sin(t*2.1)*.018;pet.rotation.y=Math.sin(t*.45)*.08}renderer.render(scene,camera)}

async function startAR(){if(!scene)init3D();$('#home').classList.add('hidden');$('#game').classList.remove('hidden');
 try{if(navigator.xr){const supported=await navigator.xr.isSessionSupported('immersive-ar');if(supported){ar=true;const b=ARButton.createButton(renderer,{requiredFeatures:['hit-test'],optionalFeatures:['dom-overlay','local-floor'],domOverlay:{root:document.body}});b.id='xrButton';document.body.appendChild(b);b.click();$('#statusText').textContent='Modo AR disponível';toast('Aponte para uma superfície e coloque o pet');return}}}catch(e){console.warn(e)}
 $('#arFallback').classList.remove('hidden');toast('AR não disponível neste navegador');}
function preview(){if(!scene)init3D();$('#home').classList.add('hidden');$('#game').classList.remove('hidden');$('#arFallback').classList.remove('hidden');toast('Modo de teste iniciado')}
function action(type){tone();vibrate();if(type==='feed'){state.hunger=Math.min(100,state.hunger+18);state.mood=Math.min(100,state.mood+3);toast(`${state.name} adorou a comida! 🍎`)}if(type==='play'){if(state.energy<10){toast(`${state.name} está cansado 😴`);return}state.mood=Math.min(100,state.mood+16);state.energy=Math.max(0,state.energy-8);toast(`${state.name} se divertiu! 🎾`)}if(type==='pet'){state.mood=Math.min(100,state.mood+12);toast(`${state.name} ganhou carinho ❤️`)}if(type==='clean'){state.clean=Math.min(100,state.clean+24);state.mood=Math.min(100,state.mood+4);toast(`${state.name} está limpinho! 🫧`)}save();updateUI()}

$('#startBtn').onclick=startAR;$('#previewBtn').onclick=preview;$('#exitBtn').onclick=()=>{location.reload()};document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action(b.dataset.action));$('#settingsBtn').onclick=()=>$('#settings').classList.remove('hidden');$('#closeSettings').onclick=()=>$('#settings').classList.add('hidden');$('#petName').value=state.name;$('#petName').oninput=e=>{state.name=e.target.value.trim()||'Mochi';save();updateUI()};$('#soundToggle').checked=state.sound;$('#soundToggle').onchange=e=>{state.sound=e.target.checked;save()};$('#vibrationToggle').checked=state.vibration;$('#vibrationToggle').onchange=e=>{state.vibration=e.target.checked;save()};$('#resetBtn').onclick=()=>{localStorage.removeItem('arPetSave');location.reload()};
addEventListener('resize',()=>{if(camera&&renderer){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}});decay();updateUI();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(console.warn);
