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
  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }

  if (!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

// ===== header user state =====
async function loadUser() {
  try {
    const me = await api('/api/users/me');
    $('#userBadge').textContent = `Signed in as ${me.username || me.user?.username || 'User'}`;
    return me;
  } catch {
    $('#userBadge').textContent = 'Not signed in';
    return null;
  }
}

$('#logoutBtn')?.addEventListener('click', async () => {
  try {
    await api('/api/users/logout', 'POST');
    await loadUser();
    window.location.href = '/index.html';
  } catch (e) { 
    alert('Logout error: ' + e.message); 
  }
});

// ===== state & filters =====
let page = 1;
let pages = 1;
let loading = false;
let lastQueryKey = '';

// single-day control (instead of from/to)
const dayEl = $('#day');

// helper: exact local day range (no UTC misparse)
const parseYMD = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
};
const startOfDayLocal = (s) => {
  const { y, m, d } = parseYMD(s);
  return new Date(y, m, d, 0, 0, 0, 0).getTime();
};
const endOfDayLocal = (s) => {
  const { y, m, d } = parseYMD(s);
  return new Date(y, m, d, 23, 59, 59, 999).getTime();
};

// initialize day with today
(function seedToday() {
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  if (dayEl) dayEl.value = `${yyyy}-${mm}-${dd}`;
})();

function buildParams() {
  // keep server paging+search, but local filters decide final set.
  const params = new URLSearchParams();
  const q = $('#q')?.value.trim() || '';
  const imagesOnly = $('#imagesOnly')?.checked || false;

  if (q) params.set('q', q);
  if (imagesOnly) params.set('imagesOnly', 'true');

  params.set('page', String(page));
  params.set('limit', '10');
  return params;
}

function queryKey() {
  return JSON.stringify({
    q: $('#q')?.value.trim() || '',
    imagesOnly: $('#imagesOnly')?.checked || false,
    day: $('#day')?.value || ''
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

    // local search in title/content (case-insensitive)
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
  return String(s ?? '').replace(/[&<>"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
  }[c]));
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

function renderItems(items, { append = false } = {}) {
  const list = $('#feedList');
  if (!append) list.innerHTML = '';
  $('#empty').classList.toggle('hidden', items.length !== 0 || append);
  for (const p of items) {
    list.appendChild(makePostCard(p));
  }
}

// ===== data load =====
async function loadPosts({ append = false } = {}) {
  if (loading) return;
  loading = true;

  if (!append) skeleton(4);

  try {
    const params = buildParams();
    const data = await api('/api/posts?' + params.toString());

    pages = Array.isArray(data) ? 1 : (data.pages || 1);
    const rawItems = Array.isArray(data) ? data : (data.items || []);

    const filtered = applyLocalFilters(rawItems);
    renderItems(filtered, { append });
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

// ===== live filters (oninput/onchange) =====
const requery = () => {
  const newKey = queryKey();
  if (newKey !== lastQueryKey) {
    lastQueryKey = newKey;
    page = 1;
    loadPosts();
  }
};

$('#q')?.addEventListener('input', requery);
$('#imagesOnly')?.addEventListener('change', requery);
$('#day')?.addEventListener('change', requery);

// empty-state new post
$('#emptyNewPost')?.addEventListener('click', () => openModal());

// ===== modal: create post =====
const modal = $('#modal');
function lockScroll(yes) {
  document.body.style.overflow = yes ? 'hidden' : '';
}
function openModal() { 
  if (!modal) return;
  modal.classList.remove('hidden'); 
  lockScroll(true); 
}
function closeModal() { 
  if (!modal) return;
  modal.classList.add('hidden');  
  lockScroll(false); 
}

$('#newPostBtn')?.addEventListener('click', openModal);
$('#closeModal')?.addEventListener('click', closeModal);
$('#cancelPost')?.addEventListener('click', closeModal);

modal?.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal();
});

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

// helper: upload image to server; expect {url} in response
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file); // חשוב: השם 'image' תואם ל-upload.single('image')
  const res = await fetch('/api/uploads', { method: 'POST', body: fd, credentials: 'include' });
  if (!res.ok) {
    const txt = await res.text().catch(()=> '');
    throw new Error(`Upload failed (${res.status}): ${txt || res.statusText}`);
  }
  return await res.json(); // { url: "/uploads/xxxx.jpg" }
}

function clearFormFields(form){
  form.reset();
  previewBox?.classList.add('hidden');
  previewBox.innerHTML = '';
}

$('#clearForm')?.addEventListener('click', () => {
  const f = $('#postForm');
  if (f) clearFormFields(f);
});

$('#saveDraft')?.addEventListener('click', async () => {
  const f = $('#postForm');
  if (!f) return;

  const title        = f.title?.value?.trim() || '';
  const content      = f.content?.value?.trim() || '';

  // השדות הבאים לא קיימים בטופס – לכן חובה עם ?.
  const tags         = f.tags?.value?.trim() || '';
  const location     = f.location?.value?.trim() || '';
  const visibility   = f.visibility?.value || 'public';
  const allowComments= !!f.allowComments?.checked;

  if (!title && !content) {
    alert('Nothing to save. Add a title or content.');
    return;
  }

  try {
    const payload = { title, content, tags, location, visibility, allowComments, status: 'draft' };
    await api('/api/posts', 'POST', payload);
    alert('Draft saved');
    clearFormFields(f);
  } catch (e) {
    alert('Save draft error: ' + e.message);
  }
});


$('#postForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;

  const title        = f.title?.value?.trim() || '';
  const content      = f.content?.value?.trim() || '';

  // לא קיימים בטופס? אין בעיה, ברירת מחדל תופסת
  const tags         = f.tags?.value?.trim() || '';
  const location     = f.location?.value?.trim() || '';
  const visibility   = f.visibility?.value || 'public';
  const allowComments= !!f.allowComments?.checked;

  if (!title || !content) {
    alert('Please fill title and content');
    return;
  }

  try {
    const payload = { title, content, tags, location, visibility, allowComments, status: 'published' };

    const imgFile = f.imageFile?.files?.[0];
    if (imgFile) {
      const { url } = await uploadImage(imgFile); // מחזיר { url }
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


// ===== init =====
(async function init() {
  await loadUser();
  lastQueryKey = queryKey();
  await loadPosts();
})();
