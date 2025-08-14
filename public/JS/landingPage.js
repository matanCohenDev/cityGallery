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

// API helper
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

// Register
document.getElementById('registerForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const f = e.target;
  const username = f.username.value.trim();
  const email    = f.email.value.trim();
  const password = f.password.value;

  try{
    // 1) create the account
    await api('/api/users/register','POST',{ username, email, password });

    // 2) auto-login (so session cookie is set)
    await api('/api/users/login','POST',{ username, password });

    // 3) go to feed
    window.location.href = '/feed.html';
  }catch(err){
    alert('Register error: ' + err.message);
  }
});

// Login
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

// Who am I / Logout
async function whoAmI(){
  const out = document.getElementById('meOut');
  try{ out.textContent = JSON.stringify(await api('/api/users/me'), null, 2); }
  catch{ out.textContent = 'Not signed in.'; }
}
document.getElementById('whoamiBtn').addEventListener('click', ()=> whoAmI());
document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  try{ await api('/api/users/logout','POST'); alert('Logged out'); whoAmI(); }
  catch(err){ alert('Logout error: ' + err.message); }
});

// Initial quiet status
whoAmI().catch(()=>{});
