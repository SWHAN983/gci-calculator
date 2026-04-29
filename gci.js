// ===== GCI Calculator – gci.js =====
// Based on Celik et al. (2008), ASME J. Fluids Eng., 130(7), 078001

'use strict';

let currentDim = 3;
let lastResults = null;

// ── Example datasets ─────────────────────────────────────────────
// Example 0: Celik et al. (2008) ASME J. Fluids Eng. 130(7), 078001
//   Table 1 — 2D lid-driven cavity flow, velocity at a point
//   This is the standard reference example used worldwide for GCI validation.
// Example 1: 3D incompressible flow — drag coefficient study
const EXAMPLES = [
  {
    dim: 2,
    N1: 18000, N2: 8000, N3: 4500,
    phi1: 6.063, phi2: 5.972, phi3: 5.863,
    Fs: 1.25, pInit: 2,
    label: 'Celik et al. (2008) ASME JFE — 2D 공동 유동 속도 (논문 Table 1)'
  },
  {
    dim: 3,
    N1: 2000000, N2: 700000, N3: 250000,
    phi1: 0.97253, phi2: 0.96891, phi3: 0.96012,
    Fs: 1.25, pInit: 2,
    label: '3D 저항 계수 격자 연구 예제 (Fine ≈ 200만 셀)'
  }
];

function loadExample(idx) {
  const ex = EXAMPLES[idx];
  setDim(ex.dim);
  document.getElementById('n1').value = ex.N1;
  document.getElementById('n2').value = ex.N2;
  document.getElementById('n3').value = ex.N3;
  document.getElementById('phi1').value = ex.phi1;
  document.getElementById('phi2').value = ex.phi2;
  document.getElementById('phi3').value = ex.phi3;
  document.getElementById('fs').value = ex.Fs;
  document.getElementById('pInit').value = ex.pInit;

  // Animate buttons to show which was selected
  document.querySelectorAll('.ex-btn').forEach((b, i) => {
    b.classList.toggle('ex-btn-active', i === idx);
  });

  // Show source label briefly
  clearError();
  const errBox = document.getElementById('errorBox');
  errBox.classList.remove('hidden');
  errBox.style.cssText = 'background:rgba(99,102,241,0.1);border-color:rgba(99,102,241,0.3);color:#a5b4fc;';
  errBox.innerHTML = `📌 <strong>${ex.label}</strong>`;
  setTimeout(() => {
    errBox.classList.add('hidden');
    errBox.style.cssText = '';
  }, 4000);

  // Auto-calculate
  calculate();
}


// ── Dimension toggle ─────────────────────────────────────────────
function setDim(d) {
  currentDim = d;
  document.getElementById('btn3d').classList.toggle('active', d === 3);
  document.getElementById('btn2d').classList.toggle('active', d === 2);
  document.getElementById('dimHint').textContent =
    d === 3 ? 'h = (V/N)^(1/3)' : 'h = (A/N)^(1/2)';
}

// ── Helper: representative grid size from cell count ────────────
function repGridSize(N, dim) {
  // We don't know the domain volume/area, so we compute h proportionally.
  // For ratio r = h2/h1:   h ∝ N^(-1/dim)   →  r = (N1/N2)^(1/dim)
  // The absolute h value is only needed for Richardson extrapolation structure,
  // but since we calculate r directly from cell counts, we use h = N^(-1/dim)
  // (relative scale, proportional relationship preserved).
  return Math.pow(N, -1 / dim);
}

// ── Main calculation ─────────────────────────────────────────────
function calculate() {
  clearError();

  // Read inputs
  const N1 = parseFloat(document.getElementById('n1').value);
  const N2 = parseFloat(document.getElementById('n2').value);
  const N3 = parseFloat(document.getElementById('n3').value);
  const phi1 = parseFloat(document.getElementById('phi1').value);
  const phi2 = parseFloat(document.getElementById('phi2').value);
  const phi3 = parseFloat(document.getElementById('phi3').value);
  const Fs = parseFloat(document.getElementById('fs').value);
  const pInit = parseFloat(document.getElementById('pInit').value);

  // Validation
  const errors = [];
  if (isNaN(N1) || isNaN(N2) || isNaN(N3)) errors.push('격자 셀 수(N₁, N₂, N₃)를 모두 입력하세요.');
  if (N1 <= 0 || N2 <= 0 || N3 <= 0) errors.push('셀 수는 양수여야 합니다.');
  if (isNaN(phi1) || isNaN(phi2) || isNaN(phi3)) errors.push('관심 변수 값(φ₁, φ₂, φ₃)을 모두 입력하세요.');
  if (isNaN(Fs) || Fs < 1) errors.push('안전계수 Fₛ는 1 이상이어야 합니다.');
  if (isNaN(pInit) || pInit <= 0) errors.push('초기 차수 추정값은 양수여야 합니다.');

  // Check ordering: N1 > N2 > N3 (fine = most cells)
  if (!isNaN(N1) && !isNaN(N2) && !isNaN(N3)) {
    if (!(N1 > N2 && N2 > N3)) {
      errors.push('셀 수 정렬 오류: N₁(Fine) > N₂(Medium) > N₃(Coarse) 이어야 합니다.');
    }
  }

  if (errors.length > 0) {
    showError(errors.join('<br/>'));
    return;
  }

  // Step 1: Representative grid sizes & refinement ratios
  const h1 = repGridSize(N1, currentDim);
  const h2 = repGridSize(N2, currentDim);
  const h3 = repGridSize(N3, currentDim);

  const r21 = h2 / h1;   // > 1 since h2 > h1 (coarser)
  const r32 = h3 / h2;

  // Step 2: Errors
  const eps21 = phi2 - phi1;
  const eps32 = phi3 - phi2;
  const ratio = eps32 / eps21;
  const s = Math.sign(ratio);

  // Convergence type
  let convType;
  if (s > 0 && Math.abs(eps21) < Math.abs(eps32)) convType = 'monotonic';
  else if (s > 0 && Math.abs(eps21) > Math.abs(eps32)) convType = 'diverging';
  else if (s < 0) convType = 'oscillatory';
  else convType = 'converged'; // eps21 ≈ 0

  // Step 3: Apparent order p – fixed-point iteration (Celik eq. 3.3)
  let p = pInit;
  const MAX_ITER = 50;
  const TOL = 1e-8;
  let convergedP = false;

  if (Math.abs(eps21) < 1e-15 || Math.abs(eps32) < 1e-15) {
    p = pInit; // degenerate case
  } else {
    for (let i = 0; i < MAX_ITER; i++) {
      const qp = Math.log((Math.pow(r21, p) - s) / (Math.pow(r32, p) - s));
      const pNew = (1 / Math.log(r21)) * Math.abs(Math.log(Math.abs(ratio)) + qp);
      if (Math.abs(pNew - p) < TOL) { p = pNew; convergedP = true; break; }
      p = pNew;
    }
    if (!convergedP) p = pInit; // fallback
  }

  // Step 4: Richardson extrapolation (21 pair)
  const r21p = Math.pow(r21, p);
  const r32p = Math.pow(r32, p);
  const phiExt21 = (r21p * phi1 - phi2) / (r21p - 1);
  const phiExt32 = (r32p * phi2 - phi3) / (r32p - 1);

  // Step 5: Approximate relative errors
  const ea21 = Math.abs((phi1 - phi2) / phi1) * 100;
  const ea32 = Math.abs((phi2 - phi3) / phi2) * 100;

  // Step 6: Extrapolated relative errors
  const eext21 = Math.abs((phiExt21 - phi1) / phiExt21) * 100;
  const eext32 = Math.abs((phiExt32 - phi2) / phiExt32) * 100;

  // Step 7: GCI
  const gciFine21 = (Fs * ea21) / (r21p - 1);
  const gciMed32  = (Fs * ea32) / (r32p - 1);

  // Step 8: Asymptotic range check
  const asymCheck = gciMed32 / (r21p * gciFine21);

  // Store results for copy
  lastResults = { N1,N2,N3,phi1,phi2,phi3,Fs,currentDim,
    h1,h2,h3,r21,r32,eps21,eps32,s,p,
    phiExt21,phiExt32,ea21,ea32,eext21,eext32,
    gciFine21,gciMed32,asymCheck,convType };

  renderResults(lastResults);
}

// ── Render results ───────────────────────────────────────────────
function renderResults(R) {
  document.getElementById('placeholder').classList.add('hidden');
  document.getElementById('resultsContent').classList.remove('hidden');

  const fmt = (v, d=5) => isFinite(v) ? v.toPrecision(d) : 'N/A';
  const fmtP = (v, d=4) => isFinite(v) ? v.toFixed(d) : 'N/A';
  const fmtPct = (v, d=4) => isFinite(v) ? v.toFixed(d) + '%' : 'N/A';

  // GCI grade
  const gci = R.gciFine21;
  let grade, gradeClass, gradeEmoji;
  if (gci < 1) { grade='우수 (< 1%)'; gradeClass='grade-excellent'; gradeEmoji='🟢'; }
  else if (gci < 3) { grade='양호 (1–3%)'; gradeClass='grade-good'; gradeEmoji='🟡'; }
  else if (gci < 5) { grade='보통 (3–5%)'; gradeClass='grade-moderate'; gradeEmoji='🟠'; }
  else { grade='불량 (> 5%)'; gradeClass='grade-poor'; gradeEmoji='🔴'; }

  // Convergence badge
  const badge = document.getElementById('convergenceBadge');
  badge.style.display = 'inline-flex';
  if (R.convType === 'monotonic') {
    badge.textContent = '✅ 단조 수렴';
    badge.style.background = 'rgba(52,211,153,0.12)';
    badge.style.border = '1px solid rgba(52,211,153,0.3)';
    badge.style.color = '#34d399';
  } else if (R.convType === 'oscillatory') {
    badge.textContent = '⚠️ 진동 수렴';
    badge.style.background = 'rgba(251,191,36,0.12)';
    badge.style.border = '1px solid rgba(251,191,36,0.3)';
    badge.style.color = '#fbbf24';
  } else if (R.convType === 'diverging') {
    badge.textContent = '❌ 발산 경향';
    badge.style.background = 'rgba(248,113,113,0.12)';
    badge.style.border = '1px solid rgba(248,113,113,0.3)';
    badge.style.color = '#f87171';
  } else {
    badge.textContent = '✅ 수렴됨';
    badge.style.background = 'rgba(52,211,153,0.12)';
    badge.style.border = '1px solid rgba(52,211,153,0.3)';
    badge.style.color = '#34d399';
  }

  // KPIs
  const gciEl = document.getElementById('kpiGCIVal');
  gciEl.textContent = fmtPct(gci);
  gciEl.className = 'kpi-value ' + gradeClass;
  document.getElementById('kpiGCISub').textContent = gradeEmoji + ' ' + grade;

  document.getElementById('kpiPVal').textContent = fmtP(R.p);
  const pSub = Math.abs(R.p - 2) < 0.5 ? '이론값(2) 근접' : R.p > 3 ? '⚠️ 과추정 – 점근 미진입 의심' : R.p < 0.5 ? '⚠️ 과소추정 – 해상도 검토' : '이론값과 차이 있음';
  document.getElementById('kpiPSub').textContent = pSub;

  const asymEl = document.getElementById('kpiCheckVal');
  asymEl.textContent = fmtP(R.asymCheck);
  const asymOk = Math.abs(R.asymCheck - 1) <= 0.05;
  asymEl.className = 'kpi-value ' + (asymOk ? 'grade-excellent' : 'grade-moderate');
  document.getElementById('kpiCheckSub').textContent = asymOk ? '✅ 점근 범위 내' : '⚠️ 점근 범위 확인 필요';

  // Refinement ratios
  const r21ok = R.r21 >= 1.3;
  const r32ok = R.r32 >= 1.3;
  setText('r21', fmtP(R.r21));
  setText('r32', fmtP(R.r32));
  setText('r21Check', r21ok ? '<span class="check-ok">✓</span>' : '<span class="check-warn">⚠</span>');
  setText('r32Check', r32ok ? '<span class="check-ok">✓</span>' : '<span class="check-warn">⚠</span>');

  // Errors
  setText('eps21', fmt(R.eps21));
  setText('eps32', fmt(R.eps32));
  setText('sVal', R.s >= 0 ? '+1 (단조)' : '−1 (진동)');

  // Richardson & relative errors
  setText('phiExt21', fmt(R.phiExt21));
  setText('ea21', fmtPct(R.ea21));
  setText('ea32', fmtPct(R.ea32));
  setText('eext21', fmtPct(R.eext21));

  // GCI
  const gciFineEl = document.getElementById('gciFine21');
  gciFineEl.textContent = fmtPct(gci);
  gciFineEl.className = 'highlight-val ' + gradeClass;
  setText('gciMed32', fmtPct(R.gciMed32));
  setText('asymCheck', fmtP(R.asymCheck));
  setText('asymCheckStatus',
    asymOk ? '<span class="check-ok">≈ 1.0 ✓</span>' : '<span class="check-warn">≠ 1.0 ⚠</span>');

  // Summary
  const summaryBox = document.getElementById('summaryBox');
  summaryBox.innerHTML =
    `<strong>φ_ext²¹ = ${fmt(R.phiExt21)}</strong> (Richardson 외삽 추정값)<br/>` +
    `관측 수렴 차수 <strong>p = ${fmtP(R.p)}</strong> | ` +
    `GCI_fine = <strong class="${gradeClass}">${fmtPct(gci)}</strong><br/>` +
    (R.convType === 'oscillatory'
      ? `⚠️ <strong>진동 수렴 감지</strong>: GCI 신뢰도가 낮습니다. 격자 전략을 재검토하세요.`
      : `격자 독립 해로부터 최대 <strong>${fmtPct(gci)}</strong> 오차 범위에 있음 (95% 신뢰 수준)`);

  // Chart
  drawChart(R);
}

function setText(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ── Mini bar chart ───────────────────────────────────────────────
function drawChart(R) {
  const canvas = document.getElementById('gciChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.parentElement.clientWidth - 24;
  const H = 180;
  canvas.width = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const labels = ['Coarse (φ₃)', 'Medium (φ₂)', 'Fine (φ₁)', 'Extrap. (φ_ext)'];
  const values = [R.phi3, R.phi2, R.phi1, R.phiExt21];
  const colors = ['#f87171', '#fbbf24', '#6366f1', '#34d399'];

  const allVals = values.filter(isFinite);
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;
  const padTop = 20, padBot = 40, padLeft = 16, padRight = 16;
  const barW = (W - padLeft - padRight) / labels.length - 10;
  const chartH = H - padTop - padBot;

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop);
  ctx.lineTo(padLeft, H - padBot);
  ctx.lineTo(W - padRight, H - padBot);
  ctx.stroke();

  values.forEach((v, i) => {
    if (!isFinite(v)) return;
    const x = padLeft + i * ((W - padLeft - padRight) / labels.length) + 5;
    const barH = ((v - minV) / range) * chartH * 0.85 + chartH * 0.1;
    const y = H - padBot - barH;

    // Bar glow
    const grad = ctx.createLinearGradient(0, y, 0, H - padBot);
    grad.addColorStop(0, colors[i]);
    grad.addColorStop(1, colors[i] + '44');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Value label
    ctx.fillStyle = colors[i];
    ctx.font = '500 10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(v.toPrecision(5), x + barW / 2, y - 5);

    // X label
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW / 2, H - padBot + 16);
  });

  // Convergence trend line
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  values.forEach((v, i) => {
    if (!isFinite(v)) return;
    const x = padLeft + i * ((W - padLeft - padRight) / labels.length) + 5 + barW / 2;
    const barH = ((v - minV) / range) * chartH * 0.85 + chartH * 0.1;
    const y = H - padBot - barH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Copy results ─────────────────────────────────────────────────
function copyResults() {
  if (!lastResults) return;
  const R = lastResults;
  const fmt = (v, d=6) => isFinite(v) ? v.toPrecision(d) : 'N/A';
  const fmtP = (v) => isFinite(v) ? v.toFixed(4) : 'N/A';
  const fmtPct = (v) => isFinite(v) ? v.toFixed(4) + '%' : 'N/A';

  const text = [
    '=== GCI 계산 결과 (Celik et al. 2008) ===',
    `해석 차원: ${R.currentDim}D`,
    '',
    '[격자 정보]',
    `  N1 (Fine):   ${R.N1}   h1 = ${fmt(R.h1)}`,
    `  N2 (Medium): ${R.N2}   h2 = ${fmt(R.h2)}`,
    `  N3 (Coarse): ${R.N3}   h3 = ${fmt(R.h3)}`,
    `  r21 = ${fmtP(R.r21)}  |  r32 = ${fmtP(R.r32)}`,
    '',
    '[관심 변수]',
    `  φ1 (Fine):   ${R.phi1}`,
    `  φ2 (Medium): ${R.phi2}`,
    `  φ3 (Coarse): ${R.phi3}`,
    `  ε21 = ${fmt(R.eps21)}  |  ε32 = ${fmt(R.eps32)}`,
    `  수렴 유형: ${R.convType}`,
    '',
    '[계산 결과]',
    `  관측 수렴 차수 p = ${fmtP(R.p)}`,
    `  Richardson 외삽값 φ_ext21 = ${fmt(R.phiExt21)}`,
    `  근사 상대 오차 e_a21 = ${fmtPct(R.ea21)}`,
    `  근사 상대 오차 e_a32 = ${fmtPct(R.ea32)}`,
    `  외삽 상대 오차 e_ext21 = ${fmtPct(R.eext21)}`,
    `  GCI_fine (21) = ${fmtPct(R.gciFine21)}`,
    `  GCI_medium (32) = ${fmtPct(R.gciMed32)}`,
    `  점근 수렴 확인 = ${fmtP(R.asymCheck)} (목표: ≈ 1.0)`,
    '',
    `참고: Celik et al. (2008). ASME J. Fluids Eng. 130(7), 078001.`,
  ].join('\n');

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none"><path d="M5 10l4 4L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> 복사됨!';
    btn.style.color = '#34d399';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
  });
}

// ── Helpers ──────────────────────────────────────────────────────
function showError(msg) {
  const el = document.getElementById('errorBox');
  el.innerHTML = '⚠️ ' + msg;
  el.classList.remove('hidden');
}
function clearError() {
  document.getElementById('errorBox').classList.add('hidden');
  document.getElementById('errorBox').innerHTML = '';
}

// ── Keyboard shortcut: Enter → calculate ────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    const tag = document.activeElement.tagName;
    if (tag === 'INPUT') calculate();
  }
});

// ── Tab switching ────────────────────────────────────────────────
function showTab(tab) {
  const calcSections = [document.getElementById('calculator'), document.querySelector('.theory-section')];
  const reportSection = document.getElementById('report');
  const navCalc = document.getElementById('navCalc');
  const navReport = document.getElementById('navReport');

  if (tab === 'report') {
    if (!lastResults) { alert('먼저 GCI를 계산해주세요.'); return; }
    calcSections.forEach(s => s && (s.style.display = 'none'));
    reportSection.classList.remove('hidden');
    navCalc.classList.remove('active');
    navReport.classList.add('active');
    renderReport(lastResults);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    calcSections.forEach(s => s && (s.style.display = ''));
    reportSection.classList.add('hidden');
    navCalc.classList.add('active');
    navReport.classList.remove('active');
  }
}

// ── Report rendering ─────────────────────────────────────────────
function renderReport(R) {
  const fmtN = n => n.toLocaleString('ko-KR');
  const fmtV = (v, d=5) => isFinite(v) ? v.toPrecision(d) : 'N/A';
  const fmtD = (v, d=4) => isFinite(v) ? v.toFixed(d) : 'N/A';
  const fmtPct = (v, d=3) => isFinite(v) ? v.toFixed(d) + '%' : 'N/A';

  const gci = R.gciFine21;
  const asymOk = Math.abs(R.asymCheck - 1) <= 0.05;
  const r21ok = R.r21 >= 1.3;
  const r32ok = R.r32 >= 1.3;
  const now = new Date();

  // Grade info
  let gradeClass, verdictClass, gradeLabel, verdictIcon, verdictTitle, verdictDescText;
  if (gci < 1) {
    gradeClass='grade-excellent'; verdictClass='verdict-excellent'; gradeLabel='우수';
    verdictIcon='🟢'; verdictTitle='격자 독립성 달성 — 우수한 수준';
    verdictDescText=`현재 Fine 격자(${fmtN(R.N1)}개 셀)로 얻은 해석 결과는 이론적 격자 독립 해에 매우 가깝습니다. GCI_fine = ${fmtPct(gci)}로, 공학적으로 충분히 신뢰할 수 있는 결과입니다.`;
  } else if (gci < 3) {
    gradeClass='grade-good'; verdictClass='verdict-good'; gradeLabel='양호';
    verdictIcon='🟡'; verdictTitle='격자 독립성 달성 — 공학적으로 수용 가능';
    verdictDescText=`GCI_fine = ${fmtPct(gci)}로 격자 이산화 오차가 허용 범위 내에 있습니다. 현재 Fine 격자 결과를 사용하되, 보고 시 격자 불확실도(${fmtPct(gci)})를 명시하는 것을 권장합니다.`;
  } else if (gci < 5) {
    gradeClass='grade-moderate'; verdictClass='verdict-moderate'; gradeLabel='보통';
    verdictIcon='🟠'; verdictTitle='격자 독립성 미흡 — 추가 정제 권장';
    verdictDescText=`GCI_fine = ${fmtPct(gci)}로 격자 이산화 오차가 다소 큽니다. Fine 격자를 더 정밀하게 정제하거나, 국소 정제(Local refinement)를 적용하는 것을 권장합니다.`;
  } else {
    gradeClass='grade-poor'; verdictClass='verdict-poor'; gradeLabel='불량';
    verdictIcon='🔴'; verdictTitle='격자 독립성 미달 — 격자 재설계 필요';
    verdictDescText=`GCI_fine = ${fmtPct(gci)}로 격자 이산화 오차가 큽니다. 현재 결과를 최종 값으로 사용하기 어렵습니다. Fine 격자를 대폭 정제하거나 격자 전략을 전면 재검토하세요.`;
  }

  // Meta
  document.getElementById('rptSubtitle').textContent =
    `${R.currentDim}D 해석 · Fine ${fmtN(R.N1)} / Medium ${fmtN(R.N2)} / Coarse ${fmtN(R.N3)} 셀 · φ₁ = ${R.phi1}`;
  document.getElementById('rptMeta').innerHTML =
    `생성일시: ${now.toLocaleString('ko-KR')}<br/>기준: Celik et al. (2008) ASME JFE`;

  // Verdict
  const vEl = document.getElementById('rptVerdict');
  vEl.className = 'rpt-verdict ' + verdictClass;
  document.getElementById('verdictIcon').textContent = verdictIcon;
  document.getElementById('verdictTitle').textContent = verdictTitle;
  document.getElementById('verdictDesc').textContent = verdictDescText;
  const scoreEl = document.getElementById('verdictScore');
  scoreEl.innerHTML = `<div class="score-label">격자 독립성 오차</div><div class="score-value">${fmtPct(gci)}</div>`;

  // Section 1: mesh cards
  document.getElementById('rptN1').textContent = fmtN(R.N1);
  document.getElementById('rptN2').textContent = fmtN(R.N2);
  document.getElementById('rptN3').textContent = fmtN(R.N3);

  const checks = [];
  checks.push(r21ok
    ? { type:'pass', icon:'✅', label:`정제 비율 r₂₁ = ${fmtD(R.r21)} ≥ 1.3 ✓`, desc:`Fine↔Medium 격자 간 정제 비율이 권장 기준(≥ 1.3)을 만족합니다. 격자 간 차이가 충분하여 수렴 차수를 정확히 계산할 수 있습니다.` }
    : { type:'warn', icon:'⚠️', label:`정제 비율 r₂₁ = ${fmtD(R.r21)} < 1.3 — 기준 미달`, desc:`격자 간 차이가 너무 작습니다. r ≥ 1.3을 권장하며, 격자 정제 비율을 높이세요.` });
  checks.push(r32ok
    ? { type:'pass', icon:'✅', label:`정제 비율 r₃₂ = ${fmtD(R.r32)} ≥ 1.3 ✓`, desc:`Medium↔Coarse 격자 간 정제 비율도 권장 기준을 만족합니다.` }
    : { type:'warn', icon:'⚠️', label:`정제 비율 r₃₂ = ${fmtD(R.r32)} < 1.3 — 기준 미달`, desc:`Medium↔Coarse 격자 간 차이가 너무 작습니다.` });
  const nRatio21 = (R.N1/R.N2).toFixed(2), nRatio32 = (R.N2/R.N3).toFixed(2);
  checks.push({ type:'pass', icon:'ℹ️', label:`셀 수 비율: N₁/N₂ = ${nRatio21}, N₂/N₃ = ${nRatio32}`, desc:`셀 수 비율이 높을수록 격자 간 물리적 차이가 크며, GCI 계산의 신뢰도가 향상됩니다.` });

  document.getElementById('rptGridChecks').innerHTML = checks.map(c =>
    `<div class="check-item check-item-${c.type}">
      <div class="check-item-icon">${c.icon}</div>
      <div><div class="check-item-label">${c.label}</div><div class="check-item-desc">${c.desc}</div></div>
    </div>`).join('');

  // Section 2: convergence visual
  const d21 = (R.phi2 - R.phi1).toExponential(2);
  const d32 = (R.phi3 - R.phi2).toExponential(2);
  document.getElementById('rptConvVisual').innerHTML = `
    <div class="conv-arrow-row">
      <div class="conv-box conv-box-coarse">
        <div class="conv-box-label">Coarse</div>
        <div class="conv-box-val">${fmtV(R.phi3)}</div>
        <div class="conv-box-sublabel">${fmtN(R.N3)} cells</div>
      </div>
      <div class="conv-arrow">→<div class="conv-arrow-diff">Δ=${d32}</div></div>
      <div class="conv-box conv-box-medium">
        <div class="conv-box-label">Medium</div>
        <div class="conv-box-val">${fmtV(R.phi2)}</div>
        <div class="conv-box-sublabel">${fmtN(R.N2)} cells</div>
      </div>
      <div class="conv-arrow">→<div class="conv-arrow-diff">Δ=${d21}</div></div>
      <div class="conv-box conv-box-fine">
        <div class="conv-box-label">Fine</div>
        <div class="conv-box-val">${fmtV(R.phi1)}</div>
        <div class="conv-box-sublabel">${fmtN(R.N1)} cells</div>
      </div>
      <div class="conv-arrow">→<div class="conv-arrow-diff">외삽</div></div>
      <div class="conv-box conv-box-ext">
        <div class="conv-box-label">이론 한계</div>
        <div class="conv-box-val">${fmtV(R.phiExt21)}</div>
        <div class="conv-box-sublabel">Richardson 외삽값</div>
      </div>
    </div>
    <div style="text-align:center">
      ${R.convType === 'monotonic'
        ? `<span class="conv-trend-label" style="background:rgba(52,211,153,0.12);border:1px solid rgba(52,211,153,0.3);color:#34d399;">✅ 단조 수렴 — 격자가 세밀해질수록 결과가 안정적으로 한 방향으로 수렴하고 있습니다</span>`
        : R.convType === 'oscillatory'
        ? `<span class="conv-trend-label" style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;">⚠️ 진동 수렴 — 결과가 위아래로 흔들리고 있습니다. 격자 전략을 재검토하세요</span>`
        : `<span class="conv-trend-label" style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.3);color:#f87171;">❌ 발산 경향 — 격자를 세밀하게 해도 결과 차이가 커지고 있습니다</span>`}
    </div>`;

  // Convergence type & p cards
  const convTypeText = {
    monotonic:  { icon:'📉', title:'단조 수렴 (Monotonic)', color:'var(--green)',  desc:`격자가 촘촘해질수록 결과가 한 방향으로 꾸준히 수렴하고 있습니다. 이상적인 수렴 형태로, GCI 계산 결과를 신뢰할 수 있습니다.` },
    oscillatory:{ icon:'〰️', title:'진동 수렴 (Oscillatory)', color:'var(--yellow)', desc:`격자에 따라 결과가 증가했다 감소하는 진동 현상이 나타납니다. GCI 계산 신뢰도가 낮으며, 격자 전략을 재검토해야 합니다.` },
    diverging:  { icon:'📈', title:'발산 (Diverging)', color:'var(--red)',   desc:`격자가 세밀해져도 결과 차이가 줄어들지 않습니다. 격자 설정이나 솔버 수렴을 다시 확인하세요.` },
    converged:  { icon:'✅', title:'이미 수렴됨', color:'var(--green)',  desc:`Fine과 Medium 격자 결과가 거의 동일합니다. 격자 독립성이 이미 달성된 상태입니다.` },
  }[R.convType] || { icon:'❓', title:'알 수 없음', color:'var(--text-muted)', desc:'' };

  document.getElementById('rptConvTypeCard').innerHTML = `
    <div class="insight-card-icon">${convTypeText.icon}</div>
    <div class="insight-card-title">수렴 유형</div>
    <div class="insight-card-val" style="color:${convTypeText.color}">${convTypeText.title}</div>
    <div class="insight-card-desc">${convTypeText.desc}</div>`;

  const pStatus = R.p > 3 ? { color:'var(--yellow)', note:'⚠️ 과추정 — 격자가 점근 범위에 아직 미진입했을 수 있습니다.' }
    : R.p < 0.5 ? { color:'var(--red)', note:'❌ 과소추정 — 격자 해상도 부족 또는 발산 가능성.' }
    : Math.abs(R.p-2) < 0.5 ? { color:'var(--green)', note:'✅ 이론값(2차 기법 → p≈2) 근접 — 정상 범위입니다.' }
    : { color:'var(--yellow)', note:'⚠️ 이론값과 다소 차이가 있습니다. 격자 전략을 점검하세요.' };
  document.getElementById('rptPCard').innerHTML = `
    <div class="insight-card-icon">📐</div>
    <div class="insight-card-title">관측 수렴 차수 (p)</div>
    <div class="insight-card-val" style="color:${pStatus.color}">${fmtD(R.p)}</div>
    <div class="insight-card-desc">STAR-CCM+ 2차 기법의 이론 차수는 <strong>p = 2</strong>입니다. 관측값이 이론값에 가까울수록 격자가 점근 수렴 범위 내에 있음을 의미합니다.<br/><br/>${pStatus.note}</div>`;

  // Section 3: Gauge chart
  drawGaugeChart(gci);
  document.getElementById('rptEa21').innerHTML = `<span class="${gradeClass}">${fmtPct(R.ea21)}</span>`;
  document.getElementById('rptGciFine').innerHTML = `<span class="${gradeClass}">${fmtPct(gci)}</span>`;
  document.getElementById('rptPhiExt').textContent = fmtV(R.phiExt21, 6);

  // Section 4: Asymptotic
  const asymPct = Math.min(Math.max((R.asymCheck - 0.5) / 1.0, 0), 1) * 100;
  document.getElementById('rptAsymVisual').innerHTML = `
    <div class="asym-val-big" style="color:${asymOk?'var(--green)':'var(--yellow)'}">${fmtD(R.asymCheck)}</div>
    <div class="asym-needle-row">
      <span class="asym-label">0.5</span>
      <div class="asym-scale"><div class="asym-needle" id="asymNeedle"></div></div>
      <span class="asym-label">1.5</span>
    </div>
    <div class="asym-desc">목표값: <strong>1.0</strong> (±0.05 허용) &nbsp;|&nbsp; ${asymOk
      ? '✅ 점근 수렴 범위 내 — GCI 계산 결과를 신뢰할 수 있습니다.'
      : '⚠️ 점근 수렴 범위 이탈 — 세 격자가 아직 수치 점근 범위에 완전히 진입하지 않았을 수 있습니다. GCI가 과대 또는 과소 추정될 수 있습니다.'}</div>`;
  setTimeout(() => {
    const needle = document.getElementById('asymNeedle');
    if (needle) needle.style.left = asymPct + '%';
  }, 100);

  // Full data table
  const rows = [
    ['격자 정제 비율 r₂₁', fmtD(R.r21), r21ok?'✅ ≥ 1.3':'⚠️ < 1.3', false],
    ['격자 정제 비율 r₃₂', fmtD(R.r32), r32ok?'✅ ≥ 1.3':'⚠️ < 1.3', false],
    ['관측 수렴 차수 p', fmtD(R.p), '', false],
    ['Richardson 외삽값 φ_ext²¹', fmtV(R.phiExt21, 6), '격자 독립 해 추정', true],
    ['Fine↔Medium 오차 e_a²¹', fmtPct(R.ea21), '', false],
    ['Medium↔Coarse 오차 e_a³²', fmtPct(R.ea32), '', false],
    ['외삽 상대 오차 e_ext²¹', fmtPct(R.eext21), '', false],
    ['GCI_fine (21)', fmtPct(gci), gradeLabel, true],
    ['GCI_medium (32)', fmtPct(R.gciMed32), '', false],
    ['점근 수렴 확인', fmtD(R.asymCheck), asymOk?'✅ ≈ 1.0':'⚠️ 확인 필요', true],
  ];
  document.getElementById('rptFullTable').innerHTML = rows.map(([label, val, note, hl]) =>
    `<tr class="${hl?'row-highlight':''}"><td class="col-label">${label}</td><td class="col-val">${val}</td><td class="col-note">${note}</td></tr>`
  ).join('');

  // Section 5: Conclusion
  const conclusions = [];
  // GCI result
  if (gci < 1) conclusions.push({ type:'pass', icon:'🏆', title:'격자 독립성 달성 (GCI < 1%)', desc:`현재 Fine 격자(<strong>${fmtN(R.N1)} cells</strong>)의 해석 결과는 격자 독립 해로부터 <strong>${fmtPct(gci)}</strong> 이내입니다. 이 결과를 최종값으로 사용할 수 있습니다.` });
  else if (gci < 3) conclusions.push({ type:'pass', icon:'✅', title:'공학적으로 수용 가능 (GCI < 3%)', desc:`GCI_fine = <strong>${fmtPct(gci)}</strong>로 공학적 판단 기준에 부합합니다. 보고서 작성 시 격자 불확실도를 <strong>±${fmtPct(gci)}</strong>로 명시하세요.` });
  else if (gci < 5) conclusions.push({ type:'warn', icon:'⚠️', title:'추가 격자 정제 권장 (3% ≤ GCI < 5%)', desc:`현재 오차 <strong>${fmtPct(gci)}</strong>는 정밀 공학 해석에서 다소 큽니다. Fine 격자의 Base Size를 줄이거나, 주요 유동 영역에 국소 정제를 적용하세요.` });
  else conclusions.push({ type:'fail', icon:'🔴', title:'격자 독립성 미달 — 격자 재설계 필요', desc:`GCI = <strong>${fmtPct(gci)}</strong>로 격자 이산화 오차가 허용 기준을 초과합니다. Fine 격자를 대폭 정제하거나 격자 전략을 전면 재검토하세요.` });

  // Asymptotic check
  if (asymOk) conclusions.push({ type:'pass', icon:'✅', title:'점근 수렴 범위 내 — GCI 신뢰도 높음', desc:`점근 수렴 확인값 = <strong>${fmtD(R.asymCheck)}</strong> (목표 1.0 ± 0.05). 세 격자 모두 수치 점근 범위에 진입하였으며, GCI 계산 결과의 신뢰도가 높습니다.` });
  else conclusions.push({ type:'warn', icon:'⚠️', title:'점근 수렴 범위 이탈 — 격자 추가 정제 고려', desc:`점근 수렴 확인값 = <strong>${fmtD(R.asymCheck)}</strong>으로 1.0에서 벗어납니다. 격자가 아직 수치 점근 범위에 완전히 진입하지 않았을 수 있습니다. 더 정밀한 격자에서 검증을 반복하세요.` });

  // Convergence type warning
  if (R.convType === 'oscillatory') conclusions.push({ type:'warn', icon:'〰️', title:'진동 수렴 감지 — GCI 신뢰도 낮음', desc:'격자에 따라 결과가 진동하고 있습니다. 반복 수렴(iterative convergence)이 충분히 달성되었는지 확인하고, 격자 토폴로지(Prism layer, Local refinement 등) 일관성을 점검하세요.' });
  if (R.convType === 'diverging') conclusions.push({ type:'fail', icon:'📈', title:'발산 경향 — 격자 설정 재검토 필수', desc:'격자를 세밀하게 해도 결과 오차가 줄지 않습니다. 격자 설정, 경계 조건, 솔버 수렴 등을 전면 재검토하세요.' });

  // Reference info
  conclusions.push({ type:'info', icon:'📄', title:'보고서 작성 시 포함 권장 항목', desc:`격자 명칭(Coarse/Medium/Fine) · 셀 수(${fmtN(R.N3)} / ${fmtN(R.N2)} / ${fmtN(R.N1)}) · 정제 비율(r₂₁=${fmtD(R.r21)}) · 관측 차수(p=${fmtD(R.p)}) · Richardson 외삽값(${fmtV(R.phiExt21,6)}) · GCI_fine(<strong>${fmtPct(gci)}</strong>) · 점근 수렴 확인(${fmtD(R.asymCheck)}) · 기준: Celik et al. (2008)` });

  document.getElementById('rptConclusion').innerHTML = conclusions.map(c =>
    `<div class="conclusion-card conclusion-card-${c.type}">
      <div class="conclusion-icon">${c.icon}</div>
      <div class="conclusion-body">
        <div class="conclusion-title">${c.title}</div>
        <div class="conclusion-desc">${c.desc}</div>
      </div>
    </div>`).join('');
}

// ── GCI Gauge Chart ──────────────────────────────────────────────
function drawGaugeChart(gci) {
  const canvas = document.getElementById('rptGaugeChart');
  if (!canvas) return;
  const W = canvas.parentElement.clientWidth - 32;
  const H = 110;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const zones = [
    { max: 1, color: '#34d399', label: '우수\n< 1%' },
    { max: 3, color: '#6ee7b7', label: '양호\n1–3%' },
    { max: 5, color: '#fbbf24', label: '보통\n3–5%' },
    { max: 12, color: '#f87171', label: '불량\n> 5%' },
  ];
  const maxVal = 12, padL = 20, padR = 20, barH = 20, barY = 40;
  const barW = W - padL - padR;

  let prevX = padL;
  zones.forEach(z => {
    const endFrac = Math.min(z.max, maxVal) / maxVal;
    const endX = padL + endFrac * barW;
    const grad = ctx.createLinearGradient(prevX, 0, endX, 0);
    grad.addColorStop(0, z.color + 'bb');
    grad.addColorStop(1, z.color);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(prevX, barY, endX - prevX - 1, barH, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '9px Inter';
    ctx.textAlign = 'center';
    const midX = (prevX + endX - 1) / 2;
    z.label.split('\n').forEach((line, i) => ctx.fillText(line, midX, barY + barH + 14 + i * 12));
    prevX = endX + 1;
  });

  // Needle
  const needleFrac = Math.min(gci, maxVal) / maxVal;
  const needleX = padL + needleFrac * barW;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(needleX, barY - 4);
  ctx.lineTo(needleX - 7, barY - 18);
  ctx.lineTo(needleX + 7, barY - 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // GCI value label
  ctx.fillStyle = 'white';
  ctx.font = 'bold 13px Inter';
  ctx.textAlign = 'center';
  ctx.fillText(`GCI = ${gci.toFixed(3)}%`, needleX, barY - 22);

  // Scale ticks
  [0, 1, 3, 5, 10].forEach(v => {
    const x = padL + (Math.min(v, maxVal) / maxVal) * barW;
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px Inter';
    ctx.textAlign = 'center';
    ctx.fillText(v + '%', x, barY - 3);
  });
}

// ── DOMContentLoaded ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {});

