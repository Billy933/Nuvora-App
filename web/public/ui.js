if(location.pathname!=='/accept-invite'&&location.pathname!=='/accept-invite.html'&&new URLSearchParams(location.hash.slice(1)).has('access_token'))location.replace('/accept-invite'+location.hash);
export const $=(s,root=document)=>root.querySelector(s);
export const money=n=>`ETB ${(Number(n)/100).toFixed(2)}`;
export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
 bag:'<path d="M5 7h14l1 14H4z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 heart:'<path d="M20 5c-3-3-7-1-8 1-1-2-5-4-8-1-4 4 1 9 8 15 7-6 12-11 8-15Z"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
 phone:'<path d="m5 3 4 4-2 3c2 3 4 5 7 7l3-2 4 4-2 3C10 22 2 14 2 5Z"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 food:'<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 21V3c-5 2-5 10 0 10"/>',
 truck:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="18" r="2"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
 logout:'<path d="M10 3H4v18h6M10 12h11m-5-5 5 5-5 5"/>',
 check:'<path d="m4 12 5 5L20 6"/>',refresh:'<path d="M20 8a9 9 0 1 0 1 7M20 3v6h-6"/>',
 chart:'<path d="M4 3v18h17M8 16v-5M13 16V6M18 16v-8"/>',
 flame:'<path d="M13 2c1 5-4 6-4 10-2-1-3-3-2-5-5 5-4 14 5 15 10-1 11-10 5-15 1 3-1 5-2 5 1-4 0-7-2-10Z"/>'
};
export const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.food}</svg>`;
export function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
export async function api(url,method='GET',data,headers={}) {
 const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})});
 let d;try{d=await r.json();}catch{throw Error('The service could not be reached. Please try again.');}
 if(!r.ok){const e=new Error(d.error||'Unable to complete request');e.status=r.status;throw e;}return d;
}
export const store={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
export async function readPhoto(file) {
 if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>1500000)throw Error('Choose a JPEG, PNG, or WebP smaller than 1.5 MB.');
 return await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Unable to read that photo.'));r.readAsDataURL(file);});
}
export function isOpen(settings,now=new Date()) {
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Addis_Ababa',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 return !!settings?.accepting_orders && time>=settings.opening_time && time<settings.closing_time;
}

export function applyBrand(content){
 document.querySelectorAll('[data-brand-logo]').forEach(img=>{img.src=content.logo_image||'/assets/nuvora-logo.png';img.alt=`${content.restaurant_name} - ${content.tagline}`;});
 document.querySelectorAll('[data-about-brand]').forEach(el=>el.textContent=`About ${content.restaurant_name}`);
 const home=document.querySelector('a.brand');if(home)home.setAttribute('aria-label',`${content.restaurant_name} home`);
}
