/* Fonctions communes aux pages : appel API, session, formatage. */

// Récupère le jeton stocké après connexion.
function getSession() {
  try {
    return JSON.parse(localStorage.getItem('pointeuse_session') || 'null');
  } catch {
    return null;
  }
}
function setSession(s) {
  localStorage.setItem('pointeuse_session', JSON.stringify(s));
}
function clearSession() {
  localStorage.removeItem('pointeuse_session');
}

// Appel générique de l'API. Ajoute automatiquement le jeton.
async function api(path, method = 'GET', body = null) {
  const s = getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (s && s.token) headers['Authorization'] = 'Bearer ' + s.token;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // Session expirée -> retour connexion
    clearSession();
    if (!location.pathname.endsWith('index.html') && location.pathname !== '/') {
      location.href = 'index.html';
    }
  }
  return { status: res.status, data };
}

// Protège une page : redirige vers la connexion si le rôle ne correspond pas.
function requireRole(role) {
  const s = getSession();
  if (!s || !s.user) {
    location.href = 'index.html';
    return null;
  }
  if (role && s.user.role !== role) {
    // Mauvais espace : on renvoie chacun vers le sien.
    location.href = s.user.role === 'admin' ? 'admin.html' : 'employee.html';
    return null;
  }
  return s;
}

async function logout() {
  await api('/api/logout', 'POST');
  clearSession();
  location.href = 'index.html';
}

// Formate des minutes en "3h05".
function fmtMinutes(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}`;
}

// Noms des jours de la semaine (0=Dim).
const DAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function statusBadge(p) {
  const labels = {
    open: 'En cours',
    normal: 'Normal',
    pending: 'En attente',
    validated: 'Validé',
    refused: 'Refusé',
  };
  return `<span class="badge ${p.status}">${labels[p.status] || p.status}</span>`;
}

function typeBadge(type) {
  if (type === 'overtime') return '<span class="badge overtime">Heures sup.</span>';
  if (type === 'recovery') return '<span class="badge recovery">Récupération</span>';
  return '';
}
