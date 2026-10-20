export const defaultSettings = Object.freeze({
  pickup_address: 'Bole, Selam City Mall', contact_phone: '+251919158071',
  opening_time: '07:00', closing_time: '23:00', accepting_orders: false,
  delivery_max_km: 50, nearby_limit_km: 15, nearby_rate: 500, far_rate: 1000,
  delivery_pricing_confirmed: false
});
export const defaultContent = Object.freeze({
  restaurant_name: 'Nuvora', tagline: 'Takeaway & delivery',
  hero_eyebrow: 'FRESH FROM OUR KITCHEN', hero_title: 'Good food. Great mood.',
  hero_description: 'Your favorites, freshly prepared. Pick them up or have them delivered to your door.',
  hero_image: '', logo_image: '/assets/nuvora-logo.png',
  menu_heading: 'Find your next favorite', about_title: 'Made with care, served with love.',
  about_description: 'Welcome to Nuvora. Order for pickup or delivery from our kitchen in Addis Ababa.',
  empty_title: 'Something delicious is on its way.', empty_description: 'Our kitchen is getting the menu ready. Come back soon.',
  footer_text: 'A little flavor. A lot of happiness.'
});
export function withContent(s) { return {...defaultSettings,...s,content:{...defaultContent,...s?.content}}; }
export function validateContent(c) {
  if(!c || typeof c!=='object' || Array.isArray(c))throw new HttpError(400,'Invalid storefront content');
  const limits={restaurant_name:60,tagline:80,hero_eyebrow:70,hero_title:100,hero_description:400,menu_heading:100,
    about_title:100,about_description:1200,empty_title:100,empty_description:400,footer_text:150};
  const result={};
  for(const [key,max] of Object.entries(limits)) {
    if(typeof c[key]!=='string' || !c[key].trim() || c[key].length>max)throw new HttpError(400,`Check ${key.replaceAll('_',' ')} (maximum ${max} characters)`);
    result[key]=c[key].trim();
  }
  for(const key of ['hero_image','logo_image']) {
    const value=c[key];
    if(typeof value!=='string' || value.length>2100000 || (value && value!=='/assets/nuvora-logo.png' &&
      !/^https:\/\/[^\s"<>]+$/.test(value) && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))) {
      throw new HttpError(400,'Choose a JPEG, PNG, or WebP image');
    }
    result[key]=value;
  }
  return result;
}
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function validateAdminAction(input){
  if(!input||typeof input!=='object'||!['add','remove','transfer'].includes(input.action)||
    typeof input.email!=='string'||input.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    throw new HttpError(400,'Choose an action and enter a valid email');
  }
  const email=input.email.trim().toLowerCase();
  if(input.action==='transfer'&&(input.confirmation?.trim().toLowerCase()!==email||
    typeof input.password!=='string'||!input.password||input.password.length>500)) {
    throw new HttpError(400,'Type the new owner email and confirm your current password');
  }
  return {action:input.action,email,password:input.password};
}
export function validateSettings(s) {
  if(!s || typeof s!=='object')throw new HttpError(400,'Invalid restaurant settings');
  if (typeof s.pickup_address !== 'string' || !s.pickup_address.trim() || s.pickup_address.length > 300 ||
      !/^(?:\+251|0)[79]\d{8}$/.test(s.contact_phone || '') ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.opening_time || '') ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.closing_time || '') || s.opening_time >= s.closing_time ||
      typeof s.accepting_orders !== 'boolean' || typeof s.delivery_pricing_confirmed !== 'boolean' ||
      !Number.isFinite(s.delivery_max_km) || s.delivery_max_km <= 0 || s.delivery_max_km > 100 ||
      !Number.isFinite(s.nearby_limit_km) || s.nearby_limit_km <= 0 || s.nearby_limit_km > s.delivery_max_km ||
      !Number.isSafeInteger(s.nearby_rate) || s.nearby_rate < 0 || s.nearby_rate > 100000 ||
      !Number.isSafeInteger(s.far_rate) || s.far_rate < s.nearby_rate || s.far_rate > 100000) {
    throw new HttpError(400, 'Check restaurant details, hours, coverage and delivery rates');
  }
  return Object.fromEntries(Object.keys(defaultSettings).map(k => [k, s[k]]));
}
export function validateMenu(m) {
  if(!m || typeof m!=='object')throw new HttpError(400,'Invalid menu item');
  if (typeof m.name !== 'string' || !m.name.trim() || m.name.length > 120 ||
      typeof m.category !== 'string' || !m.category.trim() || m.category.length > 80 ||
      typeof m.description !== 'string' || m.description.length > 1000 ||
      !Number.isSafeInteger(m.price) || m.price <= 0 || m.price > 10000000 ||
      typeof m.available !== 'boolean' || typeof m.image !== 'string') throw new HttpError(400, 'Check menu fields and price');
  return {name:m.name.trim(), category:m.category.trim(), description:m.description, price:m.price, available:m.available, image:m.image};
}
export function validateOrder(o) {
  if(!o || typeof o!=='object')throw new HttpError(400,'Invalid order');
  if (!['pickup','delivery'].includes(o.mode) || typeof o.name !== 'string' || !o.name.trim() || o.name.length > 120 ||
      !/^(?:\+251|0)[79]\d{8}$/.test(o.phone || '') ||
      (o.mode === 'delivery' && (typeof o.address !== 'string' || o.address.trim().length < 8 || o.address.length > 1000)) ||
      (o.notes != null && (typeof o.notes !== 'string' || o.notes.length > 1000)) ||
      !Array.isArray(o.items) || !o.items.length || o.items.length > 50 ||
      o.items.some(i => !i || !Number.isSafeInteger(i.id) || i.id < 1 || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 30) ||
      new Set(o.items.map(i => i.id)).size !== o.items.length) {
    throw new HttpError(400, 'Check your contact details, address and cart quantities');
  }
  return {name:o.name.trim(),phone:o.phone,mode:o.mode,address:o.mode==='delivery'?o.address.trim():'',notes:o.notes || '',items:o.items.map(({id,quantity})=>({id,quantity}))};
}
