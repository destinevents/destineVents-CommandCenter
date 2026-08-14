// Interns write their daily report as free-form text: a heading, then "*" or
// "-" bullets, sometimes indented, sometimes with blank lines between sections.
// HTML collapses all of that whitespace, so the report arrives on the Approvals
// page as one grey wall of prose. This module parses the raw text back into
// blocks so every surface (approvals, tables, calendar, CSV, PDF) can render it
// the way the intern actually typed it.
//
// Pure module — no DOM, no side effects. The collapsible "Show more" wrapper
// lives in shared/components/activityText.ts.
import { escapeHtml } from './helpers.ts';

export type ActivityBlock =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'bullet'; readonly text: string; readonly depth: number }
  | { readonly kind: 'text'; readonly text: string };

const BULLET_LINE = /^([ \t]*)(?:[-*•+–—]|\d+[.)])[ \t]+(.*)$/;
const EMPTY_BULLET_LINE = /^[ \t]*(?:[-*•+–—]|\d+[.)])[ \t]*$/;
const MD_HEADING = /^[ \t]*#{1,6}[ \t]+(.+)$/;
const INLINE_BOLD = /\*\*([^*]+)\*\*|__([^_]+)__/g;

// Recovering bullets from a single-line paste: a "*"/"•" marker only needs
// something after it, but a dash also works as ordinary punctuation, so it
// counts as a bullet only when what follows starts a new item (capital/digit).
const INLINE_BULLET = /[ \t]+(?=(?:[*•+][ \t]+\S|[-–—][ \t]+[A-Z0-9]))/g;

// In a flattened entry a section title has no marker of its own, so it ends up
// glued to the tail of the previous bullet ("…founder entry. RE:Bloom"). A short
// trailing fragment after a finished sentence is pulled back out as its own line.
const TRAILING_HEADING = /^(.*[.!?])[ \t]+([A-Z][^.!?]{0,40})$/;

const MAX_HEADING_LEN = 72;
const MAX_BULLET_DEPTH = 2;
const MIN_INLINE_BULLETS = 2;

// Some entries reach the database with their line breaks already stripped (a
// paste out of a rich-text editor, or an older form that trimmed them). If the
// text is one long line but carries several bullet markers, put the breaks back.
// Only a fragment that reads like a title, not a clipped sentence: it either
// carries a colon ("RE:Bloom") or is at most two words.
function splitTrailingHeading(line: string, isLast: boolean): string {
  if (isLast) return line;
  const match = TRAILING_HEADING.exec(line);
  if (!match) return line;
  const tail = match[2].trim();
  if (!tail.includes(':') && tail.split(/\s+/).length > 2) return line;
  return `${match[1]}\n${tail}`;
}

function recoverLineBreaks(text: string): string {
  if (text.includes('\n')) return text;
  const markers = text.match(INLINE_BULLET);
  if (!markers || markers.length < MIN_INLINE_BULLETS) return text;
  const lines = text.replace(INLINE_BULLET, '\n').split('\n');
  return lines.map((line, i) => splitTrailingHeading(line, i === lines.length - 1)).join('\n');
}

// null = blank line. Kept in the stream so it can break a paragraph run before
// being dropped.
function classifyLine(line: string): ActivityBlock | null {
  const stripped = line.replace(/[ \t]+$/, '');
  // A blank line, or a marker the intern left empty, is spacing — not content.
  if (!stripped.trim() || EMPTY_BULLET_LINE.test(stripped)) return null;

  const heading = MD_HEADING.exec(stripped);
  if (heading) return { kind: 'heading', text: heading[1].trim() };

  const bullet = BULLET_LINE.exec(stripped);
  if (bullet && bullet[2].trim()) {
    const indent = bullet[1].replace(/\t/g, '  ').length;
    return {
      kind: 'bullet',
      text: bullet[2].trim(),
      depth: Math.min(MAX_BULLET_DEPTH, Math.floor(indent / 2)),
    };
  }
  return { kind: 'text', text: stripped.trim() };
}

// A short line that introduces a list ("RE:Bloom", "Notes:") reads as a heading.
function isHeadingCandidate(block: ActivityBlock, next: ActivityBlock | null): boolean {
  if (block.kind !== 'text' || block.text.length > MAX_HEADING_LEN) return false;
  return block.text.endsWith(':') || next?.kind === 'bullet';
}

function promoteHeadings(
  blocks: readonly (ActivityBlock | null)[]
): readonly (ActivityBlock | null)[] {
  return blocks.map((block, i) => {
    if (!block || block.kind !== 'text') return block;
    const next = blocks.slice(i + 1).find((b): b is ActivityBlock => b !== null) ?? null;
    if (!isHeadingCandidate(block, next)) return block;
    return { kind: 'heading', text: block.text.replace(/:$/, '') };
  });
}

// Wrapped prose lines belong to one paragraph, so consecutive text lines merge
// into a single block (their newlines survive — .act-para is pre-wrap). A blank
// line ends the run and starts a new paragraph.
function mergeTextRuns(blocks: readonly (ActivityBlock | null)[]): readonly ActivityBlock[] {
  return blocks.reduce<readonly ActivityBlock[]>((acc, block, i) => {
    if (!block) return acc;
    const prev = acc[acc.length - 1];
    const adjacent = i > 0 && blocks[i - 1] !== null;
    if (block.kind === 'text' && prev?.kind === 'text' && adjacent) {
      return [...acc.slice(0, -1), { kind: 'text', text: `${prev.text}\n${block.text}` }];
    }
    return [...acc, block];
  }, []);
}

export function parseActivity(raw: unknown): readonly ActivityBlock[] {
  if (raw === null || raw === undefined) return [];
  const normalized = recoverLineBreaks(String(raw).replace(/\r\n?/g, '\n')).trim();
  if (!normalized) return [];
  return mergeTextRuns(promoteHeadings(normalized.split('\n').map(classifyLine)));
}

// Escape first, then re-introduce the one bit of markup interns actually use —
// "**bold**" — so the emphasis survives without opening an HTML injection.
function inlineHtml(text: string): string {
  return escapeHtml(text).replace(INLINE_BOLD, (_m, stars, unders) => `<strong>${stars ?? unders}</strong>`);
}

interface HtmlAccumulator {
  readonly html: string;
  readonly inList: boolean;
}

export function activityToHtml(raw: unknown): string {
  const { html, inList } = parseActivity(raw).reduce<HtmlAccumulator>(
    (acc, block) => {
      if (block.kind === 'bullet') {
        const opened = acc.inList ? acc.html : `${acc.html}<ul class="act-list">`;
        return {
          html: `${opened}<li class="act-item act-item--${block.depth}">${inlineHtml(block.text)}</li>`,
          inList: true,
        };
      }
      const closed = acc.inList ? `${acc.html}</ul>` : acc.html;
      const rendered = block.kind === 'heading'
        ? `<div class="act-heading">${inlineHtml(block.text)}</div>`
        : `<p class="act-para">${inlineHtml(block.text)}</p>`;
      return { html: closed + rendered, inList: false };
    },
    { html: '', inList: false }
  );
  return inList ? `${html}</ul>` : html;
}

// Same shape, no markup — for CSV/Excel cells, which keep newlines inside a
// quoted field.
export function activityToText(raw: unknown): string {
  return parseActivity(raw)
    .map((block) => (block.kind === 'bullet' ? `${'  '.repeat(block.depth)}• ${block.text}` : block.text))
    .join('\n');
}

// One-line summary for tooltips and anywhere a single row is all there is room for.
export function activityPreview(raw: unknown, maxChars = 120): string {
  const flat = activityToText(raw).replace(/\s*\n+\s*/g, ' · ').replace(/[ \t]+/g, ' ').trim();
  return flat.length <= maxChars ? flat : `${flat.slice(0, maxChars - 1).trimEnd()}…`;
}

// Whether the entry is worth collapsing behind a "Show more".
export function isLongActivity(raw: unknown, maxChars = 260, maxBlocks = 4): boolean {
  const blocks = parseActivity(raw);
  return blocks.length > maxBlocks || activityToText(raw).length > maxChars;
}
