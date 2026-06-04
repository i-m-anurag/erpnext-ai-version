import { describe, it, expect } from 'vitest';
import { renderTemplate } from './email-template.service.js';
import type { EmailTemplate } from './email-template.schema.js';

const tpl: EmailTemplate = {
  slug: 'welcome',
  subject: 'Hi {{userName}} — {{appName}}',
  html: '<p>{{userName}}, visit <a href="{{link}}">here</a></p>',
  variables: ['userName', 'appName', 'link'],
};

describe('renderTemplate', () => {
  it('substitutes declared variables in subject and body', () => {
    const out = renderTemplate(tpl, { userName: 'Ann', appName: 'ERP', link: 'http://x/y' });
    expect(out.subject).toBe('Hi Ann — ERP');
    expect(out.html).toContain('Ann, visit');
    expect(out.html).toContain('href="http://x/y"');
  });

  it('throws when a declared variable is not supplied', () => {
    expect(() => renderTemplate(tpl, { userName: 'Ann', appName: 'ERP' })).toThrow(/link/);
  });

  it('throws when the body references an undeclared placeholder', () => {
    const bad: EmailTemplate = { ...tpl, variables: ['userName', 'appName'], html: '<p>{{ghost}}</p>' };
    expect(() => renderTemplate(bad, { userName: 'A', appName: 'B' })).toThrow(/ghost/);
  });
});
