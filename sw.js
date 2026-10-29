const CACHE='ar-pet-v57';
const CORE=['./','./index.html','./styles.css','./responsive.css','./pirate-gameplay.css','./app.js','./idle-animation.js','./pirate-gameplay.js','./desktop-ar.js','./manifest.json'];

async function prepareAppResponse(response){
  if(!response || !response.ok)return response;
  try{
    const source=await response.clone().text();
    const marker="  pet.position.set(0,basePetY,0);\n  scene.add(pet);\n  // Invisible placement anchor";
    const hook="  pet.position.set(0,basePetY,0);\n  scene.add(pet);\n  // Direct, one-time animation integration. The animation module is optional and cannot break AR startup.\n  if(typeof window.installPiscoAnimations==='function'){\n    try{window.installPiscoAnimations(pet);}\n    catch(err){console.warn('Pisco animation integration skipped safely:',err);}\n  }\n  // Invisible placement anchor";
    if(!source.includes('window.installPiscoAnimations(pet)') && source.includes(marker)){
      return new Response(source.replace(marker,hook),{status:response.status,statusText:response.statusText,headers:response.headers});
    }
  }catch(err){
    console.warn('Could not prepare app.js animation integration:',err);
  }
  return response;
}

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(()=>Promise.all(CORE.map(async path=>{
  const request=new Request(path,{cache:'no-store'});
  const response=await fetch(request);
  const prepared=path.endsWith('/app.js')||path==='./app.js' ? await prepareAppResponse(response) : response;
  if(prepared&&prepared.ok)await (await caches.open(CACHE)).put(request,prepared.clone());
}))).then(()=>self.skipWaiting())));

self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ar-pet-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response&&response.ok){
        const prepared=url.pathname.endsWith('/app.js') ? await prepareAppResponse(response) : response;
        const copy=prepared.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return prepared;
      }
      return response;
    }catch(err){
      return caches.match(event.request).then(cached=>cached||caches.match('./'));
    }
  })());
});
