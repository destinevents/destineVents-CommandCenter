// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { actionMenuHTML, toggleActionMenu } from './actionMenu.ts';

function renderMenu(items = '<button>View</button>'): HTMLElement {
  document.body.innerHTML = actionMenuHTML(items, 'Actions for Aurora');
  return document.querySelector('.action-menu-trigger') as HTMLElement;
}

const openMenus = () => document.querySelectorAll('.action-menu-dropdown.open');

describe('actionMenuHTML', () => {
  it('renders a trigger followed by its dropdown items', () => {
    renderMenu('<button onclick="openProjectDetail(3)">View</button>');
    const dropdown = document.querySelector('.action-menu-dropdown') as HTMLElement;
    expect(dropdown.innerHTML).toContain('openProjectDetail(3)');
    expect(dropdown.previousElementSibling?.className).toBe('action-menu-trigger');
  });

  it('escapes the label so a quote in a project name cannot break the attribute', () => {
    document.body.innerHTML = actionMenuHTML('<button>View</button>', 'Actions for Chimichanga" onload="x');
    const trigger = document.querySelector('.action-menu-trigger') as HTMLElement;
    expect(trigger.getAttribute('aria-label')).toBe('Actions for Chimichanga" onload="x');
    expect(trigger.hasAttribute('onload')).toBe(false);
  });
});

describe('toggleActionMenu', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('opens the dropdown belonging to the clicked trigger', () => {
    const trigger = renderMenu();
    toggleActionMenu(trigger);
    expect(openMenus()).toHaveLength(1);
  });

  it('closes the dropdown when its own trigger is clicked again', () => {
    const trigger = renderMenu();
    toggleActionMenu(trigger);
    toggleActionMenu(trigger);
    expect(openMenus()).toHaveLength(0);
  });

  it('keeps only one row menu open at a time', () => {
    document.body.innerHTML = actionMenuHTML('<button>A</button>') + actionMenuHTML('<button>B</button>');
    const [first, second] = Array.from(document.querySelectorAll('.action-menu-trigger')) as HTMLElement[];
    toggleActionMenu(first);
    toggleActionMenu(second);
    expect(openMenus()).toHaveLength(1);
    expect(second.nextElementSibling?.classList.contains('open')).toBe(true);
  });

  // Regression: the dismiss listeners used to be wired up by loadFinance(), so
  // a menu opened on a page that loads on its own never closed.
  it('closes on a click outside without any page-level setup', () => {
    const trigger = renderMenu();
    toggleActionMenu(trigger);
    document.body.appendChild(document.createElement('div')).click();
    expect(openMenus()).toHaveLength(0);
  });
});
