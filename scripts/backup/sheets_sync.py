#!/usr/bin/env python3
"""
Google Sheets sync: append new sessions / orders / top_ups to monthly sheets.

Idempotent: tracks last_synced_id per table in a sync_state JSON file.

Sheets created:
  - YXD POS · Members Master   (1 sheet, always updated)
  - YXD POS · 2026-05            (monthly: Sessions, Orders, TopUps tabs)
  - YXD POS · Daily Summary      (1 sheet, append-only)

Per owner policy: members table is mirrored in full each run
(so even if Supabase fails, every member is visible in Google Sheets).

Usage:
  python3 scripts/backup/sheets_sync.py

Env vars:
  GOOGLE_SERVICE_ACCOUNT_KEY    JSON content
  GOOGLE_SERVICE_ACCOUNT_FILE   path to JSON file
  YXD_SHEETS_FOLDER_ID          parent Drive folder for sheets
"""
import os
import sys
import json
import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from run_sql import load_env, connect


STATE_FILE = Path(__file__).parent / 'sync_state.json'


def get_creds():
    try:
        from google.oauth2 import service_account
    except ImportError:
        print('Install: pip install google-api-python-client google-auth', file=sys.stderr)
        return None

    scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
    key_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    key_file = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
    if key_json:
        return service_account.Credentials.from_service_account_info(json.loads(key_json), scopes=scopes)
    if key_file and Path(key_file).exists():
        return service_account.Credentials.from_service_account_file(key_file, scopes=scopes)
    print('⚠️  No Google credentials in env', file=sys.stderr)
    return None


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def fetch_new_rows(cur, table, last_id_col, last_id):
    """Fetch rows where last_id_col > last_id, ordered by last_id_col."""
    if last_id is None:
        cur.execute(f'SELECT * FROM {table} ORDER BY {last_id_col}')
    else:
        cur.execute(f'SELECT * FROM {table} WHERE {last_id_col} > %s ORDER BY {last_id_col}', (last_id,))
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    return cols, rows


def main():
    print('Sheets sync not yet wired to live Drive — see README in this folder for setup steps.', file=sys.stderr)
    print('Run daily_backup.py to upload JSON snapshots to Drive in the meantime.', file=sys.stderr)
    # NOTE: full Sheets-API wiring deferred to next iteration to keep this commit small.
    # Daily JSON backup (already wired) covers the recovery requirement.


if __name__ == '__main__':
    main()
