// ===== tiny helpers =====
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function fmtExact(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

// unified JSON fetch
async function fetchJSON(path, method='GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  return { res, data };
}

// basic api (single attempt)
async function api(path, method='GET', body) {
  const { res, data } = await fetchJSON(path, method, body);
  if (!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

// multi-attempt API (helps avoid 404 on different servers)
async function apiTry(attempts, body) {
  let lastErr = new Error('Request failed');
  for (const { path, method } of attempts) {
    try {
      const { res, data } = await fetchJSON(path, method, body);
      if (res.ok) return data;
      // continue if "not found", try next route
      if (res.status === 404) { lastErr = new Error(data.message || res.statusText); continue; }
      // for other statuses, stop and throw
      throw new Error(data.message || data.msg || res.statusText);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// ===== header user state =====
let currentUser = null;

async function loadUser() {
  try {
    const me = await api('/api/users/me');
    $('#userBadge').textContent = `Signed in as ${me.username || me.user?.username || 'User'}`;
    currentUser = me.user || me; // normalize
    return currentUser;
  } catch {
    $('#userBadge').textContent = 'Not signed in';
    currentUser = null;
    return null;
  }
}

$('#logoutBtn')?.addEventListener('click', async () => {
  try {
    await api('/api/users/logout', 'POST');
    await loadUser();
  } catch (e) { alert('Logout error: ' + e.message); }
  window.location.href = '/';
});

// ===== profile posts state =====
let profilePosts = [];

// ===== render helpers =====
function htmlEscape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function heartSvg() {
  return `
    <svg class="heart" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>`;
}

// --- actions bar (likes/comments) ---
function makeActionsBar(p) {
  const likedClass = p.userLiked ? 'liked' : '';
  return `
    <div class="post__actions">
      <button class="icon-like ${likedClass}" data-id="${p._id}" aria-label="Like">
        ${heartSvg()}
        <span class="like-count">${p.likesCount ?? 0}</span>
      </button>
      <button class="preview-btn" data-id="${p._id}" aria-label="Open preview">
        Comments (<span class="comment-count">${p.commentsCount ?? 0}</span>)
      </button>
    </div>
  `;
}

// --- admin bar (edit/delete only — Preview removed) ---
function makeAdminBar(p){
  const id = p._id;
  return `
    <div class="post__admin">
      <button class="btn edit-btn"   data-id="${id}">✏️ Edit</button>
      <button class="btn btn-danger delete-btn" data-id="${id}">🗑️ Delete</button>
    </div>
  `;
}

function makePostCard(p) {
  const li = document.createElement('li');
  li.className = 'post';

  const author = p.author?.username || currentUser?.username || 'Unknown';
  const when   = p.createdAt ? fmtExact(p.createdAt) : '';
  const title  = htmlEscape(p.title || '');
  const text   = htmlEscape(p.content || '');

  li.innerHTML = `
    <div class="post__hdr">
      <div class="avatar" title="${author}"></div>
      <div class="hdr__meta">
        <span class="hdr__name">${author}</span>
        <span class="hdr__time">${when}</span>
      </div>
    </div>
    ${p.images?.[0] ? `
      <a class="post__img" href="${p.images[0]}" target="_blank" rel="noopener">
        <img src="${p.images[0]}" alt="">
      </a>` : ``}
    <div class="post__body">
      ${title ? `<h3 class="post__title">${title}</h3>` : ``}
      ${text  ? `<p class="post__text">${text}</p>` : ``}
    </div>
    ${makeActionsBar(p)}
    ${makeAdminBar(p)}
  `;

  // wire events
  li.querySelector('.icon-like')?.addEventListener('click', onToggleLike);
  li.querySelector('.preview-btn')?.addEventListener('click', openPreviewFromBtn);
  li.querySelector('.edit-btn')?.addEventListener('click', (e)=> openEditPost(e.currentTarget.dataset.id));
  li.querySelector('.delete-btn')?.addEventListener('click', (e)=> onDeletePost(e.currentTarget.dataset.id));

  return li;
}

// ===== utils: identify my post robustly =====
function isMine(post, me) {
  if (!post || !me) return false;

  const meId = me._id || me.id;
  const meUsername = me.username;

  const a = post.author;
  if (a && typeof a === 'object') {
    if (a._id && meId && String(a._id) === String(meId)) return true;
    if (a.id && meId && String(a.id) === String(meId)) return true;
    if (a.username && meUsername && String(a.username) === String(meUsername)) return true;
  }
  if (typeof a === 'string' && meId && String(a) === String(meId)) return true;

  if (post.authorId && meId && String(post.authorId) === String(meId)) return true;
  if (post.userId && meId && String(post.userId) === String(meId)) return true;
  if (post.user && typeof post.user === 'object' && post.user._id && meId && String(post.user._id) === String(meId)) return true;
  if (post.username && meUsername && String(post.username) === String(meUsername)) return true;

  return false;
}

// ===== load ONLY logged-in user's posts (client-filtered fallback) =====
async function loadProfilePosts() {
  const me = currentUser || await loadUser();
  if (!me) {
    $('#countWith').textContent = '(0)';
    $('#countNo').textContent = '(0)';
    $('#emptyWith')?.classList.remove('hidden');
    $('#emptyNo')?.classList.remove('hidden');
    return;
  }

  $('#profileName') && ($('#profileName').textContent = me.username || 'My Profile');

  let mine = [];
  let page = 1;
  const limit = 50;

  try {
    while (true) {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (me._id) {
        params.set('authorId', me._id);
        params.set('userId', me._id);
      }
      if (me.username) params.set('author', me.username);
      params.set('mine', 'true');

      const data = await api('/api/posts?' + params.toString());
      const items = Array.isArray(data) ? data : (data.items || []);

      const onlyMine = items.filter(p => isMine(p, me));
      mine = mine.concat(onlyMine);

      const count = items.length;
      const hasMore =
        (typeof data.pages === 'number' ? page < data.pages :
         typeof data.hasMore === 'boolean' ? data.hasMore :
         count === limit);

      if (!hasMore) break;
      page++;
      if (page > 200) break;
    }
  } catch (e) {
    console.error('Error loading profile posts:', e);
    mine = [];
  }

  profilePosts = mine;

  const posts    = mine.filter(p => Array.isArray(p.images) && p.images[0]);
  const statuses = mine.filter(p => !Array.isArray(p.images) || !p.images[0]);

  $('#countWith').textContent = `(${posts.length})`;
  $('#countNo').textContent   = `(${statuses.length})`;

  renderProfilePosts(posts, 'gridWith', 'emptyWith');
  renderProfilePosts(statuses, 'gridNo', 'emptyNo');
}

function renderProfilePosts(items, gridId, emptyId) {
  const grid = $(`#${gridId}`);
  const empty = $(`#${emptyId}`);
  if (!grid || !empty) return;

  grid.innerHTML = '';

  if (!items || items.length === 0) {
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  items.forEach(p => grid.appendChild(makePostCard(p)));
}

// ======= Likes =======
async function onToggleLike(ev) {
  if (!currentUser) { alert('Please sign in to like'); return; }
  const btn = ev.currentTarget.closest('.icon-like');
  const id = btn?.dataset?.id;
  if (!id) return;

  const liked = btn.classList.contains('liked');
  const countEl = btn.querySelector('.like-count');

  // optimistic
  btn.classList.toggle('liked');
  if (countEl) {
    const curr = parseInt(countEl.textContent || '0', 10) || 0;
    countEl.textContent = String(liked ? Math.max(0, curr - 1) : curr + 1);
  }

  try {
    const res = await api(`/api/posts/${encodeURIComponent(id)}/like`, 'POST');
    if (countEl) countEl.textContent = String(res.likesCount ?? 0);
    btn.classList.toggle('liked', !!res.liked);

    if (previewState.postId === id) {
      const pvLike = $('#pv-like-count'); if (pvLike) pvLike.textContent = String(res.likesCount ?? 0);
      const pvHeart = $('#pv-like-btn');  if (pvHeart) pvHeart.classList.toggle('liked', !!res.liked);
    }
  } catch (e) {
    // revert optimistic
    btn.classList.toggle('liked');
    if (countEl) {
      const curr = parseInt(countEl.textContent || '0', 10) || 0;
      countEl.textContent = String(liked ? curr + 1 : Math.max(0, curr - 1));
    }
    alert('Like error: ' + e.message);
  }
}

// ======= Preview & Comments =======
const previewModal = $('#previewModal');
const closePreviewBtn = $('#closePreview');
const previewBoxEl = $('#previewContent');
const previewState = { postId: null };

function openPreview() { previewModal?.classList.remove('hidden'); lockScroll(true); }
function closePreview() { previewModal?.classList.add('hidden'); lockScroll(false); previewState.postId = null; previewBoxEl.innerHTML=''; }

closePreviewBtn?.addEventListener('click', closePreview);
previewModal?.addEventListener('click', (e) => { if (e.target === previewModal) closePreview(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !previewModal?.classList.contains('hidden')) closePreview(); });

function openPreviewFromBtn(ev){
  const id = ev.currentTarget?.dataset?.id;
  if (!id) return;
  loadPreview(id);
}

async function loadPreview(id){
  try {
    const p = await api(`/api/posts/${encodeURIComponent(id)}/preview`);
    previewState.postId = id;

    const author = p.author?.username || currentUser?.username || 'Unknown';
    const when   = p.createdAt ? fmtExact(p.createdAt) : '';
    const title  = htmlEscape(p.title || '');
    const text   = htmlEscape(p.content || '');

    const likedClass = p.userLiked ? 'liked' : '';

    previewBoxEl.innerHTML = `
      <article>
        <header style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
          <div class="avatar"></div>
          <div class="hdr__meta">
            <strong>${author}</strong>
            <div class="muted" style="font-size:.9rem">${when}</div>
          </div>
        </header>
        ${p.images?.[0] ? `<div class="preview__img"><img src="${p.images[0]}" alt="" style="width:100%;display:block"></div>` : ''}
        <h3 style="margin:.6rem 0 0">${title}</h3>
        <p style="margin:.3rem 0 1rem;white-space:pre-wrap">${text}</p>

        <div class="preview__meta" style="margin-bottom:.5rem">
          <button id="pv-like-btn" class="icon-like ${likedClass}" data-id="${p._id}" aria-label="Like">
            ${heartSvg()} <span id="pv-like-count" class="count-pill">${p.likesCount ?? 0}</span>
          </button>
          <span class="count-pill">Comments: <span id="pv-comment-count">${p.commentsCount ?? 0}</span></span>
        </div>

        <section class="preview__comments">
          <h4 style="margin:0 0 .4rem">Comments</h4>
          <div id="pv-comments-list"></div>

          <form id="pv-comment-form" style="display:grid;gap:8px;margin-top:8px">
            <textarea id="pv-comment-text" class="input" rows="3" placeholder="Write a comment..." required></textarea>
            <div style="display:flex;gap:8px;justify-content:flex-end">
              <button type="submit" class="btn btn--primary">Add comment</button>
            </div>
          </form>
        </section>
      </article>
    `;

    $('#pv-like-btn')?.addEventListener('click', onToggleLike);

    const list = $('#pv-comments-list');
    list.innerHTML = '';
    (p.comments || []).forEach(c => list.appendChild(renderCommentItem(c)));

    $('#pv-comment-form')?.addEventListener('submit', onAddComment);

    openPreview();
  } catch (e) {
    alert('Preview error: ' + e.message);
  }
}

function renderCommentItem(c) {
  const div = document.createElement('div');
  div.className = 'comment';
  const uname = c.user?.username || 'User';
  const when = c.createdAt ? fmtExact(c.createdAt) : '';
  div.innerHTML = `
    <div class="comment__head">
      <span>${htmlEscape(uname)}</span>
      <span>${when}</span>
    </div>
    <div class="comment__text">${htmlEscape(c.text || '')}</div>
  `;
  return div;
}

async function onAddComment(ev) {
  ev.preventDefault();
  if (!currentUser) { alert('Please sign in to comment'); return; }
  const id = previewState.postId;
  if (!id) return;
  const ta = $('#pv-comment-text');
  const text = ta?.value?.trim() || '';
  if (!text) return;

  try {
    const res = await api(`/api/posts/${encodeURIComponent(id)}/comments`, 'POST', { text });
    const list = $('#pv-comments-list');
    list.prepend(renderCommentItem(res));
    ta.value = '';
    $('#pv-comment-count').textContent = String(res.commentsCount ?? (parseInt($('#pv-comment-count').textContent||'0',10)+1));
    const btn = document.querySelector(`.preview-btn[data-id="${CSS.escape(id)}"]`);
    const span = btn?.querySelector('.comment-count');
    if (span) span.textContent = String(res.commentsCount ?? parseInt(span.textContent||'0',10)+1);
  } catch (e) {
    alert('Comment error: ' + e.message);
  }
}

// ===== modal: create post =====
const modal = $('#modal');
function lockScroll(yes) { document.body.style.overflow = yes ? 'hidden' : ''; }
function openModal() { if (!modal) return; modal.classList.remove('hidden'); lockScroll(true); }
function closeModal() { if (!modal) return; modal.classList.add('hidden');  lockScroll(false); }

$('#newPostBtn')?.addEventListener('click', openModal);
$('#closeModal')?.addEventListener('click', closeModal);
$('#cancelPost')?.addEventListener('click', closeModal);
$('#emptyNewPost1')?.addEventListener('click', openModal);
$('#emptyNewPost2')?.addEventListener('click', openModal);

modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal(); });

// image preview (local)
const imageFileEl = document.querySelector('input[name="imageFile"]');
const previewBox = $('#imagePreview');

imageFileEl?.addEventListener('change', () => {
  const f = imageFileEl.files?.[0];
  if (!f) { previewBox.classList.add('hidden'); previewBox.innerHTML = ''; return; }
  const url = URL.createObjectURL(f);
  previewBox.innerHTML = `<img src="${url}" alt="preview"><small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>`;
  previewBox.classList.remove('hidden');
});

// upload helper
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`);
  }
  return await res.json(); // { url }
}

function clearFormFields(form){
  form.reset();
  previewBox?.classList.add('hidden');
  previewBox.innerHTML = '';
}

$('#clearForm')?.addEventListener('click', () => {
  const f = $('#postForm'); if (f) clearFormFields(f);
});

$('#postForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;

  const title   = f.title?.value?.trim() || '';
  const content = f.content?.value?.trim() || '';
  const tags         = f.tags?.value?.trim() || '';
  const location     = f.location?.value?.trim() || '';
  const visibility   = f.visibility?.value || 'public';
  const allowComments= !!f.allowComments?.checked;

  if (!title || !content) { alert('Please fill title and content'); return; }

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
    await loadProfilePosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toastOK('Post published');
  } catch (e) {
    alert('Create post error: ' + e.message);
  }
});

// ===== settings modal =====
const settingsModal = $('#settingsModal');
const closeSettingsBtn = $('#closeSettings');
const cancelSettingsBtn = $('#cancelSettings');

function openSettings() { if (!settingsModal) return; settingsModal.classList.remove('hidden'); lockScroll(true); }
function closeSettings() { if (!settingsModal) return; settingsModal.classList.add('hidden'); lockScroll(false); }

$('#openSettings')?.addEventListener('click', openSettings);
closeSettingsBtn?.addEventListener('click', closeSettings);
cancelSettingsBtn?.addEventListener('click', closeSettings);

settingsModal?.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !settingsModal?.classList.contains('hidden')) closeSettings(); });

// Load user data into settings form
async function loadUserSettings() {
  try {
    const user = await api('/api/users/me');
    const me = user.user || user;
    const form = $('#settingsForm');
    if (form && me) {
      form.username.value = me.username || '';
      form.email.value = me.email || '';
    }
  } catch (e) {
    console.error('Error loading user settings:', e);
  }
}

// Save settings (PATCH/PUT fallback to avoid 404)
$('#settingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;

  const username = f.username?.value?.trim() || '';
  const email = f.email?.value?.trim() || '';
  const currentPassword = f.currentPassword?.value || '';
  const newPassword = f.newPassword?.value || '';
  const confirmPassword = f.confirmPassword?.value || '';

  if (!username) { alert('Username is required'); return; }
  if (newPassword && newPassword !== confirmPassword) { alert('New passwords do not match'); return; }

  try {
    const payload = { username, email };
    if (currentPassword && newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }

    await apiTry([
      { path: '/api/users/me', method: 'PATCH' },
      { path: '/api/users/me', method: 'PUT' },
    ], payload);

    closeSettings();
    await loadUser();
    toastOK('Settings updated');
  } catch (e) {
    alert('Save settings error: ' + e.message);
  }
});

// ===== Edit Post (modal) =====
const editModal = $('#editModal');
const closeEditBtn = $('#closeEdit');
const cancelEditBtn = $('#cancelEdit');
const editForm = $('#editForm');
const editImageFileEl = editForm?.querySelector('input[name="imageFile"]');
const editImagePreview = $('#editImagePreview');
const editPreviewBox = $('#editPreviewBox');

let editState = { id: null, original: null };

function openEditPost(id){
  const p = profilePosts.find(x => String(x._id) === String(id));
  if (!p) return alert('Post not found');
  editState.id = id;
  editState.original = p;

  // Prefill form
  editForm.title.value = p.title || '';
  editForm.content.value = p.content || '';
  editForm.removeImage.checked = false;
  if (editImageFileEl) editImageFileEl.value = '';
  editImagePreview.classList.add('hidden');
  editImagePreview.innerHTML = '';

  // Preview current
  editPreviewBox.innerHTML = `
    ${p.images?.[0] ? `<img class="view-cover" src="${p.images[0]}" alt="">` : `<div class="muted">No image</div>`}
  `;

  editModal.classList.remove('hidden'); lockScroll(true);
}

closeEditBtn?.addEventListener('click', ()=>{ editModal.classList.add('hidden'); lockScroll(false); });
cancelEditBtn?.addEventListener('click', ()=>{ editModal.classList.add('hidden'); lockScroll(false); });

editImageFileEl?.addEventListener('change', ()=>{
  const f = editImageFileEl.files?.[0];
  if (!f){ editImagePreview.classList.add('hidden'); editImagePreview.innerHTML=''; return; }
  const url = URL.createObjectURL(f);
  editImagePreview.innerHTML = `<img src="${url}" alt="preview"><small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>`;
  editImagePreview.classList.remove('hidden');
});

editForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const id = editState.id;
  if (!id) return;

  const title = editForm.title.value.trim();
  const content = editForm.content.value.trim();
  const removeImage = !!editForm.removeImage.checked;

  if (!title || !content) return alert('Please fill title and content');

  try{
    const payload = { title, content };

    // image handling
    const newFile = editImageFileEl?.files?.[0];
    if (removeImage){
      payload.images = [];
    } else if (newFile){
      const { url } = await uploadImage(newFile);
      if (url) payload.images = [url];
    }

    const updated = await apiTry([
      { path: `/api/posts/${encodeURIComponent(id)}`, method: 'PATCH' },
      { path: `/api/posts/${encodeURIComponent(id)}`, method: 'PUT' },
      { path: `/api/posts/${encodeURIComponent(id)}/update`, method: 'POST' },
    ], payload);

    // update local + refresh lists
    const idx = profilePosts.findIndex(p => String(p._id) === String(id));
    if (idx !== -1) profilePosts[idx] = { ...profilePosts[idx], ...updated };
    await loadProfilePosts();

    editModal.classList.add('hidden'); lockScroll(false);
    toastOK('Post updated');
  } catch (err){
    alert('Edit error: ' + err.message);
  }
});

async function onDeletePost(id){
  if (!confirm('Delete this post? This action cannot be undone.')) return;
  try{
    await apiTry([
      { path: `/api/posts/${encodeURIComponent(id)}`, method: 'DELETE' },
      { path: `/api/posts/${encodeURIComponent(id)}/delete`, method: 'POST' },
    ]);
    profilePosts = profilePosts.filter(p => String(p._id) !== String(id));
    await loadProfilePosts();
    toastOK('Post deleted');
  } catch(e){
    alert('Delete error: ' + e.message);
  }
}

// ===== Toast helpers =====
function toastOK(msg){
  const t = $('#toast'); if(!t) return;
  t.textContent = msg; t.classList.remove('hidden','error'); t.classList.add('ok');
  setTimeout(()=> t.classList.add('hidden'), 1500);
}
function toastErr(msg){
  const t = $('#toast'); if(!t) return alert(msg);
  t.textContent = msg; t.classList.remove('hidden','ok'); t.classList.add('error');
  setTimeout(()=> t.classList.add('hidden'), 2000);
}

// ===== Groups (mine + owned management) =====
async function loadMyGroups(){
  const me = currentUser || await loadUser();
  if (!me) return;

  try{
    const list = await api('/api/groups/mine'); // groups where owner or member
    const owned  = list.filter(g => String(g.owner?._id || g.owner) === String(me._id || me.id));
    const member = list.filter(g => String(g.owner?._id || g.owner) !== String(me._id || me.id));

    renderOwnedGroups(owned);
    renderMemberGroups(member);
  } catch(e){
    console.error('Groups load error:', e);
  }
}

function renderOwnedGroups(groups){
  const grid = $('#gridAdminGroups'); if(!grid) return;
  grid.innerHTML = (groups||[]).map(g => groupCardHTML(g, true)).join('');
  wireGroupCards(grid);
}

function renderMemberGroups(groups){
  const grid = $('#gridMyGroups'); if(!grid) return;
  const empty = $('#emptyMemberGroups');
  grid.innerHTML = (groups||[]).map(g => groupCardHTML(g, false)).join('');
  if (!groups || groups.length === 0) empty?.classList.remove('hidden'); else empty?.classList.add('hidden');
  wireGroupCards(grid);
}

function groupCardHTML(g, isOwner){
  const name = htmlEscape(g.name || '(Group)');
  const firstLetter = (g.name?.trim()?.charAt(0) || '?').toUpperCase();
  const desc = htmlEscape(g.description || '');
  const count = Array.isArray(g.members) ? g.members.length : (g.membersCount ?? 0);
  return `
    <li>
      <div class="group-card" data-id="${g._id}">
        <div class="group-card__head">
          <span class="group-card__avatar"><span class="avatar-fallback">${firstLetter}</span></span>
          <h3 class="group-card__name" title="${name}">${name}</h3>
        </div>
        <p class="group-card__desc" style="-webkit-line-clamp:2">${desc}</p>
        <div class="group-card__foot">
          <div class="group-card__meta">
            <span class="pill members-pill" data-count="${count}">${count} member${count===1?'':'s'}</span>
          </div>
          <div class="group-card__actions">
            ${isOwner
              ? `<button class="btn manage-members">👥 Manage</button>
                 <button class="btn btn-danger delete-group">🗑️ Delete</button>`
              : `<button class="btn view-members">👀 View members</button>`
            }
          </div>
        </div>
      </div>
    </li>
  `;
}

function wireGroupCards(scope){
  $$('.manage-members', scope).forEach(b => b.addEventListener('click', (e)=>{
    const id = e.currentTarget.closest('.group-card')?.dataset?.id; if (!id) return;
    openMembersModal(id, { manage: true });
  }));
  $$('.view-members', scope).forEach(b => b.addEventListener('click', (e)=>{
    const id = e.currentTarget.closest('.group-card')?.dataset?.id; if (!id) return;
    openMembersModal(id, { manage: false });
  }));
  $$('.delete-group', scope).forEach(b => b.addEventListener('click', async (e)=>{
    const card = e.currentTarget.closest('.group-card');
    const id = card?.dataset?.id; if (!id) return;
    if (!confirm('Delete this group? This will remove the group for all members.')) return;
    try{
      await api(`/api/groups/${encodeURIComponent(id)}`, 'DELETE');
      card.closest('li')?.remove();
      toastOK('Group deleted');
    } catch(err){
      toastErr('Delete group error: ' + err.message);
    }
  }));
}

// ===== Create Group modal (fixed wiring) =====
const groupModal = $('#groupModal');
const closeGroupBtn = $('#closeGroup');
const cancelGroupBtn = $('#cancelGroup');
const groupForm = $('#groupForm');

function openGroupModal() { if (!groupModal) return; groupModal.classList.remove('hidden'); lockScroll(true); }
function closeGroupModal() { if (!groupModal) return; groupModal.classList.add('hidden'); lockScroll(false); }

$('#openCreateGroup2')?.addEventListener('click', openGroupModal);
$('#emptyCreateGroup2')?.addEventListener('click', openGroupModal);
closeGroupBtn?.addEventListener('click', closeGroupModal);
cancelGroupBtn?.addEventListener('click', closeGroupModal);

groupModal?.addEventListener('click', (e) => { if (e.target === groupModal) closeGroupModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !groupModal?.classList.contains('hidden')) closeGroupModal(); });

groupForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const f = e.target;
  const name = f.name?.value?.trim() || '';
  const description = f.description?.value?.trim() || '';
  if (!name || !description) return alert('Please fill all fields');
  try{
    await api('/api/groups', 'POST', { name, description });
    closeGroupModal();
    f.reset();
    await loadMyGroups();
    toastOK('Group created');
  } catch (err){
    alert('Create group error: ' + err.message);
  }
});

// ===== Members modal =====
const membersModal = $('#membersModal');
const closeMembersBtn = $('#closeMembers');
const membersSearch = $('#membersSearch');
const membersCount = $('#membersCount');
const membersList = $('#membersList');
const membersEmpty = $('#membersEmpty');

const membersState = { groupId: null, canRemove: false, all: [], filtered: [] };

function openMembersModal(groupId, { manage } = { manage: false }){
  loadGroupMembers(groupId, manage).then(()=>{
    membersModal?.classList.remove('hidden');
    lockScroll(true);
  }).catch(e=>{
    toastErr('Load members error: ' + e.message);
  });
}

function closeMembersModal(){
  membersModal?.classList.add('hidden');
  lockScroll(false);
  membersState.groupId = null;
  membersState.all = [];
  membersList.innerHTML = '';
  membersSearch.value = '';
}

closeMembersBtn?.addEventListener('click', closeMembersModal);
membersModal?.addEventListener('click', (e)=>{ if (e.target === membersModal) closeMembersModal(); });
document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape' && !membersModal?.classList.contains('hidden')) closeMembersModal(); });

async function loadGroupMembers(groupId, manageFlag){
  const data = await api(`/api/groups/${encodeURIComponent(groupId)}/members`);
  const canRemove = !!data.canRemove && !!manageFlag;
  const members = Array.isArray(data.members) ? data.members : [];
  membersState.groupId = groupId;
  membersState.canRemove = canRemove;
  membersState.all = members;
  renderMembers(members, canRemove);
}

function renderMembers(list, canRemove){
  membersList.innerHTML = '';
  if (!list || list.length === 0){
    membersEmpty?.classList.remove('hidden');
    membersCount.textContent = '(0)';
    return;
  }
  membersEmpty?.classList.add('hidden');
  membersCount.textContent = `(${list.length})`;

  const frag = document.createDocumentFragment();
  list.forEach(m => frag.appendChild(memberRow(m, canRemove)));
  membersList.appendChild(frag);
}

function memberRow(m, canRemove){
  const li = document.createElement('li');
  li.className = 'member-row';
  li.dataset.id = m._id;
  const initials = (m.username || 'U').slice(0,2).toUpperCase();
  li.innerHTML = `
    <div class="member-main">
      <div class="member-avatar">${initials}</div>
      <div class="member-meta">
        <div class="member-name">${htmlEscape(m.username || 'User')}</div>
        <div class="member-sub">${htmlEscape(m.email || '')}</div>
      </div>
    </div>
    <div class="member-actions">
      ${canRemove ? `<button class="btn-danger remove-member">Remove</button>` : ``}
    </div>
  `;
  if (canRemove){
    li.querySelector('.remove-member')?.addEventListener('click', ()=> onRemoveMember(m._id));
  }
  return li;
}

membersSearch?.addEventListener('input', ()=>{
  const q = membersSearch.value.trim().toLowerCase();
  const all = membersState.all || [];
  const filtered = q
    ? all.filter(m => (m.username||'').toLowerCase().includes(q) || (m.email||'').toLowerCase().includes(q))
    : all.slice();
  renderMembers(filtered, membersState.canRemove);
});

async function onRemoveMember(userId){
  const gid = membersState.groupId; if (!gid) return;
  if (!confirm('Remove this member from the group?')) return;
  try{
    await api(`/api/groups/${encodeURIComponent(gid)}/members/${encodeURIComponent(userId)}`, 'DELETE');
    membersState.all = membersState.all.filter(m => String(m._id) !== String(userId));
    const row = membersList.querySelector(`.member-row[data-id="${CSS.escape(userId)}"]`);
    row?.remove();

    const newCount = membersState.all.length;
    membersCount.textContent = `(${newCount})`;
    if (newCount === 0) membersEmpty?.classList.remove('hidden');

    updateGroupCardCount(gid, newCount);

    toastOK('Member removed');
  } catch(e){
    toastErr('Remove member error: ' + e.message);
  }
}

function updateGroupCardCount(groupId, newCount){
  const card = $(`.group-card[data-id="${CSS.escape(groupId)}"]`);
  const pill = card?.querySelector('.members-pill');
  if (pill){
    pill.dataset.count = String(newCount);
    pill.textContent = `${newCount} member${newCount===1?'':'s'}`;
  }
}

// ===== init =====
(async function init() {
  await loadUser();
  await loadUserSettings();
  await loadProfilePosts();     // only my posts
  await loadMyGroups();         // my groups (owned + member)
})();
