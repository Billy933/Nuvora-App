import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createSupabase } from './supabase.mjs';
import { HttpError, validateMenu, validateOrder, validateSettings, validateContent, withContent } from './validation.mjs';

const statuses=['Received','Preparing','Ready for pickup','Out for delivery','Completed','Cancelled'];
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
async function readBody(req) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415,'Send JSON data');
  if (req.body !== undefined) {
    const text=typeof req.body==='string'?req.body:JSON.stringify(req.body);
    if(Buffer.byteLength(text)>4300000) throw new HttpError(413,'Request too large');
    try{return JSON.parse(text);}catch{throw new HttpError(400,'Invalid JSON');}
  }
  let size=0; const chunks=[];
  for await(const chunk of req) {size+=chunk.length;if(size>4300000)throw new HttpError(413,'Request too large');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new HttpError(400,'Invalid JSON');}
}
export function createCloudHandler({env=process.env,backend}={}) {
  return async (req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      const route=url.pathname==='/api/index' && url.searchParams.has('route') ? '/api/'+url.searchParams.get('route') : url.pathname;
      const mutation=!['GET','HEAD'].includes(req.method);
      if(mutation && req.headers.origin) {
        const allowed=[env.PUBLIC_ORIGIN,env.VERCEL_URL && `https://${env.VERCEL_URL}`,
          !env.VERCEL && `http://${req.headers.host}`].filter(Boolean);
        if(!allowed.includes(req.headers.origin))throw new HttpError(403,'Invalid request origin');
      }
      const db=backend || createSupabase(env);
      async function limit(scope,max,seconds) {
        if(!env.RATE_LIMIT_SECRET || env.RATE_LIMIT_SECRET.length<32)throw new HttpError(503,'Service protection is not configured yet');
        const ip=env.VERCEL ? (req.headers['x-vercel-forwarded-for'] || 'unknown') : (req.socket?.remoteAddress || 'local');
        const key=createHmac('sha256',env.RATE_LIMIT_SECRET).update(`${scope}:${ip}`).digest('hex');
        const ok=await db.rpc('nuvora_rate_limit',{p_key:key,p_max:max,p_seconds:seconds});
        if(!ok)throw new HttpError(429,'Too many requests. Please try again later.');
      }
      const secure=env.VERCEL || env.COOKIE_SECURE==='true';
      const cookie=(token,age)=>`nuvora_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
      const session=(req.headers.cookie||'').match(/(?:^|;\s*)nuvora_session=([^;]+)/)?.[1];
      const access=session ? decodeURIComponent(session) : '';
      if(route==='/api/login' && req.method==='POST') {
        await limit('login',10,900);
        const b=await readBody(req);
        if(!b || typeof b!=='object')throw new HttpError(400,'Enter your admin email and password');
        if(typeof b.email!=='string'||b.email.length>254||typeof b.password!=='string'||b.password.length>500)throw new HttpError(400,'Enter your admin email and password');
        const s=await db.login(b.email,b.password);
        res.setHeader('Set-Cookie',cookie(s.access_token,Math.min(s.expires_in || 3600,3600)));
        return send(res,200,{ok:true});
      }
      if(route==='/api/admin/logout' && req.method==='POST') {
        res.setHeader('Set-Cookie',cookie('',0));
        if(access)await db.request('/auth/v1/logout?scope=local',{method:'POST',auth:true,accessToken:access}).catch(()=>{});
        return send(res,200,{ok:true});
      }
      if(route.startsWith('/api/admin/')) {
        if(!await db.isAdmin(access))throw new HttpError(401,'Sign in to continue');
        if(route==='/api/admin/content' && req.method==='PUT') {
          const content=validateContent(await readBody(req));
          for(const key of ['hero_image','logo_image']) {
            if(content[key] && content[key]!=='/assets/nuvora-logo.png')content[key]=await db.storeImage(content[key]);
          }
          await db.request('/rest/v1/restaurant_settings?id=eq.1',{method:'PATCH',body:{content}});
          return send(res,200,{ok:true,content});
        }
        if(route==='/api/admin/orders' && req.method==='GET') {
          const rows=await db.request('/rest/v1/orders?select=id,created,status,payload&order=created.desc&limit=200');
          return send(res,200,rows.map(o=>({id:o.id,created:o.created,status:o.status,...o.payload})));
        }
        if(route==='/api/admin/settings' && req.method==='PUT') {
          const settings=validateSettings(await readBody(req));
          await db.request('/rest/v1/restaurant_settings?id=eq.1',{method:'PATCH',body:settings});
          return send(res,200,{ok:true});
        }
        if(/^\/api\/admin\/orders\/[A-F0-9]{12}$/.test(route) && req.method==='PATCH') {
          const id=route.split('/').pop(),input=await readBody(req),status=input?.status;
          const [o]=await db.request(`/rest/v1/orders?id=eq.${id}&select=payload`);
          if(!o)throw new HttpError(404,'Order not found');
          if(!statuses.includes(status)||(o.payload.mode==='pickup' && status==='Out for delivery')||(o.payload.mode==='delivery' && status==='Ready for pickup'))throw new HttpError(400,'Invalid order status');
          await db.request(`/rest/v1/orders?id=eq.${id}`,{method:'PATCH',body:{status}});
          return send(res,200,{ok:true});
        }
        const menuMatch=route.match(/^\/api\/admin\/menu(?:\/([1-9]\d*))?$/);
        if(menuMatch) {
          const id=menuMatch[1];
          if(id) {
            const rows=await db.request(`/rest/v1/menu?id=eq.${id}&select=id`);
            if(!rows.length)throw new HttpError(404,'Menu item not found');
          }
          if(id && req.method==='DELETE') {await db.request(`/rest/v1/menu?id=eq.${id}`,{method:'DELETE'});return send(res,200,{ok:true});}
          if((!id && req.method==='POST') || (id && req.method==='PUT')) {
            const m=validateMenu(await readBody(req)); m.image=await db.storeImage(m.image);
            const rows=await db.request(`/rest/v1/menu${id?`?id=eq.${id}`:''}`,{method:id?'PATCH':'POST',body:m,headers:{Prefer:'return=representation'}});
            return send(res,id?200:201,{id:rows[0].id});
          }
        }
        throw new HttpError(404,'Not found');
      }
      if(route==='/api/menu' && req.method==='GET')return send(res,200,await db.request('/rest/v1/menu?select=*&order=id.asc'));
      if(route==='/api/settings' && req.method==='GET') {
        const [s]=await db.request('/rest/v1/restaurant_settings?id=eq.1&select=*');
        if(!s)throw new HttpError(503,'Restaurant settings are not configured');
        const {id,...settings}=s;
        return send(res,200,withContent(settings));
      }
      if(route==='/api/orders' && req.method==='POST') {
        await limit('order',10,600);
        const o=validateOrder(await readBody(req));
        const id=randomBytes(6).toString('hex').toUpperCase(), token=randomBytes(24).toString('hex');
        const result=await db.rpc('nuvora_place_order',{p_id:id,p_token_hash:createHash('sha256').update(token).digest('hex'),p_order:o});
        return send(res,201,{...result,token});
      }
      if(/^\/api\/orders\/[A-F0-9]{12}$/.test(route) && req.method==='GET') {
        const token=req.headers['x-order-token'] || url.searchParams.get('token') || '';
        if(!/^[a-f0-9]{48}$/.test(token))throw new HttpError(404,'Order not found');
        const id=route.split('/').pop(),hash=createHash('sha256').update(token).digest('hex');
        const [o]=await db.request(`/rest/v1/orders?id=eq.${id}&token_hash=eq.${hash}&select=id,status`);
        if(!o)throw new HttpError(404,'Order not found');
        return send(res,200,o);
      }
      throw new HttpError(404,'Not found');
    }catch(e){
      if(!e.status)console.error('Nuvora API failure:',e.name);
      return send(res,e.status || 503,{error:e.status?e.message:'The kitchen service is unavailable. Please try again.'});
    }
  };
}
