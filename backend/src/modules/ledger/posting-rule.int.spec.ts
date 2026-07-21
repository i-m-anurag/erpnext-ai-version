import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { accountsSeeder } from '../../db/seeds/seeders/accounts.seeder.js';
import { buildVoucher, getPostingRule } from './posting-rule.js';
import { registerPostingRules } from './register-posting-rules.js';

/**
 * Payment Entry's GL mapping moved out of the controller into a conditional posting
 * rule. These lock in the mapping so the refactor can't silently change the books:
 * the bank/cash side comes from the document's own account field, and the party
 * control account is resolved by Chart-of-Accounts role (never a hardcoded code).
 */
const DATE = '2026-07-15';
const doc = (data: Record<string, unknown>) => ({ code: 'PAY-TEST-1', data });

describe('payment-entry posting rule (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await accountsSeeder.run();
    registerPostingRules();
  });

  afterAll(async () => {
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('RECEIVE: debits the account paid to, credits Receivable with the party', async () => {
    const rule = getPostingRule('payment-entry')!;
    const v = await buildVoucher(
      rule,
      doc({ paymentType: 'RECEIVE', amount: 5000, party: 'Acme Supplies', accountPaidTo: 'bank' }),
      DATE,
    );
    expect(v.lines).toEqual([
      { account: 'bank', debit: 5000, credit: 0, party: null },
      { account: 'debtors', debit: 0, credit: 5000, party: 'Acme Supplies' }, // Receivable role
    ]);
  });

  it('PAY: debits Payable with the party, credits the account paid from', async () => {
    const rule = getPostingRule('payment-entry')!;
    const v = await buildVoucher(
      rule,
      doc({ paymentType: 'PAY', amount: 2500, party: 'Globex Corp', accountPaidFrom: 'cash' }),
      DATE,
    );
    expect(v.lines).toEqual([
      { account: 'creditors', debit: 2500, credit: 0, party: 'Globex Corp' }, // Payable role
      { account: 'cash', debit: 0, credit: 2500, party: null },
    ]);
  });

  it('rejects a paymentType no case covers, instead of posting nothing silently', async () => {
    const rule = getPostingRule('payment-entry')!;
    await expect(
      buildVoucher(rule, doc({ paymentType: 'TRANSFER', amount: 100, accountPaidFrom: 'cash' }), DATE),
    ).rejects.toThrow(/no posting rule case matches/i);
  });

  it('rejects a missing account field rather than posting to a blank account', async () => {
    const rule = getPostingRule('payment-entry')!;
    await expect(
      buildVoucher(rule, doc({ paymentType: 'PAY', amount: 100, party: 'Initech' }), DATE),
    ).rejects.toThrow(/missing account in field "accountPaidFrom"/i);
  });

  it('purchase-invoice still maps to Purchase Expenses / Creditors with the supplier', async () => {
    const rule = getPostingRule('purchase-invoice')!;
    const v = await buildVoucher(rule, doc({ grandTotal: 3000, supplier: 'Acme Supplies' }), DATE);
    expect(v.lines).toEqual([
      { account: 'purchase-expenses', debit: 3000, credit: 0, party: null },
      { account: 'creditors', debit: 0, credit: 3000, party: 'Acme Supplies' },
    ]);
  });
});
