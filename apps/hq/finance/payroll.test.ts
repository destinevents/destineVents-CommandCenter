// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be hoisted before subject import) ────────────────────────────

vi.mock('@shared/utils/formatUtils.ts', () => ({
  formatCurrency: (n: number) => `₱${n.toFixed(2)}`,
}));

vi.mock('@shared/utils/helpers.ts', () => ({
  escapeHtml: (s: string) => s,
  statusClass: () => '',
}));

vi.mock('@shared/utils/validators.ts', () => ({
  validateRequired: (val: string, label: string) => (val ? null : `${label} is required`),
  validateEmail: (val: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Enter a valid email address'),
}));

vi.mock('@config/settings.ts', () => ({
  APP_SETTINGS: {
    company: { name: 'DestineVents', address: 'Baguio City, PH' },
    banking: { tin: '' },
    finance: {},
  },
}));

vi.mock('./templates/payroll.ts', () => ({
  payrollTableHTML: vi.fn().mockReturnValue(''),
  payrollFormHTML:  vi.fn().mockReturnValue(''),
  PAYROLL_STATUSES: ['Draft', 'Pending', 'Paid'],
  EMPLOYEE_TYPES:   ['Employee', 'Freelancer', 'Intern', 'Contractor'],
}));

vi.mock('@hq/finance/financeService.ts', () => ({
  fetchPayrollRuns:  vi.fn().mockResolvedValue([]),
  createPayrollRun:  vi.fn().mockResolvedValue({ id: 99 }),
  updatePayrollRun:  vi.fn().mockResolvedValue(true),
  deletePayrollRun:  vi.fn().mockResolvedValue(true),
}));

vi.mock('@hq/core/state.ts', () => {
  let store: unknown[] = [];
  return {
    get _payroll() { return store; },
    setPayroll: (v: unknown[]) => { store = v; },
  };
});

vi.mock('@hq/core/ui.ts', () => ({
  toast:      vi.fn(),
  openModal:  vi.fn(),
  closeModal: vi.fn(),
}));

vi.mock('@shared/core/authService.ts', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ name: 'Test User', email: 'test@example.com' }),
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { _nextPayrollNumber, autoFillDeductions, recalcPayroll } from './payroll.ts';
import { payrollTableHTML } from './templates/payroll.ts';
import { toast, openModal } from '@hq/core/ui.ts';
import { setPayroll } from '@hq/core/state.ts';
import {
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun,
} from '@hq/finance/financeService.ts';
import type { PayrollRun } from '@shared/types.ts';

const mockToast        = toast as ReturnType<typeof vi.fn>;
const mockOpenModal    = openModal as ReturnType<typeof vi.fn>;
const mockTableHTML    = payrollTableHTML as ReturnType<typeof vi.fn>;
const mockSetPayroll   = setPayroll as (v: unknown[]) => void;

function makeRun(overrides: Partial<PayrollRun> = {}): PayrollRun {
  return {
    id: 1, payroll_number: null, period: 'Jul 2026',
    employee_name: 'Ana', employee_type: 'Employee',
    employees: 1, hours_worked: null,
    basic_pay: 20000, overtime: 0, allowances: 0,
    gross: 20000, deductions: 1800, net: 18200,
    status: 'Draft', released_by: null, notes: null,
    created_at: '2026-07-01',
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

// ── _nextPayrollNumber ────────────────────────────────────────────────────────

describe('_nextPayrollNumber', () => {
  const year = new Date().getFullYear();

  it('starts at 001 when no existing records', () => {
    expect(_nextPayrollNumber([])).toBe(`PAY-${year}-001`);
  });

  it('increments past the highest existing number', () => {
    const runs = [
      makeRun({ payroll_number: `PAY-${year}-003` }),
      makeRun({ payroll_number: `PAY-${year}-001` }),
    ];
    expect(_nextPayrollNumber(runs)).toBe(`PAY-${year}-004`);
  });

  it('ignores records from a different year', () => {
    const runs = [makeRun({ payroll_number: `PAY-${year - 1}-099` })];
    expect(_nextPayrollNumber(runs)).toBe(`PAY-${year}-001`);
  });

  it('ignores null payroll_number values', () => {
    const runs = [makeRun({ payroll_number: null }), makeRun({ payroll_number: `PAY-${year}-002` })];
    expect(_nextPayrollNumber(runs)).toBe(`PAY-${year}-003`);
  });

  it('pads the sequence number to 3 digits', () => {
    const runs = [makeRun({ payroll_number: `PAY-${year}-009` })];
    expect(_nextPayrollNumber(runs)).toBe(`PAY-${year}-010`);
  });
});

// ── recalcPayroll ─────────────────────────────────────────────────────────────

describe('recalcPayroll', () => {
  function setInput(id: string, value: string) {
    let el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) {
      el = document.createElement('input');
      el.id = id;
      document.body.appendChild(el);
    }
    el.value = value;
  }

  function setDisplay(id: string) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('span');
      el.id = id;
      document.body.appendChild(el);
    }
    return el;
  }

  beforeEach(() => { document.body.innerHTML = ''; });

  it('computes gross and net correctly', () => {
    setInput('pp-basic',      '20000');
    setInput('pp-overtime',   '2000');
    setInput('pp-allowances', '1000');
    setInput('pp-ded',        '1800');
    const grossEl = setDisplay('pp-gross-display');
    const dedEl   = setDisplay('pp-ded-display');
    const netEl   = setDisplay('pp-net-display');

    recalcPayroll();

    expect(grossEl.textContent).toBe('₱23000.00');
    expect(dedEl.textContent).toBe('− ₱1800.00');
    expect(netEl.textContent).toBe('₱21200.00');
  });

  it('treats missing inputs as 0', () => {
    const grossEl = setDisplay('pp-gross-display');
    const netEl   = setDisplay('pp-net-display');

    recalcPayroll();

    expect(grossEl.textContent).toBe('₱0.00');
    expect(netEl.textContent).toBe('₱0.00');
  });
});

// ── autoFillDeductions ────────────────────────────────────────────────────────

describe('autoFillDeductions', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  function makeInput(id: string, value: string) {
    const el = document.createElement('input');
    el.id = id; el.value = value;
    document.body.appendChild(el);
    return el;
  }

  it('fills the deductions input with SSS+PhilHealth+PagIBIG', () => {
    makeInput('pp-basic', '20000');
    const dedInput = makeInput('pp-ded', '0');
    makeInput('pp-overtime', '0');
    makeInput('pp-allowances', '0');
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-gross-display' }));
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-ded-display' }));
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-net-display' }));

    autoFillDeductions();

    const sss        = Math.round(20000 * 0.045); // 900
    const philhealth = Math.round(20000 * 0.025); // 500
    const pagibig    = Math.round(20000 * 0.02);  // 400
    expect(dedInput.value).toBe(String(sss + philhealth + pagibig));
  });

  it('shows a formatted toast with currency', () => {
    makeInput('pp-basic', '10000');
    makeInput('pp-ded', '0');
    makeInput('pp-overtime', '0');
    makeInput('pp-allowances', '0');
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-gross-display' }));
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-ded-display' }));
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-net-display' }));

    autoFillDeductions();

    expect(mockToast).toHaveBeenCalledWith(
      expect.stringMatching(/SSS ₱.*PhilHealth ₱.*Pag-IBIG ₱/),
      'success',
    );
  });

  it('treats missing basic pay as 0 and sets deductions to 0', () => {
    const dedInput = makeInput('pp-ded', '999');
    makeInput('pp-overtime', '0');
    makeInput('pp-allowances', '0');
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-gross-display' }));
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-ded-display' }));
    document.body.appendChild(Object.assign(document.createElement('span'), { id: 'pp-net-display' }));

    autoFillDeductions();

    expect(dedInput.value).toBe('0');
  });
});

// ── Service layer integration ─────────────────────────────────────────────────

describe('loadPayroll', () => {
  it('calls fetchPayrollRuns and updates state', async () => {
    const { loadPayroll } = await import('./payroll.ts');
    const mockRuns = [makeRun({ id: 1 })];
    (fetchPayrollRuns as ReturnType<typeof vi.fn>).mockResolvedValue(mockRuns);

    // Provide the container so renderPayroll doesn't throw
    document.body.innerHTML = '<div id="ftab-payroll"></div>';

    await loadPayroll();

    expect(fetchPayrollRuns).toHaveBeenCalledOnce();
  });
});

describe('markPayrollPaid', () => {
  it('calls updatePayrollRun with Paid status', async () => {
    const { markPayrollPaid } = await import('./payroll.ts');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.body.innerHTML = '<div id="ftab-payroll"></div>';

    await markPayrollPaid(42);

    expect(updatePayrollRun).toHaveBeenCalledWith(42, { status: 'Paid', released_by: 'Test User' });
  });

  it('does nothing when user cancels the confirm', async () => {
    const { markPayrollPaid } = await import('./payroll.ts');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await markPayrollPaid(42);

    expect(updatePayrollRun).not.toHaveBeenCalled();
  });
});

describe('handleDeletePayroll', () => {
  it('calls deletePayrollRun when confirmed', async () => {
    const { handleDeletePayroll } = await import('./payroll.ts');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.body.innerHTML = '<div id="ftab-payroll"></div>';

    await handleDeletePayroll(7);

    expect(deletePayrollRun).toHaveBeenCalledWith(7);
  });

  it('does nothing when user cancels', async () => {
    const { handleDeletePayroll } = await import('./payroll.ts');
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await handleDeletePayroll(7);

    expect(deletePayrollRun).not.toHaveBeenCalled();
  });

  it('shows error toast when delete fails', async () => {
    const { handleDeletePayroll } = await import('./payroll.ts');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (deletePayrollRun as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

    await handleDeletePayroll(7);

    expect(mockToast).toHaveBeenCalledWith('Could not delete payroll record', 'error');
  });
});

describe('createPayrollRun service call', () => {
  it('shows error toast when create fails', async () => {
    (createPayrollRun as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    document.body.innerHTML = `
      <input id="pp-employee" value="Maria"/>
      <input id="pp-period"   value="Jul 2026"/>
      <input id="pp-basic"    value="15000"/>
      <input id="pp-overtime" value="0"/>
      <input id="pp-allowances" value="0"/>
      <input id="pp-ded"      value="0"/>
      <input id="pp-hours"    value=""/>
      <input id="pp-type"     value="Employee"/>
      <input id="pp-status"   value="Draft"/>
      <input id="pp-notes"    value=""/>
    `;
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('Could not save'), 'error',
    );
  });
});

// ── savePayroll validation branches ──────────────────────────────────────────

describe('savePayroll validation', () => {
  function setForm(overrides: Record<string, string> = {}) {
    const defaults: Record<string, string> = {
      'pp-employee': 'Ana Santos', 'pp-period': 'Jul 2026',
      'pp-basic': '20000', 'pp-overtime': '0', 'pp-allowances': '0',
      'pp-ded': '0', 'pp-hours': '', 'pp-type': 'Employee',
      'pp-status': 'Draft', 'pp-notes': '',
    };
    document.body.innerHTML = Object.entries({ ...defaults, ...overrides })
      .map(([id, val]) => `<input id="${id}" value="${val}"/>`)
      .join('');
  }

  beforeEach(() => { document.body.innerHTML = ''; });

  it('rejects missing employee name', async () => {
    setForm({ 'pp-employee': '' });
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('Employee name'), 'error');
    expect(createPayrollRun).not.toHaveBeenCalled();
  });

  it('rejects missing period', async () => {
    setForm({ 'pp-period': '' });
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('Pay period'), 'error');
    expect(createPayrollRun).not.toHaveBeenCalled();
  });

  it('rejects basic pay of 0', async () => {
    setForm({ 'pp-basic': '0' });
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('Basic pay'), 'error');
    expect(createPayrollRun).not.toHaveBeenCalled();
  });

  it('rejects negative overtime', async () => {
    setForm({ 'pp-overtime': '-500' });
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('negative'), 'error');
    expect(createPayrollRun).not.toHaveBeenCalled();
  });

  it('rejects deductions exceeding gross pay', async () => {
    setForm({ 'pp-basic': '10000', 'pp-ded': '99999' });
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('exceed'), 'error');
    expect(createPayrollRun).not.toHaveBeenCalled();
  });

  it('preserves hours_worked = 0 (does not drop it as falsy)', async () => {
    setForm({ 'pp-hours': '0' });
    document.body.innerHTML += '<div id="ftab-payroll"></div>';
    const { savePayroll } = await import('./payroll.ts');
    await savePayroll();
    expect(createPayrollRun).toHaveBeenCalledWith(
      expect.objectContaining({ hours_worked: 0 }),
    );
  });
});

// ── savePayroll edit path ─────────────────────────────────────────────────────

describe('savePayroll edit path', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('calls updatePayrollRun for an existing record', async () => {
    mockSetPayroll([makeRun({ id: 5 })]);
    document.body.innerHTML = `
      <input id="pp-employee" value="Maria"/>
      <input id="pp-period"   value="Aug 2026"/>
      <input id="pp-basic"    value="18000"/>
      <input id="pp-overtime" value="0"/>
      <input id="pp-allowances" value="0"/>
      <input id="pp-ded"      value="0"/>
      <input id="pp-hours"    value=""/>
      <input id="pp-type"     value="Employee"/>
      <input id="pp-status"   value="Draft"/>
      <input id="pp-notes"    value=""/>
      <div id="ftab-payroll"></div>
    `;
    const { openEditPayroll, savePayroll } = await import('./payroll.ts');
    openEditPayroll(5);
    await savePayroll();
    expect(updatePayrollRun).toHaveBeenCalledWith(5, expect.objectContaining({ employee_name: 'Maria' }));
    expect(createPayrollRun).not.toHaveBeenCalled();
  });
});

// ── renderPayroll filter logic ────────────────────────────────────────────────

describe('renderPayroll filters', () => {
  // Reset shared state so clearPayrollFilters/setPayrollFilter don't render
  // stale records from earlier tests (module state persists across tests)
  beforeEach(async () => {
    mockSetPayroll([]);
    document.body.innerHTML = '<div id="ftab-payroll"></div>';
    // Render once to get the toolbar into the DOM so we can manipulate its inputs
    const { clearPayrollFilters } = await import('./payroll.ts');
    clearPayrollFilters();
    mockTableHTML.mockClear();
  });

  it('passes all runs to payrollTableHTML when no filters active', async () => {
    const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
    const { renderPayroll } = await import('./payroll.ts');
    renderPayroll(runs);
    expect(mockTableHTML).toHaveBeenCalledWith(runs);
  });

  it('filters by employee name search', async () => {
    const ana  = makeRun({ id: 1, employee_name: 'Ana Santos' });
    const beth = makeRun({ id: 2, employee_name: 'Beth Cruz' });
    const { renderPayroll, setPayrollFilter } = await import('./payroll.ts');

    (document.getElementById('pr-search') as HTMLInputElement).value = 'ana';
    setPayrollFilter();
    mockTableHTML.mockClear();

    renderPayroll([ana, beth]);
    expect(mockTableHTML).toHaveBeenCalledWith([ana]);
  });

  it('filters by status', async () => {
    const draft = makeRun({ id: 1, status: 'Draft' });
    const paid  = makeRun({ id: 2, status: 'Paid' });
    const { renderPayroll, setPayrollFilter } = await import('./payroll.ts');

    (document.getElementById('pr-filter-status') as HTMLSelectElement).value = 'Paid';
    setPayrollFilter();
    mockTableHTML.mockClear();

    renderPayroll([draft, paid]);
    expect(mockTableHTML).toHaveBeenCalledWith([paid]);
  });

  it('filters by date range — excludes records outside bounds', async () => {
    const jul1  = makeRun({ id: 1, created_at: '2026-07-01' });
    const jul15 = makeRun({ id: 2, created_at: '2026-07-15' });
    const aug1  = makeRun({ id: 3, created_at: '2026-08-01' });
    const { renderPayroll, setPayrollFilter } = await import('./payroll.ts');

    (document.getElementById('pr-date-from') as HTMLInputElement).value = '2026-07-01';
    (document.getElementById('pr-date-to')   as HTMLInputElement).value = '2026-07-31';
    setPayrollFilter();
    mockTableHTML.mockClear();

    renderPayroll([jul1, jul15, aug1]);
    expect(mockTableHTML).toHaveBeenCalledWith([jul1, jul15]);
  });

  it('shows no-results empty state when filters match nothing', async () => {
    const run = makeRun({ id: 1, employee_name: 'Ana' });
    const { renderPayroll, setPayrollFilter } = await import('./payroll.ts');

    (document.getElementById('pr-search') as HTMLInputElement).value = 'zzznomatch';
    setPayrollFilter();
    mockTableHTML.mockClear();

    renderPayroll([run]);
    expect(mockTableHTML).not.toHaveBeenCalled();
    expect(document.getElementById('ftab-payroll')!.innerHTML).toContain('No records match filters');
  });
});

// ── clearPayrollFilters ───────────────────────────────────────────────────────

describe('clearPayrollFilters', () => {
  beforeEach(async () => {
    mockSetPayroll([]);
    document.body.innerHTML = '<div id="ftab-payroll"></div>';
    const { clearPayrollFilters } = await import('./payroll.ts');
    clearPayrollFilters();
    mockTableHTML.mockClear();
  });

  it('resets all filters so all records pass through', async () => {
    const { renderPayroll, setPayrollFilter, clearPayrollFilters } = await import('./payroll.ts');

    (document.getElementById('pr-search') as HTMLInputElement).value = 'specific';
    setPayrollFilter();
    mockTableHTML.mockClear();

    clearPayrollFilters();
    mockTableHTML.mockClear();

    const runs = [makeRun({ id: 1 }), makeRun({ id: 2 })];
    renderPayroll(runs);
    expect(mockTableHTML).toHaveBeenCalledWith(runs);
  });
});

// ── loadPayroll error handling ────────────────────────────────────────────────

describe('loadPayroll error handling', () => {
  it('shows error toast when fetchPayrollRuns throws', async () => {
    (fetchPayrollRuns as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    document.body.innerHTML = '<div id="ftab-payroll"></div>';
    const { loadPayroll } = await import('./payroll.ts');
    await loadPayroll();
    expect(mockToast).toHaveBeenCalledWith('Could not load payroll records', 'error');
  });
});

// ── markPayrollPaid additional paths ─────────────────────────────────────────

describe('markPayrollPaid additional paths', () => {
  it('shows success toast when update succeeds', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.body.innerHTML = '<div id="ftab-payroll"></div>';
    const { markPayrollPaid } = await import('./payroll.ts');
    await markPayrollPaid(42);
    expect(mockToast).toHaveBeenCalledWith('Payroll marked as Paid', 'success');
  });

  it('shows error toast when update returns false', async () => {
    (updatePayrollRun as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { markPayrollPaid } = await import('./payroll.ts');
    await markPayrollPaid(42);
    expect(mockToast).toHaveBeenCalledWith('Could not mark as Paid', 'error');
  });

  it('shows error toast when update throws', async () => {
    (updatePayrollRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { markPayrollPaid } = await import('./payroll.ts');
    await markPayrollPaid(42);
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('unexpected'), 'error');
  });
});

// ── handleDeletePayroll additional paths ──────────────────────────────────────

describe('handleDeletePayroll additional paths', () => {
  it('shows success toast when deletion succeeds', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.body.innerHTML = '<div id="ftab-payroll"></div>';
    const { handleDeletePayroll } = await import('./payroll.ts');
    await handleDeletePayroll(7);
    expect(mockToast).toHaveBeenCalledWith('Payroll record deleted', 'success');
  });

  it('shows error toast when deletePayrollRun throws', async () => {
    (deletePayrollRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { handleDeletePayroll } = await import('./payroll.ts');
    await handleDeletePayroll(7);
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('unexpected'), 'error');
  });
});

// ── openAddPayroll / openEditPayroll ──────────────────────────────────────────

describe('openAddPayroll', () => {
  it('opens modal with New Payroll Record title', async () => {
    const { openAddPayroll } = await import('./payroll.ts');
    openAddPayroll();
    expect(mockOpenModal).toHaveBeenCalledWith(
      'New Payroll Record', expect.any(String), expect.any(Function),
    );
  });
});

describe('openEditPayroll', () => {
  it('opens modal with Edit Payroll Record title for a known id', async () => {
    mockSetPayroll([makeRun({ id: 3 })]);
    const { openEditPayroll } = await import('./payroll.ts');
    openEditPayroll(3);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'Edit Payroll Record', expect.any(String), expect.any(Function),
    );
  });

  it('does nothing when id is not in state', async () => {
    mockSetPayroll([]);
    const { openEditPayroll } = await import('./payroll.ts');
    openEditPayroll(999);
    expect(mockOpenModal).not.toHaveBeenCalled();
  });
});

// ── printPayslip ──────────────────────────────────────────────────────────────

describe('printPayslip', () => {
  it('does nothing when record is not found', async () => {
    mockSetPayroll([]);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { printPayslip } = await import('./payroll.ts');
    printPayslip(999);
    expect(openSpy).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows error toast when popup is blocked', async () => {
    mockSetPayroll([makeRun({ id: 1 })]);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { printPayslip } = await import('./payroll.ts');
    printPayslip(1);
    expect(mockToast).toHaveBeenCalledWith(
      'Pop-up blocked — please allow pop-ups and try again', 'error',
    );
  });

  it('writes payslip HTML to the popup and focuses it', async () => {
    mockSetPayroll([makeRun({ id: 1, payroll_number: 'PAY-2026-001' })]);
    const mockWrite = vi.fn();
    const mockClose = vi.fn();
    const mockFocus = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: { write: mockWrite, close: vi.fn() },
      focus: mockFocus,
      close: mockClose,
    } as unknown as Window);

    const { printPayslip } = await import('./payroll.ts');
    printPayslip(1);

    expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('PAYSLIP'));
    expect(mockFocus).toHaveBeenCalled();
  });
});

// ── sendPayrollEmail ──────────────────────────────────────────────────────────

describe('sendPayrollEmail', () => {
  function getSavedCallback(): () => void {
    const calls = mockOpenModal.mock.calls;
    return calls[calls.length - 1][2] as () => void;
  }

  function setupEmailForm(email: string) {
    document.body.innerHTML = `
      <input id="pe-to"      value="${email}"/>
      <input id="pe-subject" value="Payslip PAY-2026-001 — Jul 2026"/>
      <textarea id="pe-body">Body text</textarea>
    `;
  }

  beforeEach(() => {
    mockSetPayroll([makeRun({ id: 1, payroll_number: 'PAY-2026-001' })]);
  });

  it('opens modal titled Email Payslip', async () => {
    const { sendPayrollEmail } = await import('./payroll.ts');
    sendPayrollEmail(1);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'Email Payslip', expect.any(String), expect.any(Function), 'Open Email Client',
    );
  });

  it('does nothing when record id is not found', async () => {
    mockSetPayroll([]);
    const { sendPayrollEmail } = await import('./payroll.ts');
    sendPayrollEmail(999);
    expect(mockOpenModal).not.toHaveBeenCalled();
  });

  it('toasts error when email field is empty', async () => {
    const { sendPayrollEmail } = await import('./payroll.ts');
    sendPayrollEmail(1);
    setupEmailForm('');
    getSavedCallback()();
    expect(mockToast).toHaveBeenCalledWith('Recipient email is required', 'error');
  });

  it('toasts error for invalid email format', async () => {
    const { sendPayrollEmail } = await import('./payroll.ts');
    sendPayrollEmail(1);
    setupEmailForm('not-an-email');
    getSavedCallback()();
    expect(mockToast).toHaveBeenCalledWith('Enter a valid email address', 'error');
  });

  it('opens mailto link and toasts success for valid email', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { sendPayrollEmail } = await import('./payroll.ts');
    sendPayrollEmail(1);
    setupEmailForm('ana@destine.com');
    getSavedCallback()();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('mailto:ana@destine.com'));
    expect(mockToast).toHaveBeenCalledWith('Email client opened', 'success');
  });
});
