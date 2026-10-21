import { randomUUID } from 'node:crypto';
import { HttpError } from './validation.mjs';

// Uses Supabase's HTTP APIs. Secret keys never leave this server module.
export function createSupabase(env = process.env, fetcher = fetch) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const publishable = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !secret || !publishable) {
    throw new HttpError(503, 'Supabase is not configured yet');
  }
  async function request(route, {method='GET', body, accessToken, auth=false, headers={}} = {}) {
    const key = auth ? publishable : secret;
    const response = await fetcher(url + route, {
      method, headers: {apikey:key, ...(accessToken ? {Authorization:`Bearer ${accessToken}`} :
        key.startsWith('eyJ') ? {Authorization:`Bearer ${key}`} : {}),
        ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...headers},
      ...(body !== undefined ? {body:JSON.stringify(body)} : {}), signal:AbortSignal.timeout(12000)
    });
    const text = await response.text();
    let data; try { data=text ? JSON.parse(text) : null; } catch {data=null;}
    if (!response.ok) {
      if (auth) throw new HttpError(response.status === 429 ? 429 : 401, response.status === 429 ? 'Too many attempts. Please try again later.' : 'Sign in with your admin email and password');
      if (data?.code === 'P0001') throw new HttpError(400, data.message);
      console.error('Supabase request failed:', route.split('?')[0], response.status, data?.code || '');
      throw new HttpError(503, 'The kitchen service is unavailable. Please try again.');
    }
    return data;
  }
  const rpc=(name,body)=>request(`/rest/v1/rpc/${name}`,{method:'POST',body});
  async function isAdmin(accessToken) {
    if (!accessToken) return false;
    const user=await request('/auth/v1/user',{auth:true,accessToken});
    if (!user?.id) return false;
    const rows=await request(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
    return rows.length === 1;
  }
  async function getAdmin(accessToken) {
    if(!accessToken)return null;
    const user=await request('/auth/v1/user',{auth:true,accessToken});
    if(!user?.id)return null;
    const [row]=await request(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,role`);
    return row ? {id:user.id,email:user.email,role:row.role} : null;
  }
  async function markLogin(id){
    await request(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{last_login_at:new Date().toISOString()}});
  }
  async function storeImage(image) {
    if (!image) return '';
    // Bundled menu photos live with the storefront and are also editable in the admin UI.
    if (/^\/menu-items\/[a-z0-9-]+\.jpg$/.test(image)) return image;
    if (image === '/assets/nuvora-hero.jpg' || image === '/assets/nuvora-logo.png') return image;
    if (image.startsWith(`${url}/storage/v1/object/public/menu-photos/`) &&
        /^https:\/\/[^\s"<>]+$/.test(image)) return image;
    const match=image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new HttpError(400, 'Choose a JPEG, PNG, or WebP photo');
    const bytes=Buffer.from(match[2],'base64');
    if (!bytes.length || bytes.length > 1500000) throw new HttpError(400, 'Photo must be smaller than 1.5 MB');
    const name=`${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    const r=await fetcher(`${url}/storage/v1/object/menu-photos/${name}`, {method:'POST', headers:{apikey:secret,
      ...(secret.startsWith('eyJ') ? {Authorization:`Bearer ${secret}`} : {}), 'Content-Type':`image/${match[1]}`},body:bytes,signal:AbortSignal.timeout(12000)});
    if(!r.ok) throw new HttpError(503, 'Unable to upload photo. Please try again.');
    return `${url}/storage/v1/object/public/menu-photos/${name}`;
  }
  return {request,rpc,isAdmin,getAdmin,markLogin,storeImage,
    async createSetupLink(email,redirectTo){
      const data=await request(`/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',body:{type:'invite',email}});
      if(typeof data?.action_link!=='string'||!data.action_link.startsWith(`${url}/auth/v1/verify?`))throw new HttpError(503,'Unable to create a setup link. Please retry.');
      return data.action_link;
    },
    async verifyPassword(id,email,password){
      const s=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:true,body:{email,password}});
      try{if(s.user?.id!==id)throw new HttpError(401,'Confirm your current owner password');}
      finally{if(s.access_token)await request('/auth/v1/logout?scope=local',{method:'POST',auth:true,accessToken:s.access_token}).catch(()=>{});}
    },
    async login(email,password) {
      const session=await request('/auth/v1/token?grant_type=password',{method:'POST',auth:true,body:{email,password}});
      if (!await isAdmin(session.access_token)) {
        await request('/auth/v1/logout?scope=local',{method:'POST',auth:true,accessToken:session.access_token}).catch(()=>{});
        throw new HttpError(403, 'This account does not have restaurant admin access');
      }
      const user=await request('/auth/v1/user',{auth:true,accessToken:session.access_token});
      await markLogin(user.id);
      return session;
    }
  };
}
