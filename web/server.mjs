import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCloudHandler } from './lib/cloud-handler.mjs';
import { defaultSettings, validateSettings, validateContent, withContent } from './lib/validation.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(root,'data'), {recursive:true});
const db = new DatabaseSync(process.env.DB_PATH || path.join(root,'data/nuvora.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS menu(id INTEGER PRIMARY KEY, name TEXT, category TEXT, description TEXT, price INTEGER, image TEXT, available INTEGER); CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, token TEXT, created TEXT, status TEXT, payload TEXT);`);
db.exec('CREATE TABLE IF NOT EXISTS restaurant_settings(id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
db.prepare('INSERT OR IGNORE INTO restaurant_settings VALUES(1,?)').run(JSON.stringify({...defaultSettings,accepting_orders:true}));
const cloud = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ? createCloudHandler() : null;
const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('hex');
if (!cloud && !process.env.ADMIN_PASSWORD) console.log('LOCAL DEMO ONLY - temporary admin password:',password);
const sessions = new Map();
const statuses = ['Received','Preparing','Ready for pickup','Out for delivery','Completed','Cancelled'];
const send = (res,status,data) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
async function body(req) { let raw=''; for await (const chunk of req) {raw+=chunk;if(raw.length>4_300_000) throw Error('Request too large');} return JSON.parse(raw || '{}'); }
function validMenu(m) {return typeof m.name==='string' && m.name.trim().length>0 && m.name.length<=120 && typeof m.category==='string' && m.category.trim().length>0 && Number.isSafeInteger(m.price) && m.price>0 && m.price<=10000000 && typeof m.description==='string' && m.description.length<=1000 && typeof m.image==='string' && (m.image==='' || /^\/menu-items\/[a-z0-9-]+\.jpg$/.test(m.image) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(m.image));}
export const server = http.createServer(async (req,res) => {
 try {
  const url=new URL(req.url,'http://localhost'); const route=url.pathname;
  if(cloud && route.startsWith('/api/')) return await cloud(req,res);
  if(route==='/api/settings' && req.method==='GET') return send(res,200,withContent(JSON.parse(db.prepare('SELECT payload FROM restaurant_settings WHERE id=1').get().payload)));
  if (route==='/api/login' && req.method==='POST') { const p=String((await body(req)).password||''); const a=Buffer.from(p),b=Buffer.from(password);if(a.length!==b.length || !timingSafeEqual(a,b)) return send(res,401,{error:'Incorrect password'}); const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*60*60*1000);res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);return send(res,200,{ok:true}); }
  const token=(req.headers.cookie||'').match(/(?:^|; )session=([a-f0-9]+)/)?.[1]; const admin=(sessions.get(token)||0)>Date.now();
  if(route.startsWith('/api/admin')) {
   if(!admin) return send(res,401,{error:'Sign in to continue'});
   if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`${process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`}`) return send(res,403,{error:'Invalid origin'});
   if(route==='/api/admin/me'&&req.method==='GET')return send(res,200,{id:'demo',email:'Local demo',role:'demo'});
   if(route==='/api/admin/notifications'&&req.method==='GET')return send(res,200,{configured:false,publicKey:null,endpoints:[]});
   if(route==='/api/admin/notifications')return send(res,400,{error:'Device notifications require the cloud deployment'});
   if(route==='/api/admin/team')return send(res,400,{error:'Admin management is available in the cloud deployment only'});
   if(route==='/api/admin/settings' && req.method==='PUT') {const s=validateSettings(await body(req));const existing=JSON.parse(db.prepare('SELECT payload FROM restaurant_settings WHERE id=1').get().payload);db.prepare('UPDATE restaurant_settings SET payload=? WHERE id=1').run(JSON.stringify({...existing,...s}));return send(res,200,{ok:true});}
   if(route==='/api/admin/content' && req.method==='PUT') {const content=validateContent(await body(req));const existing=JSON.parse(db.prepare('SELECT payload FROM restaurant_settings WHERE id=1').get().payload);db.prepare('UPDATE restaurant_settings SET payload=? WHERE id=1').run(JSON.stringify({...existing,content}));return send(res,200,{ok:true,content});}
   if(route==='/api/admin/logout') {sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});}
   if(route==='/api/admin/orders' && req.method==='GET') return send(res,200,db.prepare('SELECT id,created,status,payload FROM orders ORDER BY created DESC').all().map(o=>({...o,...JSON.parse(o.payload),payload:undefined})));
   if(route.startsWith('/api/admin/orders/') && req.method==='PATCH') {const id=route.split('/').pop(), {status}=await body(req);const order=db.prepare('SELECT payload FROM orders WHERE id=?').get(id);if(!order)return send(res,404,{error:'Order not found'}); const mode=JSON.parse(order.payload).mode;if(!statuses.includes(status) || (mode==='pickup' && status==='Out for delivery') || (mode==='delivery' && status==='Ready for pickup'))return send(res,400,{error:'Invalid status'});db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id);return send(res,200,{ok:true});}
   if(route==='/api/admin/menu' && req.method==='POST') {const m=await body(req);if(!validMenu(m))return send(res,400,{error:'Check menu fields and price'}); const result=db.prepare('INSERT INTO menu(name,category,description,price,image,available) VALUES(?,?,?,?,?,?)').run(m.name.trim(),m.category.trim(),m.description,m.price,m.image,m.available?1:0);return send(res,201,{id:Number(result.lastInsertRowid)});}
   if(route.startsWith('/api/admin/menu/')) {const id=Number(route.split('/').pop());if(!db.prepare('SELECT id FROM menu WHERE id=?').get(id))return send(res,404,{error:'Item not found'});if(req.method==='DELETE'){db.prepare('DELETE FROM menu WHERE id=?').run(id);return send(res,200,{ok:true});}if(req.method==='PUT'){const m=await body(req);if(!validMenu(m))return send(res,400,{error:'Check menu fields and price'});db.prepare('UPDATE menu SET name=?,category=?,description=?,price=?,image=?,available=? WHERE id=?').run(m.name.trim(),m.category.trim(),m.description,m.price,m.image,m.available?1:0,id);return send(res,200,{ok:true});}}
  }
  if(route==='/api/menu' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM menu').all());
  if(route==='/api/orders' && req.method==='POST') {
   const settings=JSON.parse(db.prepare('SELECT payload FROM restaurant_settings WHERE id=1').get().payload);
   if(!settings.accepting_orders)return send(res,400,{error:'The kitchen is closed for orders right now'});
   const o=await body(req);if(!['pickup','delivery'].includes(o.mode) || typeof o.name!=='string' || !o.name.trim() || o.name.length>120 || !/^(?:\+251|0)[79]\d{8}$/.test(o.phone||'') || (o.mode==='delivery' && (typeof o.address!=='string' || o.address.trim().length<8)) || !Array.isArray(o.items) || !o.items.length || o.items.length>50 || String(o.notes||'').length>1000) return send(res,400,{error:'Enter your name, Ethiopian mobile number, and delivery address where required'});
   const items=o.items.map(i=>{const m=db.prepare('SELECT * FROM menu WHERE id=? AND available=1').get(i.id);if(!m || !Number.isInteger(i.quantity) || i.quantity<1 || i.quantity>30) throw Error('An item is unavailable or has an invalid quantity');return {id:m.id,name:m.name,price:m.price,quantity:i.quantity};});
   const payload={name:o.name.trim(),phone:o.phone,mode:o.mode,address:o.mode==='delivery'?String(o.address).slice(0,1000):'',notes:String(o.notes||''),items,total:items.reduce((s,i)=>s+i.price*i.quantity,0)};const id=randomBytes(6).toString('hex').toUpperCase(), token=randomBytes(24).toString('hex');db.prepare('INSERT INTO orders VALUES(?,?,?,?,?)').run(id,token,new Date().toISOString(),'Received',JSON.stringify(payload));return send(res,201,{id,token,status:'Received',...payload});
  }
  if(route.startsWith('/api/orders/') && req.method==='GET') {const o=db.prepare('SELECT id,status FROM orders WHERE id=? AND token=?').get(route.split('/').pop(),url.searchParams.get('token'));return send(res,o?200:404,o||{error:'Order not found'});}
  if(route.startsWith('/api/')) return send(res,404,{error:'Not found'});
  if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
   const files={'/':'index.html','/admin':'admin.html','/admin.html':'admin.html','/offline.html':'offline.html','/manifest.webmanifest':'manifest.webmanifest','/pwa.js':'pwa.js','/app.js':'app.js','/admin.js':'admin.js','/settings.js':'settings.js','/ui.js':'ui.js','/style.css':'style.css','/layout.css':'layout.css','/team.js':'team.js','/order-alerts.js':'order-alerts.js','/order-alert-state.js':'order-alert-state.js','/order-worker.js':'order-worker.js','/accept-invite':'accept-invite.html','/accept-invite.html':'accept-invite.html','/accept-invite.js':'accept-invite.js','/assets/nuvora-logo.png':'assets/nuvora-logo.png','/assets/nuvora-pwa-192.png':'assets/nuvora-pwa-192.png','/assets/nuvora-pwa-512.png':'assets/nuvora-pwa-512.png','/assets/nuvora-hero.jpg':'assets/nuvora-hero.jpg'};if(/^\/menu-items\/[a-z0-9-]+\.jpg$/.test(route))files[route]=route.slice(1);const f=files[route];if(!f)return send(res,404,{error:'Not found'});const contentType=f.endsWith('.webmanifest')?'application/manifest+json; charset=utf-8':f.endsWith('.png')?'image/png':f.endsWith('.jpg')?'image/jpeg':f.endsWith('.js')?'text/javascript; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';res.writeHead(200,{'Content-Type':contentType,'Cache-Control':f.startsWith('menu-items/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(readFileSync(path.join(root,'public',f)));
 } catch(e) {send(res,400,{error:e.message || 'Unable to process request'});}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Nuvora: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3000}`));

