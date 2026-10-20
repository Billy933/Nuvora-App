import {$,api} from './ui.js';
const fragment=new URLSearchParams(location.hash.slice(1));
let token=fragment.get('access_token')||'';
const error=fragment.get('error_description');
history.replaceState(null,'',location.pathname);
const form=$('#accept-invitation'),msg=$('#invitation-message');
if(!token||error){form.hidden=true;msg.textContent=error||'Open the setup link shared by the owner to set up access. If it has expired, ask the owner for a fresh link.';}
form.onsubmit=async e=>{
 e.preventDefault();const password=form.elements.password.value;
 if(password!==form.elements.confirm.value){msg.textContent='The passwords do not match.';return;}
 const button=form.querySelector('button');button.disabled=true;msg.textContent='Setting up your access…';
 try{await api('/api/invitation/accept','POST',{token,password});token='';form.reset();location.replace('/admin');}
 catch(e){msg.textContent=e.message;button.disabled=false;form.elements.password.value='';form.elements.confirm.value='';}
};
