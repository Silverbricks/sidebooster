# Prize draw engine

The engine has two goals: the draw must be **fair and unpredictable** before it happens, and **verifiable and unchangeable** after it.

## Steps (admin draw console: `/admin/campaigns/[id]`)

| # | Step | What happens | Code |
|---|---|---|---|
| 1 | **Lock register** | Runs when sales close, either automatically from the cron or `autoLockDue`, or manually with a reason. The eligible ticket list is frozen and its SHA-256 `eligibleHash` recorded. A random 32-byte seed is generated and **only its commitment** `sha256(seed)` is published | `lockCampaign` |
| 2 | **Run draw** | `winningIndex = BigInt(sha256(seed + ":" + eligibleHash)) mod eligibleCount`. The winner is the ticket at that index of the locked list. A `resultHash` seals the result | `runDraw`, `computeWinningIndex` |
| 3 | **Verify** | Five integrity checks must pass: the seed matches its commitment, the entry-list hash matches the lock, the winning index recomputes, the result hash is intact, and the audit chain is intact | `verifyResult` |
| 4 | **Publish** | The result becomes public at `/results/[slug]`, with the seed, hashes and index so anyone can recompute it. Participants are notified. **Published results cannot be changed** | `publishResult` |
| 5 | **Prize delivered** | The admin records delivery with a note | `markPrizeDelivered` |

## Triggers

- **Mode A:** fixed date and time, in the campaign's time zone.
- **Mode B:** sold out. When the last ticket is allocated, sales close and the register locks. Only allowed if `rule_sold_out_trigger_allowed` is on and the campaign terms permit it.

## Date changes

The system **never silently changes an advertised draw date**. A seller submits an `EXTENSION` request (`DrawSchedule`) with a reason. Once an admin approves it:

- the new dates apply;
- every participant is notified;
- the original schedule stays in the history and audit log.

## Audit

- Every draw event is written to `DrawAuditLog`, a **hash chain**: each entry stores the hash of the previous one, numbered per campaign (`seq`). Editing any entry breaks the chain, and `verifyDrawAuditChain` detects it. This is tested.
- All admin actions also go to the general `AuditLog`, with actor, reason and details.

## Cancellation

Cancelling a campaign requires a reason. Participants are notified and paid tickets are refunded.

## Tested

The tests in `scripts/test-flows.ts` cover:

- deterministic winner recomputation;
- detection of a tampered result;
- detection of a broken audit chain;
- concurrent allocation;
- extension approval and notification.
