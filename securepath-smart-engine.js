/**
 * ═══════════════════════════════════════════════════════════════════
 * SecurePath Smart Matching Engine (SSME)
 * محرك ذكي لتحليل احتياجات العميل التأمينية وربطه بالمنتج المناسب
 * ═══════════════════════════════════════════════════════════════════
 * Version: 1.0.0
 * License: FRA 38062 — SecurePath (واثقتي)
 * ═══════════════════════════════════════════════════════════════════
 */

const SmartEngine = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // القسم 1: أوزان الخوارزمية
  // ═══════════════════════════════════════════════════════════════
  const WEIGHTS = {
    age:              0.15,
    maritalStatus:    0.08,
    dependents:       0.12,
    city:             0.05,
    income:           0.18,
    existingCoverage: 0.10,
    healthScore:      0.10,
    smoking:          0.06,
    chronicDisease:   0.08,
    insuraPoints:     0.05,
    activityLevel:    0.03,
  };

  // ═══════════════════════════════════════════════════════════════
  // القسم 2: كتالوج المنتجات
  // ═══════════════════════════════════════════════════════════════
  const PRODUCT_CATALOG = {
    LIFE:       { minAge: 18, maxAge: 65, minIncome: 5000,  riskFactors: ['dependents', 'married'], arName: 'تأمين الحياة' },
    HEALTH:     { minAge: 0,  maxAge: 70, minIncome: 3000,  riskFactors: ['chronicDisease', 'smoker'], arName: 'التأمين الصحي' },
    MOTOR:      { minAge: 18, maxAge: 75, minIncome: 2000,  riskFactors: ['hasCar'], arName: 'تأمين السيارات' },
    HOME:       { minAge: 21, maxAge: 70, minIncome: 4000,  riskFactors: ['hasHome'], arName: 'تأمين المنازل' },
    TRAVEL:     { minAge: 18, maxAge: 80, minIncome: 1000,  riskFactors: ['frequentTravel'], arName: 'تأمين السفر' },
    DISABILITY: { minAge: 18, maxAge: 60, minIncome: 6000,  riskFactors: ['physicalJob'], arName: 'تأمين العجز' },
    CRITICAL:   { minAge: 25, maxAge: 60, minIncome: 8000,  riskFactors: ['familyHistory'], arName: 'تأمين الأمراض الحرجة' },
    BUSINESS:   { minAge: 21, maxAge: 70, minIncome: 10000, riskFactors: ['businessOwner'], arName: 'تأمين الأعمال' },
  };

  const PRODUCT_NAMES_AR = Object.fromEntries(
    Object.entries(PRODUCT_CATALOG).map(([k, v]) => [k, v.arName])
  );

  // ═══════════════════════════════════════════════════════════════
  // القسم 3: بناء الملف الشخصي
  // ═══════════════════════════════════════════════════════════════
  function buildProfile(inputs) {
    return {
      age:              parseInt(inputs.age) || 30,
      gender:           inputs.gender || 'male',
      maritalStatus:    inputs.maritalStatus || 'single',
      dependents:       parseInt(inputs.dependents) || 0,
      city:             inputs.city || 'Cairo',
      monthlyIncome:    parseFloat(inputs.monthlyIncome) || 0,
      existingPolicies: inputs.existingPolicies || [],
      height:           parseFloat(inputs.height) || 170,
      weight:           parseFloat(inputs.weight) || 70,
      smoker:           inputs.smoker === 'yes',
      chronicDisease:   inputs.chronicDisease === 'yes',
      hasCar:           inputs.hasCar === 'yes',
      hasHome:          inputs.hasHome === 'yes',
      businessOwner:    inputs.businessOwner === 'yes',
      frequentTravel:   inputs.frequentTravel === 'yes',
      physicalJob:      inputs.physicalJob === 'yes',
      familyHistory:    inputs.familyHistory === 'yes',
      insuraPoints:     parseInt(inputs.insuraPoints) || 0,
      activityLevel:    inputs.activityLevel || 'medium',
      timestamp:        new Date().toISOString(),
      userId:           inputs.userId || null,
      fullName:         inputs.fullName || 'عميل جديد',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // القسم 4: حساب مؤشر المخاطر
  // ═══════════════════════════════════════════════════════════════
  function calculateRiskScore(profile) {
    let risk = 0;

    if (profile.age > 50)       risk += 25;
    else if (profile.age > 40)  risk += 15;
    else if (profile.age > 30)  risk += 8;

    const bmi = profile.weight / Math.pow(profile.height / 100, 2);
    if (bmi < 18.5)       risk += 10;
    else if (bmi > 30)    risk += 20;
    else if (bmi > 25)    risk += 10;

    if (profile.smoker)         risk += 15;
    if (profile.chronicDisease) risk += 20;
    if (profile.familyHistory)  risk += 10;

    if (profile.activityLevel === 'high') risk -= 10;
    if (profile.insuraPoints > 500)       risk -= 5;

    return Math.max(0, Math.min(100, risk));
  }

  // ═══════════════════════════════════════════════════════════════
  // القسم 5: مطابقة المنتجات
  // ═══════════════════════════════════════════════════════════════
  function matchProducts(profile, riskScore) {
    const scores = {};

    for (const [key, rules] of Object.entries(PRODUCT_CATALOG)) {
      const reasons = [];

      if (profile.age < rules.minAge || profile.age > rules.maxAge) {
        scores[key] = { score: 0, eligible: false, reasons: ['العمر خارج النطاق'] };
        continue;
      }

      if (profile.monthlyIncome < rules.minIncome) {
        scores[key] = { score: 0, eligible: false, reasons: ['الدخل أقل من الحد الأدنى'] };
        continue;
      }

      let score = 30;

      for (const factor of rules.riskFactors) {
        const matched =
          profile[factor] ||
          (factor === 'married' && profile.maritalStatus === 'married');
        if (matched) {
          score += 15;
          reasons.push(`✓ يتوافق مع: ${factor}`);
        }
      }

      if (riskScore > 60) {
        score += 20;
        reasons.push('✓ ضرورة عالية بسبب المخاطر الصحية');
      }

      if (profile.insuraPoints > 300) {
        score += 10;
        reasons.push('✓ خصم متاح من InsuraPoints');
      }

      if (profile.dependents > 0 && key === 'LIFE') {
        score += 15;
        reasons.push(`✓ لديك ${profile.dependents} معالين`);
      }

      scores[key] = {
        score: Math.min(100, score),
        eligible: true,
        reasons,
        priority: score > 70 ? 'HIGH' : score > 45 ? 'MEDIUM' : 'LOW',
      };
    }

    return Object.entries(scores)
      .filter(([, v]) => v.eligible)
      .sort((a, b) => b[1].score - a[1].score)
      .map(([k, v]) => ({ product: k, productNameAr: PRODUCT_NAMES_AR[k], ...v }));
  }

  // ═══════════════════════════════════════════════════════════════
  // القسم 6: التوصيات
  // ═══════════════════════════════════════════════════════════════
  function detectCoverageGaps(profile) {
    const gaps = [];
    const covered = (profile.existingPolicies || []).map(p => p.type);

    if (!covered.includes('HEALTH'))
      gaps.push({ type: 'HEALTH', typeAr: 'التأمين الصحي', severity: 'HIGH', reason: 'لا يوجد تأمين صحي' });

    if (!covered.includes('LIFE') && profile.dependents > 0)
      gaps.push({ type: 'LIFE', typeAr: 'تأمين الحياة', severity: 'CRITICAL', reason: 'معالون بدون تأمين حياة' });

    if (!covered.includes('MOTOR') && profile.hasCar)
      gaps.push({ type: 'MOTOR', typeAr: 'تأمين السيارات', severity: 'HIGH', reason: 'سيارة بدون تأمين' });

    if (!covered.includes('HOME') && profile.hasHome)
      gaps.push({ type: 'HOME', typeAr: 'تأمين المنازل', severity: 'MEDIUM', reason: 'منزل بدون تأمين' });

    return gaps;
  }

  function calculateEstimatedDiscount(profile) {
    if (profile.insuraPoints > 1000) return 15;
    if (profile.insuraPoints > 500)  return 10;
    if (profile.insuraPoints > 200)  return 5;
    return 0;
  }

  function buildActionItems(matches, gaps, profile) {
    const items = [];
    if (gaps.some(g => g.severity === 'CRITICAL'))
      items.push('⚠️ أولوية قصوى: سد فجوة تأمين الحياة');
    if (matches[0]) items.push(`اطلب عرض سعر لـ ${matches[0].productNameAr}`);
    if (profile.insuraPoints > 200) items.push('استبدل نقاطك للحصول على خصم');
    items.push('جدّد وثائقك قبل انتهائها بـ 30 يومًا');
    return items;
  }

  function generateRecommendations(matches, profile, riskScore) {
    const top = matches[0];
    const gaps = detectCoverageGaps(profile);

    return {
      headline: top
        ? `التوصية الأولى: ${top.productNameAr} (توافق ${top.score}%)`
        : 'نحتاج لمزيد من المعلومات لتقديم توصية دقيقة',
      primaryRecommendation: top ? top.product : null,
      primaryRecommendationAr: top ? top.productNameAr : null,
      alternativeRecommendations: matches.slice(1, 4).map(m => m.product),
      coverageGaps: gaps,
      riskLevel: riskScore > 60 ? 'مرتفع' : riskScore > 35 ? 'متوسط' : 'منخفض',
      estimatedDiscount: calculateEstimatedDiscount(profile),
      actionItems: buildActionItems(matches, gaps, profile),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // القسم 7: تتبع الرحلة
  // ═══════════════════════════════════════════════════════════════
  const JOURNEY_STAGES = [
    'PROFILED', 'ASSESSED', 'MATCHED', 'QUOTED',
    'CONTACTED', 'CONVERTED', 'RENEWED', 'LAPSED',
  ];

  async function trackJourney(userId, stage, metadata = {}) {
    if (!window.firebase?.firestore || !userId) return;
    try {
      const db = firebase.firestore();
      await db.collection('journeyTracking').add({
        userId,
        stage,
        metadata,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[SmartEngine] trackJourney failed:', e.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // القسم 8: المزامنة مع لوحة الأدمن
  // ═══════════════════════════════════════════════════════════════
    async function syncToAdmin(assessment) {
    if (!window.firebase?.firestore) return null;
    try {
      const db = firebase.firestore();

      // ═══════════════════════════════════════════════════════════
      // 1. اكتب التفاصيل الكاملة في protectionAssessments
      // ═══════════════════════════════════════════════════════════
      const ref = await db.collection('protectionAssessments').add({
        clientId: assessment.clientId,
        clientName: assessment.clientName,
        profile: assessment.profile,
        riskScore: assessment.riskScore,
        matches: assessment.matches,
        recommendations: assessment.recommendations,
        riskLevel: assessment.recommendations.riskLevel,
        primaryRecommendation: assessment.recommendations.primaryRecommendation,
        primaryRecommendationAr: assessment.recommendations.primaryRecommendationAr,
        engineVersion: assessment.engineVersion,
        source: 'smart-engine',
        status: 'new',
        reviewedBy: null,
        adminNotes: '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      // ═══════════════════════════════════════════════════════════
      // 2. ⭐ اكتب أيضًا في insuranceAssessments (للظهور في لوحة الأدمن)
      // ═══════════════════════════════════════════════════════════
      if (assessment.clientId) {
        const statusAr =
          assessment.recommendations.riskLevel === 'مرتفع' ? 'يحتاج تحسين عاجل' :
          assessment.recommendations.riskLevel === 'متوسط' ? 'يحتاج تحسين' :
          'ممتاز';

        await db.collection('insuranceAssessments').doc(assessment.clientId).set({
          score: 100 - assessment.riskScore,
          status: statusAr,
          activeCount: (assessment.profile.existingPolicies || []).length,
          ownedCount: (assessment.profile.existingPolicies || []).length,
          gaps: assessment.recommendations.coverageGaps.map(g => g.type),
          recommendations: assessment.recommendations.actionItems,
          factors: [
            { name: 'profileCompleteness', value: 15, max: 15 },
            { name: 'coverageBreadth', value: 30, max: 45 },
            { name: 'activePolicies', value: (assessment.profile.existingPolicies || []).length * 5, max: 20 },
            { name: 'verifiedDocuments', value: 5, max: 10 },
            { name: 'smartEngine', value: assessment.matches[0]?.score || 0, max: 10 },
          ],
          source: 'smart-engine',
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        console.log('✅ [SmartEngine] كتب في insuranceAssessments:', assessment.clientId);
      }

      // ═══════════════════════════════════════════════════════════
      // 3. إشعار
      // ═══════════════════════════════════════════════════════════
      await db.collection('adminNotifications').add({
        type: 'NEW_ASSESSMENT',
        priority: assessment.recommendations.riskLevel === 'مرتفع' ? 'HIGH' : 'NORMAL',
        clientName: assessment.clientName,
        assessmentId: ref.id,
        productRecommendation: assessment.recommendations.primaryRecommendationAr,
        riskLevel: assessment.recommendations.riskLevel,
        read: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      return ref.id;
    } catch (e) {
      console.error('[SmartEngine] syncToAdmin failed:', e.message);
      return null;
    }
  }  

  // ═══════════════════════════════════════════════════════════════
  // API عام
  // ═══════════════════════════════════════════════════════════════
  return {
    run: run,
    buildProfile: buildProfile,
    calculateRiskScore: calculateRiskScore,
    matchProducts: matchProducts,
    generateRecommendations: generateRecommendations,
    PRODUCT_NAMES_AR: PRODUCT_NAMES_AR,
    JOURNEY_STAGES: JOURNEY_STAGES,
    trackJourney: trackJourney,
  };
})();

if (typeof window !== 'undefined') window.SmartEngine = SmartEngine;