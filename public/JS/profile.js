// =====================
// CityGallery — Profile (Full)
// =====================

/* ---------- tiny helpers ---------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const htmlEscape = (s)=> String(s ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function fmtExact(iso){ const d=new Date(iso); return d.toLocaleString([], {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
let LAST_UPLOADED_GROUP_COVER_URL = null;

/* ---------- API ---------- */
async function api(path, method='GET', body){
  const isForm = body instanceof FormData;
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  const res = await fetch(path, { method, headers, body: isForm ? body : (body ? JSON.stringify(body) : undefined), credentials:'include' });
  let data = {};
  const text = await res.text(); try{ data = JSON.parse(text) } catch { data = {} }
  if (!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

function toImageUrl(u){
  if(!u) return '';
  if (/^https?:\/\//i.test(u) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('/uploads/')) return u;
  // נרמול מחרוזות כמו "uploads/abc.jpg"
  u = String(u).replace(/^\.?\/?uploads[\\/]/i, '');
  return `/uploads/${u}`;
}

function getGroupCoverRaw(g){
  const candidate =
    g?.coverImage ??
    g?.cover ??
    g?.avatar ??
    g?.image ??
    g?.photo ??
    (typeof g?.cover === 'object' ? (g.cover.url || g.cover.src) : undefined) ??
    (Array.isArray(g?.images) ? g.images[0] : undefined) ??
    '';
  if (candidate && typeof candidate === 'object') {
    return candidate.url || candidate.src || '';
  }
  return candidate || '';
}

function getGroupCoverUrl(g){
  const raw = getGroupCoverRaw(g);
  return raw ? toImageUrl(raw) : '';
}

function initialsFromName(name='Group'){
  const parts = String(name).trim().split(/\s+/).slice(0,2);
  return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'GR';
}

function avatarFallbackHtml(name){
  const ini = initialsFromName(name);
  return `<div class="avatar-fallback" aria-hidden="true">${ini}</div>`;
}

/* ---------- Toast ---------- */
const toastEl = $('#toast');
function showToast(msg, type='ok'){
  if (!toastEl) return; toastEl.textContent=msg;
  toastEl.classList.remove('hidden','ok','error'); toastEl.classList.add(type);
  setTimeout(()=> toastEl.classList.add('hidden'), 2200);
}

async function deleteGroupById(groupId){
  await api(`/api/groups/${encodeURIComponent(groupId)}`, 'DELETE');
  showToast('Group deleted ✔','ok');
  return true;
}

/* ---------- User header ---------- */
let CURRENT_USER = null;
async function loadUser(){
  try{
    const me = await api('/api/users/me');
    CURRENT_USER = me || null;
    const username = me?.username || me?.user?.username || 'User';
    const bio = me?.bio || 'Your posts and stats';
    $('#userBadge')?.replaceChildren(document.createTextNode(`Signed in as ${username}`));
    $('#profileName')?.replaceChildren(document.createTextNode(username));
    $('#profileSubtitle')?.replaceChildren(document.createTextNode(bio));
    return me;
  }catch{
    $('#userBadge')?.replaceChildren(document.createTextNode('Not signed in'));
    CURRENT_USER=null; return null;
  }
}
$('#logoutBtn')?.addEventListener('click', async ()=>{ try{ await api('/api/users/logout','POST') } finally { location.href='/' }});

/* ---------- State ---------- */
let page=1, pages=1, loading=false, cache=[], mine=[];
function hasImage(p){ const imgs=Array.isArray(p.images)?p.images:[]; return imgs.some(u=> typeof u==='string' && u.trim().length); }
function isMine(post, me){
  if (!me || !post) return false;
  const meId = me._id || me.id || me.user?._id || me.user?.id || null;
  const a = post.author || {}; const aId = a._id || a.id || null;
  if (meId && aId && String(meId)===String(aId)) return true;
  const meUsername = me.username || me.user?.username || null;
  if (meUsername && a.username && String(meUsername)===String(a.username)) return true;
  const meEmail = me.email || me.user?.email || null;
  return !!(meEmail && a.email && String(meEmail)===String(a.email));
}

/* ---------- Skeletons ---------- */
function skeletonGrid(targetUl, n=6){
  const ul=$(targetUl); if(!ul) return; ul.innerHTML='';
  for(let i=0;i<n;i++){ const li=document.createElement('li'); li.className='card skeleton';
    li.innerHTML = `
      <div class="card__media skel"></div>
      <div class="card__body">
        <div class="line skel" style="width:70%"></div>
        <div class="line skel" style="width:40%"></div>
      </div>
      <div class="card__actions">
        <button class="btn" disabled>Preview</button>
        <button class="btn" disabled>Edit</button>
      </div>`;
    ul.appendChild(li);
  }
}

/* ---------- Render posts ---------- */
function cardTemplate(p){
  const title = htmlEscape(p.title || '');
  const when  = p.createdAt ? fmtExact(p.createdAt) : '';
  const img   = hasImage(p) ? toImageUrl(p.images[0]) : null;

  const li = document.createElement('li');
  li.className = 'card' + (img ? '' : ' card--noimg');
  li.innerHTML = `
    <a class="card__media" href="${img || '#'}" ${img ? 'target="_blank" rel="noopener"' : ''}>
      ${img ? `<img src="${img}" alt="">` : ''}
    </a>
    <div class="card__body">
      <h3 class="card__title">${title || '(No title)'}</h3>
      <div class="card__meta">
        <span>${when}</span>
        <span>${(p.status || 'published')}</span>
      </div>
    </div>
    <div class="card__actions">
      <button class="btn" data-action="preview">Preview</button>
      <button class="btn" data-action="edit">Edit</button>
      <button class="btn btn-danger" data-action="delete">Delete</button>
    </div>
  `;

  li.querySelector('[data-action="preview"]')?.addEventListener('click', (e)=>{ e.preventDefault(); openPreview(p); });
  li.querySelector('[data-action="edit"]')?.addEventListener('click', (e)=>{ e.preventDefault(); openEdit(p); });
  li.querySelector('[data-action="delete"]')?.addEventListener('click', async (e)=>{
    e.preventDefault();
    try{
      await api(`/api/posts/${p._id || p.id}`, 'DELETE');
      showToast('Post deleted ✔','ok');
      page=1; pages=1; cache=[]; mine=[]; await loadMine();
    }catch(err){ showToast(err.message || 'Failed to delete','error') }
  });

  return li;
}
function renderGridTo(ulSelector, items){
  const ul=$(ulSelector); if(!ul) return; ul.innerHTML=''; for(const p of items) ul.appendChild(cardTemplate(p));
}
function renderTwoGrids(filtered){
  const withArr=filtered.filter(hasImage); const noArr=filtered.filter(p=>!hasImage(p));
  renderGridTo('#gridWith', withArr); renderGridTo('#gridNo', noArr);
  $('#emptyWith')?.classList.toggle('hidden', withArr.length!==0);
  $('#emptyNo')?.classList.toggle('hidden',  noArr.length!==0);
  $('#countWith')?.replaceChildren(document.createTextNode(`(${withArr.length})`));
  $('#countNo')?.replaceChildren(document.createTextNode(`(${noArr.length})`));
}

/* ---------- Quick view modal ---------- */
const viewModal=$('#viewModal'), viewBody=$('#viewBody');
function lockScroll(yes){ document.body.style.overflow = yes ? 'hidden' : '' }
function openView(){ viewModal?.classList.remove('hidden'); lockScroll(true) }
function closeView(){ viewModal?.classList.add('hidden');  lockScroll(false) }
$('#closeView')?.addEventListener('click', closeView);
viewModal?.addEventListener('click', (e)=>{ if(e.target===viewModal) closeView() });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !viewModal?.classList.contains('hidden')) closeView() });
function openPreview(p){
  $('#viewTitle')?.replaceChildren(document.createTextNode(p.title || 'Post'));
  const img = hasImage(p) ? `<img class="view-cover" src="${toImageUrl(p.images[0])}" alt="">` : '';
  if(viewBody){ viewBody.innerHTML = `${img}<div><div class="muted" style="margin-bottom:6px">${fmtExact(p.createdAt||Date.now())}</div><h3 style="margin:.2em 0">${htmlEscape(p.title||'(No title)')}</h3><p style="margin:.4em 0; white-space:pre-wrap">${htmlEscape(p.content||'')}</p></div>`}
  openView();
}

/* ---------- Filters & stats ---------- */
function currentQuery(){ return { q: ($('#q')?.value||'').trim().toLowerCase(), imagesOnly: !!$('#imagesOnly')?.checked, sort: $('#sort')?.value || 'new' } }
function applyLocal(items){
  const {q,sort}=currentQuery();
  let out = items.filter(p=>{ if(q){ const hay=`${p.title??''} ${p.content??''}`.toLowerCase(); if(!hay.includes(q)) return false } return true });
  if (sort==='new') out.sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  else if (sort==='old') out.sort((a,b)=> new Date(a.createdAt)-new Date(b.createdAt));
  else if (sort==='title') out.sort((a,b)=> (a.title||'').localeCompare(b.title||''));
  return out;
}
function syncNoSectionVisibility(){ const only=!!$('#imagesOnly')?.checked; $('#sectionNo')?.classList.toggle('hidden', only) }
function updateStats(all, filtered){
  const total=all.length, withImgAll=all.filter(hasImage).length, withImgFiltered=filtered.filter(hasImage).length, noImgFiltered=filtered.length-withImgFiltered;
  $('#heroStats')?.replaceChildren(...[`Total: ${total}`,`Posts: ${withImgAll}`,`Statuses: ${noImgFiltered}`].map(t=>{ const s=document.createElement('span'); s.className='stat-pill'; s.textContent=t; return s; }));
}
function refreshGrids(){ const filtered=applyLocal(mine); renderTwoGrids(filtered); updateStats(mine,filtered); syncNoSectionVisibility(); }

/* ---------- Data load (my posts) ---------- */
async function loadMine({append=false}={}){
  if(loading) return; loading=true;
  if(!append){ skeletonGrid('#gridWith',6); skeletonGrid('#gridNo',4) }
  try{
    const params=new URLSearchParams(); params.set('mine','true'); params.set('page',String(page)); params.set('limit','24');
    const data=await api('/api/posts?'+params.toString());
    pages = Array.isArray(data) ? 1 : (data.pages || 1);
    const items = Array.isArray(data) ? data : (data.items || []);
    if(!append) cache=[]; cache=cache.concat(items);
    mine = cache.filter(p=> isMine(p, CURRENT_USER));
    refreshGrids();
  }catch(e){
    console.error(e);
    if(!append){ $('#gridWith') && ($('#gridWith').innerHTML=''); $('#gridNo') && ($('#gridNo').innerHTML=''); $('#emptyWith')?.classList.remove('hidden'); $('#emptyNo')?.classList.remove('hidden'); }
  }finally{ loading=false }
}
function nearBottom(){ const px=document.documentElement.scrollHeight-(window.scrollY+window.innerHeight); return px<300 }
window.addEventListener('scroll', async ()=>{ if(nearBottom() && !loading && page<pages){ page++; await loadMine({append:true}) }});
$('#q')?.addEventListener('input', refreshGrids); $('#imagesOnly')?.addEventListener('change', refreshGrids); $('#sort')?.addEventListener('change', refreshGrids);

/* ---------- Create post modal ---------- */
const modal=$('#modal');
function openModal(){ modal?.classList.remove('hidden'); lockScroll(true) }
function closeModal(){ modal?.classList.add('hidden');   lockScroll(false) }
$('#newPostBtn')?.addEventListener('click', openModal);
$('#emptyNewPost1')?.addEventListener('click', openModal);
$('#emptyNewPost2')?.addEventListener('click', openModal);
$('#closeModal')?.addEventListener('click', closeModal);
$('#cancelPost')?.addEventListener('click', closeModal);
modal?.addEventListener('click',(e)=>{ if(e.target===modal) closeModal() });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !modal?.classList.contains('hidden')) closeModal() });

const imageFileEl=document.querySelector('input[name="imageFile"]'); const previewBox=$('#imagePreview');
imageFileEl?.addEventListener('change',()=>{ const f=imageFileEl.files?.[0]; if(!f){ previewBox?.classList.add('hidden'); if(previewBox) previewBox.innerHTML=''; return } const url=URL.createObjectURL(f); if(previewBox){ previewBox.innerHTML=`<img src="${url}" alt="preview"><small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>`; previewBox.classList.remove('hidden') }});
async function uploadImage(file){ const fd=new FormData(); fd.append('image',file); const res=await fetch('/api/uploads',{method:'POST',body:fd,credentials:'include'}); if(!res.ok){ const txt=await res.text().catch(()=> ''); throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`)} return await res.json() }
function clearFormFields(form){ form.reset(); if(previewBox){ previewBox.classList.add('hidden'); previewBox.innerHTML='' } }
$('#clearForm')?.addEventListener('click',()=>{ const f=$('#postForm'); if(f) clearFormFields(f) });
$('#postForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault(); const f=e.target;
  const title=f.title.value.trim(); const content=f.content.value.trim();
  if(!title || !content) return showToast('Please fill title and content','error');
  try{
    const payload={ title, content, status:'published' };
    const imgFile=f.imageFile?.files?.[0];
    if(imgFile){ const {url}=await uploadImage(imgFile); if(url) payload.images=[url] }
    await api('/api/posts','POST',payload);
    closeModal(); clearFormFields(f); page=1; pages=1; cache=[]; mine=[]; await loadMine(); window.scrollTo({top:0,behavior:'smooth'}); showToast('Post published ✔','ok');
  }catch(err){ showToast('Create post error: '+err.message,'error') }
});

/* ---------- Settings ---------- */
const settingsModal=$('#settingsModal'), settingsForm=$('#settingsForm');
$('#openSettings')?.addEventListener('click',(e)=>{ e.preventDefault(); openSettings() });
$('#closeSettings')?.addEventListener('click', closeSettings);
$('#cancelSettings')?.addEventListener('click', closeSettings);
settingsModal?.addEventListener('click',(e)=>{ if(e.target===settingsModal) closeSettings() });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !settingsModal?.classList.contains('hidden')) closeSettings() });
function openSettings(){ prefillSettings(); settingsModal?.classList.remove('hidden'); document.body.style.overflow='hidden' }
function closeSettings(){ settingsModal?.classList.add('hidden'); document.body.style.overflow='' }
async function prefillSettings(){ try{ const me=CURRENT_USER || await api('/api/users/me'); CURRENT_USER=me; settingsForm.username.value = me?.username || me?.user?.username || ''; settingsForm.email.value = me?.email || me?.user?.email || ''; settingsForm.currentPassword.value=''; settingsForm.newPassword.value=''; settingsForm.confirmPassword.value=''; }catch{} }
async function tryProfileUpdate(body){
  const endpoints=[{url:'/api/users/me',method:'PATCH'},{url:'/api/users/profile',method:'PATCH'},{url:'/api/users/update',method:'PUT'}];
  for(const ep of endpoints){ try{ await api(ep.url, ep.method, body); return true }catch(e){ if(String(e.message).match(/^(400|404|405)/)) continue; throw e } }
  throw new Error('Profile update endpoint not found');
}
async function tryPasswordChange(currentPassword, newPassword){
  const options=[{url:'/api/users/change-password',method:'POST',body:{currentPassword,newPassword}},{url:'/api/users/me/password',method:'PATCH',body:{currentPassword,newPassword}},{url:'/api/users/password',method:'PUT',body:{currentPassword,newPassword}}];
  for(const ep of options){ try{ await api(ep.url, ep.method, ep.body); return true }catch(e){ if(String(e.message).match(/^(400|404|405)/)) continue; throw e } }
  throw new Error('Password change endpoint not found');
}
$('#saveSettings')?.addEventListener('click', (e)=>{ e.preventDefault(); settingsForm?.requestSubmit() });
settingsForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const username=settingsForm.username.value.trim(); const email=settingsForm.email.value.trim();
  const currentPassword=settingsForm.currentPassword.value; const newPassword=settingsForm.newPassword.value; const confirmPassword=settingsForm.confirmPassword.value;
  if((newPassword || confirmPassword)){ if(newPassword.length<6) return showToast('Password must be at least 6 chars','error'); if(newPassword!==confirmPassword) return showToast('New passwords do not match','error'); if(!currentPassword) return showToast('Enter current password to change it','error'); }
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast('Invalid email','error');
  $('#saveSettings')?.setAttribute('disabled','disabled');
  try{
    const toUpdate={}; if(username) toUpdate.username=username; if(email) toUpdate.email=email;
    if(Object.keys(toUpdate).length){ await tryProfileUpdate(toUpdate) }
    if(newPassword){ await tryPasswordChange(currentPassword,newPassword) }
    try{ const me=await api('/api/users/me'); CURRENT_USER=me; const un=me?.username||me?.user?.username||'User'; const bio=me?.bio||'Your posts and stats'; $('#userBadge')?.replaceChildren(document.createTextNode(`Signed in as ${un}`)); $('#profileName')?.replaceChildren(document.createTextNode(un)); $('#profileSubtitle')?.replaceChildren(document.createTextNode(bio)); }catch{}
    showToast('Settings saved ✔','ok'); closeSettings();
  }catch(err){ showToast(err.message || 'Failed to save settings','error') }
  finally{ $('#saveSettings')?.removeAttribute('disabled') }
});

/* ---------- Edit post modal ---------- */
const editModal=$('#editModal'), editForm=$('#editForm'), closeEditBtn=$('#closeEdit'), cancelEditBtn=$('#cancelEdit'), editPreviewBox=$('#editPreviewBox'), editImageInput=editForm?.querySelector('input[name="imageFile"]'), editImagePreview=$('#editImagePreview');
let EDIT_POST_ID=null;
function openEdit(p){
  EDIT_POST_ID = p._id || p.id;
  $('#editTitle')?.replaceChildren(document.createTextNode(`Edit: ${p.title || 'Post'}`));
  editPreviewBox.innerHTML = hasImage(p) ? `<img class="view-cover" src="${toImageUrl(p.images[0])}" alt="">` : `<div class="muted">No image</div>`;
  editForm.title.value = p.title || ''; editForm.content.value = p.content || ''; editForm.removeImage.checked=false;
  if(editImagePreview){ editImagePreview.classList.add('hidden'); editImagePreview.innerHTML='' }
  if(editImageInput) editImageInput.value='';
  editModal?.classList.remove('hidden'); lockScroll(true);
}
function closeEdit(){ editModal?.classList.add('hidden'); lockScroll(false); EDIT_POST_ID=null }
closeEditBtn?.addEventListener('click', closeEdit); cancelEditBtn?.addEventListener('click', closeEdit);
editModal?.addEventListener('click',(e)=>{ if(e.target===editModal) closeEdit() });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !editModal?.classList.contains('hidden')) closeEdit() });
editImageInput?.addEventListener('change', ()=>{ const f=editImageInput.files?.[0]; if(!f){ editImagePreview?.classList.add('hidden'); if(editImagePreview) editImagePreview.innerHTML=''; return } const url=URL.createObjectURL(f); if(editImagePreview){ editImagePreview.innerHTML=`<img src="${url}" alt="preview"><small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>`; editImagePreview.classList.remove('hidden') }});
editForm?.addEventListener('submit', async (e)=>{
  e.preventDefault(); if(!EDIT_POST_ID) return showToast('No post selected','error');
  const title=editForm.title.value.trim(); const content=editForm.content.value.trim(); const removeImage=!!editForm.removeImage.checked;
  if(!title || !content) return showToast('Title and text are required','error');
  try{
    const payload={ title, content }; const newFile=editImageInput?.files?.[0];
    if(removeImage) payload.images=[]; else if(newFile){ const {url}=await uploadImage(newFile); if(url) payload.images=[url] }
    await api(`/api/posts/${EDIT_POST_ID}`,'PATCH',payload);
    closeEdit(); page=1; pages=1; cache=[]; mine=[]; await loadMine(); showToast('Post updated ✔','ok');
  }catch(err){ showToast(err.message || 'Failed to update post','error') }
});

/* ---------- Groups: list + create ---------- */
const gridAdminGroups = $('#gridAdminGroups');
// חשוב: ב-HTML אין אלמנט עם id="gridMemberGroups", לכן נשתמש ב-#gridMyGroups
const gridMemberGroups= $('#gridMyGroups');

function groupCardTemplate(g){
  const id    = g._id || g.id;
  const name  = g.name || 'Group';
  const desc  = g.description || '';
  const coverUrl = getGroupCoverUrl(g);

  // ← זה כל הקסם: קביעה האם המשתמש הנוכחי הוא הבעלים
  const ownerId  = String(g.owner?._id || g.owner || '');
  const meId     = String(CURRENT_USER?._id || CURRENT_USER?.id || '');
  const isOwner  = ownerId && meId && ownerId === meId;

  const li = document.createElement('li');
  li.className = 'group-card';
  li.innerHTML = `
    <div class="group-card__head">
      <a class="group-card__avatar" aria-label="${htmlEscape(name)}">
        ${
          coverUrl
            ? `<img src="${coverUrl}" alt="${htmlEscape(name)}"
                  loading="lazy"
                  onerror="this.closest('.group-card__avatar').innerHTML=\`${avatarFallbackHtml(htmlEscape(name)).replace(/`/g,'\\`')}\`;"/>`
            : `${avatarFallbackHtml(name)}`
        }
      </a>
      <h4 class="group-card__name" title="${htmlEscape(name)}">${htmlEscape(name)}</h4>
    </div>

    <p class="group-card__desc">${htmlEscape(desc)}</p>

    <div class="group-card__foot">
      <div style="display:flex; gap:8px">
        <button class="btn" data-action="members" data-id="${id}" data-name="${htmlEscape(name)}">Members</button>
        ${isOwner ? `<button class="btn btn-danger" data-action="delete">Delete</button>` : ''}
      </div>
    </div>
  `;

  li.querySelector('[data-action="members"]')?.addEventListener('click', (e)=>{
    e.preventDefault();
    openMembersModal(id, name);
  });

  if (isOwner) {
    li.querySelector('[data-action="delete"]')?.addEventListener('click', async (e)=>{
      e.preventDefault();
      try{
        const ok = await deleteGroupById(id);
        if (ok) li.remove();
      }catch(err){
        showToast(err.message || 'Failed to delete group','error');
      }
    });
  }

  return li;
}

function renderMyGroups(groups){
  const ul = document.getElementById('gridMyGroups');
  if(!ul) return;
  ul.innerHTML = '';
  groups.forEach(g => ul.appendChild(groupCardTemplate(g)));
}

function renderGroupLists(adminGroups, memberGroups){
  gridAdminGroups?.replaceChildren();
  gridMemberGroups?.replaceChildren();
  adminGroups.forEach(g=> gridAdminGroups?.appendChild(groupCardTemplate(g, { isOwner:true })));
  memberGroups.forEach(g=> gridMemberGroups?.appendChild(groupCardTemplate(g, { isOwner:false })));
  // הגנות: אלמנטים מונים/ריקים אולי לא קיימים ב-HTML הנוכחי
  $('#countAdminGroups')?.replaceChildren(document.createTextNode(`(${adminGroups.length})`));
  $('#countMemberGroups')?.replaceChildren(document.createTextNode(`(${memberGroups.length})`));
  $('#emptyAdminGroups')?.classList.toggle('hidden', adminGroups.length!==0);
  $('#emptyMemberGroups')?.classList.toggle('hidden', memberGroups.length!==0);
}

async function loadGroups(){
  try{
    const data = await api('/api/groups?mine=1');
    const a = Array.isArray(data?.admin) ? data.admin : (data?.adminGroups || data?.admins || []);
    const m = Array.isArray(data?.member)? data.member: (data?.memberGroups|| data?.members || []);
    if ((a && a.length) || (m && m.length)){ return renderGroupLists(a||[],m||[]) }
    if (Array.isArray(data)){
      const admin = data.filter(g=> g.role==='admin' || g.isOwner || g.createdBy === (CURRENT_USER?._id || CURRENT_USER?.id));
      const member= data.filter(g=> !(admin.includes(g)));
      renderMyGroups(Array.isArray(data) ? data : (data.items || []));
      return renderGroupLists(admin, member);
    }
  }catch{}

  try{
    const data2 = await api('/api/groups/mine');
    const admin = data2.admin || data2.adminGroups || [];
    const member= data2.member|| data2.memberGroups|| [];
    return renderGroupLists(admin, member);
  }catch{}

  try{
    const data3 = await api('/api/groups?member=me');
    const admin = Array.isArray(data3) ? data3.filter(g=> g.role==='admin' || g.isOwner) : (data3.admin || []);
    const member= Array.isArray(data3) ? data3.filter(g=> !(g.role==='admin'||g.isOwner)) : (data3.member||[]);
    return renderGroupLists(admin, member);
  }catch(e){
    console.warn('loadGroups fallback failed', e.message);
  }

  renderGroupLists([],[]);
}

/* Create Group modal */
const groupModal=$('#groupModal'), groupForm=$('#groupForm');
const openCreateGroup=$('#openCreateGroup'), openCreateGroup2=$('#openCreateGroup2');
const closeGroupBtn=$('#closeGroup'), cancelGroupBtn=$('#cancelGroup');
const groupCoverInput=groupForm?.coverFile;
const groupCoverPreview=$('#groupCoverPreview');

function openGroupModal(){
  groupForm?.reset();
  if(groupCoverPreview){ groupCoverPreview.classList.add('hidden'); groupCoverPreview.innerHTML='' }
  groupModal?.classList.remove('hidden'); lockScroll(true)
}
function closeGroupModal(){ groupModal?.classList.add('hidden'); lockScroll(false) }
openCreateGroup?.addEventListener('click', openGroupModal);
openCreateGroup2?.addEventListener('click', openGroupModal);
$('#emptyCreateGroup1')?.addEventListener('click', openGroupModal);
$('#emptyCreateGroup2')?.addEventListener('click', openGroupModal);
closeGroupBtn?.addEventListener('click', closeGroupModal);
cancelGroupBtn?.addEventListener('click', closeGroupModal);
groupModal?.addEventListener('click',(e)=>{ if(e.target===groupModal) closeGroupModal() });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !groupModal?.classList.contains('hidden')) closeGroupModal() });

groupCoverInput?.addEventListener('change', async ()=>{
  const f = groupCoverInput.files?.[0];
  LAST_UPLOADED_GROUP_COVER_URL = null;

  if(!f){
    groupCoverPreview?.classList.add('hidden');
    if(groupCoverPreview) groupCoverPreview.innerHTML='';
    return;
  }

  const localUrl = URL.createObjectURL(f);
  if(groupCoverPreview){
    groupCoverPreview.innerHTML = `
      <img src="${localUrl}" alt="preview" style="max-width:180px;border-radius:12px">
      <small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>
      <small class="muted" id="groupCoverStatus">Uploading…</small>
    `;
    groupCoverPreview.classList.remove('hidden');
  }

  try{
    const { url } = await uploadImage(f);
    LAST_UPLOADED_GROUP_COVER_URL = url || null;

    if(url && groupCoverPreview){
      groupCoverPreview.querySelector('img').src = toImageUrl(url);
      const st = groupCoverPreview.querySelector('#groupCoverStatus');
      if(st) st.textContent = 'Uploaded ✓';
    }
  }catch(err){
    const st = groupCoverPreview?.querySelector('#groupCoverStatus');
    if(st) st.textContent = 'Upload failed';
    showToast(err.message || 'Upload failed', 'error');
  }
});

async function uploadGroupCoverIfAny(){
  const f=groupCoverInput?.files?.[0]; if(!f) return null;
  const { url } = await uploadImage(f);
  return url || null;
}

groupForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = groupForm.name.value.trim();
  const description = groupForm.description.value.trim();
  const visibility = groupForm.visibility?.value || 'public'; // ✅ מונע קריסה כשאין שדה

  if(!name || !description) return showToast('Name & description are required','error');

  try{
    const payload = { name, description, isPublic: visibility === 'public' };
    if (LAST_UPLOADED_GROUP_COVER_URL) payload.coverImage = LAST_UPLOADED_GROUP_COVER_URL;

    const endpoints = [
      { url:'/api/groups', method:'POST', body:payload },
      { url:'/api/groups/create', method:'POST', body:payload },
      { url:'/api/groups/new', method:'POST', body:payload },
    ];
    let ok=false;
    for (const ep of endpoints){
      try{ await api(ep.url, ep.method, ep.body); ok=true; break }
      catch(err){ if(/^(400|404|405)/.test(String(err.message))) continue; throw err }
    }
    if(!ok) throw new Error('Group create endpoint not found');

    showToast('Group created ✔','ok');
    LAST_UPLOADED_GROUP_COVER_URL = null;
    closeGroupModal();
    await loadGroups();
  }catch(err){
    showToast(err.message || 'Failed to create group','error');
  }
});

// ===== Members Modal Logic =====
const membersModal   = $('#membersModal');
const closeMembersBtn= $('#closeMembers');
const membersListEl  = $('#membersList');
const membersEmptyEl = $('#membersEmpty');
const membersSearch  = $('#membersSearch');
const membersCountEl = $('#membersCount');

let MEMBERS_GROUP_ID   = null;
let MEMBERS_GROUP_NAME = '';
let MEMBERS_CAN_REMOVE = false;
let MEMBERS_DATA       = [];
let MEMBERS_FILTERED   = [];

function openMembersModal(groupId, groupName){
  MEMBERS_GROUP_ID = groupId;
  MEMBERS_GROUP_NAME = groupName || 'Group';
  $('#membersTitle')?.replaceChildren(document.createTextNode(`Members • ${groupName || 'Group'}`));
  membersModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  loadMembers();
}

function closeMembersModal(){
  membersModal?.classList.add('hidden');
  document.body.style.overflow = '';
  MEMBERS_GROUP_ID = null;
  MEMBERS_DATA = [];
  MEMBERS_FILTERED = [];
  MEMBERS_CAN_REMOVE = false;
  if (membersListEl) membersListEl.innerHTML = '';
}

closeMembersBtn?.addEventListener('click', closeMembersModal);
membersModal?.addEventListener('click', (e)=>{ if(e.target === membersModal) closeMembersModal(); });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && !membersModal?.classList.contains('hidden')) closeMembersModal(); });

async function loadMembers(){
  if (!MEMBERS_GROUP_ID) return;
  if (membersListEl){
    membersListEl.innerHTML = '';
    for (let i=0;i<3;i++){
      const li=document.createElement('li');
      li.className='member-row skeleton';
      li.innerHTML = `<div class="member-main">
        <div class="member-avatar skel"></div>
        <div class="member-meta" style="flex:1">
          <div class="line skel" style="width:60%"></div>
          <div class="line skel" style="width:40%"></div>
        </div>
      </div>`;
      membersListEl.appendChild(li);
    }
  }

  try{
    const res = await api(`/api/groups/${encodeURIComponent(MEMBERS_GROUP_ID)}/members`, 'GET');
    MEMBERS_CAN_REMOVE = !!res.canRemove;
    MEMBERS_DATA = Array.isArray(res.members) ? res.members : [];
    applyMembersFilter();
  }catch(err){
    if (membersListEl) membersListEl.innerHTML = `<li class="member-row"><div class="member-main"><div class="member-meta"><div class="member-name">Error</div><div class="member-sub">${htmlEscape(err.message)}</div></div></div></li>`;
    MEMBERS_CAN_REMOVE = false;
    MEMBERS_DATA = [];
    applyMembersFilter();
  }
}

function applyMembersFilter(){
  const q = (membersSearch?.value || '').trim().toLowerCase();
  MEMBERS_FILTERED = MEMBERS_DATA.filter(m => {
    const hay = `${m.username || ''} ${m.email || ''}`.toLowerCase();
    return !q || hay.includes(q);
  });
  renderMembersList();
}

membersSearch?.addEventListener('input', applyMembersFilter);

function renderMembersList(){
  if (!membersListEl) return;
  membersListEl.innerHTML = '';

  if (!MEMBERS_FILTERED.length){
    membersEmptyEl?.classList.remove('hidden');
  } else {
    membersEmptyEl?.classList.add('hidden');
  }

  membersCountEl?.replaceChildren(document.createTextNode(`(${MEMBERS_DATA.length})`));

  for (const m of MEMBERS_FILTERED){
    const li = document.createElement('li');
    li.className = 'member-row';
    const uname = htmlEscape(m.username || 'User');
    const email = htmlEscape(m.email || '');

    li.innerHTML = `
      <div class="member-main">
        <div class="member-avatar">${(uname[0]||'U').toUpperCase()}</div>
        <div class="member-meta">
          <div class="member-name">${uname}</div>
          <div class="member-sub">${email}</div>
        </div>
      </div>
      <div class="member-actions">
        ${MEMBERS_CAN_REMOVE ? `<button class="btn btn-danger" data-remove="${m._id}">Remove</button>` : ''}
      </div>
    `;

    if (MEMBERS_CAN_REMOVE){
      const btn = li.querySelector('[data-remove]');
      btn?.addEventListener('click', async (e)=>{
        e.preventDefault();

        const userId = e.currentTarget.dataset.remove || e.currentTarget.getAttribute('data-remove');
        if (!userId) { showToast('No user id','error'); return; }

        const ok = confirm(`Remove ${m.username || 'this member'} from "${MEMBERS_GROUP_NAME}"?`);
        if (!ok) return;

        try{
          // נטרל לחיצה כפולה
          btn.disabled = true;

          const url = `/api/groups/${encodeURIComponent(MEMBERS_GROUP_ID)}/members/${encodeURIComponent(userId)}`;
          await api(url, 'DELETE');

          // הסרה מקומית
          MEMBERS_DATA = MEMBERS_DATA.filter(x => String(x._id) !== String(userId));
          applyMembersFilter();

          // עדכון מונה בכרטיס קבוצה (אם קיים בעמוד)
          const pill = document.querySelector(`[data-members-count="${MEMBERS_GROUP_ID}"]`);
          if (pill){
            pill.textContent = `${MEMBERS_DATA.length} members`;
          }

          showToast('Member removed ✔','ok');
        }catch(err){
          showToast(err.message || 'Failed to remove member','error');
        }finally{
          btn.disabled = false;
        }
      });
    }


    membersListEl.appendChild(li);
  }
}

/* ---------- Init ---------- */
async function init(){
  await loadUser();
  page=1; pages=1;
  await Promise.all([ loadMine(), loadGroups() ]);
  syncNoSectionVisibility();
}
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init) } else { init() }
