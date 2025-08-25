document.getElementById('year').textContent = new Date().getFullYear();

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(t.dataset.tab + 'Form').classList.add('active');
}));

async function api(path, method='GET', body){
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include'
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

document.getElementById('registerForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  const username = f.username.value.trim();
  const email    = f.email.value.trim();
  const password = f.password.value;

  try{
    await api('/api/users/register','POST',{ username, email, password });
    await api('/api/users/login','POST',{ username, password });
    window.location.href = '/feed';
  }catch(err){
    alert('Register error: ' + err.message);
  }
});

document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  try{
    await api('/api/users/login','POST',{
      username: f.username.value.trim(),
      password: f.password.value
    });
    window.location.href = '/feed';
  }catch(err){
    alert('Login error: ' + err.message);
  }
});

const headerBtn = document.getElementById('logoutBtn');

function setHeaderForGuest(){
  if (!headerBtn) return;
  headerBtn.style.display = 'none';
  headerBtn.textContent = 'Back to feed';
  headerBtn.onclick = null;
}
function setHeaderForUser(){
  if (!headerBtn) return;
  headerBtn.textContent = 'Back to feed';
  headerBtn.style.display = 'inline-block';
  headerBtn.onclick = () => { window.location.href = '/feed'; };
}

const authCard  = document.querySelector('.auth.card');
const tabButtons = document.querySelectorAll('.tabs .tab');
const authForms = [
  document.getElementById('loginForm'),
  document.getElementById('registerForm')
];
function setAuthEnabled(enabled){
  authForms.forEach(form => {
    if (!form) return;
    form.querySelectorAll('input, button, select, textarea').forEach(el => {
      el.disabled = !enabled;
      el.tabIndex = enabled ? 0 : -1;
    });
  });
  tabButtons.forEach(btn => {
    btn.disabled = !enabled;
    btn.tabIndex = enabled ? 0 : -1;
    if (!enabled) {
      btn.dataset._origOnClick = btn.onclick;
      btn.onclick = (e)=> e.preventDefault();
    } else {
      if (btn.dataset._origOnClick) {
        btn.onclick = btn.dataset._origOnClick;
        delete btn.dataset._origOnClick;
      } else { btn.onclick = null; }
    }
  });
  authCard?.classList.toggle('auth-locked', !enabled);
}

async function whoAmI(){
  try{
    const me = await api('/api/users/me');
    const isLoggedIn = !!(me && (me._id || me.id || me.username));
    if (isLoggedIn) {
      setHeaderForUser();
      setAuthEnabled(false);
    } else {
      setHeaderForGuest();
      setAuthEnabled(true);
    }
  }catch{
    setHeaderForGuest();
    setAuthEnabled(true);
  }
}
whoAmI();

const MOCK_GALLERY_WEATHER = [
  { city: 'Tel Aviv', country: 'IL', tempC: 29, condition: 'Clear' },
  { city: 'Paris',    country: 'FR', tempC: 17, condition: 'Clouds' },
  { city: 'New York', country: 'US', tempC: 24, condition: 'Clear' },
  { city: 'London',   country: 'GB', tempC: 14, condition: 'Rain' },
  { city: 'Tokyo',    country: 'JP', tempC: 26, condition: 'Clouds' },
  { city: 'Sydney',   country: 'AU', tempC: 21, condition: 'Clear' },
];

function visitAdvice(tempC, condition){
  if (/rain/i.test(condition)) return { tag:'bad',  text:'Not great (rainy)' };
  if (tempC >= 18 && tempC <= 28) return { tag:'good', text:'Great time to visit' };
  if (tempC < 10 || tempC > 32)   return { tag:'bad',  text:'Not ideal now' };
  return { tag:'ok', text:'Okay, depends on you' };
}

function renderWeatherCharts(data){
  const barCanvas   = document.getElementById('chartTemps');
  const donutCanvas = document.getElementById('chartDonut');
  const legendEl    = document.getElementById('donutLegend');
  if (!barCanvas || !donutCanvas) return;

  const labels = data.map(r => r.city);
  const temps  = data.map(r => r.tempC);
  const counts = { good:0, ok:0, bad:0 };
  data.forEach(r => counts[visitAdvice(r.tempC, r.condition).tag]++);

  new Chart(barCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '°C',
        data: temps,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}°C` } }
      }
    }
  });

  const donut = new Chart(donutCanvas, {
    type: 'doughnut',
    data: {
      labels: ['Great', 'Okay', 'Not good'],
      datasets: [{
        data: [counts.good, counts.ok, counts.bad]
      }]
    },
    options: {
      cutout: '62%',
      plugins: { legend: { display: false } }
    }
  });

  const colors = donut.data.datasets[0].backgroundColor ||
                 donut.getDatasetMeta(0).controller.getStyle(0).backgroundColor;
  const colorAt = i => Array.isArray(colors) ? colors[i] : undefined;

  legendEl.innerHTML = `
    <div class="key"><span class="dot" style="background:${colorAt(0)||'#bbb'}"></span> Great (${counts.good})</div>
    <div class="key"><span class="dot" style="background:${colorAt(1)||'#bbb'}"></span> Okay (${counts.ok})</div>
    <div class="key"><span class="dot" style="background:${colorAt(2)||'#bbb'}"></span> Not good (${counts.bad})</div>
  `;
}

let spotlightTimer = null;
let spotlightIndex = 0;

function renderCitySpotlightItem(el, row){
  const adv = visitAdvice(row.tempC, row.condition);
  el.innerHTML = `
    <div class="spotlight-inner">
      <div class="spotlight-city">${row.city}${row.country ? ` · ${row.country}` : ''}</div>
      <div class="spotlight-temp">${Number.isFinite(row.tempC) ? row.tempC + '°C' : '-'}</div>
      <div class="spotlight-meta">${row.condition || ''}</div>
      <span class="spotlight-badge ${adv.tag}">${adv.text}</span>
    </div>
  `;
}

function startCitySpotlight(data, { intervalMs = 3500 } = {}){
  const host = document.getElementById('citySpotlight');
  if (!host || !Array.isArray(data) || !data.length) return;

  spotlightIndex = 0;
  renderCitySpotlightItem(host, data[spotlightIndex]);

  if (spotlightTimer) clearInterval(spotlightTimer);

  const step = () => {
    spotlightIndex = (spotlightIndex + 1) % data.length;
    renderCitySpotlightItem(host, data[spotlightIndex]);
  };
  spotlightTimer = setInterval(step, intervalMs);

  host.addEventListener('mouseenter', () => { if (spotlightTimer) { clearInterval(spotlightTimer); spotlightTimer = null; }});
  host.addEventListener('mouseleave', () => { if (!spotlightTimer) spotlightTimer = setInterval(step, intervalMs); });
}

async function fetchMetrics(){
  try{
    const data = await api('/api/metrics/landing'); 
    return data || {};
  }catch{ return {}; }
}
function buildDateRange14(){
  const arr = []; const d = new Date(); d.setHours(0,0,0,0);
  for(let i=13;i>=0;i--){
    const x = new Date(d); x.setDate(d.getDate()-i);
    const yyyy = x.getFullYear(); const mm = String(x.getMonth()+1).padStart(2,'0'); const dd = String(x.getDate()).padStart(2,'0');
    arr.push({ key: `${yyyy}-${mm}-${dd}`, label: `${dd}/${mm}` });
  }
  return arr;
}
function ensureSeriesFor14Days(raw){
  const byDate = Object.create(null);
  (raw || []).forEach(r => { byDate[r.date] = r.count || 0; });
  const range = buildDateRange14();
  return { labels: range.map(x => x.label), values: range.map(x => byDate[x.key] || 0) };
}
let postsChart, groupsChart;
function renderPostsChart(ctx, labels, values){
  if(postsChart) postsChart.destroy();
  postsChart = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{
      label:'Posts', data:values, tension:.35, fill:true, borderColor:'#3b82f6',
      backgroundColor:(ctx)=>{ const { chartArea, ctx:c } = ctx.chart; if(!chartArea) return 'rgba(59,130,246,.20)';
        const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        g.addColorStop(0,'rgba(59,130,246,.35)'); g.addColorStop(1,'rgba(59,130,246,.05)'); return g; },
      pointRadius:2, borderWidth:2
    }]},
    options:{ 
      responsive:true, 
      maintainAspectRatio:false, 
      plugins:{ legend:{display:false} },
      scales:{ 
        x:{ grid:{display:false}}, 
        y:{ grid:{ color:'rgba(226,232,240,.6)' }, ticks:{ precision:0 } } 
      } 
    }
  });
}
function renderGroupsChart(ctx, labels, values){
  if(groupsChart) groupsChart.destroy();
  groupsChart = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Members', data:values, borderWidth:1, borderColor:'#22d3ee', backgroundColor:'rgba(34,211,238,.35)' }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false} },
      scales:{ x:{ grid:{display:false}}, y:{ grid:{ color:'rgba(226,232,240,.6)' }, ticks:{ precision:0 } } }
    }
  });
}
async function initLandingCharts(){
  renderWeatherCharts(MOCK_GALLERY_WEATHER);
  startCitySpotlight(MOCK_GALLERY_WEATHER, { intervalMs: 3500 });

  const { postsLast14 = [], topGroups = [] } = await fetchMetrics();
  const s = ensureSeriesFor14Days(postsLast14);
  const postsCtx = document.getElementById('chartPosts14')?.getContext('2d');
  if(postsCtx) renderPostsChart(postsCtx, s.labels, s.values);

  const gLabels = (topGroups || []).map(g => g.name);
  const gValues = (topGroups || []).map(g => g.membersCount);
  const groupsCtx = document.getElementById('chartTopGroups')?.getContext('2d');
  if(groupsCtx) renderGroupsChart(groupsCtx, gLabels, gValues);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', onReady);
} else {
  onReady();
}

async function onReady(){
  try {
    await initLandingCharts();  
  } catch(e){ console.warn('initLandingCharts error:', e); }

  try {
    await initBranchesMap();    
  } catch(e){ console.warn('initBranchesMap error:', e); }
}


let branchesMap = null;       
let branchesLayerGroup = null;

async function fetchBranches(){
  try{
    const res = await fetch('/api/branches', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load branches');
    return await res.json();
  }catch(e){
    console.warn('branches fetch error:', e.message);
    return [];
  }
}

function initBranchesLeafletMap(){
  const el = document.getElementById('branchesMap');
  if (!el) return;

  if (branchesMap) {
    branchesMap.remove();
    branchesMap = null;
  }

  branchesMap = L.map(el, {
    zoomControl: true,
    scrollWheelZoom: false,    
    attributionControl: false,
  }).setView([20, 0], 2);      

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(branchesMap);

  branchesLayerGroup = L.layerGroup().addTo(branchesMap);

  setTimeout(()=> branchesMap.invalidateSize(), 150);
}

function addBranchesMarkers(branches){
  const emptyEl = document.getElementById('branchesEmpty');
  if (!branchesMap || !branchesLayerGroup) return;

  branchesLayerGroup.clearLayers();

  const bounds = [];
  branches.forEach(b=>{
    const lat = b?.coordinates?.lat;
    const lng = b?.coordinates?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const m = L.marker([lat, lng]);
    m.bindPopup(`
      <strong>${escapeHtml(b.name || 'Branch')}</strong><br/>
      <span style="color:#64748b">${escapeHtml(b.address || '')}</span>
    `);
    m.addTo(branchesLayerGroup);
    bounds.push([lat, lng]);
  });

  if (bounds.length) {
    if (emptyEl) emptyEl.style.display = 'none';
    branchesMap.fitBounds(bounds, { padding: [18, 18] });
  } else {
    if (emptyEl) emptyEl.style.display = 'block';
    branchesMap.setView([20, 0], 2);
  }
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

async function initBranchesMap(){
  initBranchesLeafletMap();
  const branches = await fetchBranches();
  addBranchesMarkers(branches);
}

async function initLanding(){
  startCitySpotlight(MOCK_GALLERY_WEATHER, { intervalMs: 3500 });

  const { postsLast14 = [], topGroups = [] } = await fetchMetrics();
  const s = ensureSeriesFor14Days(postsLast14);
  const postsCtx = document.getElementById('chartPosts14')?.getContext('2d');
  if(postsCtx) renderPostsChart(postsCtx, s.labels, s.values);
  const gLabels = (topGroups || []).map(g => g.name);
  const gValues = (topGroups || []).map(g => g.membersCount);
  const groupsCtx = document.getElementById('chartTopGroups')?.getContext('2d');
  if(groupsCtx) renderGroupsChart(groupsCtx, gLabels, gValues);

  await initBranchesMap();
}

function addBranchesMarkers(branches){
  const emptyEl = document.getElementById('branchesEmpty');
  if (!branchesMap || !branchesLayerGroup) return;

  branchesLayerGroup.clearLayers();
  const bounds = [];

  (branches || []).forEach(b=>{
    let lat = b?.coordinates?.lat;
    let lng = b?.coordinates?.lng;

    lat = typeof lat === 'string' ? parseFloat(lat) : lat;
    lng = typeof lng === 'string' ? parseFloat(lng) : lng;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const m = L.marker([lat, lng]);
    m.bindPopup(`
      <strong>${escapeHtml(b.name || 'Branch')}</strong><br/>
      <span style="color:#64748b">${escapeHtml(b.address || '')}</span>
    `);
    m.addTo(branchesLayerGroup);
    bounds.push([lat, lng]);
  });

  if (bounds.length) {
    if (emptyEl) emptyEl.style.display = 'none';
    branchesMap.fitBounds(bounds, { padding: [18, 18] });
  } else {
    if (emptyEl) emptyEl.style.display = 'block';
    branchesMap.setView([20, 0], 2);
  }
}
