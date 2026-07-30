// Generic client-side export helpers: CSV + Excel download + printable window
// (Print / Save as PDF). Used by the Finance Reports engine (§7).
import { escapeHtml } from '@shared/utils/helpers.ts';

// Guard against CSV/Excel formula injection: a text value that begins with a
// formula trigger (= + - @) or a control character is prefixed with an
// apostrophe so spreadsheets treat it as text, not a live formula. Only applied
// to strings — numeric cells stay numeric.
export function neutralizeCell(value: string): string {
  return /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

// Quote a cell for CSV, escaping embedded quotes and neutralizing formulas.
function csvCell(value: string | number): string {
  const raw = typeof value === 'string' ? neutralizeCell(value) : String(value ?? '');
  return `"${raw.replace(/"/g, '""')}"`;
}

// Pure: serialize a 2D row model to CSV text.
export function rowsToCSV(rows: (string | number)[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

// Trigger a browser download of a CSV built from a 2D array of rows.
export function downloadCSV(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob([rowsToCSV(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Pure: serialize a 2D row model to Excel-namespaced "Office HTML". String
// cells are HTML-escaped and formula-neutralized; numeric cells stay numeric.
// Rows: length 0 = blank spacer; length 1 = a full-width section heading;
// length >=2 = a data row (numbers are right-aligned, formatted cells).
export function rowsToExcelHTML(sheetName: string, rows: (string | number)[][]): string {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const dataCell = (v: string | number) => {
    // Numeric cells keep Excel's number format (matches the BIR export exactly).
    if (typeof v === 'number') {
      return `<td style="mso-number-format:"#,##0.00";text-align:right;">${v}</td>`;
    }
    return `<td>${escapeHtml(neutralizeCell(v ?? ''))}</td>`;
  };
  const body = rows.map(r => {
    if (r.length === 0) return `<tr><td colspan="${maxCols}"></td></tr>`;
    if (r.length === 1) {
      return `<tr><td colspan="${maxCols}" style="font-weight:700;background:#252f27;color:#fff;padding:4px 8px">${escapeHtml(neutralizeCell(String(r[0] ?? '')))}</td></tr>`;
    }
    const cells = r.map(dataCell).join('') + '<td></td>'.repeat(maxCols - r.length);
    return `<tr>${cells}</tr>`;
  }).join('');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:x="urn:schemas-microsoft-com:office:excel"
      xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8"/>
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>${escapeHtml(sheetName)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body>
<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;font-family:Arial;font-size:12px">${body}</table>
</body></html>`;
}

// Download a native Excel file from the same 2D row model used for CSV.
export function downloadExcel(filename: string, sheetName: string, rows: (string | number)[][]): void {
  const blob = new Blob([rowsToExcelHTML(sheetName, rows)], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Open a print-ready window with the given title + body HTML. The user can
// print or "Save as PDF" from the browser dialog — this is the PDF export path.
export function printHTML(title: string, bodyHTML: string): void {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    throw new Error('Popup blocked — allow pop-ups to print or export PDF.');
  }
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, system-ui, sans-serif; color: #1a1a1a; margin: 32px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .meta { color: #666; font-size: 12px; margin-bottom: 20px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
      th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #e5e5e5; }
      td.amt, th.amt { text-align: right; font-variant-numeric: tabular-nums; }
      tfoot td { font-weight: 700; border-top: 2px solid #333; }
      h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #444; margin: 22px 0 4px; }
      .print-btn { margin-top: 24px; padding: 8px 20px; background: #252f27; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
      @media print { .print-btn { display: none; } body { margin: 0; } }
    </style></head>
    <body>${bodyHTML}
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
    </body></html>`);
  win.document.close();
}
