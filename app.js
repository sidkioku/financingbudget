// Finanzplan — Null-Aufwand Ausgaben- & Fixkosten-Tracker
// Pre-loaded with Monatliche_Ausgaben.numbers data

const STORAGE_KEY = 'finanzplan_state_v1';
const SYNC_CONFIG_KEY = 'finanzplan_sync_v1';

const DEFAULT_FIXED_BILLS = [
  { id: 'gen-v4y', name: 'Generali Vermögensaufbau4you', amount: 50.00, dayLabel: '03.' },
  { id: 'gen-basis', name: 'Generali Basisrente', amount: 133.11, dayLabel: '01.' },
  { id: 'icloud', name: 'iCloud', amount: 9.99, dayLabel: 'Kreditkartenabrechnung' },
  { id: 'mobil', name: 'Mobil', amount: 17.49, dayLabel: '16.' },
  { id: 'gez', name: 'Rundfunkgebühren', amount: 18.36, dayLabel: '15.01.,15.04.,15.07.,15.10.', quarterlyActual: 55.08 },
  { id: 'strom', name: 'Strom', amount: 66.00, dayLabel: '15.' },
  { id: 'gen-haft', name: 'Generali Privathaftpflicht', amount: 10.66, dayLabel: '02.' },
  { id: 'gen-zahn', name: 'Generali Zahnzusatzversicherung', amount: 35.50, dayLabel: '02.' },
  { id: 'junitiv', name: 'Junitiv', amount: 300.00, dayLabel: '20.' },
  { id: 'miete', name: 'Miete', amount: 420.00, dayLabel: '30.' },
  { id: 'internet', name: 'Internet', amount: 32.97, dayLabel: '22.' },
  { id: 'clever', name: 'Clever', amount: 30.00, dayLabel: '' },
  { id: 'ija', name: 'IJA', amount: 15.00, dayLabel: '07.' },
  { id: 'fit-1', name: 'Fitness 1', amount: 17.80, dayLabel: '01.' },
  { id: 'fit-2', name: 'Fitness 2', amount: 17.80, dayLabel: '15.' },
  { id: 'scalable', name: 'Scalable Broker', amount: 250.00, dayLabel: '01.' },
  { id: 'yt-prem', name: 'YouTube Premium', amount: 8.99, dayLabel: 'Kreditkartenabrechnung' },
  { id: 'd-ticket', name: 'Deutschlandticket', amount: 59.85, dayLabel: '02.' }
];

const DEFAULT_ANNUAL_BILLS = [
  { id: 'ann-rs', name: 'Rechtsschutzversicherung', amount: 249.97, dateLabel: '03.03.', month: 3 },
  { id: 'ann-abfall', name: 'Abfallgebühr', amount: 66.15, dateLabel: '25.02.', month: 2 },
  { id: 'ann-bc25', name: 'BahnCard 25', amount: 29.99, dateLabel: 'September', month: 9 },
  { id: 'ann-iptv', name: 'IPTV', amount: 30.00, dateLabel: 'Mai', month: 5 },
  { id: 'ann-rad', name: 'Fahrradvollkasko', amount: 100.00, dateLabel: 'Juni', month: 6 },
  { id: 'ann-gfd', name: 'GfD BW e.V.', amount: 120.00, dateLabel: 'Januar', month: 1 }
];

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatEUR(val) {
  return eurFormatter.format(Number.isFinite(val) ? val : 0);
}

/**
 * Parses German or English formatted currency strings (e.g. "12,50 €", "1.240,50", "14.50")
 */
function parseFlexibleAmount(raw) {
  if (typeof raw === 'number') return raw;
  if (!raw) return NaN;
  let cleaned = String(raw).replace(/[^0-9,.-]/g, '').trim();
  if (!cleaned) return NaN;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot) {
    // German format: 1.234,56 -> 1234.56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && lastComma !== -1) {
    // 1,234.56 -> 1234.56
    cleaned = cleaned.replace(/,/g, '');
  }
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : NaN;
}

function getCycleStartDay() {
  const d = Number(state?.settings?.salaryDay);
  return d >= 1 && d <= 28 ? d : 20;
}

function getCycleBounds(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const startDay = getCycleStartDay();
  const start = new Date(y, m - 1, startDay, 0, 0, 0, 0);
  const end = new Date(y, m, startDay - 1, 23, 59, 59, 999);
  const nextStart = new Date(y, m, startDay, 0, 0, 0, 0);
  return { start, end, nextStart, startDay };
}

function getTodayMonthKey() {
  const now = new Date();
  const startDay = 20;
  // If today is before the 20th, we are in the cycle that started on the 20th of the previous month
  const ref = now.getDate() < startDay
    ? new Date(now.getFullYear(), now.getMonth() - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey) {
  const { start, nextStart, startDay } = getCycleBounds(monthKey);
  const fmtShort = new Intl.DateTimeFormat('de-DE', { month: 'short' });
  const m1 = fmtShort.format(start);
  const m2 = fmtShort.format(nextStart);
  const y2 = nextStart.getFullYear();
  return `${startDay}. ${m1} – ${startDay}. ${m2} ${y2}`;
}

function shiftMonthKey(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getDaysRemainingInMonth(monthKey) {
  const { start, end } = getCycleBounds(monthKey);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));
  const todayKey = getTodayMonthKey();
  if (monthKey < todayKey) return 1;
  if (monthKey > todayKey) return totalDays;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((endMidnight - todayMidnight) / 86400000) + 1);
}

function createInitialState() {
  return {
    updatedAt: 0,
    deletedIds: [],
    settings: {
      baseSalary: 2500.00,
      salaryDay: 20,
      creditCardDay: 28
    },
    fixedBills: DEFAULT_FIXED_BILLS,
    annualBills: DEFAULT_ANNUAL_BILLS,
    months: {}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    return {
      ...createInitialState(),
      ...parsed,
      deletedIds: Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [],
      settings: { ...createInitialState().settings, ...(parsed.settings || {}) },
      fixedBills: Array.isArray(parsed.fixedBills) ? parsed.fixedBills : DEFAULT_FIXED_BILLS,
      annualBills: Array.isArray(parsed.annualBills) ? parsed.annualBills : DEFAULT_ANNUAL_BILLS,
      months: parsed.months || {}
    };
  } catch {
    return createInitialState();
  }
}

const DEFAULT_GIST_ID = 'e5b19c723fa2912e74dae29ce1aa2fe6';

function loadSyncConfig() {
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) return { gistId: DEFAULT_GIST_ID, gistToken: '' };
    const parsed = JSON.parse(raw);
    return {
      gistId: parsed.gistId || DEFAULT_GIST_ID,
      gistToken: parsed.gistToken || ''
    };
  } catch {
    return { gistId: DEFAULT_GIST_ID, gistToken: '' };
  }
}

let state = loadState();
let syncConfig = loadSyncConfig();
let activeMonthKey = getTodayMonthKey();

function ensureMonthRecord(monthKey) {
  if (!state.months[monthKey]) {
    state.months[monthKey] = {
      expenses: [],
      expectedIncomes: [],
      paidOverrides: {},
      salaryReceivedOverride: null
    };
  }
  return state.months[monthKey];
}

function saveState(triggerCloudSync = true) {
  state.updatedAt = Date.now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderApp();
  if (triggerCloudSync && syncConfig.gistId && syncConfig.gistToken) {
    pushToGist();
  }
}

/**
 * Extracts numeric day of month from Monatstag string (e.g. "03.", "15.01.,15.04.", "Kreditkartenabrechnung")
 */
function resolveBillingDay(dayLabel) {
  if (!dayLabel) return null;
  const lower = dayLabel.toLowerCase();
  if (lower.includes('kreditkarte')) {
    return state.settings.creditCardDay || 28;
  }
  const match = dayLabel.match(/(\d{1,2})\./);
  if (match) {
    const day = Number.parseInt(match[1], 10);
    if (day >= 1 && day <= 31) return day;
  }
  return null;
}

/**
 * Computes the exact calendar Date when a fixed bill is due within the 20. -> 19. cycle
 * Cycle `YYYY-MM` runs from 20.MM.YYYY through 19.(MM+1).YYYY.
 * Bills with billingDay >= 20 fall in month MM; bills with billingDay < 20 fall in month MM+1.
 */
function getBillDueDateInCycle(bill, monthKey) {
  const billingDay = resolveBillingDay(bill.dayLabel);
  if (!billingDay) return null;
  const [y, m] = monthKey.split('-').map(Number);
  const startDay = getCycleStartDay();
  if (billingDay >= startDay) {
    const maxDay = new Date(y, m, 0).getDate();
    return new Date(y, m - 1, Math.min(billingDay, maxDay), 0, 0, 0, 0);
  }
  const maxDayNext = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(billingDay, maxDayNext), 0, 0, 0, 0);
}

/**
 * Determines whether a fixed bill is considered Paid ("Bezahlt?") in the given 20.->20. cycle
 */
function isBillPaidInMonth(bill, monthKey) {
  const monthRec = ensureMonthRecord(monthKey);
  if (Object.prototype.hasOwnProperty.call(monthRec.paidOverrides, bill.id)) {
    return Boolean(monthRec.paidOverrides[bill.id]);
  }
  const todayKey = getTodayMonthKey();
  if (monthKey < todayKey) return true;
  if (monthKey > todayKey) return false;

  const dueDate = getBillDueDateInCycle(bill, monthKey);
  if (!dueDate) return false;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return todayMidnight >= dueDate;
}

/**
 * Determines if base salary is already received in the given 20.->20. cycle.
 * Since each cycle starts on payday (20.), salary is received from day 1 of the active cycle.
 */
function isSalaryReceivedInMonth(monthKey) {
  const monthRec = ensureMonthRecord(monthKey);
  if (monthRec.salaryReceivedOverride !== null && monthRec.salaryReceivedOverride !== undefined) {
    return Boolean(monthRec.salaryReceivedOverride);
  }
  const todayKey = getTodayMonthKey();
  if (monthKey <= todayKey) return true;
  return false;
}

function computeMonthMetrics(monthKey) {
  const monthRec = ensureMonthRecord(monthKey);
  const fixedTotal = state.fixedBills.reduce((acc, b) => acc + b.amount, 0);
  const annualTotal = state.annualBills.reduce((acc, b) => acc + b.amount, 0);
  const annualMonthlyReserve = Math.round((annualTotal / 12) * 100) / 100;
  const fixedBaselineWithReserve = fixedTotal + annualMonthlyReserve;

  let fixedPaidSoFar = 0;
  let fixedRestbetrag = 0;
  let paidCount = 0;

  for (const bill of state.fixedBills) {
    const paid = isBillPaidInMonth(bill, monthKey);
    if (paid) {
      fixedPaidSoFar += bill.amount;
      paidCount += 1;
    } else {
      fixedRestbetrag += bill.amount;
    }
  }

  const variableSpent = monthRec.expenses.reduce((acc, e) => acc + e.amount, 0);
  const baseSalary = Number(state.settings.baseSalary) || 0;
  const salaryReceived = isSalaryReceivedInMonth(monthKey);

  const extraIncomesTotal = monthRec.expectedIncomes.reduce((acc, inc) => acc + inc.amount, 0);
  const extraIncomesPending = monthRec.expectedIncomes
    .filter((inc) => !inc.received)
    .reduce((acc, inc) => acc + inc.amount, 0);

  const totalMonthlyIncome = baseSalary + extraIncomesTotal;
  const freeBudgetTotal = totalMonthlyIncome - fixedBaselineWithReserve;
  const safeToSpend = freeBudgetTotal - variableSpent;
  const totalUsedThisMonth = fixedPaidSoFar + variableSpent;

  const pendingIncomeTotal = (salaryReceived ? 0 : baseSalary) + extraIncomesPending;

  return {
    fixedTotal,
    annualTotal,
    annualMonthlyReserve,
    fixedBaselineWithReserve,
    fixedPaidSoFar,
    fixedRestbetrag,
    paidCount,
    variableSpent,
    baseSalary,
    salaryReceived,
    extraIncomesTotal,
    extraIncomesPending,
    pendingIncomeTotal,
    totalMonthlyIncome,
    freeBudgetTotal,
    safeToSpend,
    totalUsedThisMonth
  };
}

function showToast(message) {
  const banner = document.getElementById('toastBanner');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    banner.hidden = true;
  }, 3800);
}

function renderApp() {
  const monthRec = ensureMonthRecord(activeMonthKey);
  const m = computeMonthMetrics(activeMonthKey);

  // Month label
  document.getElementById('currentMonthLabel').textContent = formatMonthLabel(activeMonthKey);

  // Hero Safe-to-Spend
  const safeEl = document.getElementById('safeToSpendValue');
  safeEl.textContent = formatEUR(m.safeToSpend);
  safeEl.classList.toggle('positive', m.safeToSpend >= 0);
  safeEl.classList.toggle('negative', m.safeToSpend < 0);

  const daysLeft = getDaysRemainingInMonth(activeMonthKey);
  const perDay = m.safeToSpend > 0 ? m.safeToSpend / daysLeft : 0;
  document.getElementById('dailyAllowanceBadge').innerHTML =
    `<span>Noch <strong>${formatEUR(perDay)} / Tag</strong> (${daysLeft} Tage übrig)</span>`;

  // Progress bar (Variable spent vs Free disposable budget)
  const fillEl = document.getElementById('budgetProgressFill');
  const ratio = m.freeBudgetTotal > 0 ? Math.min(100, Math.max(0, (m.variableSpent / m.freeBudgetTotal) * 100)) : 100;
  fillEl.style.inlineSize = `${ratio.toFixed(1)}%`;
  fillEl.classList.toggle('warn', ratio >= 75 && ratio < 100);
  fillEl.classList.toggle('over', m.safeToSpend < 0);

  document.getElementById('heroIncomeTotal').textContent = formatEUR(m.totalMonthlyIncome);
  document.getElementById('heroFixedBaseline').textContent = formatEUR(m.fixedBaselineWithReserve);
  document.getElementById('heroVariableSpent').textContent = formatEUR(m.variableSpent);

  // 4-KPI Strip
  document.getElementById('kpiTotalUsed').textContent = formatEUR(m.totalUsedThisMonth);
  document.getElementById('kpiTotalUsedMeta').textContent =
    `${formatEUR(m.fixedPaidSoFar)} Fixkosten abgebucht + ${formatEUR(m.variableSpent)} variabel`;

  document.getElementById('kpiRestbetrag').textContent = formatEUR(m.fixedRestbetrag);
  document.getElementById('kpiRestbetragMeta').textContent =
    `${state.fixedBills.length - m.paidCount} von ${state.fixedBills.length} Fixkosten diesen Monat noch offen`;

  document.getElementById('kpiExpectedIncome').textContent = formatEUR(m.pendingIncomeTotal);
  const nextIncomeHint = !m.salaryReceived
    ? `Gehalt (${formatEUR(m.baseSalary)}) am ${state.settings.salaryDay}. erwartet`
    : (m.extraIncomesPending > 0 ? 'Offene Rückerstattungen erwartet' : 'Alle Einnahmen für diesen Monat erhalten ✓');
  document.getElementById('kpiExpectedIncomeMeta').textContent = nextIncomeHint;

  document.getElementById('kpiAnnualReserve').textContent = formatEUR(m.annualMonthlyReserve);
  document.getElementById('kpiAnnualReserveMeta').textContent =
    `${formatEUR(m.annualTotal)}/Jahr ÷ 12 (inkl. 18,36 €/Mo GEZ in Fixkosten)`;

  // Special Debit Notice Banner (Quarterly GEZ or Annual bills falling in active 20.->20. cycle)
  const { start: cycStart, end: cycEnd } = getCycleBounds(activeMonthKey);
  const startMonthNum = cycStart.getMonth() + 1;
  const endMonthNum = cycEnd.getMonth() + 1;
  const dueNotices = [];
  // GEZ is debited on the 15th of Jan/Apr/Jul/Oct, which falls in the second half (endMonthNum) of a 20.->19. cycle
  if ([1, 4, 7, 10].includes(endMonthNum)) {
    dueNotices.push(`Rundfunkbeitrag Quartalsabbuchung (55,08 € am 15.${String(endMonthNum).padStart(2, '0')}.)`);
  }
  for (const ann of state.annualBills) {
    if (ann.month === startMonthNum || ann.month === endMonthNum) {
      dueNotices.push(`${ann.name} (${formatEUR(ann.amount)} — ${ann.dateLabel})`);
    }
  }
  const bannerEl = document.getElementById('specialDebitBanner');
  if (dueNotices.length > 0) {
    bannerEl.hidden = false;
    document.getElementById('specialDebitText').innerHTML =
      `<strong>📌 Hinweis für Zyklus ${formatMonthLabel(activeMonthKey)}:</strong> Tatsächliche Abbuchung aus deiner Rücklage: ${dueNotices.join(' • ')}`;
  } else {
    bannerEl.hidden = true;
  }

  // Variable Expense List
  const expListEl = document.getElementById('variableExpenseList');
  document.getElementById('variableCountBadge').textContent = `${monthRec.expenses.length} Einträge`;
  expListEl.innerHTML = '';

  if (monthRec.expenses.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'brand-subtitle';
    emptyLi.style.padding = '0.75rem 0.25rem';
    emptyLi.textContent = 'Noch keine variablen Ausgaben in diesem Monat. Nutze Apple Pay, die Schnelleingabe oben oder am Urlaubsende den 5-Sekunden Konto-Abgleich.';
    expListEl.appendChild(emptyLi);
  } else {
    const sorted = [...monthRec.expenses].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    for (const item of sorted) {
      const li = document.createElement('li');
      li.className = 'item-row';
      const badgeHtml = item.source === 'Apple Pay'
        ? `<span class="badge badge-applepay">Apple Pay</span>`
        : (item.source === 'Abgleich' ? `<span class="badge">Urlaub / Abgleich</span>` : '');
      li.innerHTML = `
        <div>
          <div class="item-title">${escapeHtml(item.note || 'Ausgabe')} ${badgeHtml}</div>
          <div class="item-sub">${escapeHtml(item.dateLabel || '')}</div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.45rem;">
          <span class="item-amount">&minus;${formatEUR(item.amount)}</span>
          <button type="button" class="btn btn-ghost btn-danger" data-del-expense="${escapeHtml(item.id)}" aria-label="Eintrag löschen">&times;</button>
        </div>
      `;
      expListEl.appendChild(li);
    }
  }

  // Income & Expected Payments List
  const incListEl = document.getElementById('incomeList');
  incListEl.innerHTML = '';

  // Row 1: Fixed Monthly Base Salary
  const salLi = document.createElement('li');
  salLi.className = 'item-row';
  const salChecked = m.salaryReceived ? 'checked' : '';
  salLi.innerHTML = `
    <label class="checkbox-label" style="min-block-size: 38px;">
      <input type="checkbox" class="checkbox-custom" id="toggleSalaryReceivedChk" ${salChecked}>
      <span>
        <span class="item-title" style="display:block;">Monatliches Gehalt / Haupt-Einkommen</span>
        <span class="item-sub">Zahltag: ${state.settings.salaryDay}. des Monats &bull; ${m.salaryReceived ? 'Bereits eingegangen ✓' : 'Wird erwartet'}</span>
      </span>
    </label>
    <div style="display: flex; align-items: center; gap: 0.4rem;">
      <span class="item-amount" style="color: var(--color-success);">+${formatEUR(m.baseSalary)}</span>
      <button type="button" class="btn btn-ghost" id="editSalaryInlineBtn" aria-label="Gehalt ändern">✎</button>
    </div>
  `;
  incListEl.appendChild(salLi);

  // Additional expected incomes for this month
  for (const inc of monthRec.expectedIncomes) {
    const li = document.createElement('li');
    li.className = 'item-row';
    li.innerHTML = `
      <label class="checkbox-label" style="min-block-size: 38px;">
        <input type="checkbox" class="checkbox-custom" data-toggle-income="${escapeHtml(inc.id)}" ${inc.received ? 'checked' : ''}>
        <span>
          <span class="item-title" style="display:block;">${escapeHtml(inc.title)}</span>
          <span class="item-sub">Erwartet: ${escapeHtml(inc.dateLabel || 'diesen Monat')} &bull; ${inc.received ? 'Erhalten ✓' : 'Noch offen'}</span>
        </span>
      </label>
      <div style="display: flex; align-items: center; gap: 0.4rem;">
        <span class="item-amount" style="color: var(--color-success);">+${formatEUR(inc.amount)}</span>
        <button type="button" class="btn btn-ghost btn-danger" data-del-income="${escapeHtml(inc.id)}" aria-label="Einnahme löschen">&times;</button>
      </div>
    `;
    incListEl.appendChild(li);
  }

  // Fixed Bills Table (Monatliche_Ausgaben.numbers)
  const fixedTbody = document.getElementById('fixedBillsTbody');
  fixedTbody.innerHTML = '';
  for (const bill of state.fixedBills) {
    const paid = isBillPaidInMonth(bill, activeMonthKey);
    const rest = paid ? 0 : bill.amount;
    const hasManualOverride = Object.prototype.hasOwnProperty.call(monthRec.paidOverrides, bill.id);
    const tr = document.createElement('tr');
    if (paid) tr.classList.add('row-paid');
    const chkId = `chk-bill-${bill.id}`;
    tr.innerHTML = `
      <th scope="row">
        ${escapeHtml(bill.name)}
        ${bill.quarterlyActual ? `<span class="badge" title="Quartalsweise 55,08 €">${formatEUR(bill.quarterlyActual)} / Quartal</span>` : ''}
      </th>
      <td>
        <label class="checkbox-label" for="${chkId}">
          <input type="checkbox" class="checkbox-custom" id="${chkId}" data-toggle-bill="${escapeHtml(bill.id)}" ${paid ? 'checked' : ''}>
          <span>${paid ? 'Bezahlt' : 'Offen'}${hasManualOverride ? ' *' : ''}</span>
        </label>
      </td>
      <td class="num-col">${formatEUR(bill.amount)}</td>
      <td class="num-col" style="font-weight: ${rest > 0 ? '700' : '400'};">${formatEUR(rest)}</td>
      <td>${escapeHtml(bill.dayLabel || '—')}</td>
      <td class="num-col">
        <button type="button" class="btn btn-ghost btn-danger" data-del-fixed="${escapeHtml(bill.id)}" aria-label="${escapeHtml(bill.name)} löschen">&times;</button>
      </td>
    `;
    fixedTbody.appendChild(tr);
  }

  document.getElementById('fixedPaidCountCell').textContent = `${m.paidCount}/${state.fixedBills.length} bezahlt`;
  document.getElementById('fixedTotalAmountCell').textContent = formatEUR(m.fixedTotal);
  document.getElementById('fixedTotalRestCell').textContent = formatEUR(m.fixedRestbetrag);

  // Annual Bills Table
  const annualTbody = document.getElementById('annualBillsTbody');
  annualTbody.innerHTML = '';
  for (const ann of state.annualBills) {
    const monthlyPart = ann.amount / 12;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <th scope="row">${escapeHtml(ann.name)}</th>
      <td class="num-col">${formatEUR(ann.amount)}</td>
      <td class="num-col">${formatEUR(monthlyPart)} / Mo</td>
      <td>${escapeHtml(ann.dateLabel || '—')}</td>
      <td class="num-col">
        <button type="button" class="btn btn-ghost btn-danger" data-del-annual="${escapeHtml(ann.id)}" aria-label="${escapeHtml(ann.name)} löschen">&times;</button>
      </td>
    `;
    annualTbody.appendChild(tr);
  }

  document.getElementById('annualTotalCell').textContent = formatEUR(m.annualTotal);
  document.getElementById('annualMonthlyReserveCell').textContent = `${formatEUR(m.annualMonthlyReserve)} / Mo`;

  // Update Shortcut URL preview
  const baseUrl = window.location.origin + window.location.pathname;
  const tplEl = document.getElementById('shortcutUrlTemplate');
  if (tplEl) {
    tplEl.textContent = `${baseUrl}?add=[Betrag]&merchant=[Name/Händler]`;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addVariableExpense(amount, note, source = 'Manuell') {
  const num = parseFlexibleAmount(amount);
  if (!Number.isFinite(num) || num <= 0) {
    showToast('Bitte einen gültigen Betrag eingeben.');
    return false;
  }
  const monthRec = ensureMonthRecord(activeMonthKey);
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(now);

  monthRec.expenses.push({
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    amount: num,
    note: (note || '').trim() || (source === 'Apple Pay' ? 'Apple Pay Zahlung' : 'Ausgabe'),
    source,
    dateLabel,
    createdAt: Date.now()
  });

  saveState(true);
  return true;
}

/**
 * Checks URL query parameters for Apple Pay Shortcut auto-entries or Gist magic setup links
 */
async function handleIncomingUrlParams() {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));

  // 1. Check Magic Sync Setup Link (?gistId=...#gistToken=...)
  const incomingGistId = params.get('gistId') || hashParams.get('gistId');
  const incomingToken = hashParams.get('gistToken') || params.get('gistToken');
  if (incomingGistId && incomingToken) {
    syncConfig = { gistId: incomingGistId.trim(), gistToken: incomingToken.trim() };
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
    url.searchParams.delete('gistId');
    url.searchParams.delete('gistToken');
    url.hash = '';
    window.history.replaceState({}, document.title, url.pathname + url.search);
    showToast('☁️ Cloud-Sync verbunden! Synchronisiere…');
    await pullFromGist({ silent: false });
  }

  // 2. Check Apple Pay / Quick Add URL parameters (?add=12,50&merchant=Rewe)
  const rawAdd = params.get('add') || params.get('amount') || params.get('betrag');
  if (rawAdd) {
    const merchant = params.get('merchant') || params.get('note') || params.get('haendler') || 'Apple Pay';
    const amount = parseFlexibleAmount(rawAdd);
    url.searchParams.delete('add');
    url.searchParams.delete('amount');
    url.searchParams.delete('betrag');
    url.searchParams.delete('merchant');
    url.searchParams.delete('note');
    url.searchParams.delete('haendler');
    window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));

    if (Number.isFinite(amount) && amount > 0) {
      if (syncConfig.gistId && syncConfig.gistToken) {
        await pullFromGist({ silent: true });
      }
      activeMonthKey = getTodayMonthKey();
      addVariableExpense(amount, merchant, 'Apple Pay');
      showToast(`✓ Apple Pay gebucht: ${formatEUR(amount)} (${merchant})`);
    }
  }
}

/**
 * Merges local and remote states without losing expenses/incomes added on either device
 */
function mergeStates(localState, remoteState) {
  if (!remoteState) return localState;
  const localTs = Number(localState?.updatedAt) || 0;
  const remoteTs = Number(remoteState?.updatedAt) || 0;
  const newer = remoteTs >= localTs ? remoteState : localState;
  const older = remoteTs >= localTs ? localState : remoteState;

  const deletedSet = new Set([
    ...(Array.isArray(localState?.deletedIds) ? localState.deletedIds : []),
    ...(Array.isArray(remoteState?.deletedIds) ? remoteState.deletedIds : [])
  ]);

  const mergedMonths = {};
  const allMonthKeys = new Set([
    ...Object.keys(localState?.months || {}),
    ...Object.keys(remoteState?.months || {})
  ]);

  for (const mk of allMonthKeys) {
    const mOlder = (older?.months && older.months[mk]) || {};
    const mNewer = (newer?.months && newer.months[mk]) || {};

    // Union of expenses by id, excluding deletedIds
    const expMap = new Map();
    for (const e of [...(mOlder.expenses || []), ...(mNewer.expenses || [])]) {
      if (e && e.id && !deletedSet.has(e.id)) {
        expMap.set(e.id, e);
      }
    }

    // Union of expectedIncomes by id, excluding deletedIds
    const incMap = new Map();
    for (const inc of [...(mOlder.expectedIncomes || []), ...(mNewer.expectedIncomes || [])]) {
      if (inc && inc.id && !deletedSet.has(inc.id)) {
        incMap.set(inc.id, inc);
      }
    }

    mergedMonths[mk] = {
      expenses: Array.from(expMap.values()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      expectedIncomes: Array.from(incMap.values()),
      paidOverrides: { ...(mOlder.paidOverrides || {}), ...(mNewer.paidOverrides || {}) },
      salaryReceivedOverride:
        mNewer.salaryReceivedOverride !== null && mNewer.salaryReceivedOverride !== undefined
          ? mNewer.salaryReceivedOverride
          : (mOlder.salaryReceivedOverride ?? null)
    };
  }

  return {
    ...createInitialState(),
    ...newer,
    updatedAt: Math.max(localTs, remoteTs),
    deletedIds: Array.from(deletedSet).slice(-500),
    settings: {
      ...createInitialState().settings,
      ...(older?.settings || {}),
      ...(newer?.settings || {})
    },
    fixedBills: (Array.isArray(newer?.fixedBills) ? newer.fixedBills : DEFAULT_FIXED_BILLS).filter(
      (b) => !deletedSet.has(b.id)
    ),
    annualBills: (Array.isArray(newer?.annualBills) ? newer.annualBills : DEFAULT_ANNUAL_BILLS).filter(
      (b) => !deletedSet.has(b.id)
    ),
    months: mergedMonths
  };
}

/**
 * GitHub Gist Cloud Sync (100% Free & Automatic across iPhone & Mac)
 */
let isSyncing = false;
let pendingPush = false;

function updateSyncIndicator(status, text) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncStatusText');
  if (!dot || !label) return;
  dot.className = 'sync-dot';
  if (status) dot.classList.add(status);
  label.textContent = text;
}

async function pullFromGist({ silent = false } = {}) {
  if (!syncConfig.gistId || !syncConfig.gistToken) {
    updateSyncIndicator('', 'Lokal gespeichert');
    return;
  }
  if (isSyncing) return;
  isSyncing = true;
  if (!silent) updateSyncIndicator('syncing', 'Synchronisiere…');

  try {
    // Bypass browser HTTP cache with cache: 'no-store' and timestamp query param
    const url = `https://api.github.com/gists/${encodeURIComponent(syncConfig.gistId)}?t=${Date.now()}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${syncConfig.gistToken}`
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const file = data.files && data.files['finanzplan_state.json'];
    if (file && file.content) {
      const remoteState = JSON.parse(file.content);
      const beforeJson = JSON.stringify(state);
      const merged = mergeStates(state, remoteState);
      const afterJson = JSON.stringify(merged);

      if (beforeJson !== afterJson) {
        state = merged;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderApp();
      }

      // If merged state has changes that remote didn't have yet, push merged state back
      if (JSON.stringify(remoteState) !== afterJson && (state.updatedAt || 0) > 0) {
        isSyncing = false;
        await pushToGist();
        return;
      }
    }
    updateSyncIndicator('synced', 'iPhone & Mac live synchron');
  } catch {
    updateSyncIndicator('error', 'Sync-Fehler / Offline');
  } finally {
    isSyncing = false;
    if (pendingPush) {
      pendingPush = false;
      pushToGist();
    }
  }
}

async function pushToGist() {
  if (!syncConfig.gistId || !syncConfig.gistToken) return;
  if (isSyncing) {
    pendingPush = true;
    return;
  }
  isSyncing = true;
  updateSyncIndicator('syncing', 'Speichere live…');

  try {
    // First pull latest to merge safely before patching
    const getUrl = `https://api.github.com/gists/${encodeURIComponent(syncConfig.gistId)}?t=${Date.now()}`;
    const getRes = await fetch(getUrl, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${syncConfig.gistToken}`
      }
    });
    if (getRes.ok) {
      const getData = await getRes.json();
      const file = getData.files && getData.files['finanzplan_state.json'];
      if (file && file.content) {
        const remoteState = JSON.parse(file.content);
        state = mergeStates(state, remoteState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderApp();
      }
    }

    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(syncConfig.gistId)}`, {
      method: 'PATCH',
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${syncConfig.gistToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Finanzplan Budget & Ausgaben Sync (iPhone & Mac)',
        files: {
          'finanzplan_state.json': {
            content: JSON.stringify(state, null, 2)
          }
        }
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    updateSyncIndicator('synced', 'iPhone & Mac live synchron');
  } catch {
    updateSyncIndicator('error', 'Sync-Fehler / Offline');
  } finally {
    isSyncing = false;
    if (pendingPush) {
      pendingPush = false;
      pushToGist();
    }
  }
}

function startAutoSyncLoop() {
  // Poll every 4 seconds while visible so open Mac & iPhone screens update live without reload
  setInterval(() => {
    if (document.visibilityState === 'visible' && syncConfig.gistId && syncConfig.gistToken) {
      pullFromGist({ silent: true });
    }
  }, 4000);

  // Sync immediately when switching back to the app on iPhone or focusing the window on Mac
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncConfig.gistId && syncConfig.gistToken) {
      pullFromGist({ silent: true });
    }
  });
  window.addEventListener('focus', () => {
    if (syncConfig.gistId && syncConfig.gistToken) {
      pullFromGist({ silent: true });
    }
  });
  window.addEventListener('pageshow', () => {
    if (syncConfig.gistId && syncConfig.gistToken) {
      pullFromGist({ silent: true });
    }
  });
  window.addEventListener('online', () => {
    if (syncConfig.gistId && syncConfig.gistToken) {
      pullFromGist({ silent: false });
    }
  });
}

/**
 * Dialog Light-Dismiss Fallback & ReturnValue Reset per modern-web-guidance `dialog` & `light-dismiss-a-dialog`
 */
function setupModernDialogs() {
  const dialogs = document.querySelectorAll('dialog');
  for (const dialog of dialogs) {
    dialog.addEventListener('close', () => {
      dialog.returnValue = '';
    });
  }

  // Fallback for browsers without native <dialog closedby="any"> support (e.g. Safari)
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    for (const dialog of document.querySelectorAll('dialog[closedby="any"]')) {
      let pressedOutside = false;
      dialog.addEventListener('pointerdown', (e) => {
        pressedOutside = outside(e, dialog);
      });
      dialog.addEventListener('pointerup', (e) => {
        if (pressedOutside && outside(e, dialog)) {
          dialog.close();
        }
      });
    }
  }
}

function bindEvents() {
  // Month navigation
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    activeMonthKey = shiftMonthKey(activeMonthKey, -1);
    renderApp();
  });
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    activeMonthKey = shiftMonthKey(activeMonthKey, 1);
    renderApp();
  });

  // Quick-add expense form
  document.getElementById('quickExpenseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amountIn = document.getElementById('quickAmountInput');
    const noteIn = document.getElementById('quickNoteInput');
    if (addVariableExpense(amountIn.value, noteIn.value, 'Manuell')) {
      showToast(`✓ Ausgabe gebucht: ${formatEUR(parseFlexibleAmount(amountIn.value))}`);
      amountIn.value = '';
      noteIn.value = '';
    }
  });

  // Delegated clicks for lists and tables
  document.body.addEventListener('click', (e) => {
    const delExpBtn = e.target.closest('[data-del-expense]');
    if (delExpBtn) {
      const id = delExpBtn.getAttribute('data-del-expense');
      const monthRec = ensureMonthRecord(activeMonthKey);
      monthRec.expenses = monthRec.expenses.filter((x) => x.id !== id);
      if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
      state.deletedIds.push(id);
      saveState(true);
      return;
    }

    const delIncBtn = e.target.closest('[data-del-income]');
    if (delIncBtn) {
      const id = delIncBtn.getAttribute('data-del-income');
      const monthRec = ensureMonthRecord(activeMonthKey);
      monthRec.expectedIncomes = monthRec.expectedIncomes.filter((x) => x.id !== id);
      if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
      state.deletedIds.push(id);
      saveState(true);
      return;
    }

    const delFixedBtn = e.target.closest('[data-del-fixed]');
    if (delFixedBtn) {
      const id = delFixedBtn.getAttribute('data-del-fixed');
      state.fixedBills = state.fixedBills.filter((x) => x.id !== id);
      if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
      state.deletedIds.push(id);
      saveState(true);
      return;
    }

    const delAnnualBtn = e.target.closest('[data-del-annual]');
    if (delAnnualBtn) {
      const id = delAnnualBtn.getAttribute('data-del-annual');
      state.annualBills = state.annualBills.filter((x) => x.id !== id);
      if (!Array.isArray(state.deletedIds)) state.deletedIds = [];
      state.deletedIds.push(id);
      saveState(true);
      return;
    }

    if (e.target.closest('#editSalaryInlineBtn')) {
      openIncomeDialog();
    }
  });

  // Delegated checkbox changes
  document.body.addEventListener('change', (e) => {
    const billChk = e.target.closest('[data-toggle-bill]');
    if (billChk) {
      const id = billChk.getAttribute('data-toggle-bill');
      const monthRec = ensureMonthRecord(activeMonthKey);
      monthRec.paidOverrides[id] = billChk.checked;
      saveState(true);
      return;
    }

    const incChk = e.target.closest('[data-toggle-income]');
    if (incChk) {
      const id = incChk.getAttribute('data-toggle-income');
      const monthRec = ensureMonthRecord(activeMonthKey);
      const target = monthRec.expectedIncomes.find((x) => x.id === id);
      if (target) {
        target.received = incChk.checked;
        saveState(true);
      }
      return;
    }

    if (e.target.id === 'toggleSalaryReceivedChk') {
      const monthRec = ensureMonthRecord(activeMonthKey);
      monthRec.salaryReceivedOverride = e.target.checked;
      saveState(true);
    }
  });

  // Reset manual overrides for current month
  document.getElementById('resetOverridesBtn').addEventListener('click', () => {
    const monthRec = ensureMonthRecord(activeMonthKey);
    monthRec.paidOverrides = {};
    monthRec.salaryReceivedOverride = null;
    saveState(true);
    showToast('↻ Status auf automatische Monatstag-Erkennung zurückgesetzt');
  });

  // Modal 1: Reconcile / Vacation Lump Sum
  const reconcileDialog = document.getElementById('reconcileDialog');
  document.getElementById('openReconcileBtn').addEventListener('click', () => {
    const m = computeMonthMetrics(activeMonthKey);
    const expectedAccountCash = m.totalMonthlyIncome - m.pendingIncomeTotal - m.fixedPaidSoFar - m.variableSpent;
    document.getElementById('reconcilePreviewText').textContent =
      `Rechnerischer Soll-Stand (aus Einnahmen abzgl. bisher bezahlter Fixkosten & Ausgaben): ${formatEUR(expectedAccountCash)}`;
    document.getElementById('actualBankBalanceInput').value = '';
    document.getElementById('lumpSumAmountInput').value = '';
    reconcileDialog.showModal();
  });

  document.getElementById('applyBalanceReconcileBtn').addEventListener('click', () => {
    const actual = parseFlexibleAmount(document.getElementById('actualBankBalanceInput').value);
    if (!Number.isFinite(actual)) {
      showToast('Bitte deinen aktuellen Bank-Kontostand eingeben.');
      return;
    }
    const m = computeMonthMetrics(activeMonthKey);
    const expectedAccountCash = m.totalMonthlyIncome - m.pendingIncomeTotal - m.fixedPaidSoFar - m.variableSpent;
    const diff = Math.round((expectedAccountCash - actual) * 100) / 100;
    if (diff <= 0) {
      showToast('Dein Kontostand ist höher oder gleich dem Soll-Stand — keine Nachbuchung nötig!');
      reconcileDialog.close();
      return;
    }
    addVariableExpense(diff, 'Konto-Abgleich / Urlaubs-Differenz', 'Abgleich');
    reconcileDialog.close();
    showToast(`✓ Differenz von ${formatEUR(diff)} automatisch ausgeglichen!`);
  });

  document.getElementById('applyLumpSumBtn').addEventListener('click', () => {
    const amt = document.getElementById('lumpSumAmountInput').value;
    const note = document.getElementById('lumpSumNoteInput').value || 'Urlaub / Sammelbuchung';
    if (addVariableExpense(amt, note, 'Abgleich')) {
      reconcileDialog.close();
      showToast(`✓ Pauschalbetrag gebucht: ${formatEUR(parseFlexibleAmount(amt))}`);
    }
  });

  // Modal 2: Income & Expected Payments
  const incomeDialog = document.getElementById('incomeDialog');
  function openIncomeDialog() {
    document.getElementById('baseSalaryAmountInput').value = formatEUR(state.settings.baseSalary).replace(/\s*€$/, '');
    document.getElementById('baseSalaryDayInput').value = state.settings.salaryDay || 28;
    document.getElementById('creditCardDayInput').value = state.settings.creditCardDay || 28;
    incomeDialog.showModal();
  }
  document.getElementById('openIncomeDialogBtn').addEventListener('click', openIncomeDialog);

  document.getElementById('saveBaseSalaryBtn').addEventListener('click', () => {
    const sal = parseFlexibleAmount(document.getElementById('baseSalaryAmountInput').value);
    const sDay = Number.parseInt(document.getElementById('baseSalaryDayInput').value, 10);
    const ccDay = Number.parseInt(document.getElementById('creditCardDayInput').value, 10);
    if (Number.isFinite(sal) && sal >= 0) state.settings.baseSalary = sal;
    if (sDay >= 1 && sDay <= 31) state.settings.salaryDay = sDay;
    if (ccDay >= 1 && ccDay <= 31) state.settings.creditCardDay = ccDay;
    saveState(true);
    showToast('✓ Gehalt & Einstellungen gespeichert');
  });

  document.getElementById('addExpectedIncomeBtn').addEventListener('click', () => {
    const amt = parseFlexibleAmount(document.getElementById('expectedAmountInput').value);
    const title = document.getElementById('expectedTitleInput').value.trim();
    const rawDate = document.getElementById('expectedDateInput').value;
    if (!Number.isFinite(amt) || amt <= 0 || !title) {
      showToast('Bitte Betrag und Beschreibung eingeben.');
      return;
    }
    const dateLabel = rawDate
      ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(rawDate))
      : 'diesen Monat';
    const monthRec = ensureMonthRecord(activeMonthKey);
    monthRec.expectedIncomes.push({
      id: `inc-${Date.now()}`,
      title,
      amount: amt,
      dateLabel,
      received: false
    });
    document.getElementById('expectedAmountInput').value = '';
    document.getElementById('expectedTitleInput').value = '';
    saveState(true);
    showToast(`✓ Erwartete Einnahme (+${formatEUR(amt)}) hinzugefügt`);
  });

  // Modal 3: Add Fixed or Annual Bill
  const fixedBillDialog = document.getElementById('fixedBillDialog');
  document.getElementById('addFixedBillBtn').addEventListener('click', () => {
    document.getElementById('recurringTypeInput').value = 'monthly';
    document.getElementById('fixedBillDialogTitle').textContent = 'Monatliche Fixkosten hinzufügen';
    document.getElementById('recurringDayLabel').textContent = 'Monatstag (z.B. 01., 15. oder Kreditkartenabrechnung)';
    document.getElementById('recurringNameInput').value = '';
    document.getElementById('recurringAmountInput').value = '';
    document.getElementById('recurringDayInput').value = '';
    fixedBillDialog.showModal();
  });

  document.getElementById('addAnnualBillBtn').addEventListener('click', () => {
    document.getElementById('recurringTypeInput').value = 'annual';
    document.getElementById('fixedBillDialogTitle').textContent = 'Jährliche Zahlung hinzufügen';
    document.getElementById('recurringDayLabel').textContent = 'Datum / Monat (z.B. 03.03. oder September)';
    document.getElementById('recurringNameInput').value = '';
    document.getElementById('recurringAmountInput').value = '';
    document.getElementById('recurringDayInput').value = '';
    fixedBillDialog.showModal();
  });

  document.getElementById('cancelRecurringBtn').addEventListener('click', () => {
    fixedBillDialog.close();
  });

  document.getElementById('addRecurringForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const type = document.getElementById('recurringTypeInput').value;
    const name = document.getElementById('recurringNameInput').value.trim();
    const amount = parseFlexibleAmount(document.getElementById('recurringAmountInput').value);
    const dayLabel = document.getElementById('recurringDayInput').value.trim();
    if (!name || !Number.isFinite(amount) || amount <= 0) return;

    if (type === 'annual') {
      state.annualBills.push({
        id: `ann-${Date.now()}`,
        name,
        amount,
        dateLabel: dayLabel,
        month: null
      });
    } else {
      state.fixedBills.push({
        id: `fix-${Date.now()}`,
        name,
        amount,
        dayLabel
      });
    }
    saveState(true);
    fixedBillDialog.close();
    showToast(`✓ ${name} (${formatEUR(amount)}) gespeichert`);
  });

  // Modal 4: Apple Pay Shortcut & GitHub Gist Sync
  const shortcutDialog = document.getElementById('shortcutDialog');
  const openSyncModal = () => {
    document.getElementById('gistIdInput').value = syncConfig.gistId || '';
    document.getElementById('gistTokenInput').value = syncConfig.gistToken || '';
    shortcutDialog.showModal();
  };
  document.getElementById('openShortcutGuideBtn').addEventListener('click', openSyncModal);
  document.getElementById('openSyncBtn').addEventListener('click', openSyncModal);

  document.getElementById('copyShortcutUrlBtn').addEventListener('click', async () => {
    const baseUrl = `${window.location.origin}${window.location.pathname}?add=`;
    await navigator.clipboard.writeText(baseUrl);
    showToast('📋 Basis-Link für iPhone Kurzbefehl kopiert!');
  });

  document.getElementById('saveSyncConfigBtn').addEventListener('click', async () => {
    syncConfig = {
      gistId: document.getElementById('gistIdInput').value.trim(),
      gistToken: document.getElementById('gistTokenInput').value.trim()
    };
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig));
    await pullFromGist();
    showToast('☁️ Cloud-Sync gespeichert & abgeglichen');
  });

  document.getElementById('copySyncMagicLinkBtn').addEventListener('click', async () => {
    const gId = document.getElementById('gistIdInput').value.trim();
    const gTok = document.getElementById('gistTokenInput').value.trim();
    if (!gId || !gTok) {
      showToast('Bitte zuerst Gist-ID & Token eintragen.');
      return;
    }
    const magicUrl = `${window.location.origin}${window.location.pathname}?gistId=${encodeURIComponent(gId)}#gistToken=${encodeURIComponent(gTok)}`;
    await navigator.clipboard.writeText(magicUrl);
    showToast('📲 Einmal-Setup-Link für dein iPhone in die Zwischenablage kopiert!');
  });

  // JSON Export & Import
  document.getElementById('exportJsonBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `finanzplan-backup-${activeMonthKey}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('importJsonInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (imported && imported.fixedBills) {
          state = imported;
          saveState(true);
          showToast('✓ Backup erfolgreich wiederhergestellt!');
        }
      } catch {
        showToast('Fehler beim Lesen der Backup-Datei.');
      }
    };
    reader.readAsText(file);
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  setupModernDialogs();
  bindEvents();
  renderApp();
  await handleIncomingUrlParams();
  if (syncConfig.gistId && syncConfig.gistToken) {
    await pullFromGist({ silent: false });
  }
  startAutoSyncLoop();
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
