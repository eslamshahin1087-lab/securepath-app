'use strict';

const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const CLOUDINARY_API_SECRET = defineSecret('CLOUDINARY_API_SECRET');
const CLOUDINARY_CLOUD_NAME = 'zs4wny34';
const CLOUDINARY_API_KEY = '147401369695394';

const POINTS = {
  assessment: 30,
  documentUpload: 10,
  coverageDiversify: 50,
  earlyRenewal: 40,
  profileComplete: 20,
  referralShare: 15,
  habits: {
    walking: { points: 5, streakBonus: 10, streakEvery: 7 },
    running: { points: 8, streakBonus: 15, streakEvery: 7 },
    healthyEating: { points: 5, streakBonus: 10, streakEvery: 7 },
    hydration: { points: 5, streakBonus: 10, streakEvery: 7 },
    sleep: { points: 5, streakBonus: 10, streakEvery: 7 },
    readTip: { points: 5, streakBonus: 10, streakEvery: 7 }
  },
  drivingManual: { points: 6, streakBonus: 15, streakEvery: 7 },
  gpsDriving: { points: 8, streakBonus: 15, streakEvery: 7 }
};

const POINTS_PER_DISCOUNT_PERCENT = 100;
const MAX_DISCOUNT_PERCENT = 15;
const MAX_REDEEM_POINTS = MAX_DISCOUNT_PERCENT * POINTS_PER_DISCOUNT_PERCENT;
const MAX_DOCS_PER_DAY = 3;
const MAX_GPS_SAMPLES = 600;
const GPS_MIN_DURATION_SEC = 60;
const GPS_MIN_COMPLIANCE = 0.50;
const GPS_SPEED_TOLERANCE_KMH = 5;

const ROAD_TYPES = {
  city: { limitKmh: 60, ar: 'طريق داخل المدينة', en: 'City road' },
  main: { limitKmh: 90, ar: 'طريق رئيسي', en: 'Main road' },
  highway: { limitKmh: 120, ar: 'طريق سريع / صحراوي', en: 'Highway' }
};

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
  if (typeof value.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isRecent(value, maxAgeMs) {
  const t = timestampMillis(value);
  return t > 0 && Math.abs(Date.now() - t) <= maxAgeMs;
}

function clientDisplayName(data) {
  return String(data?.name || data?.fullName || data?.username || '').trim();
}

function clientPhone(data) {
  return String(data?.phone || '').trim();
}

function canonicalTypeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function awardFlag(base, key, value) {
  return { ...(base || {}), [key]: value };
}

function assertAuthenticated(request) {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
  return uid;
}

async function creditPoints(uid, category, points, descAr, descEn, mutate) {
  if (!Number.isInteger(points) || points <= 0) throw new HttpsError('invalid-argument', 'Invalid points value');

  const clientRef = db.collection('clients').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Client profile not found');

    const data = snap.data() || {};
    const result = mutate ? await mutate({ tx, data, clientRef }) : null;
    if (result && result.alreadyDone) return { ok: true, points: 0, reason: result.reason || 'already_done' };

    const update = {
      insuraPoints: admin.firestore.FieldValue.increment(points),
      insuraPointsLifetime: admin.firestore.FieldValue.increment(points)
    };

    if (result?.pointsFlags) update.pointsFlags = result.pointsFlags;
    if (result?.habitData) update.habitData = result.habitData;
    if (result?.drivingData) update.drivingData = result.drivingData;
    if (result?.gpsDrivingData) update.gpsDrivingData = result.gpsDrivingData;

    tx.set(clientRef, update, { merge: true });
    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: clientDisplayName(data),
      category,
      points,
      descriptionAr,
      descriptionEn,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true, points: awardedPoints };
  });
}

exports.awardInsuranceEvent = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const event = String(request.data?.event || '');

  if (event === 'assessment') {
    const assessmentSnap = await db.collection('insuranceAssessments').doc(uid).get();
    if (!assessmentSnap.exists) throw new HttpsError('failed-precondition', 'Complete an assessment first');
    const assessment = assessmentSnap.data() || {};
    const last = (await db.collection('clients').doc(uid).get()).data()?.pointsFlags?.lastAssessmentAwardAt || '';
    if (last && daysBetweenCairo(last, todayKey()) < 30) return { ok: true, points: 0, reason: 'cooldown' };
    if (!isRecent(assessment.updatedAt || assessment.timestamp, 15 * 60 * 1000)) {
      throw new HttpsError('failed-precondition', 'Assessment must be completed recently');
    }
    return creditPoints(uid, 'insurance_habit', POINTS.assessment,
      'إتمام تقييم الحماية الشامل', 'Completed the full protection assessment',
      ({ data }) => ({
        pointsFlags: awardFlag(data.pointsFlags, 'lastAssessmentAwardAt', todayKey())
      }));
  }

  if (event === 'diversification') {
    const policyId = String(request.data?.policyId || '');
    if (!policyId) throw new HttpsError('invalid-argument', 'policyId is required');
    const policySnap = await db.collection('policies').doc(policyId).get();
    if (!policySnap.exists || policySnap.data()?.clientId !== uid) throw new HttpsError('permission-denied', 'Policy not found');
    const typeKey = canonicalTypeKey(policySnap.data()?.type || policySnap.data()?.typeName || policySnap.data()?.category);
    if (!typeKey) throw new HttpsError('failed-precondition', 'Policy type missing');
    return creditPoints(uid, 'insurance_habit', POINTS.coverageDiversify,
      'تنويع التغطية التأمينية', 'Diversified insurance coverage',
      ({ data }) => {
        const earned = Array.isArray(data.pointsFlags?.diversifyTypes) ? data.pointsFlags.diversifyTypes : [];
        if (earned.includes(typeKey)) return { alreadyDone: true, reason: 'coverage_already_awarded' };
        return { pointsFlags: awardFlag(data.pointsFlags, 'diversifyTypes', earned.concat(typeKey)) };
      });
  }

  if (event === 'renewal') {
    const policyId = String(request.data?.policyId || '');
    if (!policyId) throw new HttpsError('invalid-argument', 'policyId is required');
    const policySnap = await db.collection('policies').doc(policyId).get();
    if (!policySnap.exists || policySnap.data()?.clientId !== uid) throw new HttpsError('permission-denied', 'Policy not found');

    const end = policySnap.data()?.endDate;
    const endDate = end ? new Date(end) : null;
    const daysLeft = endDate && !isNaN(endDate.getTime())
      ? Math.ceil((endDate.getTime() - Date.now()) / 86400000)
      : 9999;
    if (daysLeft > 45) throw new HttpsError('failed-precondition', 'Renewal reward is only available within 45 days of expiry');

    return creditPoints(uid, 'insurance_habit', POINTS.earlyRenewal,
      'طلب تجديد الوثيقة قبل انتهائها', 'Requested renewal before policy expiry',
      ({ data }) => {
        const ids = Array.isArray(data.pointsFlags?.renewedPolicyIds) ? data.pointsFlags.renewedPolicyIds : [];
        if (ids.includes(policyId)) return { alreadyDone: true, reason: 'renewal_already_awarded' };
        return { pointsFlags: awardFlag(data.pointsFlags, 'renewedPolicyIds', ids.concat(policyId)) };
      });
  }

  if (event === 'profileComplete') {
    const clientSnap = await db.collection('clients').doc(uid).get();
    const data = clientSnap.data() || {};
    const required = ['fullName', 'birthDate', 'gender', 'phone', 'occupation', 'clientType'];
    const complete = required.every((key) => String(data[key] || '').trim() !== '');
    if (!complete) throw new HttpsError('failed-precondition', 'Profile is not complete');
    return creditPoints(uid, 'insurance_habit', POINTS.profileComplete,
      'استكمال بيانات الملف الشخصي', 'Completed profile information',
      ({ data }) => data.pointsFlags?.profileCompleteAwarded
        ? { alreadyDone: true, reason: 'profile_already_awarded' }
        : { pointsFlags: awardFlag(data.pointsFlags, 'profileCompleteAwarded', true) });
  }

  if (event === 'referralShare') {
    return creditPoints(uid, 'insurance_habit', POINTS.referralShare,
      'مشاركة رابط دعوة صديق', 'Shared the referral link',
      ({ data }) => {
        const last = data.pointsFlags?.lastReferralShareAwardAt || '';
        if (last && daysBetweenCairo(last, todayKey()) < 30) return { alreadyDone: true, reason: 'cooldown' };
        return { pointsFlags: awardFlag(data.pointsFlags, 'lastReferralShareAwardAt', todayKey()) };
      });
  }

  throw new HttpsError('invalid-argument', 'Unknown insurance points event');
});

function daysBetweenCairo(a, b) {
  if (!a || !b) return 9999;
  const x = new Date(a + 'T00:00:00+02:00');
  const y = new Date(b + 'T00:00:00+02:00');
  return Math.round((y.getTime() - x.getTime()) / 86400000);
}

exports.checkInHabit = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const habit = String(request.data?.habit || '');
  const cfg = POINTS.habits[habit];
  if (!cfg) throw new HttpsError('invalid-argument', 'Unknown habit');

  const today = todayKey();
  return creditPoints(uid, 'health_habit', cfg.points,
    'تسجيل العادة الصحية', 'Healthy habit check-in',
    ({ data }) => {
      const habitData = { ...(data.habitData || {}) };
      const current = habitData[habit] || { streak: 0, lastDate: '', totalDays: 0 };
      if (current.lastDate === today) return { alreadyDone: true, reason: 'habit_already_done' };
      const gap = daysBetweenCairo(current.lastDate, today);
      const streak = gap === 1 ? Number(current.streak || 0) + 1 : 1;
      const bonus = streak % cfg.streakEvery === 0 ? cfg.streakBonus : 0;
      habitData[habit] = { streak, lastDate: today, totalDays: Number(current.totalDays || 0) + 1 };
      return { habitData, extraPoints: bonus };
    }).then(async (result) => {
      if (!result.points) return result;
      return result;
    });
});

exports.logDrivingManual = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const today = todayKey();
  const clientRef = db.collection('clients').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Client profile not found');
    const data = snap.data() || {};
    const current = data.drivingData || { streak: 0, lastDate: '', totalDays: 0 };
    if (current.lastDate === today) return { ok: true, points: 0, reason: 'already_done' };

    const gap = daysBetweenCairo(current.lastDate, today);
    const streak = gap === 1 ? Number(current.streak || 0) + 1 : 1;
    const bonus = streak % POINTS.drivingManual.streakEvery === 0 ? POINTS.drivingManual.streakBonus : 0;
    const awardedPoints = POINTS.drivingManual.points + bonus;

    tx.set(clientRef, {
      insuraPoints: admin.firestore.FieldValue.increment(awardedPoints),
      insuraPointsLifetime: admin.firestore.FieldValue.increment(awardedPoints),
      drivingData: {
        streak,
        lastDate: today,
        totalDays: Number(current.totalDays || 0) + 1
      }
    }, { merge: true });

    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: clientDisplayName(data),
      category: 'safe_driving',
      points: awardedPoints,
      descriptionAr: 'الالتزام بقيادة آمنة اليوم',
      descriptionEn: 'Committed to safe driving today',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { ok: true, points: awardedPoints };
  });
});

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

exports.logGpsTrip = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const roadKey = String(request.data?.roadKey || '');
  const road = ROAD_TYPES[roadKey];
  const samples = request.data?.samples;

  if (!road) throw new HttpsError('invalid-argument', 'Unknown road type');
  if (!Array.isArray(samples) || samples.length < 5 || samples.length > MAX_GPS_SAMPLES) {
    throw new HttpsError('invalid-argument', 'Invalid GPS samples');
  }

  const clean = [];
  for (const sample of samples) {
    const lat = Number(sample?.lat);
    const lng = Number(sample?.lng);
    const t = Number(sample?.t);
    const accuracy = sample?.accuracy == null ? 0 : Number(sample.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(t)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    if (accuracy && (!Number.isFinite(accuracy) || accuracy > 100)) continue;
    clean.push({ lat, lng, t });
  }

  if (clean.length < 5) throw new HttpsError('failed-precondition', 'Not enough valid GPS samples');

  clean.sort((a, b) => a.t - b.t);
  const durationSec = (clean[clean.length - 1].t - clean[0].t) / 1000;
  if (!Number.isFinite(durationSec) || durationSec < GPS_MIN_DURATION_SEC || durationSec > 2 * 60 * 60) {
    throw new HttpsError('failed-precondition', 'Invalid trip duration');
  }

  let validIntervals = 0;
  let compliantIntervals = 0;
  for (let i = 1; i < clean.length; i++) {
    const dtSec = (clean[i].t - clean[i - 1].t) / 1000;
    if (dtSec <= 0 || dtSec > 30) continue;
    const distM = haversineMeters(clean[i - 1].lat, clean[i - 1].lng, clean[i].lat, clean[i].lng);
    const speedKmh = (distM / dtSec) * 3.6;
    if (!Number.isFinite(speedKmh) || speedKmh > 300) continue;
    validIntervals++;
    if (speedKmh <= road.limitKmh + GPS_SPEED_TOLERANCE_KMH) compliantIntervals++;
  }

  if (validIntervals < 3) throw new HttpsError('failed-precondition', 'Not enough valid speed intervals');
  const compliance = compliantIntervals / validIntervals;
  if (compliance < GPS_MIN_COMPLIANCE) return { ok: true, points: 0, compliancePct: Math.round(compliance * 100), reason: 'speed_violations' };

  const today = todayKey();
  const clientSnap = await db.collection('clients').doc(uid).get();
  if (!clientSnap.exists) throw new HttpsError('not-found', 'Client profile not found');
  const data = clientSnap.data() || {};
  const gps = data.gpsDrivingData || { streak: 0, lastDate: '', totalTrips: 0 };
  if (gps.lastDate === today) return { ok: true, points: 0, compliancePct: Math.round(compliance * 100), reason: 'already_done' };

  const gap = daysBetweenCairo(gps.lastDate, today);
  const streak = gap === 1 ? Number(gps.streak || 0) + 1 : 1;
  const bonus = streak % POINTS.gpsDriving.streakEvery === 0 ? POINTS.gpsDriving.streakBonus : 0;
  const total = POINTS.gpsDriving.points + bonus;

  const tripHash = crypto.createHash('sha256')
    .update(clean.map((s) => s.lat.toFixed(5) + ',' + s.lng.toFixed(5) + ',' + s.t).join('|'))
    .digest('hex');

  if (Array.isArray(gps.recentTripHashes) && gps.recentTripHashes.includes(tripHash)) {
    return { ok: true, points: 0, compliancePct: Math.round(compliance * 100), reason: 'replayed_trip' };
  }

  const result = await creditPoints(uid, 'safe_driving_gps', total,
    'رحلة قيادة بتتبع GPS بنسبة التزام ' + Math.round(compliance * 100) + '%',
    'GPS-tracked trip with ' + Math.round(compliance * 100) + '% speed compliance',
    ({ data }) => {
      const current = data.gpsDrivingData || { streak: 0, lastDate: '', totalTrips: 0, recentTripHashes: [] };
      const hashes = Array.isArray(current.recentTripHashes) ? current.recentTripHashes.slice(-19) : [];
      hashes.push(tripHash);
      return {
        gpsDrivingData: {
          streak,
          lastDate: today,
          totalTrips: Number(current.totalTrips || 0) + 1,
          recentTripHashes: hashes
        }
      };
    });

  return { ...result, compliancePct: Math.round(compliance * 100) };
});

exports.redeemPoints = onCall(async (request) => {
  const uid = assertAuthenticated(request);
  const requested = Number.parseInt(request.data?.points, 10);
  if (!Number.isInteger(requested) || requested <= 0) throw new HttpsError('invalid-argument', 'Invalid points amount');

  const clientRef = db.collection('clients').doc(uid);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Client not found');

    const data = snap.data() || {};
    const available = Math.max(0, Number(data.insuraPoints || 0));
    const pts = Math.min(requested, available, MAX_REDEEM_POINTS) - (Math.min(requested, available, MAX_REDEEM_POINTS) % POINTS_PER_DISCOUNT_PERCENT);
    if (pts <= 0) throw new HttpsError('failed-precondition', 'Not enough points to redeem');

    const discountPercent = Math.min(Math.floor(pts / POINTS_PER_DISCOUNT_PERCENT), MAX_DISCOUNT_PERCENT);
    tx.set(clientRef, {
      insuraPoints: admin.firestore.FieldValue.increment(-pts),
      insuraPointsRedeemed: admin.firestore.FieldValue.increment(pts)
    }, { merge: true });

    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: clientDisplayName(data),
      category: 'redemption',
      points: -pts,
      descriptionAr: 'استبدال نقاط بخصم ' + discountPercent + '%',
      descriptionEn: 'Redeemed points for a ' + discountPercent + '% discount',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    tx.set(db.collection('leads').doc(), {
      clientId: uid,
      clientName: clientDisplayName(data),
      clientPhone: clientPhone(data),
      source: 'points_redemption',
      pointsUsed: pts,
      discountPercent,
      status: 'new',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { pointsUsed: pts, discountPercent };
  });

  return { ok: true, ...result };
});

exports.onDocumentUploaded = onDocumentUpdated('documents/{docId}', async (event) => {
  const before = event.data?.before;
  const after = event.data?.after;
  if (!before || !after) return;

  const previous = before.data() || {};
  const doc = after.data() || {};

  // Award only when an admin-side review moves the document into an
  // approved/verified state. Client-created pending documents never earn points.
  const wasVerified = ['verified', 'approved'].includes(String(previous.verificationStatus || '').toLowerCase())
    || ['verified', 'approved'].includes(String(previous.reviewStatus || '').toLowerCase());
  const isVerified = ['verified', 'approved'].includes(String(doc.verificationStatus || '').toLowerCase())
    || ['verified', 'approved'].includes(String(doc.reviewStatus || '').toLowerCase());

  if (wasVerified || !isVerified) return;

  const uid = String(doc.clientId || '');
  const url = String(doc.downloadURL || doc.fileUrl || '');
  if (!uid || doc.storageMode !== 'cloudinary' || !url.startsWith('https://res.cloudinary.com/' + CLOUDINARY_CLOUD_NAME + '/')) return;

  const clientRef = db.collection('clients').doc(uid);
  await db.runTransaction(async (tx) => {
    const clientSnap = await tx.get(clientRef);
    if (!clientSnap.exists) return;
    const data = clientSnap.data() || {};
    const flags = data.pointsFlags || {};
    const today = todayKey();
    const count = flags.docUploadAwardDate === today ? Number(flags.docUploadAwardCount || 0) : 0;
    if (count >= MAX_DOCS_PER_DAY) return;

    tx.set(clientRef, {
      insuraPoints: admin.firestore.FieldValue.increment(POINTS.documentUpload),
      insuraPointsLifetime: admin.firestore.FieldValue.increment(POINTS.documentUpload),
      pointsFlags: {
        ...flags,
        docUploadAwardDate: today,
        docUploadAwardCount: count + 1
      }
    }, { merge: true });

    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: clientDisplayName(data),
      category: 'insurance_habit',
      points: POINTS.documentUpload,
      descriptionAr: 'اعتماد مستند تأميني',
      descriptionEn: 'Verified insurance document',
      eventId: after.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
});

exports.onProtectionAssessmentCreated = onDocumentCreated('protectionAssessments/{assessmentId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const doc = snap.data() || {};
  const uid = String(doc.clientId || '');
  if (!uid) return;

  const clientRef = db.collection('clients').doc(uid);
  await db.runTransaction(async (tx) => {
    const clientSnap = await tx.get(clientRef);
    if (!clientSnap.exists) return;
    const data = clientSnap.data() || {};
    const last = data.pointsFlags?.lastAssessmentAwardAt || '';
    if (last && daysBetweenCairo(last, todayKey()) < 30) return;

    tx.set(clientRef, {
      insuraPoints: admin.firestore.FieldValue.increment(POINTS.assessment),
      insuraPointsLifetime: admin.firestore.FieldValue.increment(POINTS.assessment),
      pointsFlags: {
        ...(data.pointsFlags || {}),
        lastAssessmentAwardAt: todayKey()
      }
    }, { merge: true });

    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: clientDisplayName(data),
      category: 'insurance_habit',
      points: POINTS.assessment,
      descriptionAr: 'إتمام تقييم الحماية الشامل',
      descriptionEn: 'Completed the full protection assessment',
      eventId: snap.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  txSafeAdminAssessmentNotification(doc, snap.id).catch(() => {});
});

async function txSafeAdminAssessmentNotification(doc, assessmentId) {
  await db.collection('adminNotifications').add({
    type: 'NEW_ASSESSMENT',
    priority: doc.priority || 'NORMAL',
    clientName: clientDisplayName(doc),
    assessmentId,
    productRecommendation: String(doc.primaryRecommendationAr || doc.primaryRecommendation || ''),
    status: 'new',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

exports.createCloudinaryUploadSignature = onCall({ secrets: [CLOUDINARY_API_SECRET] }, async (request) => {
  assertAuthenticated(request);
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'securepath_docs';
  const toSign = 'folder=' + folder + '&timestamp=' + timestamp;
  const signature = crypto.createHash('sha1')
    .update(toSign + CLOUDINARY_API_SECRET.value())
    .digest('hex');

  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature
  };
});
