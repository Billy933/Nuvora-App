import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createCloudHandler} from './lib/cloud-handler.mjs';
import {createSupabase} from './lib/supabase.mjs';
import {defaultSettings,validateSettings,validateOrder} from './lib/validation.mjs';

const env={RATE_LIMIT_SECRET:'x'.repeat(40),PUBLIC_ORIGIN:'https://nuvora.lidetdigital.com',VERCEL:'1',VERCEL_URL:'nuvora-test.vercel.app'};
async function withServer(backend,run,options={}){
 const server=http.createServer(createCloudHandler({env:{...env,...options},backend}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{await run(async(route,method='GET',body,headers={})=>{
  const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};
 });}finally{await new Promise(r=>server.close(r));}
}
test('cloud login requires admin membership, sets secure HttpOnly cookie, rejects cross-origin mutations',async()=>{
 let seen;
 const backend={rpc:async()=>true,login:async(email,password)=>{seen={email,password};return {access_token:'test-token',expires_in:3600};},isAdmin:async t=>t==='test-token',request:async()=>[]};
 await withServer(backend,async call=>{
  assert.equal((await call('/api/admin/orders')).status,401);
  const login=await call('/api/login','POST',{email:'owner@example.com',password:'test-password'},{Origin:env.PUBLIC_ORIGIN});
  assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly/);assert.match(login.cookie,/Secure/);assert.match(login.cookie,/SameSite=Strict/);
  assert.equal(seen.email,'owner@example.com');
  assert.equal((await call('/api/admin/orders','GET',undefined,{Cookie:login.cookie.split(';')[0]})).status,200);
  assert.equal((await call('/api/admin/menu','POST',{}, {Origin:'https://attacker.example',Cookie:login.cookie})).status,403);
  assert.equal((await call('/api/login','POST',null)).status,400);
  assert.equal((await call('/api/admin/logout','POST',{})).cookie.includes('Max-Age=0'),true);
 });
});
test('cloud checkout delegates pricing to a database transaction, strips client totals and hashes tracking tokens',async()=>{
 let args;
 const backend={rpc:async(name,p)=>{if(name==='nuvora_rate_limit')return true;args=p;return {id:p.p_id,status:'Received',total:50000};}};
 await withServer(backend,async call=>{
  const placed=await call('/api/orders','POST',{name:'Customer',phone:'0911234567',mode:'pickup',items:[{id:1,quantity:2,price:1}],total:2});
  assert.equal(placed.status,201);assert.equal(placed.body.total,50000);assert.equal(placed.body.token.length,48);
  assert.equal(args.p_token_hash.length,64);assert.notEqual(args.p_token_hash,placed.body.token);
  assert.equal(args.p_order.total,undefined);assert.equal(args.p_order.items[0].price,undefined);
  assert.equal((await call('/api/orders','POST',{name:'X',phone:'123',items:[]})).status,400);
 });
});
test('rate limits are persistent backend calls and fail closed without a configured secret',async()=>{
 await withServer({rpc:async()=>false},async call=>assert.equal((await call('/api/login','POST',{})).status,429));
 await withServer({rpc:async()=>true},async call=>assert.equal((await call('/api/orders','POST',{})).status,503),{RATE_LIMIT_SECRET:''});
});
test('tracking never returns private fields; Vercel rewrites resolve the original API route',async()=>{
 let query;
 const backend={request:async q=>{query=q;return [{id:'ABCDEF123456',status:'Preparing'}];}};
 await withServer(backend,async call=>{
  const o=await call('/api/orders/ABCDEF123456','GET',undefined,{'X-Order-Token':'a'.repeat(48)});
  assert.equal(o.status,200);assert.deepEqual(Object.keys(o.body).sort(),['id','status']);assert.match(query,/token_hash=eq\.[a-f0-9]{64}/);assert.doesNotMatch(query,/a{48}/);
  assert.equal((await call('/api/orders/ABCDEF123456?token=wrong')).status,404);
  assert.equal((await call('/api/index?route=menu')).status,200);assert.match(query,/rest\/v1\/menu/);
 });
});
test('settings validation accepts the corrected ETB 5/10 rates, rejects invalid hours and boundaries',()=>{
 assert.equal(validateSettings({...defaultSettings}).nearby_rate,500);
 assert.throws(()=>validateSettings({...defaultSettings,nearby_limit_km:60}));
 assert.throws(()=>validateSettings({...defaultSettings,opening_time:'25:00'}));
 assert.throws(()=>validateSettings({...defaultSettings,far_rate:1}));
 assert.throws(()=>validateOrder({name:'X',phone:'0911234567',mode:'pickup',items:[{id:1,quantity:1},{id:1,quantity:1}]}));
});
test('Supabase adapter verifies users, rejects non-admins, preserves server-only keys and uploads photos',async()=>{
 const calls=[];let admin=false;
 const remote={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'};
 const db=createSupabase(remote,async(url,options)=>{
  calls.push({url,options});let data={};
  if(url.includes('/token?'))data={access_token:'jwt',expires_in:3600};
  else if(url.endsWith('/auth/v1/user'))data={id:'user-1'};
  else if(url.includes('admin_users?'))data=admin?[{user_id:'user-1'}]:[];
  return new Response(JSON.stringify(data),{status:200});
 });
 await assert.rejects(db.login('owner@example.com','pw'),/does not have/);
 admin=true;assert.equal((await db.login('owner@example.com','pw')).access_token,'jwt');
 const auth=calls.find(c=>c.url.endsWith('/auth/v1/user'));assert.equal(auth.options.headers.apikey,remote.SUPABASE_PUBLISHABLE_KEY);assert.equal(auth.options.headers.Authorization,'Bearer jwt');
 const photo=await db.storeImage('data:image/png;base64,aGVsbG8=');assert.match(photo,/storage\/v1\/object\/public\/menu-photos\//);
 const upload=calls.find(c=>c.url.includes('/object/menu-photos/'));assert.equal(upload.options.headers.apikey,remote.SUPABASE_SECRET_KEY);
 await assert.rejects(db.storeImage('https://evil.example/photo.png'),/Choose a JPEG/);
});

test('Supabase adapter accepts Vercel integration aliases and keeps legacy service keys server-side',async()=>{
 let observed;
 const db=createSupabase({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'legacy-anon',SUPABASE_SERVICE_ROLE_KEY:'eyJ.legacy-service'},async(url,options)=>{
  observed={url,options};return new Response('[]',{status:200});
 });
 await db.request('/rest/v1/menu?select=*');
 assert.equal(observed.url,'https://example.supabase.co/rest/v1/menu?select=*');
 assert.equal(observed.options.headers.apikey,'eyJ.legacy-service');
 assert.equal(observed.options.headers.Authorization,'Bearer eyJ.legacy-service');
 await db.request('/auth/v1/user',{auth:true,accessToken:'user-jwt'});
 assert.equal(observed.options.headers.apikey,'legacy-anon');
 assert.equal(observed.options.headers.Authorization,'Bearer user-jwt');
 assert.throws(()=>createSupabase({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon'}),/not configured/);
});
