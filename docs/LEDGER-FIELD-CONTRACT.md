# Ledger Field Contract

Some form fields are **read by name** by the accounting/posting logic. Their **label**
can change freely, but their **`key`** is a contract — rename one and GL posting breaks
(wrong amount, missing party, or a failed post).

This file lists those keys per financial doctype. Keep it in sync when you touch a
posting rule or a posting controller.

> Rule of thumb: a field is **safe to rename** only if it does **not** appear below.
> Everything below is load-bearing for the General Ledger.

---

## Purchase Invoice — `purchase-invoice`

Coupling lives in **`seed-data/base/posting-rules/purchase-invoice.json`** and
**`src/modules/form-logic/controllers/purchase-invoice.controller.ts`**.

| Field key            | Read by                      | Why it matters                              |
|----------------------|------------------------------|---------------------------------------------|
| `grandTotal`         | posting rule (`amountField`) | amount posted to both GL lines              |
| `supplier`           | posting rule (`partyField`)  | party on the Creditors line                 |
| `date`               | controller                   | posting date (defaults to today if absent)  |
| `items`              | controller                   | line-items table; drives `totalAmount`      |
| `items[].quantity`   | controller                   | `totalAmount = Σ (quantity × rate)`         |
| `items[].rate`       | controller                   | `totalAmount = Σ (quantity × rate)`         |
| `additionalDiscountAmount` | controller             | `grandTotal = totalAmount − discount`       |

Also required (not form fields): the account codes **`purchase-expenses`** and
**`creditors`** in the posting rule must exist in the Chart of Accounts.

Safe to rename: `piNumber` label, `postingTime`, `dueDate`, `isPaid`, `purpose`,
`company`, `currency`, `priceList`, `items[].item`, `items[].warehouse`, `items[].uom`,
and anything under `supplierInvoice` / `accountingDimensions` / `additionalDiscount`.

---

## Payment Entry — `payment-entry`

Fully config-driven — the mapping lives in
**`seed-data/base/posting-rules/payment-entry.json`**; the controller only supplies the
posting date. The rule branches on `paymentType` (`cases`), takes the bank/cash side
straight from the document, and resolves the party control account by Chart-of-Accounts
**role**, so no account code is hardcoded.

| Field key          | Read by                            | Why it matters                          |
|--------------------|------------------------------------|-----------------------------------------|
| `amount`           | posting rule (`amountField`)       | amount posted                           |
| `party`            | posting rule (`partyField`)        | party on the Payable/Receivable line     |
| `paymentType`      | posting rule (`cases[].when`)       | selects Dr/Cr direction                 |
| `accountPaidFrom`  | posting rule (`accountField`, PAY)  | credited on a payment out               |
| `accountPaidTo`    | posting rule (`accountField`, RECEIVE) | debited on a receipt                 |
| `date`             | controller                          | posting date                            |

**Option values that matter:** `paymentType` must stay `PAY` / `RECEIVE` — but these now
live **in the posting rule next to the lines they control**, not buried in code. Change
them in the `payment-entry-type` master and the rule's `cases[].when.equals` together.

An unmatched `paymentType` (or a missing account field) is **rejected with a clear
error** rather than silently posting nothing.

Safe to rename: `peNumber` label, `modeOfPayment`, `partyType`, `partyName`, `company`,
`project`, `costCenter`, and the `advanceTaxesAndCharges` table.

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

## Values referenced by name

Not form fields, but the posting logic depends on these existing / staying spelled
this way:

| Kind          | Values                                  | Where                                    |
|---------------|-----------------------------------------|------------------------------------------|
| Account roles | `Payable`, `Receivable` (also `Cash`, `Bank`) | resolved from the CoA by posting rules |
| Account codes | `purchase-expenses`, `creditors`        | Purchase Invoice posting rule            |
| Account code  | `retained-earnings`                     | year-end close sweep                     |
| Payment types | `PAY`, `RECEIVE`                        | `payment-entry-type` master + rule cases |

---

## Adding a new posting doctype safely

1. Prefer a **posting rule** (`seed-data/base/posting-rules/<slug>.json`) over
   hardcoding a controller. A line names its account one of three ways:
   - `account` — a fixed Chart-of-Accounts code
   - `accountField` — read the code from a document field (e.g. `accountPaidTo`)
   - `accountRole` — resolve by role (e.g. `Payable`), so nothing is hardcoded
2. Branching is config too: use `cases` with `when: { field, equals }` instead of
   if/else in a controller (see Payment Entry).
3. Post via `ledgerService.post(voucher, tx?.manager)` inside `afterSave` so the GL post
   is atomic with the document save (a failed post rolls the document back).
4. `post()` enforces that the voucher **balances** and that every account **exists** —
   an unbalanced or unknown-account voucher is rejected, not silently dropped.

## When you must rename a critical key

Update it in **both** places that reference it:
- the posting rule JSON (`amountField` / `partyField` / `account*` / `cases[].when`), and/or
- the controller (`*.controller.ts`).

Then re-run the field grep to confirm nothing else reads the old key:

```bash
grep -rn "oldKey" backend/src/modules/form-logic backend/seed-data/base/posting-rules
```
