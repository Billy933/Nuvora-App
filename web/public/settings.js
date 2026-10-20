const money=n=>`ETB ${(n/100).toFixed(2)}`;
async function settingsRequest(method='GET',data) {
  const r=await fetch(method==='GET'?'/api/settings':'/api/admin/settings',{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
  const d=await r.json();if(!r.ok)throw Error(d.error);return d;
}
export async function mountAdminSettings() {
  const panel=document.createElement('section');panel.className='settings-panel';
  panel.innerHTML=`<h2>Restaurant settings</h2><p class="small">Times are Addis Ababa clock time (24-hour): 07:00 to 23:00 means Ethiopian morning 1 to night 5.</p>
  <form id="restaurant-settings"><div class="settings-grid">
  <label>Pickup address<input name="pickup_address" required maxlength="300"></label>
  <label>Restaurant phone<input name="contact_phone" type="tel" required pattern="(0|\\+251)[79][0-9]{8}"></label>
  <label>Opens at<input name="opening_time" type="time" required></label>
  <label>Closes at<input name="closing_time" type="time" required></label>
  <label>Maximum delivery distance (km)<input name="delivery_max_km" type="number" min="0.1" max="100" step="0.1" required></label>
  <label>Nearby limit (km; provisional until confirmed)<input name="nearby_limit_km" type="number" min="0.1" max="100" step="0.1" required></label>
  <label>Nearby rate (ETB/km)<input name="nearby_rate" type="number" min="0" max="1000" step="0.01" required></label>
  <label>Long-distance rate (ETB/km)<input name="far_rate" type="number" min="0" max="1000" step="0.01" required></label>
  </div><label class="check"><input name="accepting_orders" type="checkbox"> Accept orders during opening hours</label>
  <label class="check"><input name="delivery_pricing_confirmed" type="checkbox"> Rates and nearby boundary are confirmed</label>
  <p class="small">Fees still require a phone confirmation before preparation. No distance or delivery fee is calculated automatically.</p>
  <button class="button">Save restaurant settings</button><p id="settings-message" role="status"></p></form>`;
  document.querySelector('#dashboard').append(panel);
  const form=panel.querySelector('form'),msg=panel.querySelector('#settings-message');
  try {
    const s=await settingsRequest();
    for(const [key,value] of Object.entries(s)) {
      const input=form.elements.namedItem(key);if(!input)continue;
      if(input.type==='checkbox')input.checked=value;
      else input.value=['nearby_rate','far_rate'].includes(key)?(value/100).toFixed(2):value;
    }
  }catch(e){msg.textContent=e.message;}
  form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try {
      const data=Object.fromEntries(new FormData(form));
      for(const k of ['nearby_rate','far_rate'])data[k]=Math.round(Number(data[k])*100);
      for(const k of ['delivery_max_km','nearby_limit_km'])data[k]=Number(data[k]);
      for(const k of ['accepting_orders','delivery_pricing_confirmed'])data[k]=form.elements.namedItem(k).checked;
      await settingsRequest('PUT',data);msg.textContent='Restaurant settings saved.';
    }catch(e){msg.textContent=e.message;}finally{button.disabled=false;}
  };
}
export async function mountStoreSettings() {
  const container=document.createElement('section');container.className='store-details';
  document.querySelector('.hero').after(container);
  try {
    const s=await settingsRequest();
    const fields=[['PICKUP',s.pickup_address],['HOURS',`${s.opening_time}–${s.closing_time} · Addis Ababa time`],['CONTACT',s.contact_phone]];
    for(const [label,value] of fields) {
      const block=document.createElement('div'),heading=document.createElement('p'),text=document.createElement('p');
      heading.className='eyebrow';heading.textContent=label;text.textContent=value;block.append(heading,text);container.append(block);
    }
    const info=document.createElement('p');info.className='small';
    info.textContent=`Delivery up to ${s.delivery_max_km} km from Bole. ${s.delivery_pricing_confirmed ? `Rates: ${money(s.nearby_rate)}/km nearby (up to ${s.nearby_limit_km} km); ${money(s.far_rate)}/km for longer trips. ` : ''}The restaurant will call to confirm your location, distance and delivery fee before preparation.`;
    container.append(info);
    if(!s.accepting_orders){const closed=document.createElement('p');closed.className='closed-notice';closed.textContent='The kitchen is currently paused for new orders.';container.prepend(closed);}
  }catch {container.textContent='Restaurant details are temporarily unavailable.';}
}
