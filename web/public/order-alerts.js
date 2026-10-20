import {api} from './ui.js';

import {unseenOrderIds} from './order-alert-state.js';
export function mountOrderAlerts({openOrders,refresh}){
  const el=id=>document.getElementById(id);
  let previous=null,current=null,audio=null,sound=false,lastSound=0,pending=0,push=false,busy=false,generation=0;
  const message=text=>{el('alert-message').textContent=text;};
  function ring(){
    if(!sound||!audio||document.hidden)return;
    audio.resume().then(()=>{
      for(let i=0;i<3;i++){
        const oscillator=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.25;
        oscillator.frequency.value=i===1?880:660;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.12,t+.02);gain.gain.exponentialRampToValueAtTime(.001,t+.2);
        oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(t);oscillator.stop(t+.22);
      }
    }).catch(()=>message('Tap Enable sound again to allow sound in this browser.'));
    lastSound=Date.now();
  }
  async function registration(){return navigator.serviceWorker.register('/order-worker.js',{scope:'/'});}
  async function activeRegistration(){
    const r=await registration();
    return r.active?r:await navigator.serviceWorker.ready;
  }
  function renderPush(){el('push-alerts').textContent=push?'Turn off device notifications':'Enable device notifications';}
  async function stopPush(){
    if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
    const r=await navigator.serviceWorker.getRegistration('/'),s=await r?.pushManager.getSubscription();
    if(s){try{await api('/api/admin/notifications','DELETE',{subscription:s.toJSON()});}finally{await s.unsubscribe();}}
    push=false;renderPush();
  }
  el('sound-alerts').onclick=()=>{
    if(sound){sound=false;el('sound-alerts').textContent='Enable sound';return;}
    const Context=window.AudioContext||window.webkitAudioContext;
    if(!Context){message('Sound is unavailable in this browser.');return;}
    audio||=new Context();sound=true;el('sound-alerts').textContent='Mute sound';ring();
    message('Sound enabled for this tab. Keep it open and your device volume on.');
  };
  el('view-pending').onclick=()=>openOrders();
  el('test-push').onclick=async()=>{
    const button=el('test-push');button.disabled=true;
    try{
      const r=await navigator.serviceWorker?.getRegistration('/'),subscription=await r?.pushManager.getSubscription();
      if(!push||!subscription)throw Error('Enable device notifications first.');
      await api('/api/admin/notifications/test','POST',{subscription:subscription.toJSON()});
      message('Test sent to your browser push service. Check this device for the notification.');
    }catch(e){message(e.message);}finally{button.disabled=false;}
  };
  el('push-alerts').onclick=async()=>{
    if(busy)return;busy=true;el('push-alerts').disabled=true;
    try{
      if(push){await stopPush();message('Device notifications turned off.');return;}
      if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('Use a supported browser. On iPhone or iPad, add the dashboard to your Home Screen first.');
      const config=await api('/api/admin/notifications');
      if(!config.configured)throw Error('Device notifications need server setup. Dashboard sound alerts are available now.');
      if(await Notification.requestPermission()!=='granted')throw Error('Notifications are blocked. Allow them in your browser site settings, then try again.');
      const r=await activeRegistration();
      const bytes=Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
      let subscription=await r.pushManager.getSubscription();
      if(subscription&&subscription.options.applicationServerKey&&new Uint8Array(subscription.options.applicationServerKey).some((b,i)=>b!==bytes[i])){await subscription.unsubscribe();subscription=null;}
      subscription||=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      await api('/api/admin/notifications','POST',{subscription:subscription.toJSON()});
      push=true;renderPush();message('Device notifications enabled. Delivery depends on your connection and device settings.');
    }catch(e){message(e.message);}finally{busy=false;el('push-alerts').disabled=false;}
  };
  const onFocus=()=>{if(current)refresh();};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)onFocus();});
  window.addEventListener('focus',onFocus);
  navigator.serviceWorker?.addEventListener('message',e=>{if(e.data?.type==='OPEN_ORDER'&&current){openOrders(e.data.orderId);refresh();}});
  setInterval(()=>{if(current&&pending&&sound&&Date.now()-lastSound>45000)ring();},5000);
  return {
    async setCurrent(me){
      if(current?.id===me?.id)return;
      current=me;previous=null;pending=0;push=false;renderPush();const version=++generation;
      if(!me){sound=false;el('sound-alerts').textContent='Enable sound';document.title='Nuvora · Kitchen dashboard';message('');return;}
      try{
        const config=await api('/api/admin/notifications');
        if(version!==generation)return;
        if(!config.configured){message('Dashboard alerts ready. Device notifications await server setup.');return;}
        if('serviceWorker' in navigator&&'PushManager' in window){
          const r=await navigator.serviceWorker.getRegistration('/'),s=await r?.pushManager.getSubscription();
          if(version!==generation)return;
          push=!!s&&config.endpoints.includes(s.endpoint);renderPush();
        }
      }catch(e){if(version===generation)message(e.message);}
    },
    update(orders){
      const fresh=unseenOrderIds(previous,orders);previous=new Set(orders.map(o=>o.id));
      pending=orders.filter(o=>o.status==='Received').length;
      el('pending-alert').hidden=!pending;
      el('pending-alert-text').textContent=`${pending} loaded order${pending===1?' is':'s are'} waiting for acceptance. Move to Preparing to accept, or Cancelled to decline.`;
      document.title=pending?`(${pending}) Orders waiting · Nuvora`:'Nuvora · Kitchen dashboard';
      if(pending&&(fresh.length||!lastSound))ring();
    },stopPush
  };
}
