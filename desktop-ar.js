import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js';

// Desktop camera AR fallback.
// Desktop browsers with a normal webcam often report immersive-ar as unsupported.
// This fallback uses getUserMedia + a transparent Three.js overlay.

let stream = null;
let video = null;
let renderer = null;
let scene = null;
let camera = null;
let pet = null;
let raf = 0;
let active = false;
let scale = 1;
let drag = false;
let lastX = 0;
let lastY = 0;
let yaw = 0;
let pitch = 0;
let desktopMoveMode = false;

const $ = s => document.querySelector(s);
let petDisplayName = (() => { try { return JSON.parse(localStorage.getItem('mochiPirateSaveV1') || '{}').name || 'Pisco'; } catch { return 'Pisco'; } })();
window.addEventListener('petnamechange', event => { if(event.detail) petDisplayName = event.detail; });

function toast(message){
  const el = $('#toast');
  if(!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function makeMat(color, roughness=.72){
  return new THREE.MeshStandardMaterial({color, roughness, metalness:.01});
}

function oval(parent, material, position, size){
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
  m.position.set(...position);
  m.scale.set(...size);
  parent.add(m);
  return m;
}

function createDesktopPet(){
  const root = new THREE.Group();
  const green = makeMat(0x168448);
  const greenDark = makeMat(0x075d38);
  const red = makeMat(0xc92e36);
  const yellow = makeMat(0xffc928,.48);
  const orange = makeMat(0xff8517,.42);
  const black = makeMat(0x20212a,.58);
  const white = makeMat(0xf5f1df,.62);
  const eye = makeMat(0x11131a,.22);

  oval(root,green,[0,.39,0],[.34,.43,.29]);
  oval(root,red,[0,.37,.247],[.235,.30,.075]);
  oval(root,green,[0,.76,.015],[.285,.285,.265]);
  oval(root,red,[0,.94,.075],[.19,.115,.205]);

  const wings=[];
  for(const side of [-1,1]){
    const wing=oval(root,greenDark,[side*.285,.43,-.015],[.12,.29,.20]);
    wing.rotation.z=side*-.18;
    wings.push({mesh:wing,side});
    oval(root,green,[side*.325,.43,.13],[.065,.20,.07]);
    const foot=oval(root,yellow,[side*.13,.075,.09],[.105,.065,.13]);
    foot.rotation.z=side*.12;
  }
  for(let i=0;i<3;i++){
    const tail=oval(root,i===1?red:greenDark,[(i-1)*.105,.17,-.31],[.075,.28,.075]);
    tail.rotation.x=-.28;
    tail.rotation.z=(i-1)*.18;
  }
  for(const side of [-1,1]){
    for(let i=0;i<4;i++){
      const f=oval(root,i%2?green:greenDark,[side*(.30+i*.006),.55-i*.045,.12+i*.012],[.045,.105,.028]);
      f.rotation.z=side*(-.22+i*.075);
    }
  }
  for(const side of [-1,1]){
    oval(root,white,[side*.105,.79,.244],[.085,.105,.045]);
    oval(root,eye,[side*.105,.79,.284],[.043,.058,.025]);
    oval(root,white,[side*.118,.812,.305],[.013,.016,.009]);
  }
  oval(root,orange,[0,.687,.292],[.105,.085,.09]);
  const curve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,.70,.335),new THREE.Vector3(0,.665,.405),
    new THREE.Vector3(0,.615,.432),new THREE.Vector3(0,.575,.405)
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(curve,16,.047,10,false),orange));
  oval(root,yellow,[0,.615,.345],[.067,.027,.055]);

  const brim=new THREE.Mesh(new THREE.CylinderGeometry(.30,.30,.055,24),black);
  brim.position.set(0,1.025,.015); brim.scale.z=.78; root.add(brim);
  const crown=new THREE.Mesh(new THREE.CylinderGeometry(.205,.245,.19,24),black);
  crown.position.set(0,1.135,.005); crown.scale.z=.76; root.add(crown);
  oval(root,white,[0,1.14,.174],[.07,.062,.025]);
  for(const side of [-1,1]){
    const bone=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.12,8),white);
    bone.position.set(side*.018,1.105,.19); bone.rotation.z=side*.72; root.add(bone);
  }
  root.traverse(n=>{if(n.isMesh)n.frustumCulled=false;});
  return {root,wings};
}

function ensureVideo(){
  if(video) return video;
  video=document.createElement('video');
  video.id='desktopCamera';
  video.autoplay=true;
  video.muted=true;
  video.playsInline=true;
  video.setAttribute('playsinline','');
  video.setAttribute('aria-label','Pré-visualização da webcam');
  $('#game')?.prepend(video);
  return video;
}

async function openDesktopCamera(){
  if(active) return;
  if(!navigator.mediaDevices?.getUserMedia){
    toast('📷 Este navegador não disponibiliza acesso à webcam.');
    return;
  }
  try{
    const selectedQuality=window.__piscoGetQuality?.()||localStorage.getItem('piscoVideoQuality')||'420';
    const cameraSizes={'140':[256,144],'280':[512,288],'420':[768,432],'720':[1280,720],'1080':[1920,1080],'original':[1920,1080]};
    const target=cameraSizes[selectedQuality]||cameraSizes['420'];
    stream=await navigator.mediaDevices.getUserMedia({
      video:{width:{ideal:target[0]},height:{ideal:target[1]},frameRate:{ideal:30,max:60}},
      audio:false
    });
  }catch(error){
    console.warn('Desktop camera denied/unavailable:',error);
    toast('📷 Não foi possível acessar a webcam. Verifique a permissão do navegador.');
    return;
  }

  video=ensureVideo();
  video.srcObject=stream;
  await video.play();

  const canvas=$('#scene');
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.01,100);
  camera.position.set(0,.65,1.8);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,premultipliedAlpha:false,powerPreference:'high-performance'});
  const qualityScale=window.__piscoQualityScale?.() ?? 0.42;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25,qualityScale));
  renderer.setSize(innerWidth,innerHeight);
  renderer.setClearColor(0,0);
  scene.add(new THREE.HemisphereLight(0xdde7ff,0x394052,2.2));
  const key=new THREE.DirectionalLight(0xffffff,3); key.position.set(2,4,2); scene.add(key);

  const made=createDesktopPet();
  pet=made.root;
  pet.scale.setScalar(.28);
  pet.position.set(0,.05,-1.25);
  scene.add(pet);

  desktopMoveMode=false;
  updateDesktopModeButton();
  $('#game')?.classList.remove('hidden');
  $('#game')?.classList.add('desktop-camera-ar');
  $('#arFallback')?.classList.add('hidden');
  $('#placePetBtn')?.classList.add('hidden');
  $('#repositionPetBtn')?.classList.remove('hidden');
  $('#followAimBtn')?.classList.remove('hidden');
  document.body.classList.add('desktop-camera-active');
  active=true;
  resize();
  installControls();
  toast('📷 Modo AR por webcam ativado no PC!');
  render();
}

function updateDesktopModeButton(){
  const button=$('#followAimBtn');
  if(!button)return;
  button.textContent=desktopMoveMode?'🎯 Modo: Mover':'⚓ Modo: Fixo';
  button.setAttribute('aria-pressed',String(desktopMoveMode));
  button.title=desktopMoveMode
    ? `Arraste ${petDisplayName} com o mouse e use a roda para redimensionar.`
    : `${petDisplayName} está fixo. Ative Modo: Mover para reposicioná-lo com o mouse.`;
}

function toggleDesktopMoveMode(){
  if(!active || !pet)return;
  desktopMoveMode=!desktopMoveMode;
  drag=false;
  updateDesktopModeButton();
  toast(desktopMoveMode
    ? `🎯 Modo Mover ativado — arraste ${petDisplayName} com o mouse.`
    : `⚓ Modo Fixo ativado — ${petDisplayName} ficará neste ponto.`);
}

function installControls(){
  const canvas=$('#scene');
  canvas.style.pointerEvents='auto';
  canvas.onpointerdown=e=>{
    if(!desktopMoveMode || !pet)return;
    drag=true;
    lastX=e.clientX;
    lastY=e.clientY;
    canvas.setPointerCapture?.(e.pointerId);
  };
  canvas.onpointermove=e=>{
    if(!drag || !desktopMoveMode || !pet)return;
    yaw+=(e.clientX-lastX)*.008;
    pitch+=(e.clientY-lastY)*.006;
    pitch=Math.max(-.65,Math.min(.65,pitch));
    pet.rotation.y=yaw;
    pet.rotation.x=pitch;
    lastX=e.clientX;
    lastY=e.clientY;
  };
  canvas.onpointerup=()=>drag=false;
  canvas.onpointercancel=()=>drag=false;
  canvas.onwheel=e=>{
    if(!active || !desktopMoveMode)return;
    e.preventDefault();
    scale*=Math.exp(-e.deltaY*.001);
    scale=Math.max(.55,Math.min(2.2,scale));
    pet.scale.setScalar(.28*scale);
  };

  $('#repositionPetBtn').onclick=()=>{
    if(!pet)return;
    pet.position.set(0,.05,-1.25);
    yaw=0;
    pitch=0;
    pet.rotation.set(0,0,0);
    toast(`🧭 ${petDisplayName} voltou para o centro da câmera.`);
  };
  $('#followAimBtn').onclick=toggleDesktopMoveMode;
}

function render(){
  if(!active)return;
  const t=performance.now()*.001;
  if(pet){
    const flap=Math.sin(t*15);
    pet.position.y=.05+Math.sin(t*7.5)*.025;
    pet.children.forEach(child=>{
      if(child.geometry?.type==='SphereGeometry' && child.scale.y>.15 && Math.abs(child.position.x)>.22){
        child.rotation.z+=flap*.003;
      }
    });
  }
  renderer.render(scene,camera);
  raf=requestAnimationFrame(render);
}

function resize(){
  if(!renderer||!camera)return;
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  const qualityScale=window.__piscoQualityScale?.() ?? 0.42;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25,qualityScale));
  renderer.setSize(innerWidth,innerHeight,false);
}
window.addEventListener('piscoqualitychange',()=>{
  if(!active)return;
  const quality=window.__piscoGetQuality?.()||'420';
  const sizes={'140':[256,144],'280':[512,288],'420':[768,432],'720':[1280,720],'1080':[1920,1080],'original':[1920,1080]};
  const target=sizes[quality]||sizes['420'];
  const track=stream?.getVideoTracks?.()[0];
  if(track?.applyConstraints)track.applyConstraints({width:{ideal:target[0]},height:{ideal:target[1]}}).catch(err=>console.warn('A webcam não aceitou a nova resolução; mantendo a atual:',err));
  resize();
});

function stopDesktopCamera(){
  if(!active)return;
  active=false;
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(track=>track.stop());
  stream=null;
  if(renderer){renderer.dispose();renderer=null;}
  if(video){video.srcObject=null;video.remove();video=null;}
  document.body.classList.remove('desktop-camera-active');
  $('#game')?.classList.remove('desktop-camera-ar');
  $('#repositionPetBtn')?.classList.add('hidden');
  $('#followAimBtn')?.classList.add('hidden');
  $('#scene').style.pointerEvents='none';
  drag=false;
  desktopMoveMode=false;
}

window.addEventListener('resize',resize);
window.addEventListener('beforeunload',stopDesktopCamera);

document.addEventListener('click',async event=>{
  const start=event.target.closest('#startBtn');
  if(!start)return;

  // Capture before app.js so desktop browsers don't get the generic WebXR fallback.
  if(window.matchMedia('(min-width: 768px)').matches){
    event.preventDefault();
    event.stopImmediatePropagation();
    await openDesktopCamera();
  }
},true);

document.addEventListener('click',event=>{
  if(event.target.closest('#exitBtn') && active) stopDesktopCamera();
},true);
