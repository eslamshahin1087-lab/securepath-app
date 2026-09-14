/**
 * ═══════════════════════════════════════════════════════════════════
 * Smart Assessment UI Controller
 * واجهة استمارة التحليل الذكي (5 خطوات)
 * ═══════════════════════════════════════════════════════════════════
 */

const SmartAssessmentUI = (() => {
  'use strict';

  let currentStep = 1;
  const TOTAL_STEPS = 5;

  function $(id) { return document.getElementById(id); }

  function updateProgress() {
    const pct = (currentStep / TOTAL_STEPS) * 100;
    if ($('smartProgress')) $('smartProgress').style.width = pct + '%';
    if ($('currentStep')) $('currentStep').textContent = currentStep;

    document.querySelectorAll('.smart-step').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.step) === currentStep);
    });

    if ($('smartPrev')) $('smartPrev').disabled = currentStep === 1;
    if ($('smartNext')) $('smartNext').classList.toggle('hidden', currentStep === TOTAL_STEPS);
    if ($('smartSubmit')) $('smartSubmit').classList.toggle('hidden', currentStep !== TOTAL_STEPS);

    if (currentStep === TOTAL_STEPS) buildReview();
  }

  function collectInputs() {
    const existingPolicies = Array.from(
      document.querySelectorAll('#existingPoliciesWrap input:checked')
    ).map(cb => ({ type: cb.value }));

    const user = window.firebase?.auth?.().currentUser;

    return {
      userId: user?.uid || null,
      fullName: $('fullName')?.value || user?.displayName || 'عميل جديد',
      age: $('age')?.value,
      gender: $('gender')?.value,
      maritalStatus: $('maritalStatus')?.value,
      dependents: $('dependents')?.value,
      city: $('city')?.value,
      monthlyIncome: $('monthlyIncome')?.value,
      existingPolicies,
      height: $('height')?.value,
      weight: $('weight')?.value,
      smoker: $('smoker')?.value,
      chronicDisease: $('chronicDisease')?.value,
      familyHistory: $('familyHistory')?.value,
      activityLevel: $('activityLevel')?.value,
      hasCar: $('hasCar')?.value,
      hasHome: $('hasHome')?.value,
      businessOwner: $('businessOwner')?.value,
      frequentTravel: $('frequentTravel')?.value,
      physicalJob: $('physicalJob')?.value,
      insuraPoints: window.currentUserPoints || 0,
    };
  }

  function buildReview() {
    const i = collectInputs();
    if (!$('reviewSummary')) return;
    $('reviewSummary').innerHTML = `
      <div class="review-item"><strong>الاسم:</strong> ${i.fullName}</div>
      <div class="review-item"><strong>العمر:</strong> ${i.age} سنة</div>
      <div class="review-item"><strong>الحالة:</strong> ${i.maritalStatus}</div>
      <div class="review-item"><strong>المعالون:</strong> ${i.dependents}</div>
      <div class="review-item"><strong>الدخل:</strong> ${i.monthlyIncome} جنيه</div>
      <div class="review-item"><strong>مدخن:</strong> ${i.smoker === 'yes' ? 'نعم' : 'لا'}</div>
      <div class="review-item"><strong>أمراض مزمنة:</strong> ${i.chronicDisease === 'yes' ? 'نعم' : 'لا'}</div>
      <div class="review-item"><strong>سيارة:</strong> ${i.hasCar === 'yes' ? 'نعم' : 'لا'}</div>
      <div class="review-item"><strong>منزل:</strong> ${i.hasHome === 'yes' ? 'نعم' : 'لا'}</div>
    `;
  }

  async function submit() {
    const btn = $('smartSubmit');
    if (!btn) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '⏳ جاري التحليل...';

    try {
      const inputs = collectInputs();

      if (!inputs.age || !inputs.monthlyIncome) {
        throw new Error('يرجى إكمال البيانات الأساسية (العمر والدخل)');
      }

      const result = await SmartEngine.run(inputs);
      renderResult(result);

      if (typeof SmartEngine.trackJourney === 'function') {
        await SmartEngine.trackJourney(inputs.userId, 'MATCHED', {
          assessmentId: result.assessmentId,
        });
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  function renderResult(result) {
    const el = $('smartResult');
    if (!el) return;
    el.classList.remove('hidden');
    const r = result.recommendations;
    const riskClass = r.riskLevel === 'مرتفع' ? 'high' : r.riskLevel === 'متوسط' ? 'medium' : 'low';

    el.innerHTML = `
      <h3 class="result-headline">${r.headline}</h3>
      <div class="result-badges">
        <span class="result-badge badge-${riskClass}">مستوى المخاطر: ${r.riskLevel}</span>
        ${r.estimatedDiscount > 0
          ? `<span class="result-badge badge-low">خصم ${r.estimatedDiscount}% متاح</span>`
          : ''}
      </div>

      <h4>🎯 التوصيات البديلة:</h4>
      <ul>
        ${r.alternativeRecommendations.length
          ? r.alternativeRecommendations.map(p => `<li>${SmartEngine.PRODUCT_NAMES_AR[p] || p}</li>`).join('')
          : '<li>لا توجد توصيات بديلة</li>'}
      </ul>

      <h4>⚠️ الفجوات التأمينية:</h4>
      <ul>
        ${r.coverageGaps.length
          ? r.coverageGaps.map(g =>
              `<li><strong>${g.typeAr}</strong>: ${g.reason} <em>(${g.severity})</em></li>`
            ).join('')
          : '<li>لا توجد فجوات حالية — تغطيتك شاملة 👌</li>'}
      </ul>

      <h4>📋 خطواتك القادمة:</h4>
      <ol>${r.actionItems.map(a => `<li>${a}</li>`).join('')}</ol>

      <div class="result-actions">
        <button class="btn-primary"
          onclick="SmartAssessmentUI.requestQuote('${r.primaryRecommendation || ''}')">
          📩 اطلب عرض سعر
        </button>
        <button class="btn-secondary" onclick="window.print()">🖨️ طباعة التقرير</button>
      </div>
    `;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function requestQuote(product) {
    if (typeof window.requestQuote === 'function') {
      window.requestQuote(product);
    } else {
      alert('سيتم التواصل معك قريبًا لعرض سعر ' + (SmartEngine.PRODUCT_NAMES_AR[product] || product));
    }
  }

  function init() {
    if (!$('smartAssessment')) return;

    $('smartNext')?.addEventListener('click', () => {
      if (currentStep < TOTAL_STEPS) { currentStep++; updateProgress(); }
    });
    $('smartPrev')?.addEventListener('click', () => {
      if (currentStep > 1) { currentStep--; updateProgress(); }
    });
    $('smartSubmit')?.addEventListener('click', submit);

    $('hasExisting')?.addEventListener('change', e => {
      $('existingPoliciesWrap')?.classList.toggle('hidden', e.target.value === 'no');
    });

    updateProgress();
  }

  return { init, submit, requestQuote, collectInputs };
})();

document.addEventListener('DOMContentLoaded', () => SmartAssessmentUI.init());