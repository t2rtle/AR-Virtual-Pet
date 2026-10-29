const CACHE='ar-pet-v62';
const CORE=['./','./index.html','./styles.css','./responsive.css','./pirate-gameplay.css','./app.js','./idle-animation.js','./pirate-gameplay.js','./desktop-ar.js','./manifest.json'];

self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>Promise.all(CORE.map(async path=>{
    try{
      const request=new Request(path,{cache:'no-store'});
      const response=await fetch(request);
      if(response&&response.ok)await cache.put(request,response.clone());
    }catch(err){console.warn('Não foi possível pré-carregar:',path,err);}
  }))).then(()=>self.skipWaiting())
));

self.addEventListener('activate',event=>event.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(key=>key.startsWith('ar-pet-')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response&&response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy)).catch(()=>{});
        return response;
      }
      const cached=await caches.match(event.request);
      return cached||response;
    }catch(err){
      return (await caches.match(event.request))||(await caches.match('./'));
    }
  })());
});
