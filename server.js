/*
 * Pointeuse - École des devoirs
 * ------------------------------------------------------------
 * Petit serveur HTTP sans aucune dépendance externe (modules Node natifs).
 * - Sert les fichiers statiques du dossier /public
 * - Expose une petite API JSON sous /api/*
 * - Stocke tout dans data/db.json
 *
 * Lancement :   node server.js
 * Puis ouvrir : http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/* ------------------------------------------------------------------ */
/*  Base de données (fichier JSON très simple)                         */
/* ------------------------------------------------------------------ */

// Données par défaut créées au premier lancement.
// Chaque employée et l'admin se connectent avec un code PIN.
const DEFAULT_DB = {
  users: [
    { id: 'emp1',  name: 'Employée 1', role: 'employee', pin: '1111' },
    { id: 'emp2',  name: 'Employée 2', role: 'employee', pin: '2222' },
    { id: 'admin', name: 'Admin',      role: 'admin',    pin: '0000' },
  ],
  // Horaires imposés par l'admin. days = jours obligatoires (0=Dim ... 6=Sam)
  schedules: {
    emp1: { start: '14:00', end: '18:00', days: [1, 2, 3, 4, 5] },
    emp2: { start: '14:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  },
  // Historique des pointages
  punches: [],
};

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('db.json illisible, réinitialisation.', e);
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

let db = loadDB();

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

/* ------------------------------------------------------------------ */
/*  Sessions (jetons en mémoire)                                       */
/* ------------------------------------------------------------------ */

// token -> userId. Perdu si le serveur redémarre => il suffit de se reconnecter.
const sessions = new Map();

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function userFromToken(token) {
  const userId = sessions.get(token);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) || null;
}

/* ------------------------------------------------------------------ */
/*  Utilitaires temps                                                  */
/* ------------------------------------------------------------------ */

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// "2026-07-09" -> jour de la semaine (0=Dim ... 6=Sam), sans décalage de fuseau.
function weekday(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).getDay();
}

// Minutes travaillées EN DEHORS de l'horaire imposé (écart).
function minutesOutsideSchedule(dateStr, clockIn, clockOut, schedule) {
  const inMin = toMinutes(clockIn);
  const outMin = toMinutes(clockOut);
  const worked = Math.max(0, outMin - inMin);

  // Pas d'horaire défini ou jour non obligatoire => toute la session est "hors horaire".
  if (!schedule || !schedule.days.includes(weekday(dateStr))) {
    return worked;
  }
  const sStart = toMinutes(schedule.start);
  const sEnd = toMinutes(schedule.end);

  let outside = 0;
  if (inMin < sStart) outside += Math.min(outMin, sStart) - inMin; // arrivée en avance
  if (outMin > sEnd) outside += outMin - Math.max(inMin, sEnd);    // départ en retard
  return Math.max(0, outside);
}

function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function workedMinutes(p) {
  if (!p.clockIn || !p.clockOut) return 0;
  return Math.max(0, toMinutes(p.clockOut) - toMinutes(p.clockIn));
}

/* ------------------------------------------------------------------ */
/*  Helpers HTTP                                                       */
/* ------------------------------------------------------------------ */

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy(); // garde-fou
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function getToken(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/* ------------------------------------------------------------------ */
/*  Routes API                                                         */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method;
  const route = url.pathname;

  /* ---- Connexion ---- */
  if (route === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const user = db.users.find(
      (u) => u.id === body.userId && String(u.pin) === String(body.pin)
    );
    if (!user) return sendJSON(res, 401, { error: 'Identifiant ou code PIN incorrect.' });
    const token = newToken();
    sessions.set(token, user.id);
    return sendJSON(res, 200, {
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });
  }

  // Liste publique des comptes (pour l'écran de connexion) - sans les PIN.
  if (route === '/api/users' && method === 'GET') {
    return sendJSON(res, 200, {
      users: db.users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    });
  }

  /* ---- À partir d'ici : authentification requise ---- */
  const me = userFromToken(getToken(req));
  if (!me) return sendJSON(res, 401, { error: 'Non authentifié.' });

  if (route === '/api/logout' && method === 'POST') {
    sessions.delete(getToken(req));
    return sendJSON(res, 200, { ok: true });
  }

  // Infos du compte courant + son horaire imposé.
  if (route === '/api/me' && method === 'GET') {
    return sendJSON(res, 200, {
      user: { id: me.id, name: me.name, role: me.role },
      schedule: db.schedules[me.id] || null,
    });
  }

  /* ---------------- Espace EMPLOYÉE ---------------- */

  // Pointage courant ouvert (sans heure de sortie) s'il existe.
  if (route === '/api/clock/status' && method === 'GET') {
    const open = db.punches.find((p) => p.userId === me.id && !p.clockOut);
    return sendJSON(res, 200, { open: open || null });
  }

  // Commencer le travail
  if (route === '/api/clock/in' && method === 'POST') {
    if (me.role !== 'employee')
      return sendJSON(res, 403, { error: "Réservé aux employées." });
    const already = db.punches.find((p) => p.userId === me.id && !p.clockOut);
    if (already)
      return sendJSON(res, 409, { error: 'Un pointage est déjà en cours.' });

    const { date, time } = nowParts();
    const punch = {
      id: crypto.randomUUID(),
      userId: me.id,
      date,
      clockIn: time,
      clockOut: null,
      status: 'open',           // open | normal | pending | validated | refused
      type: null,               // null | overtime | recovery
      justification: '',
      deviationMinutes: 0,
    };
    db.punches.push(punch);
    saveDB();
    return sendJSON(res, 200, { punch });
  }

  // Terminer le travail (exige une justification si hors horaire).
  if (route === '/api/clock/out' && method === 'POST') {
    if (me.role !== 'employee')
      return sendJSON(res, 403, { error: "Réservé aux employées." });
    const body = await readBody(req);
    const punch = db.punches.find((p) => p.userId === me.id && !p.clockOut);
    if (!punch)
      return sendJSON(res, 409, { error: 'Aucun pointage en cours.' });

    const { time } = nowParts();
    const deviation = minutesOutsideSchedule(
      punch.date, punch.clockIn, time, db.schedules[me.id]
    );

    // Écart significatif (> 5 min) => justification obligatoire.
    if (deviation > 5) {
      const justif = (body.justification || '').trim();
      if (!justif) {
        return sendJSON(res, 422, {
          needJustification: true,
          deviationMinutes: deviation,
          error:
            "Vous pointez en dehors de l'horaire imposé (" +
            deviation +
            ' min). Une justification est obligatoire.',
        });
      }
      punch.clockOut = time;
      punch.deviationMinutes = deviation;
      punch.justification = justif;
      punch.status = 'pending'; // en attente de validation admin
      punch.type = null;
    } else {
      punch.clockOut = time;
      punch.deviationMinutes = 0;
      punch.status = 'normal';
    }
    saveDB();
    return sendJSON(res, 200, { punch });
  }

  // Historique de l'employée connectée.
  if (route === '/api/my-punches' && method === 'GET') {
    const list = db.punches
      .filter((p) => p.userId === me.id)
      .map((p) => ({ ...p, workedMinutes: workedMinutes(p) }))
      .sort((a, b) => (a.date + a.clockIn < b.date + b.clockIn ? 1 : -1));
    return sendJSON(res, 200, { punches: list });
  }

  /* ---------------- Espace ADMIN ---------------- */

  if (route.startsWith('/api/admin/')) {
    if (me.role !== 'admin')
      return sendJSON(res, 403, { error: 'Accès administrateur requis.' });

    // Tous les pointages (avec filtre optionnel période / employée).
    if (route === '/api/admin/punches' && method === 'GET') {
      const userId = url.searchParams.get('userId');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      let list = db.punches.slice();
      if (userId) list = list.filter((p) => p.userId === userId);
      if (from) list = list.filter((p) => p.date >= from);
      if (to) list = list.filter((p) => p.date <= to);
      list = list
        .map((p) => ({
          ...p,
          workedMinutes: workedMinutes(p),
          userName: (db.users.find((u) => u.id === p.userId) || {}).name,
        }))
        .sort((a, b) => (a.date + a.clockIn < b.date + b.clockIn ? 1 : -1));
      return sendJSON(res, 200, { punches: list });
    }

    // Justifications en attente.
    if (route === '/api/admin/pending' && method === 'GET') {
      const list = db.punches
        .filter((p) => p.status === 'pending')
        .map((p) => ({
          ...p,
          workedMinutes: workedMinutes(p),
          userName: (db.users.find((u) => u.id === p.userId) || {}).name,
        }))
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      return sendJSON(res, 200, { punches: list });
    }

    // Valider / refuser une justification + classer en HS ou récupération.
    if (route === '/api/admin/validate' && method === 'POST') {
      const body = await readBody(req);
      const punch = db.punches.find((p) => p.id === body.punchId);
      if (!punch) return sendJSON(res, 404, { error: 'Pointage introuvable.' });

      if (body.decision === 'validate') {
        punch.status = 'validated';
        punch.type = body.type === 'recovery' ? 'recovery' : 'overtime';
      } else if (body.decision === 'refuse') {
        punch.status = 'refused';
        punch.type = null;
      } else {
        return sendJSON(res, 400, { error: 'Décision invalide.' });
      }
      saveDB();
      return sendJSON(res, 200, { punch });
    }

    // Lire tous les horaires imposés.
    if (route === '/api/admin/schedules' && method === 'GET') {
      return sendJSON(res, 200, {
        schedules: db.schedules,
        users: db.users
          .filter((u) => u.role === 'employee')
          .map((u) => ({ id: u.id, name: u.name })),
      });
    }

    // Définir / modifier l'horaire imposé d'une employée.
    if (route === '/api/admin/schedule' && method === 'POST') {
      const body = await readBody(req);
      const target = db.users.find(
        (u) => u.id === body.userId && u.role === 'employee'
      );
      if (!target) return sendJSON(res, 404, { error: 'Employée introuvable.' });
      db.schedules[body.userId] = {
        start: body.start || '14:00',
        end: body.end || '18:00',
        days: Array.isArray(body.days) ? body.days.map(Number) : [1, 2, 3, 4, 5],
      };
      saveDB();
      return sendJSON(res, 200, { schedule: db.schedules[body.userId] });
    }

    // Seul l'admin peut corriger un pointage (heures, statut...).
    if (route === '/api/admin/edit-punch' && method === 'POST') {
      const body = await readBody(req);
      const punch = db.punches.find((p) => p.id === body.punchId);
      if (!punch) return sendJSON(res, 404, { error: 'Pointage introuvable.' });
      if (body.clockIn) punch.clockIn = body.clockIn;
      if (body.clockOut !== undefined) punch.clockOut = body.clockOut;
      if (body.status) punch.status = body.status;
      if (body.type !== undefined) punch.type = body.type;
      // Recalcule l'écart si les deux heures sont présentes.
      if (punch.clockIn && punch.clockOut) {
        punch.deviationMinutes = minutesOutsideSchedule(
          punch.date, punch.clockIn, punch.clockOut, db.schedules[punch.userId]
        );
      }
      saveDB();
      return sendJSON(res, 200, { punch });
    }

    // Statistiques globales.
    if (route === '/api/admin/stats' && method === 'GET') {
      const stats = {};
      db.users
        .filter((u) => u.role === 'employee')
        .forEach((u) => {
          stats[u.id] = {
            name: u.name,
            workedMinutes: 0,
            overtimeMinutes: 0,
            recoveryMinutes: 0,
            pendingCount: 0,
          };
        });
      db.punches.forEach((p) => {
        const s = stats[p.userId];
        if (!s) return;
        if (p.clockOut && p.status !== 'refused') {
          s.workedMinutes += workedMinutes(p);
        }
        if (p.status === 'validated' && p.type === 'overtime')
          s.overtimeMinutes += p.deviationMinutes;
        if (p.status === 'validated' && p.type === 'recovery')
          s.recoveryMinutes += p.deviationMinutes;
        if (p.status === 'pending') s.pendingCount += 1;
      });
      return sendJSON(res, 200, { stats });
    }
  }

  return sendJSON(res, 404, { error: 'Route inconnue.' });
}

/* ------------------------------------------------------------------ */
/*  Fichiers statiques                                                 */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res, url) {
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(pathname));

  // Empêche de sortir du dossier public.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Interdit');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Page introuvable');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ */
/*  Serveur                                                            */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: 'Erreur serveur.' });
  }
});

server.listen(PORT, () => {
  console.log(`Pointeuse démarrée sur http://localhost:${PORT}`);
  console.log('Comptes par défaut :');
  console.log('  - Employée 1 (PIN 1111)');
  console.log('  - Employée 2 (PIN 2222)');
  console.log('  - Admin      (PIN 0000)');
});
