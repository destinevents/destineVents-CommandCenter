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
}));

vi.mock('@config/settings.js', () => ({
  APP_SETTINGS: {
    company: { name: 'DestineVents', address: 'Baguio City, PH' },
    banking: {},
    finance: {},
  },
}));

vi.mock('./templates/payroll.ts', () => ({
  payrollTableHTML: () => '',
  payrollFormHTML:  () => '',
  PAYROLL_STATUSES: ['Draft', 'Pending', 'Paid'],
  EMPLOYEE_TYPES:   ['Employee', 'Freelancer', 'Intern', 'Contractor'],
}));

vi.mock('@shared/services/finance/financeService.ts', () => ({
  fetchPayrollRuns:  vi.fn().mockResolvedValue([]),
  createPayrollRun:  vi.fn().mockResolvedValue({ id: 99 }),
  updatePayrollRun:  vi.fn().mockResolvedValue(true),
  deletePayrollRun:  vi.fn().mockResolvedValue(true),
}));

vi.mock('@hq/state.ts', () => {
  let store: unknown[] = [];
  return {
    get _payroll() { return store; },
    setPayroll: (v: unknown[]) => { store = v; },
  };
});

vi.mock('@hq/ui.ts', () => ({
  toast:      vi.fn(),
  openModal:  vi.fn(),
  closeModal: vi.fn(),
}));

// ── Subject ───────────────────────────────────────────────────────────────────

import { _nextPayrollNumber, autoFillDeductions, recalcPayroll } from './payroll.ts';
import { toast } from '@hq/ui.ts';
import {
  fetchPayrollRuns, createPayrollRun, updatePayrollRun, deletePayrollRun,
} from '@shared/services/finance/financeService.ts';
import type { PayrollRun } from '@shared/types.ts';

const mockToast = toast as ReturnType<typeof vi.fn>;

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

    expect(updatePayrollRun).toHaveBeenCalledWith(42, { status: 'Paid' });
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
    // We test by calling savePayroll with a fully-wired DOM
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
