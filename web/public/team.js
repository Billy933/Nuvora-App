import {$,api,escape} from './ui.js';

export function mountAdminTeam({onExit}){
 const root=$('#team-editor');let current=null,rows=[],busy=false,target=null;
 root.innerHTML=`<p id="team-notice" class="notice" role="status" hidden></p>
 <div id="team-cloud"><section class="panel"><h2>Add an admin</h2><p class="muted">Admins can manage the menu, orders and storefront. Only the owner can manage access.</p>
 <form id="add-admin" class="team-add"><label>Admin email<input name="email" type="email" autocomplete="off" required maxlength="254" placeholder="new.admin@example.com"></label><button class="button">Add admin</button></form>
 <p class="small">New users get a one-time setup link. Share it privately with that admin so they can choose a password. No email is sent automatically. Add the same pending email again to get a fresh link.</p><div id="setup-link-panel" class="info-note" hidden><label>Private setup link<input id="setup-link" type="url" readonly autocomplete="off" spellcheck="false"></label><button id="copy-setup-link" class="text-button" type="button">Copy setup link</button></div></section>
 <section class="panel"><div class="section-heading"><h2>Dashboard access</h2><button class="text-button" id="refresh-team">Refresh</button></div><div id="team-list" class="table-scroll"></div></section>
 <section class="panel"><h2>Hand over the restaurant</h2><p class="muted">Add the replacement admin and ask them to sign in first. Then choose Hand over next to their account. They become the owner and your dashboard access is removed immediately.</p><p class="small">This transfers access to this dashboard. Transfer Supabase, Vercel, GitHub and domain ownership separately when handing over the whole project.</p></section></div>`;
 function clearSetup(){$('#setup-link').value='';$('#setup-link-panel').hidden=true;}
 $('#copy-setup-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#setup-link').value);message('Setup link copied. Share it only with the intended admin.');}catch{$('#setup-link').select();message('Select and copy the setup link, then share it with the intended admin.');}};
 const dialog=document.createElement('dialog');dialog.id='team-dialog';dialog.className='team-dialog';
 dialog.innerHTML=`<form id="team-confirm"><div class="editor-heading"><h2 id="team-dialog-title"></h2><button type="button" class="icon-button" id="close-team-dialog" aria-label="Close access confirmation">×</button></div><div class="team-dialog-body"><p id="team-confirm-copy" class="muted"></p><div id="transfer-fields"><label>New owner email<input name="confirmation" type="email" autocomplete="off" maxlength="254"></label><label>Your current password<input name="password" type="password" autocomplete="current-password" maxlength="500"></label><p class="info-note">Your account will lose dashboard access and you will be signed out. The new owner can add you back later if needed.</p></div><p id="team-confirm-message" class="form-message" role="status"></p><div class="editor-footer"><button type="button" class="button button-quiet" id="cancel-team-action">Cancel</button><button class="button" id="confirm-team-action">Confirm</button></div></div></form>`;
 document.body.append(dialog);
 function message(text){$('#team-notice').textContent=text;$('#team-notice').hidden=!text;}
 function close(){if(!busy)dialog.close();}
 $('#close-team-dialog').onclick=close;$('#cancel-team-action').onclick=close;dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 function controls(disabled){root.querySelectorAll('button,input').forEach(el=>el.disabled=disabled);root.querySelectorAll('[data-transfer-admin]').forEach(b=>{const a=rows.find(a=>a.id===b.dataset.transferAdmin);b.disabled=disabled||!a?.confirmed||!a?.last_login_at;});$('#confirm-team-action').disabled=disabled;}
 function render(){
  $('#team-list').innerHTML=`<table class="team-table"><thead><tr><th>Account</th><th>Role</th><th>Last dashboard sign-in</th><th>Actions</th></tr></thead><tbody>${rows.map(a=>`<tr><td><strong>${escape(a.email)}</strong><small>${a.confirmed?'Email confirmed':'Invitation pending'}${a.id===current.id?' · You':''}</small></td><td><span class="order-status ${a.role==='owner'?'completed':'preparing'}">${escape(a.role)}</span></td><td>${a.last_login_at?escape(new Date(a.last_login_at).toLocaleString('en-GB',{timeZone:'Africa/Addis_Ababa',dateStyle:'medium',timeStyle:'short'})):'Not yet signed in'}</td><td>${a.id===current.id?'<span class="small">Current owner</span>':`<div class="table-actions"><button class="text-button" data-transfer-admin="${escape(a.id)}" ${a.confirmed&&a.last_login_at?'':'disabled'}>Hand over</button><button class="text-button danger" data-remove-admin="${escape(a.id)}">Remove access</button></div>`}</td></tr>`).join('')}</tbody></table>`;
 }
 async function load(){
  if(!current||busy)return;
  if(current.role==='demo'){$('#team-cloud').hidden=true;message('Admin accounts and handover are available in the cloud deployment. This local demo uses a shared temporary password.');return;}
  $('#team-cloud').hidden=false;
  if(current.role!=='owner'){$('#team-cloud').hidden=true;message('Only the owner can manage dashboard access.');return;}
  try{rows=await api('/api/admin/team');render();}catch(e){message(e.message);}
 }
 $('#refresh-team').onclick=()=>load();
 $('#add-admin').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const email=e.target.elements.email.value.trim();
  busy=true;controls(true);message('Adding admin…');
  try{const result=await api('/api/admin/team','POST',{action:'add',email});e.target.reset();if(result.setup_link){$('#setup-link').value=result.setup_link;$('#setup-link-panel').hidden=false;message(`Setup link ready for ${email}. Share it with them and ask them to sign in before handover.`);}else message(`Dashboard admin access added for ${email}.`);}
  catch(e){message(e.message);}finally{busy=false;controls(false);await load();}
 };
 root.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||busy)return;
  const id=b.dataset.transferAdmin||b.dataset.removeAdmin;if(!id)return;
  const row=rows.find(a=>a.id===id);if(!row)return;
  target={action:b.dataset.transferAdmin?'transfer':'remove',email:row.email};
  const transfer=target.action==='transfer';$('#team-confirm').reset();$('#transfer-fields').hidden=!transfer;
  for(const name of ['confirmation','password'])$('#team-confirm').elements[name].required=transfer;
  $('#team-dialog-title').textContent=transfer?'Hand over ownership':'Remove dashboard access';
  $('#team-confirm-copy').textContent=transfer?`${row.email} will become the owner. This removes your dashboard access.`:`${row.email} will immediately lose dashboard access, including existing signed-in sessions. Their login account and historical orders are preserved.`;
  $('#team-confirm-message').textContent='';$('#confirm-team-action').textContent=transfer?'Hand over and sign out':'Remove access';dialog.showModal();
 });
 $('#team-confirm').onsubmit=async e=>{
  e.preventDefault();if(busy||!target)return;
  busy=true;controls(true);const f=e.target;
  try{await api('/api/admin/team','POST',{...target,confirmation:f.elements.confirmation.value,password:f.elements.password.value});f.reset();clearSetup();dialog.close();
   if(target.action==='transfer'){current=null;onExit('Handover complete. Your dashboard access has been removed. The new owner can now sign in.');}
   else message(`Dashboard access removed for ${target.email}.`);
  }catch(e){$('#team-confirm-message').textContent=e.message;f.elements.password.value='';}
  finally{busy=false;controls(false);await load();}
 };
 return {setCurrent(user){if(user?.id!==current?.id){rows=[];$('#team-list').innerHTML='';clearSetup();message('');}current=user;},load};
}
