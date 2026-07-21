import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { Account, type AccountType, type RootType } from './account.entity.js';

export interface AccountDef {
  code: string;
  name: string;
  parentCode?: string | null;
  rootType: RootType;
  accountType?: AccountType;
  isGroup?: boolean;
}

/** An account node with its children nested (for the Chart of Accounts tree). */
export interface AccountNode {
  code: string;
  name: string;
  parentCode: string | null;
  rootType: RootType;
  accountType: AccountType;
  isGroup: boolean;
  children: AccountNode[];
}

export class AccountService {
  private readonly repo = new BaseRepository(Account);

  async list(): Promise<Account[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async getByCode(code: string): Promise<Account> {
    const a = await this.repo.findOne({ code });
    if (!a) throw new NotFoundError(`account not found: ${code}`);
    return a;
  }

  /** Postable leaf accounts only — used by posting rules and account pickers. */
  async leaves(): Promise<Account[]> {
    return this.repo.find({ where: { isGroup: false }, order: { code: 'ASC' } });
  }

  /** Leaf accounts as picker options (value = code, label = "code — name"), for the
   *  account-lookup form field (e.g. Journal Entry lines). */
  async options(): Promise<{ value: string; label: string }[]> {
    const leaves = await this.leaves();
    return leaves.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}` }));
  }

  /** Resolve the single leaf account for a control role (e.g. Payable, Cash) instead
   *  of hardcoding a code — so postings follow the Chart of Accounts, not a magic
   *  string. Throws if the role is absent or ambiguous. */
  async resolveByType(accountType: NonNullable<AccountType>): Promise<string> {
    const matches = await this.repo.find({ where: { accountType, isGroup: false }, order: { code: 'ASC' } });
    if (matches.length === 0) throw new NotFoundError(`no account configured for role: ${accountType}`);
    if (matches.length > 1) {
      throw new NotFoundError(`ambiguous role ${accountType}: ${matches.map((m) => m.code).join(', ')}`);
    }
    return matches[0]!.code;
  }

  /** The Chart of Accounts as a nested tree (root nodes first). */
  async tree(): Promise<AccountNode[]> {
    const all = await this.list();
    const byCode = new Map<string, AccountNode>();
    for (const a of all) {
      byCode.set(a.code, {
        code: a.code, name: a.name, parentCode: a.parentCode, rootType: a.rootType,
        accountType: a.accountType, isGroup: a.isGroup, children: [],
      });
    }
    const roots: AccountNode[] = [];
    for (const a of all) {
      const node = byCode.get(a.code)!;
      if (a.parentCode && byCode.has(a.parentCode)) byCode.get(a.parentCode)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  /** Idempotent upsert of a chart of accounts (for the seeder). Returns #changed. */
  async seed(defs: AccountDef[]): Promise<number> {
    let changed = 0;
    for (const d of defs) {
      const next = {
        name: d.name,
        parentCode: d.parentCode ?? null,
        rootType: d.rootType,
        accountType: d.accountType ?? null,
        isGroup: d.isGroup ?? false,
      };
      const existing = await this.repo.findOne({ code: d.code });
      if (existing) {
        if (
          existing.name !== next.name || existing.parentCode !== next.parentCode ||
          existing.rootType !== next.rootType || existing.accountType !== next.accountType ||
          existing.isGroup !== next.isGroup
        ) {
          Object.assign(existing, next);
          await this.repo.save(existing);
          changed++;
        }
      } else {
        await this.repo.save(this.repo.create({ code: d.code, ...next }));
        changed++;
      }
    }
    return changed;
  }
}

export const accountService = new AccountService();
