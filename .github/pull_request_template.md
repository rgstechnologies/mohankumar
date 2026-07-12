## What does this change?

<!-- One or two sentences. What did you change, and why? -->

## How did you check it?

<!-- Not "it builds". What did you actually do? Which screen did you open, what
     did you type, what did you see? If you changed anything touching money,
     say which figures you checked and what they came out as. -->

- [ ] `npm run verify` passes locally (lint + types + build + tests)
- [ ] I exercised the change in the running app, not just in tests

## Does this touch money, tax, or balances?

- [ ] No — this doesn't change any amount, tax, rounding or balance
- [ ] Yes — and I've added or updated a test that pins the new numbers

> Anything touching `gst-calculator.ts`, the CGST/SGST/IGST split, stock, or
> party outstanding needs a test that would fail without the change.

## Anything a reviewer should look at closely?

<!-- Trade-offs, things you weren't sure about, code you'd like a second pair of
     eyes on. Say so here — it's cheaper than finding out in production. -->
