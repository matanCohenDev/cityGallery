// =====================
// CityGallery — Profile
// Clean rewrite: helpers, API, UI, rendering, modals, filters, paging
// =====================

// ----- tiny helpers -----
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function htmlEscape(s){
  return String(s ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function fmtExact(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// ----- API -----
async function api(path, method = 'GET', body) {
  const isForm = body instanceof FormData;
  const headers = isForm ? {} : { 'Content-Type': 'application/json' };
  const res = await fetch(path, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
    credentials: 'include'
  });
  let data = {};
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

// ===================== USER HEADER =====================
let CURRENT_USER = null;

async function loadUser() {
  try {
    const me = await api('/api/users/me');
    CURRENT_USER = me || null;

    const username = me?.username || me?.user?.username || 'User';
    const bio = me?.bio || 'Your posts and stats';

    $('#userBadge')?.replaceChildren(document.createTextNode(`Signed in as ${username}`));
    $('#profileName')?.replaceChildren(document.createTextNode(username));
    $('#profileSubtitle')?.replaceChildren(document.createTextNode(bio));

    return me;
  } catch {
    $('#userBadge')?.replaceChildren(document.createTextNode('Not signed in'));
    CURRENT_USER = null;
    return null;
  }
}

// Logout
$('#logoutBtn')?.addEventListener('click', async () => {
  try { await api('/api/users/logout', 'POST'); }
  catch (e) { console.warn('Logout error:', e.message); }
  finally {
    CURRENT_USER = null;
    location.href = '/index.html';
  }
});

// ===================== STATE =====================
let page = 1;
let pages = 1;
let loading = false;
let cache = []; // מה שנטען מהשרת
let mine  = []; // רק שלי

// זיהוי פוסט שהוא שלי
function isMine(post, me) {
  if (!me || !post) return false;
  const meId = me._id || me.id || me.user?._id || me.user?.id || null;
  const meUsername = me.username || me.user?.username || null;
  const meEmail = me.email || me.user?.email || null;

  const a = post.author || {};
  const aId = a._id || a.id || null;
  const aUsername = a.username || null;
  const aEmail = a.email || null;

  if (meId && aId && String(meId) === String(aId)) return true;
  if (meUsername && aUsername && String(meUsername) === String(aUsername)) return true;
  if (meEmail && aEmail && String(meEmail) === String(aEmail)) return true;
  return false;
}

function hasImage(p){
  const imgs = Array.isArray(p.images) ? p.images : [];
  return imgs.some(u => typeof u === 'string' && u.trim().length);
}

// ===================== SKELETONS =====================
function skeletonGrid(targetUl, n = 6) {
  const ul = $(targetUl);
  if (!ul) return;
  ul.innerHTML = '';
  for (let i=0;i<n;i++){
    const li = document.createElement('li');
    li.className = 'card skeleton';
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

// ===================== RENDER =====================
function cardTemplate(p){
  const title = htmlEscape(p.title || '');
  const when  = p.createdAt ? fmtExact(p.createdAt) : '';
  const img   = hasImage(p) ? p.images[0] : null;

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
    </div>
  `;

  li.querySelector('[data-action="preview"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    openPreview(p);
  });
  li.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    alert('Hook your editor route here, e.g. /pages/editor.html?id=' + (p._id || p.id));
  });

  return li;
}

function renderGridTo(ulSelector, items){
  const ul = $(ulSelector);
  if (!ul) return;
  ul.innerHTML = '';
  for (const p of items) ul.appendChild(cardTemplate(p));
}

function renderTwoGrids(filtered){
  const withArr = filtered.filter(hasImage);
  const noArr   = filtered.filter(p => !hasImage(p));

  renderGridTo('#gridWith', withArr);
  renderGridTo('#gridNo',   noArr);

  // empty states
  $('#emptyWith')?.classList.toggle('hidden', withArr.length !== 0);
  $('#emptyNo')?.classList.toggle('hidden', noArr.length   !== 0);

  // counts
  $('#countWith')?.replaceChildren(document.createTextNode(`(${withArr.length})`));
  $('#countNo')?.replaceChildren(document.createTextNode(`(${noArr.length})`));
}

// ===================== QUICK VIEW MODAL =====================
const viewModal = $('#viewModal');
const viewBody  = $('#viewBody');

function lockScroll(yes){ document.body.style.overflow = yes ? 'hidden' : ''; }

function openView(){ viewModal?.classList.remove('hidden'); lockScroll(true); }
function closeView(){ viewModal?.classList.add('hidden');  lockScroll(false); }

$('#closeView')?.addEventListener('click', closeView);
viewModal?.addEventListener('click', (e)=>{ if (e.target === viewModal) closeView(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape' && !viewModal?.classList.contains('hidden')) closeView(); });

function openPreview(p){
  $('#viewTitle')?.replaceChildren(document.createTextNode(p.title || 'Post'));
  const img = hasImage(p) ? `<img class="view-cover" src="${p.images[0]}" alt="">` : '';
  if (viewBody){
    viewBody.innerHTML = `
      ${img}
      <div>
        <div class="muted" style="margin-bottom:6px">${fmtExact(p.createdAt || Date.now())}</div>
        <h3 style="margin:.2em 0">${htmlEscape(p.title || '(No title)')}</h3>
        <p style="margin:.4em 0; white-space:pre-wrap">${htmlEscape(p.content || '')}</p>
      </div>
    `;
  }
  openView();
}

// ===================== FILTERS & SORT =====================
function currentQuery(){
  return {
    q: ($('#q')?.value || '').trim().toLowerCase(),
    imagesOnly: !!$('#imagesOnly')?.checked,
    sort: $('#sort')?.value || 'new'
  };
}

function applyLocal(items){
  const { q, sort } = currentQuery();

  let out = items.filter(p => {
    if (q) {
      const hay = `${p.title ?? ''} ${p.content ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'new') out.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === 'old') out.sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
  else if (sort === 'title') out.sort((a,b)=> (a.title||'').localeCompare(b.title||''));

  return out; // imagesOnly נשלט ברמת סקשן
}

function syncNoSectionVisibility(){
  const only = !!$('#imagesOnly')?.checked;
  $('#sectionNo')?.classList.toggle('hidden', only);
}

function updateStats(all, filtered){
  const total = all.length;
  const withImgAll = all.filter(hasImage).length;
  const withImgFiltered = filtered.filter(hasImage).length;
  const noImgFiltered   = filtered.length - withImgFiltered;

  $('#heroStats')?.replaceChildren(
    ...[
      `Total: ${total}`,
      `Posts: ${withImgAll}`,
      `Statuses: ${noImgFiltered}`,
    ].map(t => { const s = document.createElement('span'); s.className='stat-pill'; s.textContent=t; return s; })
  );
}

function refreshGrids(){
  const filtered = applyLocal(mine);
  renderTwoGrids(filtered);
  updateStats(mine, filtered);
  syncNoSectionVisibility();
}

// ===================== DATA LOAD =====================
async function loadMine({append=false} = {}){
  if (loading) return;
  loading = true;

  if (!append) {
    skeletonGrid('#gridWith', 6);
    skeletonGrid('#gridNo',   4);
  }

  try{
    const params = new URLSearchParams();
    params.set('mine','true');
    params.set('page', String(page));
    params.set('limit','24');

    const data = await api('/api/posts?' + params.toString());
    pages = Array.isArray(data) ? 1 : (data.pages || 1);
    const items = Array.isArray(data) ? data : (data.items || []);

    if (!append) cache = [];
    cache = cache.concat(items);

    // רק שלי בצד לקוח
    mine = cache.filter(p => isMine(p, CURRENT_USER));
    refreshGrids();
  }catch(e){
    console.error(e);
    if (!append){
      $('#gridWith') && ($('#gridWith').innerHTML = '');
      $('#gridNo')   && ($('#gridNo').innerHTML   = '');
      $('#emptyWith')?.classList.remove('hidden');
      $('#emptyNo')?.classList.remove('hidden');
    }
  }finally{
    loading = false;
  }
}

// Infinite scroll
function nearBottom(){
  const px = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  return px < 300;
}
window.addEventListener('scroll', async ()=>{
  if (nearBottom() && !loading && page < pages){
    page++;
    await loadMine({append:true});
  }
});

// Live controls
$('#q')?.addEventListener('input', refreshGrids);
$('#imagesOnly')?.addEventListener('change', refreshGrids);
$('#sort')?.addEventListener('change', refreshGrids);

// ===================== CREATE-POST MODAL =====================
const modal = $('#modal');
function openModal(){ modal?.classList.remove('hidden'); lockScroll(true); }
function closeModal(){ modal?.classList.add('hidden');   lockScroll(false); }

$('#openCreatePost')?.addEventListener('click', openModal);
$('#newPostBtn')?.addEventListener('click', openModal);
$('#emptyNewPost1')?.addEventListener('click', openModal);
$('#emptyNewPost2')?.addEventListener('click', openModal);
$('#closeModal')?.addEventListener('click', closeModal);
$('#cancelPost')?.addEventListener('click', closeModal);
modal?.addEventListener('click', (e)=>{ if(e.target === modal) closeModal(); });
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal(); });

// Image file preview + upload helper
const imageFileEl = document.querySelector('input[name="imageFile"]');
const previewBox = $('#imagePreview');

imageFileEl?.addEventListener('change', () => {
  const f = imageFileEl.files?.[0];
  if (!f) { previewBox?.classList.add('hidden'); if(previewBox) previewBox.innerHTML = ''; return; }
  const url = URL.createObjectURL(f);
  if (previewBox){
    previewBox.innerHTML = `<img src="${url}" alt="preview"><small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>`;
    previewBox.classList.remove('hidden');
  }
});

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file); // upload.single('image')
  const res = await fetch('/api/uploads', { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`);
  }
  return await res.json(); // { url: "/uploads/xxxx.jpg" }
}

// Create post form
function clearFormFields(form){
  form.reset();
  if (previewBox){ previewBox.classList.add('hidden'); previewBox.innerHTML = ''; }
}

$('#clearForm')?.addEventListener('click', () => {
  const f = $('#postForm');
  if (f) clearFormFields(f);
});

$('#saveDraft')?.addEventListener('click', async () => {
  const f = $('#postForm');
  if (!f) return;
  const title = f.title.value.trim();
  const content = f.content.value.trim();
  const tags = f.tags?.value?.trim() || '';
  const location = f.location?.value?.trim() || '';
  const visibility = f.visibility?.value || 'public';
  const allowComments = !!f.allowComments?.checked;

  if (!title && !content) { return showToast('Nothing to save. Add a title or content', 'error'); }

  try {
    const payload = { title, content, tags, location, visibility, allowComments, status: 'draft' };
    await api('/api/posts', 'POST', payload);
    showToast('Draft saved ✔', 'ok');
    clearFormFields(f);
  } catch (e) {
    showToast('Save draft error: ' + e.message, 'error');
  }
});

$('#postForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;

  const title = f.title.value.trim();
  const content = f.content.value.trim();
  const tags = f.tags?.value?.trim() || '';
  const location = f.location?.value?.trim() || '';
  const visibility = f.visibility?.value || 'public';
  const allowComments = !!f.allowComments?.checked;

  if (!title || !content) { return showToast('Please fill title and content', 'error'); }

  try {
    const payload = { title, content, tags, location, visibility, allowComments, status: 'published' };

    const imgFile = f.imageFile?.files?.[0];
    if (imgFile) {
      const { url } = await uploadImage(imgFile);
      if (url) payload.images = [url];
    }

    await api('/api/posts', 'POST', payload);
    closeModal();
    clearFormFields(f);

    // רענון אחרי יצירה
    page = 1; pages = 1; cache = []; mine = [];
    await loadMine();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast('Post published ✔', 'ok');
  } catch (e) {
    showToast('Create post error: ' + e.message, 'error');
  }
});

// ===================== SETTINGS MODAL =====================
const settingsModal   = $('#settingsModal');
const settingsForm    = $('#settingsForm');
const btnOpenSettings = $('#openSettings');
const btnClose        = $('#closeSettings');
const btnCancel       = $('#cancelSettings');
const btnSave         = $('#saveSettings');
const toastEl         = $('#toast');

function showToast(msg, type='ok'){
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden','ok','error');
  toastEl.classList.add(type);
  setTimeout(()=> toastEl.classList.add('hidden'), 2200);
}

async function prefillSettings(){
  try{
    const me = CURRENT_USER || await api('/api/users/me');
    CURRENT_USER = me;
    const username = me?.username || me?.user?.username || '';
    const email    = me?.email    || me?.user?.email    || '';
    settingsForm.username.value = username;
    settingsForm.email.value    = email;
    settingsForm.currentPassword.value = '';
    settingsForm.newPassword.value     = '';
    settingsForm.confirmPassword.value = '';
  }catch(e){ /* ignore */ }
}

function openSettings(){
  if (!settingsModal) return;
  prefillSettings();
  settingsModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeSettings(){
  if (!settingsModal) return;
  settingsModal.classList.add('hidden');
  document.body.style.overflow = '';
}

btnOpenSettings?.addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
btnClose?.addEventListener('click', closeSettings);
btnCancel?.addEventListener('click', closeSettings);
settingsModal?.addEventListener('click', (e)=>{ if (e.target === settingsModal) closeSettings(); });
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && !settingsModal?.classList.contains('hidden')) closeSettings(); });

async function tryProfileUpdate(body){
  const endpoints = [
    { url: '/api/users/me',      method: 'PATCH' },
    { url: '/api/users/profile', method: 'PATCH' },
    { url: '/api/users/update',  method: 'PUT'   },
  ];
  for (const ep of endpoints){
    try{
      await api(ep.url, ep.method, body);
      return true;
    }catch(e){
      // המשך ניסיון אם זו שגיאת מסלול/מתוד
      if (String(e.message).match(/^(400|404|405)/)) continue;
      throw e;
    }
  }
  throw new Error('Profile update endpoint not found');
}

async function tryPasswordChange(currentPassword, newPassword){
  const options = [
    { url:'/api/users/change-password', method:'POST' , body:{ currentPassword, newPassword } },
    { url:'/api/users/me/password',     method:'PATCH', body:{ currentPassword, newPassword } },
    { url:'/api/users/password',        method:'PUT'  , body:{ currentPassword, newPassword } },
  ];
  for (const ep of options){
    try{
      await api(ep.url, ep.method, ep.body);
      return true;
    }catch(e){
      if (String(e.message).match(/^(400|404|405)/)) continue;
      throw e;
    }
  }
  throw new Error('Password change endpoint not found');
}

settingsForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username        = settingsForm.username.value.trim();
  const email           = settingsForm.email.value.trim();
  const currentPassword = settingsForm.currentPassword.value;
  const newPassword     = settingsForm.newPassword.value;
  const confirmPassword = settingsForm.confirmPassword.value;

  // ולידציה בסיסית
  if (newPassword || confirmPassword) {
    if (newPassword.length < 6)   return showToast('Password must be at least 6 chars', 'error');
    if (newPassword !== confirmPassword) return showToast('New passwords do not match', 'error');
    if (!currentPassword)         return showToast('Enter current password to change it', 'error');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return showToast('Invalid email', 'error');

  btnSave?.setAttribute('disabled','disabled');

  try{
    // עדכון פרופיל
    const toUpdate = {};
    if (username) toUpdate.username = username;
    if (email)    toUpdate.email    = email;
    if (Object.keys(toUpdate).length) {
      await tryProfileUpdate(toUpdate);
    }

    // שינוי סיסמה (אם ביקש)
    if (newPassword){
      await tryPasswordChange(currentPassword, newPassword);
    }

    // רענון תצוגה בראש
    try {
      const me = await api('/api/users/me');
      CURRENT_USER = me;
      const un = me?.username || me?.user?.username || 'User';
      const bio = me?.bio || 'Your posts and stats';
      $('#userBadge')?.replaceChildren(document.createTextNode(`Signed in as ${un}`));
      $('#profileName')?.replaceChildren(document.createTextNode(un));
      $('#profileSubtitle')?.replaceChildren(document.createTextNode(bio));
    } catch {}

    showToast('Settings saved ✔', 'ok');
    closeSettings();
  }catch(err){
    console.error(err);
    showToast(err.message || 'Failed to save settings', 'error');
  }finally{
    btnSave?.removeAttribute('disabled');
  }
});

// ===================== INIT =====================
async function init(){
  await loadUser();
  page = 1; pages = 1;
  await loadMine();
  syncNoSectionVisibility();
}

// Run when DOM is ready (defer on script as well)
if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
