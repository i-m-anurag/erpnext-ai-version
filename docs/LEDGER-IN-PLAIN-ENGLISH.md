# Ledgers & Reports — in plain English

> A simple explainer for the whole team. The detailed engineering version lives in
> [LEDGER-AND-REPORTS-PLAN.md](LEDGER-AND-REPORTS-PLAN.md) — read that when you're
> writing the code. This one is for *understanding and explaining* the approach.

---

## What we're building, in one sentence

Two permanent record books — one for **stock** (what we have in the warehouse) and
one for **money** (the accounts) — plus the **reports** that read them.

---

## The one big idea: a ledger is a notebook you never erase

Think of a **bank passbook**. Every time money moves, the bank writes a new line.
They never go back and scribble over an old line. If they made a mistake, they write
a *new* correcting line. You can always scroll back and see exactly what happened and
when.

Our ledgers work exactly like that. The golden rule:

> **We only ever add new lines. We never edit or delete old ones.**

Why this matters — it's the difference between an ERP you can trust and one you can't:

- **Auditors trust it.** The full history is there; nothing was quietly changed.
- **No mystery bugs.** When a number looks wrong, you can trace every line that
  produced it instead of wondering "who changed this and when?"
- **Mistakes are honest.** A correction is a visible new entry, not a cover-up.

This is the single biggest decision, and it's what saves us from the classic ERP mess
where the stock value and the accounts slowly drift apart and nobody can explain why.

---

## The two record books

### 1. The Stock Ledger — "what do we have, and what is it worth?"

Every time an item moves, we write a line: *received 100 bolts*, *issued 30 bolts*.
Each line also records the **running quantity** (how many we have now) and the
**value** (what that stock is worth).

To value stock we use a simple, well-known method: **moving average**. It's just
averaging the price as new stock arrives — like working out the average price of
apples after you've bought a few batches at different prices.

### 2. The Account Ledger — "where did the money come from and go?"

This is classic bookkeeping. The key idea is **double-entry**: every transaction has
**two sides** that must balance. Money always comes *from* somewhere and goes *to*
somewhere.

> Think of a see-saw. Every entry must keep it level — what goes down on one side
> goes up on the other. If the two sides don't add up to the same amount, we refuse
> to save it. That single rule is what keeps the books correct forever.

Accounts are organised in a **tree** (a "chart of accounts"): big groups like *Assets*
and *Expenses* at the top, with specific accounts like *Cash* or *Vendor Payments* as
the leaves. We only ever record against the specific leaf accounts; the groups are
just for adding things up in reports.

---

## How a real action works (an example)

Say we **receive a Purchase Invoice** for 100 bolts worth ₹3,000. One business action,
but it touches **both** record books at the same time:

```
  Receive Purchase Invoice (₹3,000)
        │
        ├──►  STOCK LEDGER:   +100 bolts, value +₹3,000
        │
        └──►  ACCOUNT LEDGER: "Stock" goes up ₹3,000   (we now own more stock)
                              "Owed to vendor" up ₹3,000 (we owe the supplier)
                              ↑ two sides, balanced ↑
```

Both books update **together, all-or-nothing** — like a bank transfer where the debit
and the credit either both happen or neither does. We never end up with stock that
went up but money that didn't, or vice-versa. That's why inventory and accounting
always agree.

The rules for *which lines to write for which document* (purchase invoice, payment,
delivery…) are **configuration**, not hard-coded — the same approach we already use
for forms and workflows. So a client can adjust their accounts without us changing
code.

---

## Keeping it fast

A real company builds up millions of lines. If we added them all up every time
someone asked "how much cash do we have?", reports would crawl.

So we keep a **running total** alongside the history — like the balance column in a
passbook that's always up to date. Asking for the current balance is then instant; we
just read the latest total. The full history is still there if we ever need to
re-check or rebuild the totals.

For the heavier reports (profit & loss, trial balance), we also keep **period
snapshots** — a saved opening and closing total for each month — so a monthly report
is "snapshot + this month's changes" instead of re-reading the whole year.

---

## The reports people will actually use

**Money:**
- **General Ledger** — every line for an account, with a running balance.
- **Trial Balance** — are the books balanced? (every account's total at a glance)
- **Profit & Loss** — did we make or lose money this period?
- **Balance Sheet** — what we own vs. what we owe, right now.
- **Receivables / Payables** — who owes us, who we owe, and how overdue.

**Stock:**
- **Stock Ledger** — every movement of an item, with running quantity and value.
- **Stock Balance** — what's on hand right now and what it's worth.
- **Stock Ageing** — how long stock has been sitting.

These are screens with filters, sorting, and export — built on the same grid we
already use elsewhere.

---

## The handful of rules we live by

Everything above comes down to five simple promises the system keeps:

1. **Never erase** — only add lines (correct mistakes with a new entry).
2. **Always balanced** — money in equals money out on every transaction.
3. **Never double-count** — saving the same thing twice (a retry, a double-click)
   is ignored, not recorded twice.
4. **All-or-nothing** — a business action updates both books fully, or not at all.
5. **Keep a running total** — so reports are instant, but always rebuildable from
   history.

---

## A few choices we made (and why, simply)

- **Money is stored exactly** — no floating-point shortcuts, so we never get the
  "off by one paisa" drift that haunts other systems. All the multiplying and
  rounding happens in our code in one consistent way; the database only ever adds
  and subtracts.

- **Back-dating is allowed, but only a little.** You can enter today something dated
  to yesterday or earlier *this period* (people forget to enter things — that's
  normal). You **cannot** reach back and rewrite a closed period. Older corrections
  are made with a clear, dated adjustment entry. This keeps things practical without
  opening the door to the "recalculate three years of history" nightmare.

- **We reuse what we already have.** This needs **no new technology** — it's the same
  PostgreSQL database, Redis cache, and background worker we already run. The hard
  part is discipline (the five rules above), not new tools.

- **It feeds the future.** Every entry also emits a clean event, so later we can plug
  in AI features — cash-flow prediction, fraud/anomaly detection, smart inventory
  forecasting — without digging back through the database.

---

## In one paragraph (the elevator version)

We're building two permanent, append-only record books — one for stock, one for money
— that always update together and never get edited. Every money transaction must
balance, every entry is traceable, and we keep live running totals so reports are
instant. We store money exactly, allow only sensible recent back-dating, and reuse our
existing database and tools. The result is an ERP whose inventory and accounts always
agree, that an auditor can trust, and that's ready for AI on top.
