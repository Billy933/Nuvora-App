import webpush from 'web-push';
import {timingSafeEqual} from 'node:crypto';
import {HttpError} from './validation.mjs';

export const pushReady=env=>!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.VAPID_SUBJECT);
export function workerAuthorized(header,secret){
  if(!secret||secret.length<32)return false;
  const a=Buffer.from(header||''),b=Buffer.from(`Bearer ${secret}`);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export function validateSubscription(value){
  const s=value?.subscription;
  let u;try{u=new URL(s?.endpoint);}catch{throw new HttpError(400,'Invalid push subscription');}
  // Only browser push services are permitted: never fetch a client-selected arbitrary host.
  const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.windows.com'];
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!allowed.some(h=>u.hostname===h||u.hostname.endsWith('.'+h))||s.endpoint.length>2048||
    !/^[A-Za-z0-9_-]{87}$/.test(s.keys?.p256dh||'')||!/^[A-Za-z0-9_-]{22}$/.test(s.keys?.auth||''))throw new HttpError(400,'Unsupported push subscription');
  return {endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function sendPush(subscription,payload,env){
  return webpush.sendNotification(subscription,JSON.stringify(payload),{
    vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},
    TTL:300,urgency:'high',timeout:5000
  });
}
export async function dispatchPush(db,env,{send=sendPush,orderId=null}={}){
  if(!pushReady(env))return {configured:false};
  const jobs=await db.rpc('nuvora_claim_push',{p_order_id:orderId});
  const counts={configured:true,sent:0,retry:0,expired:0,gone:0};
  await Promise.all(jobs.map(async job=>{
    let outcome='sent';
    try{
      // Recheck membership and order status immediately before sending, including queued retries.
      const [current]=await db.request(`/rest/v1/admin_users?user_id=eq.${job.user_id}&select=user_id`);
      const [order]=await db.request(`/rest/v1/orders?id=eq.${job.order_id}&status=eq.Received&select=id`);
      if(!current||!order)outcome='expired';
      else await send(job.subscription,{title:'New Nuvora order',body:'An order is waiting for acceptance. Open the kitchen dashboard.',orderId:job.order_id},env);
    }catch(e){outcome=[404,410].includes(e.statusCode)?'gone':'retry';}
    await db.rpc('nuvora_finish_push',{p_id:job.id,p_lease:job.lease,p_outcome:outcome});
    counts[outcome]++;
  }));
  return counts;
}
