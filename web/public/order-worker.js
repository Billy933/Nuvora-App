// No API responses or customer data are cached by this worker.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
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
