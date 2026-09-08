'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ============================================================
// The ONLY source of truth for point values. The client never
// sends a "points" number - only a category / event id.
// ============================================================
const POINTS = {
  assessment: 50,
  documentUpload: 20,
  coverageDiversify: 30,
  earlyRenewal: 40,
  referral: 25,
  habitWalk: 10,
  habitRun: 15,
  habitEat: 10,
  drivingManual: 15,
  drivingGps: 25
};

const POINTS_PER_DISCOUNT_PERCENT = 100; // 100 points = 1% discount
const MAX_DISCOUNT_PERCENT = 15;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/**
 * Shared helper: credits points to a client inside a transaction, with an
 * optional idempotency guard so the same event can never be paid out twice
 * (e.g. two rapid taps, or a client retry after a network blip).
 */
async function creditPoints(uid, category, points, descAr, descEn, guarded) {
  const clientRef = db.collection('clients').doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Client profile not found');
    const data = snap.data();

    if (guarded && guarded.guard(data)) {
      throw new HttpsError('failed-precondition', 'Already credited for this event');
    }

    const update = {
      insuraPoints: admin.firestore.FieldValue.increment(points),
      insuraPointsLifetime: admin.firestore.FieldValue.increment(points)
    };
    if (guarded) Object.assign(update, guarded.data(data));

    tx.set(clientRef, update, { merge: true });
    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: data.name || '',
      category,
      points,
      descriptionAr: descAr,
      descriptionEn: descEn,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============================================================
// 1) Daily habit check-in (walk / run / healthy eating)
//    Client sends only a category name - a fixed table decides the value,
//    and a server-side date guard blocks more than one credit per day.
// ============================================================
exports.checkInHabit = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

  const habit = request.data && request.data.habit; // 'walk' | 'run' | 'eat'
  const map = { walk: 'habitWalk', run: 'habitRun', eat: 'habitEat' };
  if (!map[habit]) throw new HttpsError('invalid-argument', 'Unknown habit');

  const today = todayKey();
  await creditPoints(uid, map[habit], POINTS[map[habit]],
    'تسجيل عادة صحية', 'Healthy habit check-in',
    {
      guard: (data) => (data.habitData && data.habitData[habit + 'LastDate']) === today,
      data: (data) => ({
        habitData: {
          ...(data.habitData || {}),
          [habit + 'LastDate']: today,
          [habit + 'Streak']: ((data.habitData && data.habitData[habit + 'Streak']) || 0) + 1
        }
      })
    });
  return { ok: true, points: POINTS[map[habit]] };
});

// ============================================================
// 2) Manual safe-driving daily log
// ============================================================
exports.logDrivingManual = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

  const today = todayKey();
  await creditPoints(uid, 'drivingManual', POINTS.drivingManual,
    'تسجيل قيادة آمنة', 'Safe driving check-in',
    {
      guard: (data) => (data.drivingData && data.drivingData.lastManualDate) === today,
      data: (data) => ({ drivingData: { ...(data.drivingData || {}), lastManualDate: today } })
    });
  return { ok: true, points: POINTS.drivingManual };
});

// ============================================================
// 3) GPS trip - the client sends RAW samples only. The function
//    recomputes speed compliance itself; it never trusts a
//    client-calculated score.
// ============================================================
exports.logGpsTrip = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

  const samples = request.data && request.data.samples; // [{lat, lng, t}]
  if (!Array.isArray(samples) || samples.length < 5) {
    throw new HttpsError('invalid-argument', 'Trip too short / missing samples');
  }

  let violations = 0, total = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    const dtSec = (b.t - a.t) / 1000;
    if (dtSec <= 0 || dtSec > 30) continue;               // skip bad time gaps
    const distKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
    const speedKmh = (distKm / dtSec) * 3600;
    if (speedKmh > 300) continue;                          // discard GPS glitches
    total++;
    if (speedKmh > 130) violations++;                       // example highway limit
  }
  if (total < 3) throw new HttpsError('failed-precondition', 'Not enough valid GPS data');

  const complianceRatio = 1 - violations / total;
  if (complianceRatio < 0.9) {
    return { ok: true, points: 0, reason: 'speed_violations' };
  }

  const today = todayKey();
  await creditPoints(uid, 'drivingGps', POINTS.drivingGps,
    'رحلة GPS ملتزمة بالسرعة', 'GPS trip - speed compliant',
    {
      guard: (data) => (data.gpsDrivingData && data.gpsDrivingData.lastTripDate) === today,
      data: (data) => ({ gpsDrivingData: { ...(data.gpsDrivingData || {}), lastTripDate: today } })
    });
  return { ok: true, points: POINTS.drivingGps };
});

// ============================================================
// 4) Event-driven points - no callable needed at all. These fire
//    automatically the moment the underlying real event happens
//    (a document actually gets uploaded, an assessment actually
//    gets saved), so the client can never fake them by simply
//    calling a function.
// ============================================================
exports.onDocumentUploaded = onDocumentCreated('documents/{docId}', async (event) => {
  const doc = event.data.data();
  const uid = doc.clientId;
  if (!uid) return;
  await creditPoints(uid, 'documentUpload', POINTS.documentUpload,
    'رفع مستند', 'Document uploaded');
});

exports.onAssessmentCompleted = onDocumentCreated('insuranceAssessments/{id}', async (event) => {
  const doc = event.data.data();
  const uid = doc.clientId;
  if (!uid) return;
  await creditPoints(uid, 'assessment', POINTS.assessment,
    'إكمال تقييم الحماية', 'Protection assessment completed',
    {
      guard: (data) => data.pointsFlags && data.pointsFlags.assessmentDone,
      data: () => ({ pointsFlags: { assessmentDone: true } })
    });
});

// Add similar onDocumentCreated triggers for renewals / referrals /
// coverage-diversification following the exact same pattern.

// ============================================================
// 5) Redeem points for a real discount. This is the function that
//    replaces confirmRedeemPoints() on the client. It is the only
//    thing allowed to write a 'points_redemption' lead.
// ============================================================
exports.redeemPoints = onCall(async (request) => {
  const uid = request.auth && request.auth.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

  const requestedPoints = parseInt(request.data && request.data.points, 10);
  if (!Number.isInteger(requestedPoints) || requestedPoints <= 0) {
    throw new HttpsError('invalid-argument', 'Invalid points amount');
  }

  const clientRef = db.collection('clients').doc(uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(clientRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Client not found');
    const data = snap.data();
    const available = data.insuraPoints || 0;

    const capped = Math.min(requestedPoints, available);
    const pts = capped - (capped % POINTS_PER_DISCOUNT_PERCENT);
    if (pts <= 0) throw new HttpsError('failed-precondition', 'Not enough points to redeem');

    const discountPercent = Math.min(
      Math.floor(pts / POINTS_PER_DISCOUNT_PERCENT),
      MAX_DISCOUNT_PERCENT
    );

    tx.set(clientRef, {
      insuraPoints: admin.firestore.FieldValue.increment(-pts),
      insuraPointsRedeemed: admin.firestore.FieldValue.increment(pts)
    }, { merge: true });

    tx.set(db.collection('pointsLog').doc(), {
      clientId: uid,
      clientName: data.name || '',
      category: 'redemption',
      points: -pts,
      descriptionAr: 'استبدال نقاط بخصم ' + discountPercent + '%',
      descriptionEn: 'Redeemed points for a ' + discountPercent + '% discount',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // clientName / clientPhone come from the trusted server-side profile,
    // never from client input - this also stops name/phone spoofing.
    tx.set(db.collection('leads').doc(), {
      clientId: uid,
      clientName: data.name || '',
      clientPhone: data.phone || '',
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
