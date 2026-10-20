import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {validateSubscription,workerAuthorized,dispatchPush} from './lib/push.mjs';
import {createCloudHandler} from './lib/cloud-handler.mjs';
import {unseenOrderIds} from './public/order-alert-state.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:'B'+'a'.repeat(86),auth:'b'.repeat(22)}};
const env={VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'private',VAPID_SUBJECT:'https://nuvora-app-one.vercel.app',NOTIFICATION_WORKER_SECRET:'s'.repeat(40),RATE_LIMIT_SECRET:'r'.repeat(40),PUBLIC_ORIGIN:'https://nuvora-app-one.vercel.app'};
test('push subscriptions reject arbitrary destinations, embedded credentials and invalid browser keys',()=>{
  assert.deepEqual(validateSubscription({subscription}),subscription);
  for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])assert.throws(()=>validateSubscription({subscription:{...subscription,endpoint}}));
  assert.throws(()=>validateSubscription({subscription:{...subscription,keys:{}}}));
  assert.equal(workerAuthorized('Bearer '+env.NOTIFICATION_WORKER_SECRET,env.NOTIFICATION_WORKER_SECRET),true);
  assert.equal(workerAuthorized('Bearer wrong',env.NOTIFICATION_WORKER_SECRET),false);
  assert.equal(workerAuthorized('Bearer ',''),false);
});
test('new-order detection baselines reloads, ignores status changes and detects orders arriving later',()=>{
  const orders=[{id:'A',status:'Received'},{id:'B',status:'Preparing'}];
  assert.deepEqual(unseenOrderIds(null,orders),[]);
  assert.deepEqual(unseenOrderIds(new Set(['A','B']),[...orders,{id:'C',status:'Received'}]),['C']);
  assert.deepEqual(unseenOrderIds(new Set(['A']),[{id:'A',status:'Preparing'}]),[]);
});
test('durable dispatch retries failures, removes expired endpoints and skips accepted orders or removed admins',async()=>{
  for(const scenario of ['sent','retry','gone','removed','accepted']){
    const calls=[];let sends=0;
    const db={rpc:async(name,args)=>{calls.push({name,args});return name==='nuvora_claim_push'?[{id:1,lease:'lease',order_id:'ABCDEF123456',user_id:'user',subscription}]:null;},request:async route=>route.includes('admin_users')?(scenario==='removed'?[]:[{user_id:'user'}]):scenario==='accepted'?[]:[{id:'ABCDEF123456'}]};
    await dispatchPush(db,env,{send:async(s,p)=>{sends++;assert.equal(s,subscription);assert.equal(p.orderId,'ABCDEF123456');assert.equal(p.phone,undefined);if(scenario==='retry')throw Error('timeout');if(scenario==='gone')throw {statusCode:410};}});
    assert.equal(sends,['removed','accepted'].includes(scenario)?0:1);
    assert.equal(calls[1].args.p_outcome,['removed','accepted'].includes(scenario)?'expired':scenario);
    assert.equal(calls[1].args.p_lease,'lease');
  }
});
test('notification APIs require membership, bind subscription to current user and protect the retry worker',async()=>{
  const calls=[];
  const db={isAdmin:async token=>token==='session',getAdmin:async()=>({id:'real-admin'}),request:async()=>[],rpc:async(name,args)=>{calls.push({name,args});return name==='nuvora_claim_push'?[]:true;}};
  const server=http.createServer(createCloudHandler({env,backend:db}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=(route,method='GET',body,headers={})=>fetch(base+route,{method,headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await call('/api/admin/notifications')).status,401);
    assert.equal((await call('/api/notifications/dispatch','POST',{})).status,401);
    assert.equal((await call('/api/notifications/dispatch','POST',{}, {Authorization:'Bearer '+env.NOTIFICATION_WORKER_SECRET})).status,200);
    const r=await call('/api/admin/notifications','POST',{subscription,user_id:'attacker'},{Cookie:'nuvora_session=session',Origin:env.PUBLIC_ORIGIN});assert.equal(r.status,200);
    assert.equal(calls.find(c=>c.name==='nuvora_save_push').args.p_actor,'real-admin');
    const config=await (await call('/api/admin/notifications','GET',null,{Cookie:'nuvora_session=session'})).json();
    assert.equal(config.publicKey,'public');assert.equal(config.privateKey,undefined);
    assert.equal((await call('/api/admin/notifications','POST',{subscription},{Cookie:'nuvora_session=session',Origin:'https://evil.test'})).status,403);
  }finally{await new Promise(r=>server.close(r));}
});
test('committed checkout succeeds even if immediate notification dispatch fails',async()=>{
  const db={rpc:async name=>{if(name==='nuvora_rate_limit')return true;if(name==='nuvora_place_order')return {id:'ABCDEF123456'};throw Error('queue temporarily unavailable');}};
  const server=http.createServer(createCloudHandler({env,backend:db}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/orders`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Customer',phone:'0911234567',mode:'pickup',items:[{id:1,quantity:1}]})});
    assert.equal(response.status,201);assert.equal((await response.json()).token.length,48);
  }finally{await new Promise(r=>server.close(r));}
});
test('service worker displays generic order/test pushes and opens only the dashboard',async()=>{
  const handlers={},shown=[],opened=[],messages=[];let focused=false;
  const self={location:{origin:'https://nuvora-app-one.vercel.app'},addEventListener:(type,handler)=>handlers[type]=handler,
    registration:{showNotification:async(title,options)=>shown.push({title,...options})},clients:{claim:async()=>{},matchAll:async()=>[],openWindow:async path=>opened.push(path)}};
  vm.runInNewContext(readFileSync(new URL('./public/order-worker.js',import.meta.url),'utf8'),{self,URL,encodeURIComponent});
  let work;const event={data:{json:()=>({orderId:'ABCDEF123456',phone:'secret',body:'secret'})},waitUntil:p=>work=p};
  handlers.push(event);await work;assert.equal(shown[0].tag,'ABCDEF123456');assert.doesNotMatch(shown[0].body,/secret/);
  handlers.push({...event,data:{json:()=>({type:'test'})}});await work;assert.match(shown[1].title,/connected/);
  handlers.notificationclick({notification:{close(){},data:{orderId:'ABCDEF123456'}},waitUntil:p=>work=p});await work;assert.equal(opened[0],'/admin?order=ABCDEF123456');
  self.clients.matchAll=async()=>[{url:'https://nuvora-app-one.vercel.app/admin',focus:async()=>{focused=true;},postMessage:m=>messages.push(m)}];
  handlers.notificationclick({notification:{close(){},data:{orderId:'ABCDEF123456'}},waitUntil:p=>work=p});await work;assert.equal(focused,true);assert.equal(messages[0].type,'OPEN_ORDER');
});
