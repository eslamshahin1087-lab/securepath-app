/* SecurePath Free Backend
 * Cloudflare Workers + Firestore REST API
 * No Firebase Cloud Functions required.
 */
const PROJECT_ID = 'path-1a672';
const DB_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FIREBASE_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const FIREBASE_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

const CLOUDINARY_CLOUD_NAME = 'zs4wny34';
const CLOUDINARY_API_KEY = '147401369695394';
const CLOUDINARY_ALLOWED_PREFIX = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/`;

const POINTS = {
  assessment: 30,
  documentUpload: 10,
  coverageDiversify: 50,
  earlyRenewal: 40,
  profileComplete: 20,
  referralShare: 15,
  habits: {
    walking: { points: 5, streakBonus: 10, streakEvery: 7, ar: 'المشي', en: 'Walking' },
    running: { points: 8, streakBonus: 15, streakEvery: 7, ar: 'الجري', en: 'Running' },
    healthyEating: { points: 5, streakBonus: 10, streakEvery: 7, ar: 'الأكل الصحي', en: 'Healthy eating' },
    hydration: { points: 5, streakBonus: 10, streakEvery: 7, ar: 'شرب المياه', en: 'Hydration' },
    sleep: { points: 5, streakBonus: 10, streakEvery: 7, ar: 'نوم كافٍ', en: 'Good sleep' },
    readTip: { points: 5, streakBonus: 10, streakEvery: 7, ar: 'قراءة نصيحة تأمينية', en: 'Read an insurance tip' }
  },
  drivingManual: { points: 6, streakBonus: 15, streakEvery: 7 },
  gpsDriving: { points: 8, streakBonus: 15, streakEvery: 7 }
};

const MAX_REDEEM_POINTS = 1500;
const POINTS_PER_DISCOUNT_PERCENT = 100;
const MAX_DOCS_PER_DAY = 3;
const GPS_MIN_DURATION_SEC = 60;
const GPS_MIN_COMPLIANCE = 0.50;
const GPS_SPEED_TOLERANCE_KMH = 5;
const MAX_GPS_SAMPLES = 600;

const ROAD_TYPES = {
  city: { limitKmh: 60, ar: 'طريق داخل المدينة', en: 'City road' },
  main: { limitKmh: 90, ar: 'طريق رئيسي', en: 'Main road' },
  highway: { limitKmh: 120, ar: 'طريق سريع / صحراوي', en: 'Highway' }
};

let cachedGoogleToken = null;
let cachedGoogleTokenExp = 0;
let cachedFirebaseKeys = null;
let cachedFirebaseKeysAt = 0;

function b64url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlText(text) {
  return b64url(new TextEncoder().encode(text));
}

function decodeB64urlText(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

function decodeJwtPart(value) {
  return JSON.parse(decodeB64urlText(value));
}

function pemToArrayBuffer(pem) {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(clean);
  return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}

function base64urlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function signServiceJwt(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64urlText(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: DATASTORE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(header + '.' + payload)
  );
  return header + '.' + payload + '.' + b64url(new Uint8Array(signature));
}

async function getGoogleAccessToken(env) {
  if (cachedGoogleToken && Date.now() < cachedGoogleTokenExp - 60000) return cachedGoogleToken;
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  }

  const assertion = await signServiceJwt(serviceAccount);
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!res.ok) throw new Error('Failed to obtain Google access token');
  const data = await res.json();
  cachedGoogleToken = data.access_token;
  cachedGoogleTokenExp = Date.now() + Number(data.expires_in || 3600) * 1000;
  return cachedGoogleToken;
}

async function getFirebaseKeys() {
  if (cachedFirebaseKeys && Date.now() - cachedFirebaseKeysAt < 55 * 60 * 1000) {
    return cachedFirebaseKeys;
  }
  const res = await fetch(FIREBASE_JWKS);
  if (!res.ok) throw new Error('Failed to load Firebase public keys');
  const body = await res.json();
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cachedFirebaseKeys = Object.fromEntries(
    keys.filter(k => k && k.kid && k.kty === 'RSA').map(k => [k.kid, k])
  );
  cachedFirebaseKeysAt = Date.now();
  return cachedFirebaseKeys;
}

async function verifyFirebaseIdToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed Firebase ID token');

  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported token');

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== FIREBASE_ISSUER || payload.aud !== PROJECT_ID) throw new Error('Invalid token issuer/audience');
  if (!payload.sub || payload.sub.length > 128) throw new Error('Invalid token subject');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Token expired');
  if (typeof payload.iat !== 'number' || payload.iat > now + 300) throw new Error('Invalid token issue time');
  if (typeof payload.auth_time !== 'number' || payload.auth_time > now + 300) throw new Error('Invalid authentication time');

  let keys = await getFirebaseKeys();
  let jwk = keys[header.kid];
  if (!jwk) {
    cachedFirebaseKeys = null;
    cachedFirebaseKeysAt = 0;
    keys = await getFirebaseKeys();
    jwk = keys[header.kid];
    if (!jwk) throw new Error('Unknown token key');
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64urlToBytes(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1])
  );
  if (!valid) throw new Error('Invalid token signature');

  return payload;
}

function getBearer(request) {
  const value = request.headers.get('Authorization') || '';
  const match = value.match(/^Bearer\\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function timestampMillis(value) {
  if (!value) return 0;
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isRecent(value, maxAgeMs) {
  const t = timestampMillis(value);
  return t > 0 && Math.abs(Date.now() - t) <= maxAgeMs;
}

function daysBetweenCairo(a, b) {
  if (!a || !b) return 9999;
  const x = new Date(a + 'T00:00:00+02:00');
  const y = new Date(b + 'T00:00:00+02:00');
  return Math.round((y - x) / 86400000);
}

function clientDisplayName(data) {
  return String(data?.name || data?.fullName || data?.username || '').trim();
}

function clientPhone(data) {
  return String(data?.phone || '').trim();
}

function canonicalTypeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hashTrip(samples) {
  const raw = samples.map(s => Number(s.lat).toFixed(5) + ',' + Number(s.lng).toFixed(5) + ',' + Number(s.t)).join('|');
  const data = new TextEncoder().encode(raw);
  return crypto.subtle.digest('SHA-256', data).then(buf => b64url(new Uint8Array(buf)));
}

function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (value === true || value === false) return { booleanValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = encodeFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function decodeFirestoreValue(value) {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) out[k] = decodeFirestoreValue(v);
    return out;
  }
  return null;
}

function decodeFirestoreDoc(doc) {
  if (!doc) return null;
  const data = {};
  for (const [k, v] of Object.entries(doc.fields || {})) data[k] = decodeFirestoreValue(v);
  return { ...data, __name: doc.name, __updateTime: doc.updateTime || null };
}

async function firestoreRequest(env, path, options = {}) {
  const token = await getGoogleAccessToken(env);
  const res = await fetch(DB_ROOT + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res;
}

async function getDoc(env, collection, id) {
  const res = await firestoreRequest(env, '/' + encodeURIComponent(collection) + '/' + encodeURIComponent(id));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore read failed: ' + res.status);
  return decodeFirestoreDoc(await res.json());
}

function documentName(collection, id) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${id}`;
}

function makeUpdateWrite(collection, id, fields, updateTime) {
  return {
    update: {
      name: documentName(collection, id),
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeFirestoreValue(v)]))
    },
    updateMask: { fieldPaths: Object.keys(fields) },
    ...(updateTime ? { currentDocument: { updateTime } } : {})
  };
}

function makeCreateWrite(collection, id, fields) {
  return {
    update: {
      name: documentName(collection, id),
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeFirestoreValue(v)]))
    },
    currentDocument: { exists: false }
  };
}

async function commitWrites(env, writes) {
  const res = await firestoreRequest(env, ':commit', {
    method: 'POST',
    body: JSON.stringify({ writes })
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error('Firestore commit failed: ' + res.status);
    err.status = res.status;
    err.detail = text;
    throw err;
  }
  return res.json();
}

function json(data, status = 200, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function isAllowedOrigin(origin) {
  return !origin
    || origin === 'https://eslamshahin1087-lab.github.io'
    || origin === 'http://localhost'
    || origin.startsWith('http://localhost:');
}

async function authenticate(request) {
  const token = getBearer(request);
  if (!token) {
    const e = new Error('Authentication required');
    e.status = 401;
    throw e;
  }
  try {
    return await verifyFirebaseIdToken(token);
  } catch (e) {
    e.status = 401;
    throw e;
  }
}

async function isAdminUser(env, uid, claims) {
  if (claims?.securepathAdmin === true) return true;
  return !!(await getDoc(env, 'admin', uid));
}

function normalizedEvent(data) {
  return String(data?.event || '').trim();
}

async function issuePoints(env, uid, client, points, category, descriptionAr, descriptionEn, changedFields, extraWrites = []) {
  if (!Number.isInteger(points) || points <= 0) throw new Error('Invalid points');
  const newFields = {
    insuraPoints: Number(client.insuraPoints || 0) + points,
    insuraPointsLifetime: Number(client.insuraPointsLifetime || 0) + points,
    ...changedFields
  };
  const pointLogId = crypto.randomUUID().replace(/-/g, '');
  const writes = [
    makeUpdateWrite('clients', uid, newFields, client.__updateTime),
    makeCreateWrite('pointsLog', pointLogId, {
      clientId: uid,
      clientName: clientDisplayName(client),
      category,
      points,
      descriptionAr,
      descriptionEn,
      createdAt: new Date().toISOString()
    }),
    ...extraWrites
  ];
  await commitWrites(env, writes);
  return { ok: true, points };
}

async function handlePoints(env, uid, data) {
  const event = normalizedEvent(data);
  const today = todayKey();
  const client = await getDoc(env, 'clients', uid);
  if (!client) throw new Error('Client profile not found');

  if (event === 'assessment') {
    const last = client.pointsFlags?.lastAssessmentAwardAt || '';
    if (last && daysBetweenCairo(last, today) < 30) return { ok: true, points: 0, reason: 'cooldown' };
    const assessment = await getDoc(env, 'insuranceAssessments', uid);
    if (!assessment || !isRecent(assessment.updatedAt || assessment.timestamp, 15 * 60 * 1000)) {
      throw new Error('Assessment must be completed recently');
    }
    return issuePoints(env, uid, client, POINTS.assessment, 'insurance_habit',
      'إتمام تقييم الحماية الشامل', 'Completed the full protection assessment',
      { pointsFlags: { ...(client.pointsFlags || {}), lastAssessmentAwardAt: today } });
  }

  if (event === 'diversification') {
    const policyId = String(data?.policyId || '');
    if (!policyId) throw new Error('policyId is required');
    const policy = await getDoc(env, 'policies', policyId);
    if (!policy || policy.clientId !== uid) throw new Error('Policy not found');
    const typeKey = canonicalTypeKey(policy.type || policy.typeName || policy.category);
    if (!typeKey) throw new Error('Policy type missing');
    const earned = Array.isArray(client.pointsFlags?.diversifyTypes) ? client.pointsFlags.diversifyTypes : [];
    if (earned.includes(typeKey)) return { ok: true, points: 0, reason: 'coverage_already_awarded' };
    return issuePoints(env, uid, client, POINTS.coverageDiversify, 'insurance_habit',
      'تنويع التغطية التأمينية', 'Diversified insurance coverage',
      { pointsFlags: { ...(client.pointsFlags || {}), diversifyTypes: earned.concat(typeKey) } });
  }

  if (event === 'renewal') {
    const policyId = String(data?.policyId || '');
    if (!policyId) throw new Error('policyId is required');
    const policy = await getDoc(env, 'policies', policyId);
    if (!policy || policy.clientId !== uid) throw new Error('Policy not found');
    const endDate = policy.endDate ? new Date(policy.endDate) : null;
    const daysLeft = endDate && !Number.isNaN(endDate.getTime())
      ? Math.ceil((endDate.getTime() - Date.now()) / 86400000)
      : 9999;
    if (daysLeft > 45) throw new Error('Renewal reward is only available within 45 days of expiry');
    const ids = Array.isArray(client.pointsFlags?.renewedPolicyIds) ? client.pointsFlags.renewedPolicyIds : [];
    if (ids.includes(policyId)) return { ok: true, points: 0, reason: 'renewal_already_awarded' };
    return issuePoints(env, uid, client, POINTS.earlyRenewal, 'insurance_habit',
      'طلب تجديد الوثيقة قبل انتهائها', 'Requested renewal before policy expiry',
      { pointsFlags: { ...(client.pointsFlags || {}), renewedPolicyIds: ids.concat(policyId) } });
  }

  if (event === 'profileComplete') {
    const required = ['fullName', 'birthDate', 'gender', 'phone', 'occupation', 'clientType'];
    if (!required.every(key => String(client[key] || '').trim() !== '')) throw new Error('Profile is not complete');
    if (client.pointsFlags?.profileCompleteAwarded) return { ok: true, points: 0, reason: 'profile_already_awarded' };
    return issuePoints(env, uid, client, POINTS.profileComplete, 'insurance_habit',
      'استكمال بيانات الملف الشخصي', 'Completed profile information',
      { pointsFlags: { ...(client.pointsFlags || {}), profileCompleteAwarded: true } });
  }

  if (event === 'referralShare') {
    const last = client.pointsFlags?.lastReferralShareAwardAt || '';
    if (last && daysBetweenCairo(last, today) < 30) return { ok: true, points: 0, reason: 'cooldown' };
    return issuePoints(env, uid, client, POINTS.referralShare, 'insurance_habit',
      'مشاركة رابط دعوة صديق', 'Shared the referral link',
      { pointsFlags: { ...(client.pointsFlags || {}), lastReferralShareAwardAt: today } });
  }

  if (event === 'habit') {
    const habit = String(data?.habit || '');
    const cfg = POINTS.habits[habit];
    if (!cfg) throw new Error('Unknown habit');
    const current = client.habitData?.[habit] || { streak: 0, lastDate: '', totalDays: 0 };
    if (current.lastDate === today) return { ok: true, points: 0, reason: 'habit_already_done' };
    const gap = daysBetweenCairo(current.lastDate, today);
    const streak = gap === 1 ? Number(current.streak || 0) + 1 : 1;
    const bonus = streak % cfg.streakEvery === 0 ? cfg.streakBonus : 0;
    const awarded = cfg.points + bonus;
    const habitData = { ...(client.habitData || {}) };
    habitData[habit] = { streak, lastDate: today, totalDays: Number(current.totalDays || 0) + 1 };
    return issuePoints(env, uid, client, awarded, 'health_habit',
      cfg.ar + (bonus ? ' (تتابع + مكافأة)' : ''), cfg.en + (bonus ? ' (streak bonus)' : ''),
      { habitData });
  }

  if (event === 'drivingManual') {
    const current = client.drivingData || { streak: 0, lastDate: '', totalDays: 0 };
    if (current.lastDate === today) return { ok: true, points: 0, reason: 'already_done' };
    const gap = daysBetweenCairo(current.lastDate, today);
    const streak = gap === 1 ? Number(current.streak || 0) + 1 : 1;
    const bonus = streak % POINTS.drivingManual.streakEvery === 0 ? POINTS.drivingManual.streakBonus : 0;
    const awarded = POINTS.drivingManual.points + bonus;
    return issuePoints(env, uid, client, awarded, 'safe_driving',
      'الالتزام بقيادة آمنة اليوم', 'Committed to safe driving today',
      { drivingData: { streak, lastDate: today, totalDays: Number(current.totalDays || 0) + 1 } });
  }

  if (event === 'gpsDriving') {
    const roadKey = String(data?.roadKey || '');
    const road = ROAD_TYPES[roadKey];
    const samples = data?.samples;
    if (!road || !Array.isArray(samples) || samples.length < 5 || samples.length > MAX_GPS_SAMPLES) {
      throw new Error('Invalid GPS data');
    }
    const clean = samples.map(s => ({
      lat: Number(s?.lat),
      lng: Number(s?.lng),
      t: Number(s?.t),
      accuracy: s?.accuracy == null ? 0 : Number(s.accuracy)
    })).filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng) && Number.isFinite(s.t)
      && s.lat >= -90 && s.lat <= 90 && s.lng >= -180 && s.lng <= 180
      && (!s.accuracy || (Number.isFinite(s.accuracy) && s.accuracy <= 100)));
    clean.sort((a, b) => a.t - b.t);
    if (clean.length < 5) throw new Error('Not enough valid GPS samples');
    const durationSec = (clean.at(-1).t - clean[0].t) / 1000;
    if (!Number.isFinite(durationSec) || durationSec < GPS_MIN_DURATION_SEC || durationSec > 7200) {
      throw new Error('Invalid trip duration');
    }
    let validIntervals = 0;
    let compliantIntervals = 0;
    for (let i = 1; i < clean.length; i++) {
      const dt = (clean[i].t - clean[i - 1].t) / 1000;
      if (dt <= 0 || dt > 30) continue;
      const speed = (haversineMeters(clean[i - 1].lat, clean[i - 1].lng, clean[i].lat, clean[i].lng) / dt) * 3.6;
      if (!Number.isFinite(speed) || speed > 300) continue;
      validIntervals++;
      if (speed <= road.limitKmh + GPS_SPEED_TOLERANCE_KMH) compliantIntervals++;
    }
    if (validIntervals < 3) throw new Error('Not enough valid speed intervals');
    const compliance = compliantIntervals / validIntervals;
    const compliancePct = Math.round(compliance * 100);
    if (compliance < GPS_MIN_COMPLIANCE) return { ok: true, points: 0, compliancePct, reason: 'speed_violations' };
    if (client.gpsDrivingData?.lastDate === today) return { ok: true, points: 0, compliancePct, reason: 'already_done' };

    const tripHash = await hashTrip(clean);
    const oldHashes = Array.isArray(client.gpsDrivingData?.recentTripHashes) ? client.gpsDrivingData.recentTripHashes : [];
    if (oldHashes.includes(tripHash)) return { ok: true, points: 0, compliancePct, reason: 'replayed_trip' };

    const gap = daysBetweenCairo(client.gpsDrivingData?.lastDate, today);
    const streak = gap === 1 ? Number(client.gpsDrivingData?.streak || 0) + 1 : 1;
    const bonus = streak % POINTS.gpsDriving.streakEvery === 0 ? POINTS.gpsDriving.streakBonus : 0;
    const awarded = POINTS.gpsDriving.points + bonus;
    const hashes = oldHashes.slice(-19);
    hashes.push(tripHash);
    const result = await issuePoints(env, uid, client, awarded, 'safe_driving_gps',
      'رحلة قيادة بتتبع GPS بنسبة التزام ' + compliancePct + '%',
      'GPS-tracked trip with ' + compliancePct + '% speed compliance',
      { gpsDrivingData: { streak, lastDate: today, totalTrips: Number(client.gpsDrivingData?.totalTrips || 0) + 1, recentTripHashes: hashes } });
    return { ...result, compliancePct };
  }

  throw new Error('Unknown points event');
}

async function handleRedeem(env, uid, data) {
  const requested = Number.parseInt(data?.points, 10);
  if (!Number.isInteger(requested) || requested <= 0) throw new Error('Invalid points amount');
  const client = await getDoc(env, 'clients', uid);
  if (!client) throw new Error('Client not found');

  const available = Math.max(0, Number(client.insuraPoints || 0));
  const pts = Math.min(requested, available, MAX_REDEEM_POINTS);
  const redeem = pts - (pts % POINTS_PER_DISCOUNT_PERCENT);
  if (redeem <= 0) throw new Error('Not enough points to redeem');

  const discountPercent = Math.min(Math.floor(redeem / POINTS_PER_DISCOUNT_PERCENT), 15);
  const clientPatch = {
    insuraPoints: available - redeem,
    insuraPointsRedeemed: Number(client.insuraPointsRedeemed || 0) + redeem
  };
  const logId = crypto.randomUUID().replace(/-/g, '');
  const leadId = crypto.randomUUID().replace(/-/g, '');
  await commitWrites(env, [
    makeUpdateWrite('clients', uid, clientPatch, client.__updateTime),
    makeCreateWrite('pointsLog', logId, {
      clientId: uid,
      clientName: clientDisplayName(client),
      category: 'redemption',
      points: -redeem,
      descriptionAr: 'استبدال نقاط بخصم ' + discountPercent + '%',
      descriptionEn: 'Redeemed points for a ' + discountPercent + '% discount',
      createdAt: new Date().toISOString()
    }),
    makeCreateWrite('leads', leadId, {
      clientId: uid,
      clientName: clientDisplayName(client),
      clientPhone: clientPhone(client),
      source: 'points_redemption',
      pointsUsed: redeem,
      discountPercent,
      status: 'new',
      createdAt: new Date().toISOString()
    })
  ]);
  return { ok: true, pointsUsed: redeem, discountPercent };
}

async function handleDocumentVerified(env, uid, data, claims) {
  if (!(await isAdminUser(env, uid, claims))) throw new Error('Admin access required');
  const docId = String(data?.docId || '');
  const doc = await getDoc(env, 'documents', docId);
  if (!doc || !doc.clientId) throw new Error('Document not found');
  const status = String(doc.verificationStatus || doc.reviewStatus || '').toLowerCase();
  if (!['verified', 'approved'].includes(status)) throw new Error('Document is not verified');
  const url = String(doc.downloadURL || doc.fileUrl || '');
  if (!url.startsWith(CLOUDINARY_ALLOWED_PREFIX)) throw new Error('Document storage is not approved');

  const client = await getDoc(env, 'clients', doc.clientId);
  if (!client) throw new Error('Client not found');

  const today = todayKey();
  const flags = { ...(client.pointsFlags || {}) };
  const awardedIds = Array.isArray(flags.docUploadAwardedIds) ? flags.docUploadAwardedIds : [];
  if (awardedIds.includes(docId)) return { ok: true, points: 0, reason: 'already_awarded' };
  const count = flags.docUploadAwardDate === today ? Number(flags.docUploadAwardCount || 0) : 0;
  if (count >= MAX_DOCS_PER_DAY) return { ok: true, points: 0, reason: 'daily_cap' };

  flags.docUploadAwardDate = today;
  flags.docUploadAwardCount = count + 1;
  flags.docUploadAwardedIds = awardedIds.slice(-49).concat(docId);

  return issuePoints(env, doc.clientId, client, POINTS.documentUpload, 'insurance_habit',
    'اعتماد مستند تأميني', 'Verified insurance document',
    { pointsFlags: flags });
}

function textInput(value, max, fallback = '') {
  const v = String(value ?? fallback).trim();
  if (v.length > max) throw new Error('Input is too long');
  return v;
}

function requireIdempotencyKey(data) {
  const key = textInput(data?.idempotencyKey, 120);
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw new Error('Invalid idempotency key');
  return key;
}

async function stableActionId(uid, action, key) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(uid + ':' + action + ':' + key)
  );
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

async function handleClientAction(env, uid, action, data) {
  if (!uid) throw new Error('Authentication required');
  const key = requireIdempotencyKey(data);
  const id = await stableActionId(uid, action, key);
  const now = new Date().toISOString();

  if (action === 'appointment') {
    const type = textInput(data?.type, 40, 'consultation');
    const date = textInput(data?.date, 20);
    const time = textInput(data?.time, 20);
    const notes = textInput(data?.notes, 600);
    if (!date || !time) throw new Error('Appointment date and time are required');
    if (!['consultation', 'renewal', 'claim', 'review'].includes(type)) throw new Error('Invalid appointment type');

    return commitWrites(env, [
      makeCreateWrite('appointments', id, {
        clientId: uid, type, date, time, notes, status: 'pending', createdAt: now, updatedAt: now
      }),
      makeCreateWrite('notifications', await stableActionId(uid, 'appointment-notification', key), {
        clientId: uid,
        title: 'حجز موعد جديد',
        body: 'تم استلام طلب حجز الموعد وسيتم التواصل معك لتأكيده.',
        type: 'appointment_request',
        appointmentId: id,
        read: false,
        createdAt: now
      })
    ]).then(() => ({ ok: true, id }));
  }

  if (action === 'complaint') {
    const type = textInput(data?.type, 40);
    const subject = textInput(data?.subject, 180);
    const details = textInput(data?.details, 2000);
    const policyNumber = textInput(data?.policyNumber, 100);
    if (!type || !subject || !details) throw new Error('Complaint fields are required');

    const leadId = await stableActionId(uid, 'complaint-lead', key);
    return commitWrites(env, [
      makeCreateWrite('complaints', id, {
        clientId: uid, type, subject, details, policyNumber,
        status: 'pending', createdAt: now, updatedAt: now
      }),
      makeCreateWrite('notifications', await stableActionId(uid, 'complaint-notification', key), {
        clientId: uid,
        title: 'تم استلام الشكوى',
        body: 'تم استلام شكواك وسيتم التعامل معها ومتابعتها من فريق SecurePath.',
        type: 'complaint',
        complaintId: id,
        read: false,
        createdAt: now
      }),
      makeCreateWrite('leads', leadId, {
        clientId: uid,
        source: 'complaint',
        message: subject,
        complaintId: id,
        status: 'new',
        createdAt: now,
        updatedAt: now
      })
    ]).then(() => ({ ok: true, id }));
  }

  if (action === 'renewal') {
    const policyId = textInput(data?.policyId, 128);
    if (!policyId) throw new Error('Policy is required');
    const policy = await getDoc(env, 'policies', policyId);
    if (!policy || policy.clientId !== uid) throw new Error('Policy not found');

    const requestNumber = 'SP-R-' + new Date().getFullYear() + '-' + id.slice(0, 8).toUpperCase();
    return commitWrites(env, [
      makeCreateWrite('renewals', id, {
        clientId: uid,
        policyId,
        policyNumber: textInput(policy.policyNumber, 100),
        policyType: textInput(policy.type || policy.typeName, 100),
        company: textInput(policy.company || policy.companyName, 160),
        currentStatus: textInput(policy.status, 40, 'active'),
        renewalStatus: 'pending',
        requestedBy: 'client',
        requestNumber,
        createdAt: now,
        updatedAt: now
      }),
      makeCreateWrite('notifications', await stableActionId(uid, 'renewal-notification', key), {
        clientId: uid,
        title: 'طلب تجديد الوثيقة',
        body: 'تم استلام طلب تجديد الوثيقة وسيتم التواصل معك.',
        type: 'renewal_request',
        renewalId: id,
        policyId,
        read: false,
        createdAt: now
      })
    ]).then(() => ({ ok: true, id, requestNumber }));
  }

  if (action === 'advice') {
    const message = textInput(data?.message, 1200);
    if (!message) throw new Error('Message is required');

    return commitWrites(env, [
      makeCreateWrite('messages', id, {
        clientId: uid,
        uid,
        sender: 'client',
        text: message,
        type: 'advice_request',
        createdAt: now,
        readByAdmin: false
      }),
      makeCreateWrite('notifications', await stableActionId(uid, 'advice-notification', key), {
        clientId: uid,
        title: 'طلب نصيحة جديد',
        body: 'تم إرسال طلب النصيحة وسيتم الرد عليك من فريق SecurePath.',
        type: 'advice_request',
        read: false,
        createdAt: now
      })
    ]).then(() => ({ ok: true, id }));
  }

  throw new Error('Unknown client action');
}

async function handleCloudinarySign(env, uid) {
  const secret = String(env.CLOUDINARY_API_SECRET || '');
  if (!secret) throw new Error('CLOUDINARY_API_SECRET is not configured');
  if (!uid) throw new Error('Authenticated user required');

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'securepath_docs/' + uid;
  const publicId = 'doc_' + Date.now() + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const signatureBase = 'folder=' + folder + '&public_id=' + publicId + '&timestamp=' + timestamp;
  const hash = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(signatureBase + secret));
  const signature = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    timestamp,
    folder,
    publicId,
    signature
  };
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'GET' && path === '/health') {
    return json({ ok: true, service: 'SecurePath API', projectId: PROJECT_ID, time: new Date().toISOString() });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);
  const claims = await authenticate(request);
  const uid = String(claims.user_id || claims.sub || '');
  const data = await request.json().catch(() => ({}));

  if (path === '/v1/points') return json(await handlePoints(env, uid, data));
  if (path === '/v1/redeem') return json(await handleRedeem(env, uid, data));
  if (path === '/v1/cloudinary/sign') return json(await handleCloudinarySign(env, uid));
  if (path === '/v1/client/appointment') return json(await handleClientAction(env, uid, 'appointment', data));
  if (path === '/v1/client/complaint') return json(await handleClientAction(env, uid, 'complaint', data));
  if (path === '/v1/client/renewal') return json(await handleClientAction(env, uid, 'renewal', data));
  if (path === '/v1/client/advice') return json(await handleClientAction(env, uid, 'advice', data));
  if (path === '/v1/document/verified') return json(await handleDocumentVerified(env, uid, data, claims));
  return json({ ok: false, error: 'Not found' }, 404);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin)) return json({ ok: false, error: 'Origin not allowed' }, 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin || 'https://eslamshahin1087-lab.github.io') });
    }

    try {
      return await route(request, env);
    } catch (e) {
      const status = e.status || 400;
      const message = e.message || 'Request failed';
      return json({ ok: false, error: message }, status, origin || 'https://eslamshahin1087-lab.github.io');
    }
  }
};
