# Ledger Field Contract

Some form fields are **read by name** by the accounting/posting logic. Their **label**
can change freely, but their **`key`** (and, where noted, their **option values**) is a
contract — rename one and GL posting silently breaks (wrong amount, missing party, or a
failed/empty post).

This file lists those keys per financial doctype. Keep it in sync when you touch a
posting controller or a posting rule.

> Rule of thumb: a field is **safe to rename** only if it does **not** appear below.
> Everything below is load-bearing for the General Ledger.

---

## Purchase Invoice — `purchase-invoice`

Coupling lives in **`seed-data/base/posting-rules/purchase-invoice.json`** and
**`src/modules/form-logic/controllers/purchase-invoice.controller.ts`**.

| Field key        | Read by            | Why it matters                                   |
|------------------|--------------------|--------------------------------------------------|
| `grandTotal`     | posting rule (`amountField`) | amount posted to both GL lines          |
| `vendor`         | posting rule (`partyField`)  | party on the Creditors line             |
| `invoiceDate`    | controller         | posting date (defaults to today if absent)       |
| `lines`          | controller         | line-items table; drives `grandTotal`            |
| `lines[].qty`    | controller         | `grandTotal = Σ (qty × rate)`                    |
| `lines[].rate`   | controller         | `grandTotal = Σ (qty × rate)`                    |

Also required (not form fields): the account codes **`purchase-expenses`** and
**`creditors`** in the posting rule must exist in the Chart of Accounts.

Safe to rename: `poRef`, `notes`, `piNumber` label, `lines[].item`, `lines[].remarks`.

---

## Payment Entry — `payment-entry`

Coupling lives in **`src/modules/form-logic/controllers/payment-entry.controller.ts`**
(hardcoded — no posting rule).

| Field key      | Read by    | Why it matters                                            |
|----------------|------------|-----------------------------------------------------------|
| `amount`       | controller | amount posted                                             |
| `party`        | controller | party on the Payable/Receivable line                      |
| `mode`         | controller | **value must be `Cash` or `Bank`** → selects the account  |
| `paymentType`  | controller | **value must be `Pay` or `Receive`** → selects Dr/Cr side |
| `paymentDate`  | controller | posting date                                              |

> ⚠️ For `mode` and `paymentType` the **option values** are also hardcoded — changing
> `"Cash"` → `"cash"` breaks posting just like renaming the key. (Making Payment Entry
> config-driven — a backlog item — would remove this hardcoding.)

Control accounts are resolved by role (Cash / Bank / Payable / Receivable) from the
Chart of Accounts, so those account **types** must each map to exactly one leaf account.

Safe to rename: `reference`, `peNumber` label.

---

## Journal Entry — `journal-entry`

Coupling lives in **`src/modules/form-logic/controllers/journal-entry.controller.ts`**.
The user types the Dr/Cr directly, so the line keys map straight to GL lines.

| Field key          | Read by    | Why it matters                          |
|--------------------|------------|-----------------------------------------|
| `postingDate`      | controller | posting date                            |
| `lines`            | controller | the journal grid                        |
| `lines[].account`  | controller | GL account (must be a real account code)|
| `lines[].debit`    | controller | debit amount                            |
| `lines[].credit`   | controller | credit amount                           |
| `lines[].party`    | controller | optional party on the GL line           |
| `lines[].remarks`  | controller | optional narration on the GL line       |

Safe to rename: `narration`, `reference`, `jeNumber` label.

---

## Adding a new posting doctype safely

1. Prefer a **posting rule** (`seed-data/base/posting-rules/<slug>.json`) over hardcoding
   a controller — it declares `amountField` / `partyField` / `account` / `side` and reads
   the document by those field keys. See Purchase Invoice.
2. If the mapping needs branching a flat rule can't express (like Payment Entry), a
   controller reads `doc.data[...]` directly — **document the keys here**.
3. Post via `ledgerService.post(voucher, tx?.manager)` inside `afterSave` so the GL post
   is atomic with the document save (a failed post rolls the document back).
4. `post()` enforces that the voucher **balances** and that every account **exists** —
   an unbalanced or unknown-account voucher is rejected, not silently dropped.

## When you must rename a critical key

Update it in **both** places that reference it:
- the posting rule JSON (`amountField` / `partyField` / `account`), and/or
- the controller (`*.controller.ts`, including any hardcoded option values).

Then re-run the field grep to confirm nothing else reads the old key:

```bash
grep -rn "oldKey" backend/src/modules/form-logic backend/seed-data/base/posting-rules
```
