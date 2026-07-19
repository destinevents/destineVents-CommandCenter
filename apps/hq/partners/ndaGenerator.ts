import { APP_SETTINGS } from '@config/settings.ts';
import { formatDateForNDA, todayISO } from '@shared/utils/dateUtils.ts';
import { escapeHtml } from '@shared/utils/helpers.ts';

export function generateNDAContent(client: string, address: string, contact: string, email: string, purpose: string, date: string): string {
  const fmtDate = date ? formatDateForNDA(date) : formatDateForNDA(todayISO());
  const safe = (v: string | undefined | null): string => escapeHtml(v || '');
  return `
    <h3>NON-DISCLOSURE AGREEMENT</h3>
    <p>This NDA is entered into on <strong>${fmtDate}</strong> between <strong>${APP_SETTINGS.company.name}</strong> ("Disclosing Party") and <strong>${safe(client)}</strong> ("Receiving Party").</p>
    <p><strong>1. Purpose.</strong> The parties wish to explore a business relationship regarding <strong>${safe(purpose)}</strong>.</p>
    <p><strong>2. Confidential Information.</strong> All non-public information shared shall be treated as confidential for 2 years.</p>
    <p><strong>3. Obligations.</strong> The Receiving Party shall not disclose, copy, or use Confidential Information except as needed for the Purpose.</p>
    <p><strong>4. Term.</strong> This agreement survives for 2 years from the date above.</p>
    <p><strong>5. Governing Law.</strong> This agreement is governed by the laws of the Republic of the Philippines.</p>
    <p><strong>6. Signatures.</strong> By agreeing, both parties acknowledge they have read and understood this NDA.</p>
    <p><strong>${APP_SETTINGS.company.name}</strong><br>By: ${APP_SETTINGS.company.founder}</p>
    <p><strong>${safe(client)}</strong><br>${safe(contact) ? safe(contact) + '<br>' : ''}${safe(address) || ''}</p>
  `;
}

export function buildNDAWindowContent(client: string, address: string, contact: string, email: string, purpose: string, date: string): string {
  const fmt = date ? formatDateForNDA(date) : formatDateForNDA(todayISO());
  const safe = (v: string | undefined | null): string => escapeHtml(v || '');
  return `
<html><head><meta charset="utf-8"><title>NDA — ${safe(client)}</title>
<style>
  body{font-family:'Georgia',serif;color:#111;padding:48px 56px;line-height:1.9;font-size:13px;max-width:700px;margin:auto}
  h2{text-align:center;text-transform:uppercase;font-size:15px;letter-spacing:0.12em;margin-bottom:24px}
  p{margin-bottom:14px;text-align:justify}
  .sig{margin-top:36px;display:flex;justify-content:space-between}
  .sig-line{border-top:1px solid #111;width:220px;padding-top:6px;font-size:11px;text-align:center}
  .print-btn{display:block;margin:32px auto;padding:10px 28px;font-size:13px;cursor:pointer}
  @media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
<h2>NON-DISCLOSURE AGREEMENT</h2>
<p>This NDA is entered into on <strong>${fmt}</strong> by and between:</p>
<p><strong>${APP_SETTINGS.company.name}</strong> (the "Disclosing Party"), a company organized under the laws of the Republic of the Philippines, with principal address at ${APP_SETTINGS.company.address};</p>
<p>AND</p>
<p><strong>${safe(client)}</strong> (the "Receiving Party"), with address at ${safe(address) || '[Address]'}.</p>
<p><strong>1. Purpose.</strong> The parties wish to explore a business relationship regarding <strong>${safe(purpose)}</strong> (the "Purpose"). In connection with this Purpose, the Disclosing Party may disclose certain confidential information to the Receiving Party.</p>
<p><strong>2. Definition of Confidential Information.</strong> "Confidential Information" means all non-public information, regardless of form, that the Disclosing Party shares with the Receiving Party, including but not limited to business plans, financial data, client lists, project scopes, pricing, creative concepts, technical data, and trade secrets.</p>
<p><strong>3. Obligations of Receiving Party.</strong> The Receiving Party agrees to: (a) hold all Confidential Information in strict confidence; (b) not disclose Confidential Information to any third party without prior written consent; (c) use Confidential Information solely for the Purpose; and (d) return or destroy all Confidential Information upon request.</p>
<p><strong>4. Exclusions.</strong> Confidential Information does not include information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was rightfully in the Receiving Party's possession before disclosure; (c) is independently developed by the Receiving Party without use of Confidential Information; or (d) is required to be disclosed by law.</p>
<p><strong>5. Term.</strong> This NDA shall remain in effect for two (2) years from the date above. The confidentiality obligations shall survive for a period of two (2) years after termination.</p>
<p><strong>6. Governing Law & Jurisdiction.</strong> This Agreement shall be governed by the laws of the Republic of the Philippines. Any disputes shall be brought before the courts of Baguio City.</p>
<p><strong>7. Entire Agreement.</strong> This NDA constitutes the entire agreement between the parties regarding the subject matter hereof and supersedes all prior discussions and agreements.</p>
<p>IN WITNESS WHEREOF, the parties have executed this Non-Disclosure Agreement as of the date first written above.</p>
<div class="sig">
  <div><strong>${APP_SETTINGS.company.name}</strong><br><br><div class="sig-line">${APP_SETTINGS.company.founder}</div></div>
  <div><strong>${safe(client)}</strong><br><br><div class="sig-line">${escapeHtml(contact) || 'Authorized Representative'}</div></div>
</div>
</body></html>`;
}
