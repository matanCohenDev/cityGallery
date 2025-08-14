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

// ===== header user state =====
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

// ===== state & filters =====
let page = 1;
let pages = 1;
let loading = false;
let lastQueryKey = '';

const dayEl = $('#day');

// helper: exact local day range (no UTC misparse)
const parseYMD = (s) => { const [y,m,d] = s.split('-').map(Number); return { y, m:m-1, d }; };
const startOfDayLocal = (s) => { const {y,m,d}=parseYMD(s); return new Date(y,m,d,0,0,0,0).getTime(); };
const endOfDayLocal   = (s) => { const {y,m,d}=parseYMD(s); return new Date(y,m,d,23,59,59,999).getTime(); };

// initialize day with today
(function seedToday() {
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  if (dayEl) dayEl.value = `${yyyy}-${mm}-${dd}`;
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
  params.set('limit', '10');
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

// ===== local filters =====
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

// ===== render =====
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
  `;
  return li;
}

// --- rendering (plain list) ---
function renderItems(items, { append = false } = {}) {
  const list = $('#feedList');
  if (!append) list.innerHTML = '';
  $('#empty').classList.toggle('hidden', items.length !== 0 || append);
  for (const p of items) list.appendChild(makePostCard(p));
}

// --- rendering (grouped) ---
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

// ===== data load (feed) =====
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

// ===== infinite scroll =====
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

// ===== live filters (feed) =====
function requery() {
  const newKey = queryKey();
  if (newKey !== lastQueryKey) {
    lastQueryKey = newKey;
    page = 1;
    loadPosts();
  }
}

$('#q')?.addEventListener('input', requery);
$('#imagesOnly')?.addEventListener('change', requery);
$('#day')?.addEventListener('change', requery);
$('#groupBy')?.addEventListener('change', requery);
$('#itemsPerGroup')?.addEventListener('change', requery);

// ===== modal: create post =====
const modal = $('#modal');
function lockScroll(yes) { document.body.style.overflow = yes ? 'hidden' : ''; }
function openModal() { if (!modal) return; modal.classList.remove('hidden'); lockScroll(true); }
function closeModal() { if (!modal) return; modal.classList.add('hidden');  lockScroll(false); }

$('#newPostBtn')?.addEventListener('click', openModal);
$('#closeModal')?.addEventListener('click', closeModal);
$('#cancelPost')?.addEventListener('click', closeModal);

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
    page = 1; pages = 1; lastQueryKey = queryKey();
    await loadPosts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    alert('Create post error: ' + e.message);
  }
});

// ======= JOINABLE GROUPS SIDEBAR =======

async function loadJoinableGroups() {
  const box = $('#joinable');
  const list = $('#joinableList');
  if (!box || !list) return;

  // אם לא מחובר — הסתר סיידבר
  if (!currentUser) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  list.innerHTML = '';

  // שלד טעינה
  for (let i=0;i<3;i++){
    const li = document.createElement('li');
    li.className = 'jg-card skeleton';
    li.innerHTML = `
      <div class="jg-head">
        <div class="jg-avatar skel"></div>
        <div class="jg-meta">
          <div class="line skel" style="width:70%"></div>
          <div class="line skel" style="width:50%"></div>
        </div>
      </div>
    `;
    list.appendChild(li);
  }

  try {
    const data = await api('/api/groups/joinable?limit=50', 'GET');
    list.innerHTML = '';

    if (!Array.isArray(data) || data.length === 0) {
      list.innerHTML = `<li class="jg-empty muted">No available groups to join</li>`;
      return;
    }

    for (const g of data) list.appendChild(makeJoinableCard(g));
  } catch (e) {
    list.innerHTML = `<li class="jg-error">Error loading groups: ${htmlEscape(e.message)}</li>`;
  }
}

function initials(str='?') {
  const p = String(str).trim().split(/\s+/).slice(0,2);
  return p.map(s=>s[0]?.toUpperCase() || '').join('') || '?';
}

function makeJoinableCard(g){
  const li = document.createElement('li');
  li.className = 'jg-card';
  const name = htmlEscape(g.name || 'Untitled');
  const desc = htmlEscape(g.description || '');
  const owner = g.owner?.username ? `by ${htmlEscape(g.owner.username)}` : '';
  const membersCount = Array.isArray(g.members) ? g.members.length : (g.membersCount ?? 0);

  li.innerHTML = `
    <div class="jg-head">
      <div class="jg-avatar" aria-hidden="true">${initials(g.name)}</div>
      <div class="jg-meta">
        <h4 class="jg-name" title="${name}">${name}</h4>
        <div class="jg-sub muted">${owner}${owner && membersCount ? ' • ' : ''}${membersCount ? membersCount + ' members' : ''}</div>
      </div>
    </div>
    ${desc ? `<p class="jg-desc">${desc}</p>` : ''}
    <div class="jg-actions">
      <button class="btn btn--primary jg-join" data-id="${g._id}">Join</button>
    </div>
  `;

  li.querySelector('.jg-join')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Joining…';
    try {
      await api(`/api/groups/${encodeURIComponent(g._id)}/join`, 'POST');
      // עדכון אופטימי: הסר את הכרטיס
      li.remove();
      // אם הרשימה התרוקנה – הצג הודעה
      if (!$('#joinableList')?.children.length) {
        $('#joinableList').innerHTML = `<li class="jg-empty muted">You're in all groups 🎉</li>`;
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Join';
      alert('Join error: ' + e.message);
    }
  });

  return li;
}

// ===== init =====
(async function init() {
  await loadUser();
  lastQueryKey = queryKey();
  await Promise.all([
    loadPosts(),
    loadJoinableGroups(), // ← נטען סיידבר הקבוצות
  ]);
})();
