export const defaultSettings = Object.freeze({
  pickup_address: 'Bole, Selam City Mall', contact_phone: '+251919158071',
  opening_time: '07:00', closing_time: '23:00', accepting_orders: false,
  delivery_max_km: 50, nearby_limit_km: 15, nearby_rate: 500, far_rate: 1000,
  delivery_pricing_confirmed: false
});
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
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
