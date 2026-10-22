// Cache only the public storefront shell. Order, account, and admin traffic stays network-only.
const CACHE_NAME='nuvora-storefront-shell-v1';
const SHELL=['/offline.html','/style.css','/layout.css','/app.js','/ui.js','/assets/nuvora-logo.png','/assets/nuvora-pwa-192.png','/assets/nuvora-pwa-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await cache.addAll(SHELL);
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('nuvora-storefront-shell-')&&key!==CACHE_NAME)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname==='/admin'||url.pathname==='/admin.html'||url.pathname.startsWith('/accept-invite'))return;
  if(request.mode==='navigate'){
    if(url.pathname!=='/'&&url.pathname!=='/index.html')return;
    event.respondWith(fetch(request).catch(async()=>await caches.match('/offline.html')));
    return;
  }
  if(!SHELL.includes(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME),cached=await cache.match(request);
    try{
      const response=await fetch(request);
      if(response.ok)await cache.put(request,response.clone());
      return response;
    }catch{return cached||Response.error();}
  })());
});
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{};}catch{}
  const orderId=/^[A-F0-9]{12}$/.test(payload.orderId||'')?payload.orderId:'';
  event.waitUntil(self.registration.showNotification(payload.type==='test'?'Nuvora alerts are connected':'New Nuvora order',{
    body:payload.type==='test'?'This is a test notification. Your kitchen can receive order alerts on this device.':'An order is waiting for acceptance. Open the kitchen dashboard.',
    icon:'/assets/nuvora-logo.png',tag:orderId||'nuvora-order',renotify:true,requireInteraction:true,
    data:{orderId}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const orderId=event.notification.data?.orderId||'';
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const dashboard=windows.find(c=>new URL(c.url).origin===self.location.origin&&['/admin','/admin.html'].includes(new URL(c.url).pathname));
    if(dashboard){await dashboard.focus();dashboard.postMessage({type:'OPEN_ORDER',orderId});}
    else await self.clients.openWindow('/admin'+(orderId?'?order='+encodeURIComponent(orderId):''));
  })());
});
