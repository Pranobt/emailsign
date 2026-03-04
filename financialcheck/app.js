const state = {
  step: 1,
  questionIndex: 0,
  numbers: {
    age: null,
    retirementAge: null,
    income: null,
    expenses: null,
    investments: 0,
    emi: 0,
    emergencyFund: 0,
    healthCover: "",
    termCover: ""
  },
  questions: [],
  answers: {},
  score: null,
  provisionalScore: 0
};

const PILLARS = {
  goal: "Goal Planning",
  budget: "Budgeting & Taxation",
  loan: "Loan Management",
  insurance: "Insurance Planning",
  investment: "Investment Planning",
  estate: "Estate Planning"
};

const SUB_MAX = { savings: 20, protection: 20, portfolio: 20, debt: 10, liquidity: 10, retirement: 30 };
const W_LT58 = { goal: 15, budget: 15, loan: 10, insurance: 20, investment: 25, estate: 15 };
const W_GTE58 = { goal: 18, budget: 17, loan: 8, insurance: 10, investment: 22, estate: 25 };

const el = {
  step1: document.getElementById("step1"),
  step2: document.getElementById("step2"),
  step3: document.getElementById("step3"),
  stepLabel: document.getElementById("stepLabel"),
  progressBar: document.getElementById("progressBar"),
  stepList: document.querySelectorAll(".step-list li"),
  numbersForm: document.getElementById("numbersForm"),
  termWrap: document.getElementById("termWrap"),
  termNote: document.getElementById("termNote"),
  expenseWarning: document.getElementById("expenseWarning"),
  snapshot: document.getElementById("snapshot"),
  toStep2: document.getElementById("toStep2"),
  backToStep1: document.getElementById("backToStep1"),
  prevQ: document.getElementById("prevQ"),
  nextQ: document.getElementById("nextQ"),
  toStep3: document.getElementById("toStep3"),
  qPillar: document.getElementById("qPillar"),
  qCounter: document.getElementById("qCounter"),
  qText: document.getElementById("qText"),
  qOptions: document.getElementById("qOptions"),
  questionProgress: document.getElementById("questionProgress"),
  ringValue: document.getElementById("ringValue"),
  mainScore: document.getElementById("mainScore"),
  scoreBand: document.getElementById("scoreBand"),
  pillarList: document.getElementById("pillarList"),
  subScoreList: document.getElementById("subScoreList"),
  actionList: document.getElementById("actionList"),
  callbackModal: document.getElementById("callbackModal"),
  headerCallbackBtn: document.getElementById("headerCallbackBtn"),
  inlineCallbackBtn: document.getElementById("inlineCallbackBtn"),
  closeModal: document.getElementById("closeModal"),
  callbackForm: document.getElementById("callbackForm"),
  toast: document.getElementById("toast")
};

init();

function init() {
  bindNumbers();
  bindStepButtons();
  bindModal();
  renderSnapshot();
  renderStep();
}

function bindNumbers() {
  el.numbersForm.querySelectorAll("input,select").forEach((node) => {
    node.addEventListener("input", onNumbersChange);
    node.addEventListener("change", onNumbersChange);
  });
}

function onNumbersChange() {
  pullNumbers();
  const is58 = (state.numbers.age || 0) >= 58;
  el.termWrap.classList.toggle("hidden", is58);
  el.termNote.classList.toggle("hidden", !is58);
  if (is58) {
    state.numbers.termCover = "";
    el.numbersForm.termCover.value = "";
  }

  const warn = (state.numbers.expenses || 0) > (state.numbers.income || 0) && state.numbers.income !== null;
  el.expenseWarning.classList.toggle("hidden", !warn);

  state.provisionalScore = calculateScore(false).total;
  renderSnapshot();
}

function bindStepButtons() {
  el.toStep2.addEventListener("click", () => {
    if (!validateStep1()) return;
    const profile = buildFinancialProfile(state.numbers);
    state.questions = buildDynamicQuestions(profile);
    state.answers = {};
    state.questions.forEach((q) => { state.answers[q.id] = null; });
    state.questionIndex = 0;
    state.step = 2;
    renderStep();
    renderQuestion();
  });

  el.backToStep1.addEventListener("click", () => {
    state.step = 1;
    renderStep();
  });

  el.prevQ.addEventListener("click", () => {
    if (state.questionIndex > 0) {
      state.questionIndex -= 1;
      renderQuestion();
    }
  });

  el.nextQ.addEventListener("click", () => {
    const q = state.questions[state.questionIndex];
    if (!q) return;
    if (state.answers[q.id] === null) {
      showToast("Please choose an option to continue.");
      return;
    }
    if (state.questionIndex < state.questions.length - 1) {
      state.questionIndex += 1;
      renderQuestion();
    }
  });

  el.toStep3.addEventListener("click", () => {
    if (!allQuestionsAnswered()) {
      showToast("Please answer all questions to continue.");
      return;
    }
    state.score = calculateScore(true);
    state.step = 3;
    renderStep();
    renderResults();
  });
}

function bindModal() {
  [el.headerCallbackBtn, el.inlineCallbackBtn].forEach((btn) => {
    btn.addEventListener("click", () => el.callbackModal.classList.remove("hidden"));
  });
  el.closeModal.addEventListener("click", () => el.callbackModal.classList.add("hidden"));
  el.callbackModal.addEventListener("click", (e) => {
    if (e.target === el.callbackModal) el.callbackModal.classList.add("hidden");
  });
  el.callbackForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!el.callbackForm.checkValidity()) {
      el.callbackForm.reportValidity();
      return;
    }
    el.callbackForm.reset();
    el.callbackModal.classList.add("hidden");
    showToast("Callback request submitted. Our team will reach out shortly.");
  });
}

function pullNumbers() {
  state.numbers.age = toNum(el.numbersForm.age.value);
  state.numbers.retirementAge = toNum(el.numbersForm.retirementAge.value);
  state.numbers.income = toNum(el.numbersForm.income.value);
  state.numbers.expenses = toNum(el.numbersForm.expenses.value);
  state.numbers.investments = toNum(el.numbersForm.investments.value) || 0;
  state.numbers.emi = toNum(el.numbersForm.emi.value) || 0;
  state.numbers.emergencyFund = toNum(el.numbersForm.emergencyFund.value) || 0;
  state.numbers.healthCover = el.numbersForm.healthCover.value;
  state.numbers.termCover = el.numbersForm.termCover.value;
}

function validateStep1() {
  pullNumbers();
  const required = ["age", "retirementAge", "income", "expenses", "healthCover"];
  const missing = required.some((k) => state.numbers[k] === null || state.numbers[k] === "");
  if (missing) {
    el.numbersForm.reportValidity();
    showToast("Please fill required fields before continuing.");
    return false;
  }
  return true;
}

function buildFinancialProfile(n) {
  const age = n.age || 0;
  const income = n.income || 0;
  const expenses = n.expenses || 0;
  const annualIncome = income * 12;
  const annualExpenses = expenses * 12;
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
  const emiRatio = income > 0 ? (n.emi / income) * 100 : 0;
  const retirementTarget = annualExpenses * 30;
  const fiProgress = retirementTarget > 0 ? n.investments / retirementTarget : 0;
  const yearsToRetirement = n.retirementAge - n.age;
  const emergencyTarget = income * 6;
  const emergencyCoverage = emergencyTarget > 0 ? n.emergencyFund / emergencyTarget : 0;
  const healthVal = mapCover(n.healthCover);
  const termVal = mapCover(n.termCover);

  const healthMin = Math.max(5, Math.ceil((annualIncome / 100000) * 0.6 / 5) * 5);
  const healthMax = healthMin + 10;

  return {
    age,
    annualIncome,
    annualExpenses,
    savingsRate,
    emiRatio,
    retirementTarget,
    fiProgress,
    yearsToRetirement,
    emergencyTarget,
    emergencyCoverage,
    healthVal,
    termVal,
    healthMin,
    healthMax,
    targetSavingsPct: 30,
    emiTargetPct: 30,
    isPost58: age >= 58
  };
}

function buildDynamicQuestions(p) {
  const q = [
    {
      id: "health_cover",
      pillar: "insurance",
      sub: "protection",
      text: `Recommended family health cover range for your profile is ${inrL(p.healthMin)} to ${inrL(p.healthMax)}. How much is your Family Health Insurance cover (Mediclaim)?`,
      options: [
        { label: `Below recommended range (< ${inrL(p.healthMin)})`, value: 0.3 },
        { label: `Within recommended range (${inrL(p.healthMin)} - ${inrL(p.healthMax)})`, value: 1 },
        { label: `Above recommended range (> ${inrL(p.healthMax)})`, value: 1 },
        { label: "I do not have health insurance", value: 0 }
      ]
    }
  ];

  if (!p.isPost58) {
    q.push({
      id: "term_cover",
      pillar: "insurance",
      sub: "protection",
      text: "How much is your Term Life Insurance cover?",
      options: [
        { label: "Up to 5x of your annual income", value: 0.3 },
        { label: "5x to 10x of your annual income", value: 0.7 },
        { label: "Greater than 10x of your annual income", value: 1 },
        { label: "I don't have Term Life Insurance", value: 0 }
      ]
    });
  }

  q.push(
    {
      id: "savings_rate",
      pillar: "budget",
      sub: "savings",
      text: `You should ideally be saving/investing at least ${p.targetSavingsPct}% of monthly income. What % of your monthly income do you save regularly?`,
      options: [
        { label: "0% - 10%", value: 0.2 },
        { label: `10% - ${p.targetSavingsPct}%`, value: 0.6 },
        { label: `Greater than ${p.targetSavingsPct}%`, value: 1 },
        { label: "I don't save regularly", value: 0 }
      ]
    },
    {
      id: "tax_planning",
      pillar: "budget",
      sub: "savings",
      text: "Have you planned your taxes well?",
      options: [
        { label: "Yes", value: 1 },
        { label: "Partly", value: 0.5 },
        { label: "No", value: 0 }
      ]
    },
    {
      id: "retirement_set_aside",
      pillar: "goal",
      sub: "retirement",
      text: `How much have you kept aside for your Retirement / Financial Freedom? (Target: ${formatINR(p.retirementTarget)}, approx 30x annual expenses)`,
      options: [
        { label: "Less than 30% of target", value: 0.3 },
        { label: "30% - 70% of target", value: 0.7 },
        { label: "More than 70% of target", value: 1 },
        { label: "I have not started yet", value: 0 }
      ]
    },
    {
      id: "goal_tracking",
      pillar: "goal",
      sub: "retirement",
      text: "Do you have well defined savings targets for your financial goals and can you track them actively?",
      options: [
        { label: "Yes", value: 1 },
        { label: "Sometimes", value: 0.5 },
        { label: "No", value: 0 }
      ]
    },
    {
      id: "emi_percent",
      pillar: "loan",
      sub: "debt",
      text: `Your EMI should ideally not be more than ${p.emiTargetPct}% of monthly income. What % of your monthly income goes towards paying EMI?`,
      options: [
        { label: `Less than ${p.emiTargetPct}%`, value: 1 },
        { label: `${p.emiTargetPct}% - 50%`, value: 0.5 },
        { label: "Greater than 50%", value: 0.1 },
        { label: "I don't have any EMIs / Debt", value: 1 }
      ]
    },
    {
      id: "xirr_cagr",
      pillar: "investment",
      sub: "portfolio",
      text: "Do you know the XIRR and CAGR on your current investments across all platforms?",
      options: [
        { label: "Yes", value: 1 },
        { label: "Somewhat", value: 0.5 },
        { label: "No", value: 0 }
      ]
    },
    {
      id: "equity_allocation",
      pillar: "investment",
      sub: "portfolio",
      text: "What % of your annual savings are regularly invested in Equity Mutual Funds or Direct Equity or PMS?",
      options: [
        { label: "Less than 30%", value: 0.3 },
        { label: "30% - 60%", value: 0.7 },
        { label: "More than 60%", value: 1 },
        { label: "I don't invest in equity regularly", value: 0 }
      ]
    },
    {
      id: "emergency_fund",
      pillar: "insurance",
      sub: "liquidity",
      text: `How much have you put aside as your emergency fund? (Target: ${formatINR(p.emergencyTarget)}, approx 6 months of monthly income)`,
      options: [
        { label: "Less than 3 months equivalent", value: 0.3 },
        { label: "3 - 6 months equivalent", value: 0.7 },
        { label: "More than 6 months equivalent", value: 1 },
        { label: "I don't maintain an emergency fund", value: 0 }
      ]
    },
    {
      id: "doc_access",
      pillar: "estate",
      sub: "estate",
      text: "In an emergency, can loved ones access your financial documents in under 30 minutes?",
      options: [
        { label: "Yes", value: 1 },
        { label: "Partially", value: 0.5 },
        { label: "No", value: 0 }
      ]
    },
    {
      id: "nominees",
      pillar: "estate",
      sub: "estate",
      text: "Do all your assets and investments have nominees and beneficiaries?",
      options: [
        { label: "Yes", value: 1 },
        { label: "Some assets only", value: 0.5 },
        { label: "No", value: 0 }
      ]
    },
    {
      id: "review_plan",
      pillar: "estate",
      sub: "estate",
      text: "Do you review your financial plan regularly?",
      options: [
        { label: "Quarterly", value: 1 },
        { label: "Half-yearly / Yearly", value: 0.7 },
        { label: "Rarely", value: 0.3 },
        { label: "Never", value: 0 }
      ]
    }
  );

  return q;
}

function renderStep() {
  el.step1.classList.toggle("hidden", state.step !== 1);
  el.step2.classList.toggle("hidden", state.step !== 2);
  el.step3.classList.toggle("hidden", state.step !== 3);

  const label = state.step === 1 ? "Step 1 of 3: Your numbers" : state.step === 2 ? "Step 2 of 3: Smart questions" : "Step 3 of 3: Your score";
  el.stepLabel.textContent = label;

  const pct = (state.step / 3) * 100;
  el.progressBar.style.width = `${pct}%`;
  document.querySelector(".track").setAttribute("aria-valuenow", String(Math.round(pct)));
  el.stepList.forEach((item, i) => item.classList.toggle("active", i + 1 === state.step));
}

function renderSnapshot() {
  const p = buildFinancialProfile(state.numbers);
  const years = p.yearsToRetirement;
  const yearly = years > 0 ? Math.max(0, (p.retirementTarget - state.numbers.investments) / years) : null;
  el.snapshot.innerHTML = `
    <h4>Live snapshot</h4>
    <div class="snap-grid">
      ${snap("Monthly savings", formatINR((state.numbers.income || 0) - (state.numbers.expenses || 0)))}
      ${snap("Savings rate", `${p.savingsRate.toFixed(1)}%`)}
      ${snap("Years to retirement", years < 0 ? "Already retired" : years)}
      ${snap("FI target", formatINR(p.retirementTarget))}
      ${snap("Yearly fresh investment", yearly === null ? "--" : formatINR(yearly))}
      ${snap("EMI ratio", `${p.emiRatio.toFixed(1)}%`)}
      ${snap("Provisional score", `${state.provisionalScore}/100`)}
    </div>
  `;
}

function renderQuestion() {
  const total = state.questions.length;
  const idx = clamp(state.questionIndex, 0, total - 1);
  state.questionIndex = idx;
  const q = state.questions[idx];
  if (!q) return;

  el.qPillar.textContent = PILLARS[q.pillar];
  el.qCounter.textContent = `Question ${idx + 1} of ${total}`;
  el.qText.textContent = q.text;
  el.questionProgress.style.width = `${((idx + 1) / total) * 100}%`;

  el.qOptions.innerHTML = "";
  q.options.forEach((opt, i) => {
    const id = `${q.id}_${i}`;
    const row = document.createElement("label");
    row.className = "q-option";
    row.htmlFor = id;

    const input = document.createElement("input");
    input.type = "radio";
    input.id = id;
    input.name = q.id;
    input.value = String(opt.value);
    input.checked = state.answers[q.id] !== null && Number(state.answers[q.id]) === opt.value;

    input.addEventListener("change", () => {
      state.answers[q.id] = opt.value;
      state.provisionalScore = calculateScore(false).total;
      renderSnapshot();
      updateQuestionNav();
      renderQuestionOptionsState();
    });

    const span = document.createElement("span");
    span.textContent = opt.label;

    row.appendChild(input);
    row.appendChild(span);
    el.qOptions.appendChild(row);
  });

  renderQuestionOptionsState();
  updateQuestionNav();
}

function renderQuestionOptionsState() {
  el.qOptions.querySelectorAll(".q-option").forEach((row) => {
    const checked = row.querySelector("input")?.checked;
    row.classList.toggle("checked", Boolean(checked));
  });
}

function updateQuestionNav() {
  const idx = state.questionIndex;
  const total = state.questions.length;
  const isFirst = idx === 0;
  const isLast = idx === total - 1;
  const currentQ = state.questions[idx];
  const hasCurrent = currentQ ? state.answers[currentQ.id] !== null : false;

  el.prevQ.classList.toggle("hidden", isFirst);
  el.nextQ.classList.toggle("hidden", isLast);
  el.toStep3.classList.toggle("hidden", !isLast);

  el.nextQ.disabled = !hasCurrent;
  el.toStep3.disabled = !allQuestionsAnswered();
}

function allQuestionsAnswered() {
  return state.questions.every((q) => state.answers[q.id] !== null);
}

function calculateScore(requireAnswers) {
  const n = state.numbers;
  const p = buildFinancialProfile(n);

  const savingsScore = scoreSavingsRate(p.savingsRate);
  const debtScore = scoreDebt(p.emiRatio);
  const liquidityScore = scoreLiquidity(p.emergencyCoverage);
  const protectionScore = scoreProtection(p);
  const portfolioScore = scorePortfolio(p);
  const retirementScore = scoreRetirement(p);

  const questionScores = questionAggregates(requireAnswers);

  const raw = {
    savings: blendRaw(savingsScore, SUB_MAX.savings, questionScores.savings),
    debt: blendRaw(debtScore, SUB_MAX.debt, questionScores.debt),
    liquidity: blendRaw(liquidityScore, SUB_MAX.liquidity, questionScores.liquidity),
    protection: blendRaw(protectionScore, SUB_MAX.protection, questionScores.protection),
    portfolio: blendRaw(portfolioScore, SUB_MAX.portfolio, questionScores.portfolio),
    retirement: blendRaw(retirementScore, SUB_MAX.retirement, questionScores.retirement)
  };

  const pillar = {
    goal: to100(raw.retirement, SUB_MAX.retirement),
    budget: to100(raw.savings, SUB_MAX.savings),
    loan: to100(raw.debt, SUB_MAX.debt),
    insurance: to100(raw.protection + raw.liquidity, SUB_MAX.protection + SUB_MAX.liquidity),
    investment: to100(raw.portfolio, SUB_MAX.portfolio),
    estate: questionScores.estate
  };

  const w = p.isPost58 ? W_GTE58 : W_LT58;
  const total =
    (pillar.goal * w.goal) / 100 +
    (pillar.budget * w.budget) / 100 +
    (pillar.loan * w.loan) / 100 +
    (pillar.insurance * w.insurance) / 100 +
    (pillar.investment * w.investment) / 100 +
    (pillar.estate * w.estate) / 100;

  return {
    total: Math.round(clamp(total, 0, 100)),
    raw,
    pillar,
    actions: buildActions({ p, raw })
  };
}

function questionAggregates(requireAnswers) {
  const bySub = { savings: [], debt: [], liquidity: [], protection: [], portfolio: [], retirement: [], estate: [] };
  const byPillar = { estate: [] };

  state.questions.forEach((q) => {
    const answer = state.answers[q.id];
    const score100 = answer === null ? (requireAnswers ? 0 : 50) : Math.round(answer * 100);
    if (bySub[q.sub]) bySub[q.sub].push(score100);
    if (q.pillar === "estate") byPillar.estate.push(score100);
  });

  return {
    savings: avg(bySub.savings, 50),
    debt: avg(bySub.debt, 50),
    liquidity: avg(bySub.liquidity, 50),
    protection: avg(bySub.protection, 50),
    portfolio: avg(bySub.portfolio, 50),
    retirement: avg(bySub.retirement, 50),
    estate: avg(byPillar.estate, 50)
  };
}

function renderResults() {
  const s = state.score;
  if (!s) return;

  el.mainScore.textContent = `${s.total}/100`;
  el.scoreBand.textContent = s.total >= 75 ? "Strong financial footing" : s.total >= 50 ? "Moderate financial footing" : "High-priority improvements needed";
  el.scoreBand.className = `band ${levelClass(s.total)}`;

  const circ = 2 * Math.PI * 52;
  el.ringValue.style.strokeDasharray = String(circ);
  el.ringValue.style.strokeDashoffset = String(circ - (s.total / 100) * circ);

  const pillars = [
    ["Goal Planning", Math.round(s.pillar.goal)],
    ["Budgeting & Taxation", Math.round(s.pillar.budget)],
    ["Loan Management", Math.round(s.pillar.loan)],
    ["Insurance Planning", Math.round(s.pillar.insurance)],
    ["Investment Planning", Math.round(s.pillar.investment)],
    ["Estate Planning", Math.round(s.pillar.estate)]
  ];

  el.pillarList.innerHTML = pillars.map(([name, val]) => `
    <div class="pillar-row">
      <div class="pillar-row-head"><span>${name}</span><strong class="${levelClass(val)}">${val}/100</strong></div>
      <div class="pillar-track"><div class="pillar-fill fill-${levelClass(val)}" style="width:${val}%"></div></div>
    </div>
  `).join("");

  el.subScoreList.innerHTML = [
    `Savings: ${Math.round(s.raw.savings)}/${SUB_MAX.savings}`,
    `Protection: ${Math.round(s.raw.protection)}/${SUB_MAX.protection}`,
    `Portfolio: ${Math.round(s.raw.portfolio)}/${SUB_MAX.portfolio}`,
    `Debt: ${Math.round(s.raw.debt)}/${SUB_MAX.debt}`,
    `Liquidity: ${Math.round(s.raw.liquidity)}/${SUB_MAX.liquidity}`,
    `Retirement: ${Math.round(s.raw.retirement)}/${SUB_MAX.retirement}`
  ].map((x) => `<li>${x}</li>`).join("");

  el.actionList.innerHTML = s.actions.map((x) => `<li>${x}</li>`).join("");
}

function buildActions(ctx) {
  const n = state.numbers;
  const p = ctx.p;
  const raw = ctx.raw;
  const ranked = [
    ["protection", raw.protection / SUB_MAX.protection],
    ["savings", raw.savings / SUB_MAX.savings],
    ["portfolio", raw.portfolio / SUB_MAX.portfolio],
    ["debt", raw.debt / SUB_MAX.debt],
    ["liquidity", raw.liquidity / SUB_MAX.liquidity],
    ["retirement", raw.retirement / SUB_MAX.retirement]
  ].sort((a, b) => a[1] - b[1]).map((x) => x[0]);

  const list = [];
  ranked.forEach((k) => {
    if (k === "protection") {
      if (p.isPost58) list.push("Improve protection readiness with stronger health cover and documented claim process for family.");
      else list.push(`Review term protection adequacy and close coverage gap with a dated action plan.`);
    }
    if (k === "savings") {
      const extra = Math.max(0, 0.3 * (n.income || 0) - ((n.income || 0) - (n.expenses || 0)));
      list.push(`Increase monthly surplus by ${formatINR(extra)} to align savings rate toward 30%+.`);
    }
    if (k === "portfolio") {
      const gap = Math.max(0, p.retirementTarget - (n.investments || 0));
      const yearly = p.yearsToRetirement > 0 ? gap / p.yearsToRetirement : 0;
      list.push(`Retirement target gap is ${formatINR(gap)}. Required yearly fresh investment: ${p.yearsToRetirement > 0 ? formatINR(yearly) : "--"}.`);
    }
    if (k === "debt") {
      if (p.emiRatio > 30) list.push(`Reduce EMI ratio from ${p.emiRatio.toFixed(1)}% toward 30% for healthier cash flow.`);
      else list.push("Maintain EMI load below 30% to protect long-term investment capacity.");
    }
    if (k === "liquidity") {
      const gap = Math.max(0, p.emergencyTarget - (n.emergencyFund || 0));
      list.push(`Emergency fund target is ${formatINR(p.emergencyTarget)}. Current funding gap is ${formatINR(gap)}.`);
    }
    if (k === "retirement") {
      list.push("Track retirement corpus, nominee hygiene, and document accessibility in one annual review workflow.");
    }
  });

  return [...new Set(list)].slice(0, 5);
}

function blendRaw(metricScore, maxRaw, question100) {
  const metric100 = to100(metricScore, maxRaw);
  const blended100 = metric100 * 0.7 + question100 * 0.3;
  return (blended100 / 100) * maxRaw;
}

function scoreSavingsRate(v) {
  if (v >= 30) return 20;
  if (v >= 20) return 16;
  if (v >= 10) return 10;
  if (v > 0) return 5;
  return 2;
}

function scoreDebt(v) {
  if (v <= 30) return 10;
  if (v <= 40) return 7;
  if (v <= 50) return 4;
  return 1;
}

function scoreLiquidity(coverage) {
  if (coverage >= 1) return 10;
  if (coverage >= 0.75) return 7;
  if (coverage >= 0.5) return 5;
  if (coverage > 0) return 3;
  return 1;
}

function scoreProtection(p) {
  let score = 0;
  score += p.healthVal >= 20 ? 10 : p.healthVal >= 15 ? 8 : p.healthVal >= 10 ? 6 : p.healthVal >= 5 ? 3 : 1;
  if (!p.isPost58) score += p.termVal >= 100 ? 10 : p.termVal >= 50 ? 7 : p.termVal >= 25 ? 4 : 1;
  return clamp(score, 0, 20);
}

function scorePortfolio(p) {
  const progress = p.fiProgress;
  if (progress >= 1) return 20;
  if (progress >= 0.75) return 16;
  if (progress >= 0.5) return 12;
  if (progress >= 0.25) return 8;
  return 4;
}

function scoreRetirement(p) {
  const progress = p.fiProgress;
  if (p.yearsToRetirement <= 0) {
    if (progress >= 1) return 28;
    if (progress >= 0.75) return 24;
    if (progress >= 0.5) return 20;
    return 12;
  }
  if (progress >= 1) return 30;
  if (progress >= 0.75) return 24;
  if (progress >= 0.5) return 19;
  if (progress >= 0.25) return 14;
  return 8;
}

function levelClass(v) {
  if (v >= 70) return "good";
  if (v >= 45) return "mid";
  return "bad";
}

function snap(label, value) { return `<div class="snap-item"><p>${label}</p><strong>${value}</strong></div>`; }
function toNum(v) { if (v === "" || v === null || v === undefined) return null; const n = Number(v); return Number.isNaN(n) ? null : n; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function to100(raw, max) { return max ? clamp((raw / max) * 100, 0, 100) : 0; }
function avg(arr, fallback = 50) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback; }
function mapCover(v) { if (v === "none" || !v) return 0; return Number(v) || 0; }
function formatINR(v) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0); }
function inrL(vLakh) { return `${Number(vLakh || 0)}L`; }

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove("hidden");
  setTimeout(() => el.toast.classList.add("hidden"), 2500);
}
