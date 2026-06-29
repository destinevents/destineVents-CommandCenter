async function loadFinance() {
  const [inv, bil, pay] = await Promise.all([
    fetchInvoices(),
    fetchBills(),
    fetchPayrollRuns(),
  ]);
  _invoices = inv || [];
  _bills    = bil || [];
  _payroll  = pay || [];
  renderFinanceOverview(_invoices, _bills);
  renderAR(_invoices);
  renderAP(_bills);
  renderPayroll(_payroll);
  renderBIR();
}

function showFinanceTab(name, el) {
  document.querySelectorAll('.ftab').forEach(t =>t.classList.remove('active'));
  document.getElementById('ftab-' + name).classList.add('active');
  document.querySelectorAll('#finance-subtabs .sub-tab').forEach(t =>t.classList.remove('active'));
  el.classList.add('active');
}

function renderFinanceOverview(invoices, bills) {
  const summary = calcFinanceSummary(invoices, bills);
  const net     = summary.arOutstanding - summary.apOutstanding;

  document.getElementById('finance-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">AR Outstanding</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.arOutstanding)}</div><div class="stat-change">${summary.overdueCount} overdue invoice${summary.overdueCount!==1?'s':''}</div></div>
    <div class="stat-card"><div class="stat-label">AP Outstanding</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.apOutstanding)}</div><div class="stat-change">${summary.pendingBillsCount} pending bills</div></div>
    <div class="stat-card"><div class="stat-label">Revenue Collected</div><div class="stat-value" style="font-size:22px">${formatCurrency(summary.revenueCollected)}</div><div class="stat-change up">This quarter</div></div>
    <div class="stat-card"><div class="stat-label">Net Position</div><div class="stat-value" style="font-size:22px${net<0?';color:var(--red)':''}">${formatCurrency(Math.abs(net))}</div><div class="stat-change ${net>=0?'up':''}">${net>=0?'Receivable surplus':'Payable deficit'}</div></div>`;

  document.getElementById('finance-recent-ar').innerHTML = invoices.slice(0,4).map(i=>`
    <div class="activity-item">
      <div class="activity-dot ${i.status==='Paid'?'green':i.status==='Overdue'?'red':'blue'}"></div>
      <div style="flex:1"><div class="activity-text">${escapeHtml(i.client)} — ${escapeHtml(i.or_num)}</div><div class="activity-time">${escapeHtml(i.date)}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600">${formatCurrency(i.amount)}</span>
        <span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span>
      </div>
    </div>`).join('');

  document.getElementById('finance-recent-ap').innerHTML = bills.slice(0,4).map(b=>`
    <div class="activity-item">
      <div class="activity-dot ${b.status==='Paid'?'green':'blue'}"></div>
      <div style="flex:1"><div class="activity-text">${escapeHtml(b.payee)}</div><div class="activity-time">${escapeHtml(b.date)} · EWT ${escapeHtml(b.ewt)}</div></div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-family:'Cormorant Garamond',serif;font-size:14px;font-weight:600">${formatCurrency(b.amount)}</span>
        <span class="badge badge-${statusClass(b.status)}">${escapeHtml(b.status)}</span>
      </div>
    </div>`).join('');
}

function renderAR(invoices) {
  const total = invoices.reduce((s,i)=>s+i.amount,0);
  const out   = invoices.filter(i=>i.status!=='Paid').reduce((s,i)=>s+i.amount,0);
  document.getElementById('ar-summary').textContent = `${invoices.length} invoices · ${formatCurrency(total)} total · ${formatCurrency(out)} outstanding`;
  document.getElementById('ar-tbody').innerHTML = invoices.length
    ? invoices.map(i=>`
        <tr>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.or_num)}</td>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(i.client)}</td>
          <td class="amount-cell">${formatCurrency(i.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(i.due)}</td>
          <td><span class="badge badge-${statusClass(i.status)}">${escapeHtml(i.status)}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No invoices yet</div></td></tr>`;
}

function renderAP(bills) {
  const total = bills.reduce((s,b)=>s+b.amount,0);
  const out   = bills.filter(b=>b.status!=='Paid').reduce((s,b)=>s+b.amount,0);
  document.getElementById('ap-summary').textContent = `${bills.length} bills · ${formatCurrency(total)} total · ${formatCurrency(out)} outstanding`;
  document.getElementById('ap-tbody').innerHTML = bills.length
    ? bills.map(b=>`
        <tr>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(b.payee)}</td>
          <td class="amount-cell">${formatCurrency(b.amount)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.date)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.category)}</td>
          <td style="font-size:11px;color:var(--ink-3)">${escapeHtml(b.ewt)}</td>
          <td><span class="badge badge-${statusClass(b.status)}">${escapeHtml(b.status)}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No bills yet</div></td></tr>`;
}

function renderPayroll(runs) {
  document.getElementById('payroll-tbody').innerHTML = runs.length
    ? runs.map(r=>`
        <tr>
          <td style="font-weight:500;color:var(--ink)">${escapeHtml(r.period)}</td>
          <td style="font-size:11.5px;color:var(--ink-3)">${r.employees}</td>
          <td class="amount-cell">${formatCurrency(r.gross)}</td>
          <td style="font-size:12px;color:var(--ink-3)">${formatCurrency(r.deductions)}</td>
          <td class="amount-cell">${formatCurrency(r.net)}</td>
          <td><span class="badge badge-${statusClass(r.status)}">${escapeHtml(r.status)}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="6"><div class="empty-state">No payroll runs yet</div></td></tr>`;
}

function renderBIR() {
  document.getElementById('bir-cards').innerHTML = `
    <div class="bir-card">
      <div class="bir-form-name">2551Q</div>
      <div class="bir-form-desc">Quarterly Percentage Tax Return<br>For non-VAT registered businesses</div>
      <div class="flex-between">
        <div class="bir-deadline">Q2 2026 deadline: <strong>Jul 25, 2026</strong></div>
        <span class="badge badge-unpaid">Due</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Q1 2026 — <span style="color:var(--green);font-weight:600">Filed ✓</span></div>
    </div>
    <div class="bir-card">
      <div class="bir-form-name">1701Q</div>
      <div class="bir-form-desc">Quarterly Income Tax Return<br>For self-employed / OPC founders</div>
      <div class="flex-between">
        <div class="bir-deadline">Q2 2026 deadline: <strong>Aug 15, 2026</strong></div>
        <span class="badge badge-unpaid">Due</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Q1 2026 — <span style="color:var(--green);font-weight:600">Filed ✓</span></div>
    </div>
    <div class="bir-card">
      <div class="bir-form-name">1604C</div>
      <div class="bir-form-desc">Annual Information Return — Income Taxes Withheld on Compensation</div>
      <div class="flex-between">
        <div class="bir-deadline">Next deadline: <strong>Jan 31, 2027</strong></div>
        <span class="badge badge-paid">Filed</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">FY 2025 — <span style="color:var(--green);font-weight:600">Filed ✓</span></div>
    </div>
    <div class="bir-card">
      <div class="bir-form-name">2307</div>
      <div class="bir-form-desc">Certificate of Creditable Tax Withheld at Source — issue to clients per transaction</div>
      <div class="flex-between">
        <div class="bir-deadline">Issue per transaction</div>
        <span class="badge badge-lead">Ongoing</span>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Last issued: <span style="color:var(--ink);font-weight:600">Jun 2, 2026</span></div>
    </div>`;
}

function openAddInvoice() {
  openModal('New Invoice (AR)', `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">OR Number</div><input class="form-input" id="fi-or" placeholder="OR-2026-005"/></div>
      <div class="form-group"><div class="form-label">Client</div><input class="form-input" id="fi-client" placeholder="Client name"/></div>
      <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fi-amount" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fi-status"><option>Unpaid</option><option>Paid</option><option>Overdue</option></select>
      </div>
      <div class="form-group"><div class="form-label">Date Issued</div><input class="form-input" id="fi-date" type="date"/></div>
      <div class="form-group"><div class="form-label">Due Date</div><input class="form-input" id="fi-due" type="date"/></div>
    </div>`, saveInvoice);
}

async function saveInvoice() {
  const or_num = document.getElementById('fi-or').value.trim();
  const err = validateRequired(or_num, 'OR number');
  if (err) { toast(err, 'error'); return; }
  const result = await createInvoice({
    id: Date.now(), or_num,
    client: document.getElementById('fi-client').value,
    amount: +document.getElementById('fi-amount').value||0,
    status: document.getElementById('fi-status').value,
    date:   fmtDate(document.getElementById('fi-date').value),
    due:    fmtDate(document.getElementById('fi-due').value),
  });
  if (!result) return;
  toast('Invoice added','success');
  closeModal(); loadFinance();
}

function openAddBill() {
  openModal('New Bill (AP)', `
    <div class="form-grid">
      <div class="form-group full"><div class="form-label">Payee</div><input class="form-input" id="fb-payee" placeholder="Supplier / vendor name"/></div>
      <div class="form-group"><div class="form-label">Amount (₱)</div><input class="form-input" id="fb-amount" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Category</div>
        <select class="form-input" id="fb-category"><option>Venue</option><option>Catering</option><option>Equipment</option><option>Services</option><option>Transport</option><option>Supplies</option><option>Other</option></select>
      </div>
      <div class="form-group"><div class="form-label">EWT Rate</div>
        <select class="form-input" id="fb-ewt"><option>0%</option><option>2%</option><option>5%</option><option>10%</option><option>15%</option></select>
      </div>
      <div class="form-group"><div class="form-label">Date</div><input class="form-input" id="fb-date" type="date"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="fb-status"><option>Unpaid</option><option>Paid</option></select>
      </div>
    </div>`, saveBill);
}

async function saveBill() {
  const payee = document.getElementById('fb-payee').value.trim();
  const err = validateRequired(payee, 'Payee');
  if (err) { toast(err, 'error'); return; }
  const result = await createBill({
    id: Date.now(), payee,
    amount:   +document.getElementById('fb-amount').value||0,
    category: document.getElementById('fb-category').value,
    ewt:      document.getElementById('fb-ewt').value,
    date:     fmtDate(document.getElementById('fb-date').value),
    status:   document.getElementById('fb-status').value,
  });
  if (!result) return;
  toast('Bill added','success');
  closeModal(); loadFinance();
}

function openAddPayroll() {
  openModal('New Payroll Run', `
    <div class="form-grid">
      <div class="form-group"><div class="form-label">Period</div><input class="form-input" id="pp-period" placeholder="e.g. Jun 2026"/></div>
      <div class="form-group"><div class="form-label">No. of Employees</div><input class="form-input" id="pp-emp" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Gross Pay (₱)</div><input class="form-input" id="pp-gross" type="number" placeholder="0" oninput="estimateDeductions()"/></div>
      <div class="form-group"><div class="form-label">Est. Deductions (₱)</div><input class="form-input" id="pp-ded" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Net Pay (₱)</div><input class="form-input" id="pp-net" type="number" placeholder="0"/></div>
      <div class="form-group"><div class="form-label">Status</div>
        <select class="form-input" id="pp-status"><option>Pending</option><option>Released</option></select>
      </div>
    </div>
    <div style="font-size:10px;color:var(--ink-3);margin-top:-8px">SSS ≈ 4.5% · PhilHealth ≈ 2.5% · Pag-IBIG ≈ 2% of gross</div>`, savePayroll);
}

function estimateDeductions() {
  const gross = +document.getElementById('pp-gross').value||0;
  const ded = Math.round(gross * 0.15);
  document.getElementById('pp-ded').value = ded;
  document.getElementById('pp-net').value = gross - ded;
}

async function savePayroll() {
  const period = document.getElementById('pp-period').value.trim();
  const err = validateRequired(period, 'Period');
  if (err) { toast(err, 'error'); return; }
  const gross = +document.getElementById('pp-gross').value||0;
  const ded   = +document.getElementById('pp-ded').value||0;
  const result = await createPayrollRun({
    id: Date.now(), period,
    employees: +document.getElementById('pp-emp').value||0,
    gross, deductions: ded, net: gross - ded,
    status: document.getElementById('pp-status').value,
  });
  if (!result) return;
  toast('Payroll run saved','success');
  closeModal(); loadFinance();
}
