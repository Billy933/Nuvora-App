const installButton=document.querySelector('#install-app');
let installPrompt=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

if(installButton){
  installButton.hidden=standalone();
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
  });
  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    installButton.hidden=true;
  });
  installButton.addEventListener('click',async()=>{
    if(installPrompt){
      await installPrompt.prompt();
      const choice=await installPrompt.userChoice;
      installPrompt=null;
      if(choice.outcome==='accepted')installButton.hidden=true;
      return;
    }
    const message=document.querySelector('#toast');
    if(!message)return;
    message.textContent=/iphone|ipad|ipod/i.test(navigator.userAgent)
      ?'Tap Share in Safari, then choose Add to Home Screen.'
      :'Open your browser menu and choose Install app or Add to Home Screen.';
    message.hidden=false;
    window.setTimeout(()=>{message.hidden=true;},5000);
  });
}

if('serviceWorker' in navigator&&location.protocol==='https:'){
  navigator.serviceWorker.register('/order-worker.js',{scope:'/'}).catch(()=>{});
}
