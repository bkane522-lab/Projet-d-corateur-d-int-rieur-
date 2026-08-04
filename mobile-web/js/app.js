// js/app.js
// Gère l'état du dossier prospect en cours de constitution (avant envoi au serveur).
// Utilise sessionStorage : rien n'est perdu si le prospect change d'écran,
// tout est nettoyé une fois le dossier envoyé.

// ---------- Enregistrement du service worker (PWA) ----------
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker non enregistré :', err);
    });
  });
}

const DOSSIER_KEY = 'dossier_en_cours';

// ---------- Fuseau horaire Europe/Paris ----------
// Convertit une valeur d'un input datetime-local (heure murale, sans fuseau) en un
// instant UTC correct, en assumant que l'heure saisie est une heure de Paris.
function parisLocalToUTCISOString(datetimeLocalValue) {
  if (!datetimeLocalValue) return null;
  const [datePart, timePart] = datetimeLocalValue.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);

  const guessUTC = Date.UTC(y, m - 1, d, h, mi);
  const guessDate = new Date(guessUTC);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = dtf.formatToParts(guessDate).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const parisAsUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offsetMs = parisAsUTC - guessUTC;

  return new Date(guessUTC - offsetMs).toISOString();
}

function formatParisDate(isoString) {
  if (!isoString) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short'
  }).format(new Date(isoString));
}

// ---------- Échappement HTML (protection XSS) ----------
// À utiliser systématiquement avant d'insérer une donnée utilisateur via innerHTML.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------- Upload direct vers Supabase Storage (bucket privé) ----------
let _supabaseClientPromise = null;

function getSupabaseClient() {
  if (!_supabaseClientPromise) {
    _supabaseClientPromise = (async () => {
      const { supabaseUrl, supabaseAnonKey } = await apiGet('/api/public-config');
      return supabase.createClient(supabaseUrl, supabaseAnonKey);
    })();
  }
  return _supabaseClientPromise;
}

/** kind: 'photo' | 'document' */
async function uploadFileToStorage(file, kind) {
  const { signedUrl, token, path } = await apiPost('/api/upload-url', {
    session_id: getSessionId(),
    filename: file.name,
    contentType: file.type,
    fileSize: file.size,
    kind
  });
  const client = await getSupabaseClient();
  const { error } = await client.storage.from('dossiers-media').uploadToSignedUrl(path, token, file);
  if (error) throw error;
  return path;
}

/** Compresse une image côté client avant envoi : redimensionne et réduit la qualité JPEG. */
function compressImage(file, { maxDim = 1600, quality = 0.75 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Compression échouée'));
          const compressedFile = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
          resolve(compressedFile);
        },
        'image/jpeg', quality
      );
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Estime grossièrement la netteté d'une image (variance des niveaux de gris sur un
 *  échantillon réduit) — pas un vrai laplacien, mais suffisant pour repérer une photo
 *  clairement floue ou bougée avant envoi. */
function estimateSharpness(imgElement) {
  const canvas = document.createElement('canvas');
  const w = 120, h = 90;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgElement, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  let sum = 0, sumSq = 0;
  for (let i = 1; i < gray.length - 1; i++) {
    const laplacian = gray[i - 1] - 2 * gray[i] + gray[i + 1];
    sum += laplacian;
    sumSq += laplacian * laplacian;
  }
  const mean = sum / gray.length;
  const variance = sumSq / gray.length - mean * mean;
  return variance; // seuil indicatif : < ~15 → probablement flou
}
function generateUUIDv4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // Fallback RFC4122 v4 simple, pour les navigateurs très anciens sans crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionId() {
  let sid = sessionStorage.getItem('scan_session_id');
  if (!sid) {
    sid = generateUUIDv4();
    sessionStorage.setItem('scan_session_id', sid);
  }
  return sid;
}

const DossierState = {
  get() {
    const raw = sessionStorage.getItem(DOSSIER_KEY);
    return raw ? JSON.parse(raw) : {
      source_scan: 'manuel',
      photos: [],       // [{dataUrl, legende}]
      mesures: [],      // [{libelle, valeur_cm}]
      reponses: {}       // réponses du questionnaire
    };
  },
  save(partial) {
    const current = this.get();
    const updated = { ...current, ...partial };
    sessionStorage.setItem(DOSSIER_KEY, JSON.stringify(updated));
    return updated;
  },
  addPhoto(photo) {
    const current = this.get();
    current.photos.push(photo);
    sessionStorage.setItem(DOSSIER_KEY, JSON.stringify(current));
  },
  addMesure(mesure) {
    const current = this.get();
    current.mesures.push(mesure);
    sessionStorage.setItem(DOSSIER_KEY, JSON.stringify(current));
  },
  clear() {
    sessionStorage.removeItem(DOSSIER_KEY);
    // scan_session_id n'est retiré qu'ici, c'est-à-dire uniquement après que le serveur
    // a confirmé la création réelle du dossier (seul point d'appel de DossierState.clear()
    // dans tout le projet, voir dossier.html). Le prochain projet du même prospect générera
    // un tout nouvel UUID de session au premier appel de getSessionId().
    sessionStorage.removeItem('scan_session_id');
  }
};

// Helper d'appel API commun — resolveApiUrl (js/config.js) produit un chemin relatif sur
// le site web et une URL absolue vers le domaine de production dans l'app Capacitor.
function apiUrl(path) {
  return typeof resolveApiUrl === 'function' ? resolveApiUrl(path) : path;
}

async function apiPost(path, body, options = {}) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

async function apiGet(path, options = {}) {
  const res = await fetch(apiUrl(path), { headers: options.headers || {} });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

async function apiPatch(path, body, options = {}) {
  const res = await fetch(apiUrl(path), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// Export CommonJS conditionnel : n'existe pas dans le navigateur (pas d'objet `module`),
// utilisé uniquement par les tests Node (voir tests/timezone.test.js) pour vérifier les
// fonctions pures sans dupliquer leur logique.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parisLocalToUTCISOString, formatParisDate, escapeHtml, DossierState, getSessionId, generateUUIDv4 };
}
