# YXD Backup System

Two layers of backup to satisfy the owner's policy:

> **会员信息一定要有备份并且需要一直保存在机子内，不能消失，除非我们自己删除**
> **备份至少 1 个月前，自动上传到 Drive，能用软件或任何方式打开来查询**

## Layer 1 · Daily JSON snapshot to Google Drive (this folder)

`daily_backup.py` runs once a day (via GitHub Actions) and:

1. Connects to Supabase via Session Pooler (uses `.env`'s `SUPABASE_DB_PASSWORD`).
2. Exports every table to a single `yxd_full_YYYY-MM-DD.json` file.
3. Exports a separate `yxd_members_only_YYYY-MM-DD.json` (members + top_ups).
4. Uploads both to a Drive folder.
5. Deletes local files older than 35 days — **but never deletes `members_only_*`** (kept forever).

### Setup

```bash
pip3 install google-api-python-client google-auth psycopg2-binary
```

Create a Google service account, give it editor access to a Drive folder, then set:

```bash
export GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/service-account-key.json
export YXD_BACKUP_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUv   # the Drive folder ID
```

### Automated daily run (GitHub Actions) — LIVE

`.github/workflows/daily-backup.yml` runs `daily_backup.py` every day at
**02:00 SGT** (18:00 UTC, after the 01:00 close) and on manual trigger
(Actions tab → Daily DB Backup → Run workflow).

Every run uploads the snapshot as a **GitHub Actions artifact** (90-day
retention) — so there is an off-site backup the moment you add the two
required secrets, even before Google Drive is wired up.

**Required repository secrets** (GitHub repo → Settings → Secrets and
variables → Actions → New repository secret):

| Secret | Required | Value |
|--------|----------|-------|
| `SUPABASE_DB_PASSWORD` | ✅ yes | from `gaming-cafe/.env` |
| `SUPABASE_PROJECT_REF`  | ✅ yes | from `gaming-cafe/.env` (`oixcig…`) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | optional | service-account JSON (whole file contents) — enables Drive upload |
| `YXD_BACKUP_FOLDER_ID` | optional | target Drive folder ID |

Without the two Google secrets the backup still runs and is retained as a
GitHub artifact; add them later to also push to Drive.

The backup auto-discovers **every** table in the public schema at runtime
(`discover_tables`) — it can never silently miss a new table again.

Run manually:
```bash
python3 scripts/backup/daily_backup.py            # today
python3 scripts/backup/daily_backup.py 2026-05-13 # specific date
```

### What it produces

```
/YXD-Backups/ (Drive folder)
  yxd_full_2026-05-14.json          ← retained 35 days then auto-deleted
  yxd_members_only_2026-05-14.json  ← retained forever (manual delete only)
  yxd_full_2026-05-13.json
  yxd_members_only_2026-05-13.json
  ...
```

Each JSON is readable in any text editor, parseable by Excel/Sheets/Python/anything.

## Layer 2 · Real-time sync to Google Sheets (TODO — next iteration)

`sheets_sync.py` is scaffolded. The plan:

1. Set up Supabase **Database Webhooks** (Dashboard → Database → Webhooks):
   - On `INSERT` to `sessions` / `orders` / `top_ups`: POST to Apps Script web app URL
   - On `INSERT/UPDATE` to `members`: POST to Apps Script web app URL
2. Apps Script web app receives the payload and appends to a monthly sheet:
   - `YXD POS - Members Master` (always up to date — every member, including archived)
   - `YXD POS - Sessions 2026-05` (a new sheet each month)
   - `YXD POS - Orders 2026-05`
   - `YXD POS - TopUps 2026-05`
   - `YXD POS - Daily Summary` (one row per day)

This gives staff/accountant instant access via any device. Postponed to next sprint.

## Manual restore (if Supabase ever fails)

1. Spin up a fresh Supabase project.
2. Run all `migrations/*.sql` in order.
3. Use `restore.py` (TODO) — for now, a Python REPL one-liner:

```python
import json, psycopg2
data = json.load(open('yxd_full_2026-05-14.json'))
# … INSERT each table's rows
```

The members JSON alone is enough to reconstruct member accounts and balances at the snapshot moment.
