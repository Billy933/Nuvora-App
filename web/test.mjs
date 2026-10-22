import {test} from 'node:test';
import assert from 'node:assert/strict';
process.env.DB_PATH=':memory:';
process.env.ADMIN_PASSWORD='test-password';
const {server}=await import('./server.mjs');
test('menu authorization, CRUD, server pricing, checkout validation, order privacy and fulfillment',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 let cookie='';
 async function call(url,method='GET',data,auth=true,headers={}){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth&&cookie?{Cookie:cookie}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
 try{
  assert.equal((await call('/api/admin/orders')).status,401);
  assert.equal((await call('/api/login','POST',{password:'wrong'})).status,401);
  const login=await call('/api/login','POST',{password:'test-password'});assert.equal(login.status,200);cookie=login.cookie.split(';')[0];
  const settings=(await call('/api/settings')).data;
  const editedContent={...settings.content,restaurant_name:'Test kitchen',hero_title:'Fresh today',logo_image:'data:image/png;base64,aGVsbG8='};
  assert.equal((await call('/api/admin/content','PUT',editedContent,false)).status,401);
  for(const [path,payload] of [['/api/admin/content',editedContent],['/api/admin/settings',{...settings,pickup_address:'Untrusted address'}]]) {
   assert.equal((await call(path,'PUT',payload,true,{Origin:'https://untrusted.example'})).status,403);
  }
  assert.equal((await call('/api/admin/content','PUT',{...editedContent,hero_title:''})).status,400);
  assert.equal((await call('/api/admin/content','PUT',{...editedContent,hero_image:'javascript:alert(1)'})).status,400);
  assert.equal((await call('/api/admin/content','PUT',editedContent,true,{Origin:base})).status,200);
  assert.deepEqual((await call('/api/settings')).data.content,editedContent);
  assert.equal((await call('/api/admin/settings','PUT',settings)).status,200);
  assert.deepEqual((await call('/api/settings')).data.content,editedContent);
  assert.equal(settings.pickup_address,'Bole, Selam City Mall');assert.equal(settings.nearby_rate,500);assert.equal(settings.far_rate,1000);
  assert.equal((await call('/api/admin/settings','PUT',{...settings,nearby_limit_km:60})).status,400);
  assert.equal((await call('/api/admin/settings','PUT',{...settings,accepting_orders:false})).status,200);
  const item={name:'Test dish',category:'Mains',description:'Test only',price:25000,image:'/menu-items/classic-burger.jpg',available:true};
  const added=await call('/api/admin/menu','POST',item);assert.equal(added.status,201);const id=added.data.id;
  const order={name:'Test Customer',phone:'0911234567',mode:'pickup',items:[{id,quantity:2,price:1}],total:2};
  assert.equal((await call('/api/orders','POST',order)).status,400);
  assert.equal((await call('/api/admin/settings','PUT',{...settings,accepting_orders:true})).status,200);
  const placed=await call('/api/orders','POST',order);assert.equal(placed.status,201);assert.equal(placed.data.total,50000);
  assert.equal((await call('/api/orders/'+placed.data.id+'?token=incorrect')).status,404);
  assert.equal((await call(`/api/orders/${placed.data.id}?token=${placed.data.token}`)).data.status,'Received');
  assert.equal((await call('/api/orders','POST',{...order,mode:'delivery'})).status,400);
  assert.equal((await call('/api/orders','POST',{...order,phone:'123'})).status,400);
  assert.equal((await call('/api/admin/orders/'+placed.data.id,'PATCH',{status:'Out for delivery'})).status,400);
  assert.equal((await call('/api/admin/orders/'+placed.data.id,'PATCH',{status:'Preparing'})).status,200);
  assert.equal((await call('/api/admin/menu/'+id,'PUT',{...item,available:false})).status,200);
  assert.equal((await call('/api/orders','POST',order)).status,400);
  assert.equal((await call('/api/admin/menu/'+id,'DELETE')).status,200);
  const orders=await call('/api/admin/orders');assert.equal(orders.data[0].items[0].name,'Test dish');assert.equal(orders.data[0].status,'Preparing');
  assert.equal((await call('/api/menu')).data.length,0);
  for(const route of ['/','/admin','/app.js','/admin.js','/style.css','/layout.css','/settings.js','/ui.js','/pwa.js','/order-worker.js','/manifest.webmanifest','/offline.html','/assets/nuvora-logo.png','/assets/nuvora-pwa-192.png','/assets/nuvora-pwa-512.png','/assets/nuvora-hero.jpg','/assets/category-pizza.png','/assets/category-burgers.png','/assets/category-pasta.png','/assets/category-chicken.png','/assets/category-sides.png','/menu-items/classic-burger.jpg','/team.js','/accept-invite','/accept-invite.js'])assert.equal((await fetch(base+route)).status,200);
  const manifestResponse=await fetch(base+'/manifest.webmanifest');assert.match(manifestResponse.headers.get('content-type'),/application\/manifest\+json/);
  const manifest=await manifestResponse.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
  assert.match((await fetch(base+'/assets/nuvora-hero.jpg')).headers.get('content-type'),/image\/jpeg/);
  assert.match((await fetch(base+'/menu-items/classic-burger.jpg')).headers.get('content-type'),/image\/jpeg/);
 }finally{await new Promise(r=>server.close(r));}
});
