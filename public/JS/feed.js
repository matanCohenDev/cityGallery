
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const joinableEl = $('#joinable');
const joinableListEl = $('#joinableList');

function fmtExact(iso) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });

  let data = {};
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = {}; }

  if (!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

let currentUser = null;

async function loadUser() {
  try {
    const me = await api('/api/users/me');
    $('#userBadge').textContent = `Signed in as ${me.username || me.user?.username || 'User'}`;
    currentUser = me;
    return me;
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
    window.location.href = '/';
  } catch (e) { alert('Logout error: ' + e.message); }
});

let page = 1;
let pages = 1;             
let loading = false;
let lastQueryKey = '';

const PAGE_SIZE = 50;      
const dayEl = $('#day');

const parseYMD = (s) => { const [y,m,d] = s.split('-').map(Number); return { y, m:m-1, d }; };
const startOfDayLocal = (s) => { const {y,m,d}=parseYMD(s); return new Date(y,m,d,0,0,0,0).getTime(); };
const endOfDayLocal   = (s) => { const {y,m,d}=parseYMD(s); return new Date(y,m,d,23,59,59,999).getTime(); };

(function initDay() {
  if (dayEl) dayEl.value = '';
})();

function buildParams() {
  const params = new URLSearchParams();
  const q = $('#q')?.value.trim() || '';
  const imagesOnly = $('#imagesOnly')?.checked || false;
  const groupBy = $('#groupBy')?.value || '';
  const itemsPerGroup = parseInt($('#itemsPerGroup')?.value || '5', 10);

  if (q) params.set('q', q);
  if (imagesOnly) params.set('imagesOnly', 'true');

  if (groupBy) {
    params.set('groupBy', groupBy);
    if (!Number.isNaN(itemsPerGroup) && itemsPerGroup > 0) {
      params.set('itemsPerGroup', String(Math.min(itemsPerGroup, 20)));
    }
  }

  params.set('page', String(page));
  params.set('limit', String(PAGE_SIZE));
  return params;
}

function queryKey() {
  return JSON.stringify({
    q: $('#q')?.value.trim() || '',
    imagesOnly: $('#imagesOnly')?.checked || false,
    day: $('#day')?.value || '',
    groupBy: $('#groupBy')?.value || '',
    itemsPerGroup: $('#itemsPerGroup')?.value || ''
  });
}

function applyLocalFilters(items){
  const imagesOnly = $('#imagesOnly')?.checked || false;
  const dayStr = $('#day')?.value || '';

  const dayFromTs = dayStr ? startOfDayLocal(dayStr) : -Infinity;
  const dayToTs   = dayStr ? endOfDayLocal(dayStr)   :  Infinity;

  return items.filter(p => {
    if (imagesOnly) {
      const imgs = Array.isArray(p.images) ? p.images : [];
      const hasImage = imgs.some(u => typeof u === 'string' && u.trim().length > 0);
      if (!hasImage) return false;
    }

    if (dayStr) {
      const ts = p.createdAt ? new Date(p.createdAt).getTime() : NaN;
      if (Number.isNaN(ts)) return false;
      if (ts < dayFromTs || ts > dayToTs) return false;
    }

    const q = $('#q')?.value.trim().toLowerCase() || '';
    if (q) {
      const hay = `${p.title ?? ''} ${p.content ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

function skeleton(count = 3) {
  const list = $('#feedList');
  list.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const li = document.createElement('li');
    li.className = 'post skeleton';
    li.innerHTML = `
      <div class="post__hdr">
        <div class="avatar"></div>
        <div style="flex:1">
          <div class="line skel" style="width:140px"></div>
          <div class="line skel" style="width:100px"></div>
        </div>
      </div>
      <div class="post__img"></div>
      <div class="post__body">
        <div class="line skel"></div>
        <div class="line skel" style="width:80%"></div>
      </div>`;
    list.appendChild(li);
  }
}

function htmlEscape(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function heartSvg() {
  return `
    <svg class="heart" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>`;
}

function makeActionsBar(p) {
  const likedClass = p.userLiked ? 'liked' : '';
  return `
    <div class="post__actions">
      <button class="icon-like ${likedClass}" data-id="${p._id}" aria-label="Like">
        ${heartSvg()}
        <span class="count-pill like-count">${p.likesCount ?? 0}</span>
      </button>
      <button class="preview-btn" data-id="${p._id}" aria-label="Open preview">
        Comments (<span class="comment-count">${p.commentsCount ?? 0}</span>)
      </button>
    </div>
  `;
}

function makePostCard(p) {
  const li = document.createElement('li');
  li.className = 'post';

  const author = p.author?.username || 'Unknown';
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
  `;

  li.querySelector('.icon-like')?.addEventListener('click', onToggleLike);
  li.querySelector('.preview-btn')?.addEventListener('click', openPreviewFromBtn);

  return li;
}

function renderItems(items, { append = false } = {}) {
  const list = $('#feedList');
  if (!append) list.innerHTML = '';
  $('#empty').classList.toggle('hidden', items.length !== 0 || append);
  for (const p of items) list.appendChild(makePostCard(p));
}

function makeGroupBlock(g, groupBy) {
  const wrap = document.createElement('li');
  wrap.className = 'group';

  let label = '';
  if (groupBy === 'day') label = g.key;
  else if (groupBy === 'author') label = g.key?.username || '(Unknown)';
  else if (groupBy === 'group') label = g.key?.name || '(No group)';
  else label = String(g.key ?? '');

  wrap.innerHTML = `
    <div class="group__head">
      <h3 class="group__title">${htmlEscape(label)}</h3>
      <span class="group__meta">${g.count} item(s)</span>
    </div>
    <ul class="group__items"></ul>
  `;
  const ul = wrap.querySelector('.group__items');
  const filtered = applyLocalFilters(g.items || []);
  for (const p of filtered) ul.appendChild(makePostCard(p));
  return wrap;
}

function renderGroups(groups, groupBy, { append = false } = {}) {
  const list = $('#feedList');
  if (!append) list.innerHTML = '';
  $('#empty').classList.toggle('hidden', (groups?.length ?? 0) !== 0 || append);
  for (const g of groups) list.appendChild(makeGroupBlock(g, groupBy));
}

function joinableItemHTML(g) {
  const name = htmlEscape(g.name || '(Group)');
  const desc = htmlEscape(g.description || '');
  const owner = htmlEscape(g.owner?.username || 'Unknown');
  const membersCount = Array.isArray(g.members) ? g.members.length : 0;

  return `
    <li class="joinable__item" data-id="${g._id}">
      <div class="joinable__row">
        <div class="joinable__meta">
          <h4 class="joinable__name">${name}</h4>
          <div class="joinable__sub muted">
            by ${owner} • ${membersCount} member${membersCount===1?'':'s'}
          </div>
          ${desc ? `<p class="joinable__desc">${desc}</p>` : ``}
        </div>
        <div class="joinable__actions">
          <button class="btn btn--primary join-btn" data-id="${g._id}">Join</button>
        </div>
      </div>
    </li>
  `;
}

function renderJoinableList(groups){
  if (!joinableEl || !joinableListEl) return;
  if (!Array.isArray(groups) || groups.length === 0) {
    joinableEl.classList.add('hidden');
    joinableListEl.innerHTML = '';
    return;
  }

  joinableListEl.innerHTML = groups.map(joinableItemHTML).join('');
  joinableEl.classList.remove('hidden');

  $$('.join-btn', joinableEl).forEach(btn => {
    btn.addEventListener('click', onJoinGroupClick);
  });
}

async function onJoinGroupClick(ev){
  if (!currentUser) { alert('Please sign in to join groups'); return; }
  const id = ev.currentTarget?.dataset?.id;
  if (!id) return;

  const btn = ev.currentTarget;
  btn.disabled = true;

  try {
    await api(`/api/groups/${encodeURIComponent(id)}/join`, 'POST');
    const li = btn.closest('.joinable__item');
    if (li) li.remove();

    if (joinableListEl.children.length === 0) {
      joinableEl.classList.add('hidden');
    }
  } catch (e) {
    alert('Join error: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function loadPosts({ append = false } = {}) {
  if (loading) return;
  loading = true;

  if (!append) skeleton(3);

  try {
    const params = buildParams();
    const data = await api('/api/posts?' + params.toString());
    const groupBy = $('#groupBy')?.value || '';

    pages = (() => {
      if (Array.isArray(data)) return 1;
      if (groupBy) return data.pages || 1;
      return data.pages || 1;
    })();

    if (groupBy) {
      const groups = data.groups || [];
      renderGroups(groups, groupBy, { append });
    } else {
      const rawItems = Array.isArray(data) ? data : (data.items || []);
      const filtered = applyLocalFilters(rawItems);
      renderItems(filtered, { append });
    }
  } catch (e) {
    console.error(e);
    if (!append) {
      $('#feedList').innerHTML = '';
      $('#empty').classList.remove('hidden');
    }
  } finally {
    loading = false;
  }
}

async function loadAllPages() {
  if (loading) return;
  loading = true;

  const list = $('#feedList');
  list.innerHTML = '';
  skeleton(3);

  try {
    page = 1;
    let append = false;
    while (true) {
      const params = buildParams();
      const data = await api('/api/posts?' + params.toString());
      const groupBy = $('#groupBy')?.value || '';
      const limit = Number(params.get('limit') || '10');

      if (groupBy) {
        const groups = data.groups || [];
        renderGroups(groups, groupBy, { append });

        const more =
          (typeof data.pages === 'number' ? page < data.pages :
           Array.isArray(groups) && groups.length === limit);
        if (!more) break;
      } else {
        const rawItems = Array.isArray(data) ? data : (data.items || []);
        const filtered = applyLocalFilters(rawItems);
        renderItems(filtered, { append });

        const count = Array.isArray(data) ? data.length : rawItems.length;
        const more =
          (typeof data.pages === 'number' ? page < data.pages :
           typeof data.hasMore === 'boolean' ? data.hasMore :
           count === limit);
        if (!more) break;
      }

      append = true;
      page++;
      if (page > 500) break; 
    }

    pages = 1;
  } catch (e) {
    console.error(e);
    list.innerHTML = '';
    $('#empty').classList.remove('hidden');
  } finally {
    loading = false;
  }
}

async function loadJoinableGroups(){
  if (!currentUser) {
    if (joinableEl) joinableEl.classList.add('hidden');
    return;
  }
  try {
    const groups = await api('/api/groups/joinable?limit=50');
    renderJoinableList(groups);
  } catch (e) {
    if (joinableEl) joinableEl.classList.add('hidden');
    console.warn('joinable load error:', e?.message || e);
  }
}


function nearBottom() {
  const pxFromBottom = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  return pxFromBottom < 300;
}
window.addEventListener('scroll', async () => {
  if (nearBottom() && !loading && page < pages) {
    page++;
    await loadPosts({ append: true });
  }
});

function requery() {
  const newKey = queryKey();
  if (newKey !== lastQueryKey) {
    lastQueryKey = newKey;
    page = 1;
    loadAllPages();
  }
}

$('#q')?.addEventListener('input', requery);
$('#imagesOnly')?.addEventListener('change', requery);
$('#day')?.addEventListener('change', requery);
$('#groupBy')?.addEventListener('change', requery);
$('#itemsPerGroup')?.addEventListener('change', requery);

const modal = $('#modal');
function lockScroll(yes) { document.body.style.overflow = yes ? 'hidden' : ''; }
function openModal() { if (!modal) return; modal.classList.remove('hidden'); lockScroll(true); }
function closeModal() { if (!modal) return; modal.classList.add('hidden');  lockScroll(false); }

$('#newPostBtn')?.addEventListener('click', openModal);
$('#closeModal')?.addEventListener('click', closeModal);
$('#cancelPost')?.addEventListener('click', closeModal);

modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal(); });

const imageFileEl = document.querySelector('input[name="imageFile"]');
const previewBox = $('#imagePreview');

imageFileEl?.addEventListener('change', () => {
  const f = imageFileEl.files?.[0];
  if (!f) { previewBox.classList.add('hidden'); previewBox.innerHTML = ''; return; }
  const url = URL.createObjectURL(f);
  previewBox.innerHTML = `<img src="${url}" alt="preview"><small class="muted">${f.name} • ${(f.size/1024).toFixed(1)} KB</small>`;
  previewBox.classList.remove('hidden');
});

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`);
  }
  return await res.json(); 
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
    page = 1; pages = 1; lastQueryKey = queryKey();
    await loadAllPages();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    alert('Create post error: ' + e.message);
  }
});

async function onToggleLike(ev) {
  if (!currentUser) { alert('Please sign in to like'); return; }
  const btn = ev.currentTarget.closest('.icon-like');
  const id = btn?.dataset?.id;
  if (!id) return;

  const liked = btn.classList.contains('liked');
  const countEl = btn.querySelector('.like-count');

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
    btn.classList.toggle('liked');
    if (countEl) {
      const curr = parseInt(countEl.textContent || '0', 10) || 0;
      countEl.textContent = String(liked ? curr + 1 : Math.max(0, curr - 1));
    }
    alert('Like error: ' + e.message);
  }
}

const previewModal = $('#previewModal');
const closePreviewBtn = $('#closePreview');
const previewBoxEl = $('#previewContent');
const previewState = { postId: null };

function openPreview() { previewModal.classList.remove('hidden'); lockScroll(true); }
function closePreview() { previewModal.classList.add('hidden'); lockScroll(false); previewState.postId = null; previewBoxEl.innerHTML=''; }

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

    const author = p.author?.username || 'Unknown';
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

(async function init() {
  await loadUser();
  await loadJoinableGroups();  
  if (dayEl) dayEl.value = '';
  lastQueryKey = queryKey();
  await loadAllPages();

  $('#emptyNewPost')?.addEventListener('click', openModal);
})();
