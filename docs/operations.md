# Operations runbook (pilot)

## Daily
- Verify `/api/public/rates` freshness (< 120 min). If stale: Admin → Gold Rates → Refresh; on provider outage the last valid rate stays with a stale badge and billing warns.
- Check Overview: today's bills, revenue, low-stock widget.

## Billing
- Barcode box focused → scan → Enter. Unknown/sold codes block with a clear message.
- Split tender: payments array must equal total within ₹1 or finalize fails (409).
- Corrections: never edit a finalized bill — use Void (manager) which restores stock + writes return records.

## Backups
- SQLite pilot: copy `server/data/shop.db*` nightly off-machine. Postgres prod: `pg_dump` + tested restore drill before festive season.
- RPO/RTO to agree with owner; exports are sensitive (restrict to owner/manager).

## Incidents
- Rate provider down → stale badge, optional block via `BILLING_BLOCK_ON_STALE=true`.
- Messaging provider down → recipients stay `queued/failed` with error text; bounded retry, no duplicates (idempotency key).
- Rollback: `git tag` each release; frontend = static redeploy, backend = `npm start` previous tag + no destructive migrations without backup.
