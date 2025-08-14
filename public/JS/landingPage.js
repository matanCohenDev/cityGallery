// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Tabs
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  t.classList.add('active');
  document.getElementById(t.dataset.tab + 'Form').classList.add('active');
}));

// -------- API helper (יחיד) --------
async function api(path, method='GET', body){
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include' // keep session cookie
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data.message || data.msg || res.statusText);
  return data;
}

// -------- הרשמה --------
document.getElementById('registerForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  const username = f.username.value.trim();
  const email    = f.email.value.trim();
  const password = f.password.value;

  try{
    await api('/api/users/register','POST',{ username, email, password });
    await api('/api/users/login','POST',{ username, password });
    window.location.href = '/feed'; // אחיד
  }catch(err){
    alert('Register error: ' + err.message);
  }
});

// -------- התחברות --------
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

// -------- כפתור למעלה (Back to feed כשמחובר) --------
const headerBtn = document.getElementById('logoutBtn'); // ב־HTML מוגדר עם display:none

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

// -------- נעילה/שחרור של טפסי ההתחברות/הרשמה --------
const authCard  = document.querySelector('.auth.card');
const tabButtons = document.querySelectorAll('.tabs .tab');
const authForms = [
  document.getElementById('loginForm'),
  document.getElementById('registerForm')
];

function setAuthEnabled(enabled){
  // אלמנטים בטפסים
  authForms.forEach(form => {
    if (!form) return;
    form.querySelectorAll('input, button, select, textarea').forEach(el => {
      el.disabled = !enabled;
      // לא ניתן להגיע עם טאב אם נעול
      el.tabIndex = enabled ? 0 : -1;
    });
  });

  // כפתורי טאבים
  tabButtons.forEach(btn => {
    btn.disabled = !enabled;
    btn.tabIndex = enabled ? 0 : -1;
    // למניעה מוחלטת של קליקים כשנעול
    if (!enabled) {
      btn.dataset._origOnClick = btn.onclick;
      btn.onclick = (e)=> e.preventDefault();
    } else {
      if (btn.dataset._origOnClick) {
        btn.onclick = btn.dataset._origOnClick;
        delete btn.dataset._origOnClick;
      } else {
        btn.onclick = null; // חוזר להתנהגות הרגילה שהוגדרה קודם
      }
    }
  });

  // מחלקת עזר לסטייל (אופציונלי להוסיף CSS)
  authCard?.classList.toggle('auth-locked', !enabled);
}

// -------- מי אני? (בודק סשן, מעדכן כפתור ומנעל/משחרר טפסים) --------
async function whoAmI(){
  try{
    const me = await api('/api/users/me');
    const isLoggedIn = !!(me && (me._id || me.id || me.username));
    if (isLoggedIn) {
      setHeaderForUser();
      setAuthEnabled(false); // ✅ נעול: אי אפשר למלא/להגיש
    } else {
      setHeaderForGuest();
      setAuthEnabled(true);  // ✅ פתוח לאורחים
    }
  }catch{
    setHeaderForGuest();
    setAuthEnabled(true);
  }
}

// קריאה ראשונית
whoAmI();

// ===== Metrics charts (landing) =====
async function fetchMetrics(){
  try{
    const data = await api('/api/metrics/landing');
    return data || {};
  }catch(e){
    console.warn('metrics fetch error:', e.message);
    return {};
  }
}

function buildDateRange14(){
  const arr = [];
  const d = new Date(); d.setHours(0,0,0,0);
  for(let i=13;i>=0;i--){
    const x = new Date(d); x.setDate(d.getDate()-i);
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth()+1).padStart(2,'0');
    const dd = String(x.getDate()).padStart(2,'0');
    arr.push({ key: `${yyyy}-${mm}-${dd}`, label: `${dd}/${mm}` });
  }
  return arr;
}

function ensureSeriesFor14Days(raw){
  const byDate = Object.create(null);
  (raw || []).forEach(r => { byDate[r.date] = r.count || 0; });
  const range = buildDateRange14();
  return {
    labels: range.map(x => x.label),
    values: range.map(x => byDate[x.key] || 0)
  };
}

let postsChart, groupsChart;

function renderPostsChart(ctx, labels, values){
  if(postsChart) postsChart.destroy();
  postsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Posts',
        data: values,
        tension: 0.35,
        fill: true,
        borderColor: '#3b82f6',
        backgroundColor: (ctx) => {
          const { chart } = ctx;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(59,130,246,.20)';
          const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          g.addColorStop(0, 'rgba(59,130,246,.35)');
          g.addColorStop(1, 'rgba(59,130,246,.05)');
          return g;
        },
        pointRadius: 2,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { display:false } },
        y: { grid: { color: 'rgba(226,232,240,.6)' }, ticks: { precision: 0 } }
      }
    }
  });
}

function renderGroupsChart(ctx, labels, values){
  if(groupsChart) groupsChart.destroy();
  groupsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Members',
        data: values,
        borderWidth: 1,
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34,211,238,.35)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display:false } },
      scales: {
        x: { grid: { display:false } },
        y: { grid: { color: 'rgba(226,232,240,.6)' }, ticks: { precision:0 } }
      }
    }
  });
}

async function initLandingCharts(){
  const { postsLast14 = [], topGroups = [] } = await fetchMetrics();

  // Line (posts 14 days)
  const series = ensureSeriesFor14Days(postsLast14);
  const postsCtx = document.getElementById('chartPosts14')?.getContext('2d');
  if(postsCtx) renderPostsChart(postsCtx, series.labels, series.values);

  // Bar (top groups)
  const gLabels = (topGroups || []).map(g => g.name);
  const gValues = (topGroups || []).map(g => g.membersCount);
  const groupsCtx = document.getElementById('chartTopGroups')?.getContext('2d');
  if(groupsCtx) renderGroupsChart(groupsCtx, gLabels, gValues);
}

// הפעלה ראשונית של הגרפים (לא תלוי סטטוס התחברות)
initLandingCharts().catch(()=>{});
