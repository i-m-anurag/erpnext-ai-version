import { baseFiles } from '../../db/seeds/file-loader.js';
import { registerPostingRule, type PostingRule } from './posting-rule.js';

let done = false;

/** Load config-driven posting rules from seed-data/base/posting-rules/*.json. */
export function registerPostingRules(): void {
  if (done) return;
  done = true;
  for (const { raw } of baseFiles('posting-rules')) {
    registerPostingRule(raw as PostingRule);
  }
}
