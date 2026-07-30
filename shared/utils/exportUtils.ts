// Generic client-side export helpers: CSV download + printable window
// (Print / Save as PDF). Used by the Finance Reports engine (§7).

// Quote a cell for CSV, escaping embedded quotes.
function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

// Trigger a browser download of a CSV built from a 2D array of rows.
export function downloadCSV(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
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
