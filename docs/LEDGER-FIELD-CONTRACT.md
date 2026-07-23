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
| `purchaseReceipt`    | posting rule (case `isSet`)  | decides WHICH account is debited — see below |

**`purchaseReceipt` changes the accounting.** If it is set, the goods already came in
on a Purchase Receipt, which debited Stock In Hand and credited Stock Received But Not
Billed; the invoice then debits **`stock-received-not-billed`** to clear that holding
account. If it is blank, nothing has been received into stock, so the invoice debits
**`purchase-expenses`** as before. Blank strings count as absent.

Renaming or failing to populate this field does not error — it silently posts to
expenses instead of clearing SRBNB, leaving a permanent balance in the holding
account. Watch this one.

Also required (not form fields): the account codes **`purchase-expenses`**,
**`creditors`** and **`stock-received-not-billed`** must exist in the Chart of Accounts.

Safe to rename: `piNumber` label, `postingTime`, `dueDate`, `isPaid`, `purpose`,
`company`, `currency`, `priceList`, `items[].item`, `items[].warehouse`, `items[].uom`,
and anything under `supplierInvoice` / `accountingDimensions` / `additionalDiscount`.

---

## Purchase Receipt — `purchase-receipt`

Coupling lives in **`seed-data/base/posting-rules/purchase-receipt.json`** and
**`src/modules/form-logic/controllers/purchase-receipt.controller.ts`**.

| Field key           | Read by    | Why it matters                                       |
|---------------------|------------|------------------------------------------------------|
| `items`             | controller | one stock movement per row                           |
| `items[].item`      | controller | what moved (stock ledger `item_code`)                |
| `items[].quantity`  | controller | how much moved — must be above zero                  |
| `items[].warehouse` | controller | where it moved to — required, stock needs a location |
| `items[].rate`      | controller | valuation of the incoming stock                      |
| `date`              | controller | posting date for BOTH the stock and GL entries       |

The GL amount is **not** read from a field: it is the stock ledger's own
`stock_value_difference`, handed to the rule as `stockValue`. Renaming a total on the
form cannot desynchronise stock from the books.

Posts Dr `stock-in-hand` / Cr `stock-received-not-billed`.

---

## Stock Entry — `stock-entry`

Coupling lives in **`seed-data/base/posting-rules/stock-entry.json`** and
**`src/modules/form-logic/controllers/stock-entry.controller.ts`**.

| Field key                 | Read by                     | Why it matters                          |
|---------------------------|-----------------------------|-----------------------------------------|
| `stockEntryType`          | controller + rule (`cases`) | picks the movement AND the posting      |
| `items[].item`            | controller                  | what moved                              |
| `items[].quantity`        | controller                  | always positive; direction comes from the type |
| `items[].sourceWarehouse` | controller                  | required for Issue and Transfer         |
| `items[].targetWarehouse` | controller                  | required for Receipt and Transfer       |
| `items[].rate`            | controller                  | required for Receipt only                |

`stockEntryType` values are load-bearing strings that must match the
`stock-entry-type` master exactly: **`Material Receipt`**, **`Material Issue`**,
**`Material Transfer`**. A value no case covers is rejected rather than posted blindly.

| Type              | Stock            | General Ledger                                  |
|-------------------|------------------|-------------------------------------------------|
| Material Receipt  | +qty at `rate`   | Dr `stock-in-hand` / Cr `stock-adjustment`      |
| Material Issue    | −qty at valuation | Dr `stock-adjustment` / Cr `stock-in-hand`     |
| Material Transfer | −source, +target | none — value is preserved, so nothing is posted |

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
| Account codes | `stock-in-hand`, `stock-received-not-billed`, `stock-adjustment` | stock posting rules |
| Account code  | `stock-in-hand`                         | the SL↔GL reconciliation report compares against this |
| Account code  | `retained-earnings`                     | year-end close sweep                     |
| Payment types | `PAY`, `RECEIVE`                        | `payment-entry-type` master + rule cases |
| Stock entry types | `Material Receipt`, `Material Issue`, `Material Transfer` | `stock-entry-type` master + rule cases |

---

## Backlog

- **Live total recalculation in the form UI.** `calculate` fields are derived
  server-side on save, so stored and posted amounts are always correct — but the form
  does not recompute totals while you type, so Grand Total stays blank on a new,
  unsaved document. Cosmetic only; nothing downstream depends on client-side maths.
  Two options when it's picked up: (a) a debounced `POST /api/forms/:slug/calculate`
  that reuses the one server evaluator — preferred, since it can't drift from what is
  saved; or (b) port the evaluator to the frontend — instant, but duplicates money
  arithmetic across two packages that share no code.

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
