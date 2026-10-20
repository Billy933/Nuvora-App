import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createCloudHandler} from './lib/cloud-handler.mjs';
import {createSupabase} from './lib/supabase.mjs';
import {defaultSettings,defaultContent,validateSettings,validateOrder,HttpError} from './lib/validation.mjs';

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

test('Supabase adapter accepts the deployed NEXT_PUBLIC publishable key name',async()=>{
 let headers;
 const db=createSupabase({NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test'},async(url,options)=>{
  headers=options.headers;return new Response(JSON.stringify({id:'test-user'}),{status:200});
 });
 await db.request('/auth/v1/user',{auth:true,accessToken:'user-token'});
 assert.equal(headers.apikey,'sb_publishable_test');
 assert.equal(headers.Authorization,'Bearer user-token');
});


test('cloud storefront content persists uploaded images, preserves settings and rejects unauthorized or invalid writes',async()=>{
 let row={id:1,...defaultSettings,content:{}},uploads=0;
 const backend={isAdmin:async token=>token==='owner',storeImage:async value=>{uploads++;return value.startsWith('data:')?'https://example.supabase.co/storage/v1/object/public/menu-photos/logo.png':value;},request:async(path,options)=>{
  assert.match(path,/restaurant_settings/);
  if(options?.method==='PATCH'){row={...row,...options.body};return null;}
  return [row];
 }};
 const headers={Cookie:'nuvora_session=owner',Origin:env.PUBLIC_ORIGIN};
 await withServer(backend,async call=>{
  assert.deepEqual((await call('/api/settings')).body.content,defaultContent);
  const content={...defaultContent,hero_title:'Fresh from the oven',logo_image:'data:image/png;base64,aGVsbG8='};
  assert.equal((await call('/api/admin/content','PUT',content)).status,401);
  assert.equal((await call('/api/admin/content','PUT',content,{...headers,Origin:'https://untrusted.example'})).status,403);
  assert.equal((await call('/api/admin/content','PUT',{...content,hero_image:'javascript:alert(1)'},headers)).status,400);
  const saved=await call('/api/admin/content','PUT',content,headers);
  assert.equal(saved.status,200);assert.equal(uploads,1);assert.match(saved.body.content.logo_image,/https:\/\/example.supabase.co/);
  await call('/api/admin/settings','PUT',{...defaultSettings,contact_phone:'0911234567'},headers);
  const settings=(await call('/api/settings')).body;
  assert.equal(settings.contact_phone,'0911234567');assert.equal(settings.content.hero_title,content.hero_title);
  assert.equal(settings.content.logo_image,saved.body.content.logo_image);
 });
});

test('only owners manage access; actor identity is server-derived and removed sessions lose access',async()=>{
 const members=new Map([['owner',{id:'owner-id',email:'owner@example.com',role:'owner'}],['staff',{id:'staff-id',email:'staff@example.com',role:'admin'}]]);
 const actions=[];let invites=0;
 const backend={isAdmin:async t=>members.has(t),getAdmin:async t=>members.get(t),request:async()=>[],
  createSetupLink:async()=>{invites++;},rpc:async(name,args)=>{
   if(name==='nuvora_rate_limit')return true;
   if(name==='nuvora_list_admins')return [...members.values()];
   actions.push(args);if(args.p_action==='inspect')return {exists:true,confirmed:true};
   if(args.p_action==='remove')members.delete('staff');return {ok:true};
  }};
 const owner={Cookie:'nuvora_session=owner',Origin:env.PUBLIC_ORIGIN},staff={...owner,Cookie:'nuvora_session=staff'};
 await withServer(backend,async call=>{
  assert.equal((await call('/api/admin/team')).status,401);
  assert.equal((await call('/api/admin/team','GET',undefined,staff)).status,403);
  assert.equal((await call('/api/admin/team','POST',{action:'add',email:'x@example.com'},staff)).status,403);
  assert.equal((await call('/api/admin/team','POST',{action:'remove',email:'staff@example.com'},{...owner,Origin:'https://evil.example'})).status,403);
  assert.equal((await call('/api/admin/team','POST',{action:'remove',email:'owner@example.com'},owner)).status,400);
  assert.equal((await call('/api/admin/team','POST',{action:'add',email:'bad'},owner)).status,400);
  assert.equal((await call('/api/admin/team','POST',{action:'add',email:'New@Example.com',p_actor:'attacker'},owner)).status,200);
  assert.deepEqual(actions.at(-1),{p_actor:'owner-id',p_action:'add',p_email:'new@example.com'});assert.equal(invites,0);
  assert.equal((await call('/api/admin/team','POST',{action:'remove',email:'staff@example.com'},owner)).status,200);
  assert.equal((await call('/api/admin/orders','GET',undefined,staff)).status,401);
  assert.equal((await call('/api/admin/me','GET',undefined,owner)).body.role,'owner');
 });
});

test('new admin setup link uses the fixed application origin and failed link creation never grants access',async()=>{
 let fail=true,grants=0,observed;
 const owner={id:'owner-id',email:'owner@example.com',role:'owner'};
 const backend={isAdmin:async()=>true,getAdmin:async()=>owner,
  createSetupLink:async(email,url)=>{observed={email,url};if(fail)throw new HttpError(503,'Link unavailable');return 'https://example.supabase.co/auth/v1/verify?token=fake';},
  rpc:async(name,args)=>{if(name==='nuvora_rate_limit')return true;if(args.p_action==='inspect')return {exists:false,confirmed:false};grants++;return {ok:true};}};
 await withServer(backend,async call=>{
  const headers={Cookie:'nuvora_session=owner',Origin:env.PUBLIC_ORIGIN};
  const payload={action:'add',email:'new@example.com',redirectTo:'https://evil.example'};
  assert.equal((await call('/api/admin/team','POST',payload,headers)).status,503);assert.equal(grants,0);
  fail=false;const r=await call('/api/admin/team','POST',payload,headers);
  assert.equal(r.status,200);assert.match(r.body.setup_link,/https:\/\/example.supabase.co/);assert.equal(grants,1);
  assert.deepEqual(observed,{email:'new@example.com',url:env.PUBLIC_ORIGIN+'/accept-invite'});
 });
});

test('handover requires typed confirmation and password reauthentication, clears cookie and revokes outgoing access',async()=>{
 let exists=true,verified=0,transfers=0;
 const backend={isAdmin:async()=>exists,getAdmin:async()=>({id:'owner-id',email:'owner@example.com',role:'owner'}),
  verifyPassword:async(id,email,password)=>{verified++;assert.equal(id,'owner-id');if(password!=='correct-password')throw new HttpError(401,'Incorrect password');},
  rpc:async(name,args)=>{if(name==='nuvora_rate_limit')return true;assert.equal(args.p_action,'transfer');transfers++;exists=false;return {ok:true};}};
 await withServer(backend,async call=>{
  const headers={Cookie:'nuvora_session=owner',Origin:env.PUBLIC_ORIGIN};
  const payload={action:'transfer',email:'new@example.com',confirmation:'new@example.com',password:'correct-password'};
  assert.equal((await call('/api/admin/team','POST',{...payload,confirmation:'typo@example.com'},headers)).status,400);assert.equal(verified,0);
  assert.equal((await call('/api/admin/team','POST',{...payload,password:'wrong'},headers)).status,401);assert.equal(transfers,0);
  const r=await call('/api/admin/team','POST',payload,headers);assert.equal(r.status,200);assert.match(r.cookie,/Max-Age=0/);
  assert.equal(transfers,1);assert.equal((await call('/api/admin/orders','GET',undefined,headers)).status,401);
 });
});

test('invitation setup requires a currently allowed admin token and never accepts removed users',async()=>{
 let active=false,updates=0,loginId;
 const backend={getAdmin:async t=>active&&t==='valid-token'?{id:'invited-id',role:'admin'}:null,
  rpc:async()=>true,markLogin:async id=>loginId=id,request:async(path,options)=>{updates++;assert.equal(path,'/auth/v1/user');assert.equal(options.accessToken,'valid-token');assert.equal(options.body.password,'long-new-password');}};
 await withServer(backend,async call=>{
  assert.equal((await call('/api/invitation/accept','POST',{token:'valid-token',password:'short'})).status,400);
  assert.equal((await call('/api/invitation/accept','POST',{token:'valid-token',password:'long-new-password'})).status,403);assert.equal(updates,0);
  active=true;const r=await call('/api/invitation/accept','POST',{token:'valid-token',password:'long-new-password'});
  assert.equal(r.status,200);assert.match(r.cookie,/HttpOnly/);assert.match(r.cookie,/Secure/);assert.equal(updates,1);assert.equal(loginId,'invited-id');
 });
});

test('Supabase access adapter preserves server-only invitation credentials and revokes temporary reauthentication sessions',async()=>{
 const calls=[];let membership=true;
 const db=createSupabase({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},async(url,options)=>{
  calls.push({url,options});const data=url.includes('/admin_users?')?(membership?[{user_id:'owner-id',role:'owner'}]:[]):url.includes('/admin/generate_link?')?{action_link:'https://example.supabase.co/auth/v1/verify?token=fake'}:url.includes('/token?')?{access_token:'fresh-token',user:{id:'owner-id'}}:{id:'owner-id',email:'owner@example.com'};
  return new Response(JSON.stringify(data),{status:200});
 });
 assert.equal((await db.getAdmin('token')).role,'owner');membership=false;assert.equal(await db.getAdmin('token'),null);
 await db.createSetupLink('new@example.com','https://app.example/accept-invite');
 const invite=calls.find(c=>c.url.includes('/admin/generate_link?'));assert.equal(invite.options.headers.apikey,'sb_secret_test');assert.match(invite.url,/redirect_to=https%3A%2F%2Fapp.example/);
 await db.verifyPassword('owner-id','owner@example.com','password');assert.equal(calls.at(-1).options.headers.Authorization,'Bearer fresh-token');
 await assert.rejects(db.verifyPassword('different-id','owner@example.com','password'),/Confirm your current owner password/);
 assert.equal(calls.at(-1).url.endsWith('/logout?scope=local'),true);
});
