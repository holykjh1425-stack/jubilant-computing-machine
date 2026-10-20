const CACHE='nexus-public-shell-v1';
const ASSETS=['offline.html','icons/nexus-192.png','icons/nexus-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('nexus-public-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 // Never store application requests, admin content, receipts or API responses.
 if(event.request.mode==='navigate')event.respondWith(fetch(event.request).catch(()=>caches.match('offline.html')));
});