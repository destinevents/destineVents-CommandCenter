import { describe, it, expect } from 'vitest';
import { proposalRowHTML, proposalTableHTML } from './proposals.templates.ts';
import type { Project, Proposal } from '@shared/types.ts';

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  id: 7,
  quo_number: 'QUO-2026-004',
  name: 'Abanao Square — Easter Event',
  client: 'Abanao Square',
  value: 5000,
  status: 'Draft',
  sent: null,
  followup: null,
  ...over,
} as Proposal);

const project = (over: Partial<Project> = {}): Project => ({
  id: 21,
  name: 'Abanao Square — Easter Event',
  code: 'PRJ-2026-001',
  proposal_id: 7,
  ...over,
} as Project);

describe('proposalRowHTML actions', () => {
  it('offers Mark Sent on a draft, and nothing about projects', () => {
    const html = proposalRowHTML(proposal());
    expect(html).toContain('markQuotationSent(7)');
    expect(html).not.toContain('convertProposalToProject');
  });

  it('offers the conversion once a proposal is won', () => {
    const html = proposalRowHTML(proposal({ status: 'Won' }), []);
    expect(html).toContain('convertProposalToProject(7)');
    expect(html).not.toContain('markQuotationSent');
  });

  // Converting twice is refused by convertProposalToProject, so the button was
  // a dead end on every quotation that had already been converted.
  it('points at the existing project instead of offering a second conversion', () => {
    const html = proposalRowHTML(proposal({ status: 'Won' }), [project()]);
    expect(html).toContain('openProjectDetail(21)');
    expect(html).toContain('PRJ-2026-001');
    expect(html).not.toContain('convertProposalToProject');
  });

  it('ignores a project converted from some other proposal', () => {
    const html = proposalRowHTML(proposal({ status: 'Won' }), [project({ proposal_id: 99 })]);
    expect(html).toContain('convertProposalToProject(7)');
  });

  it('falls back to a label when the linked project has no code', () => {
    const html = proposalRowHTML(proposal({ status: 'Won' }), [project({ code: null })]);
    expect(html).toContain('View Project');
  });

  it('keeps the secondary actions in the ⋯ menu', () => {
    const html = proposalRowHTML(proposal());
    expect(html).toContain('action-menu-trigger');
    ['printQuotation(7)', 'sendQuotationEmail(7)', 'openEditProposal(7)', 'handleDeleteProposal(7)']
      .forEach(call => expect(html).toContain(call));
  });

  it('renders an empty state rather than a row when there are no proposals', () => {
    expect(proposalTableHTML([])).toContain('No proposals yet');
  });
});
