#!/usr/bin/env python3
"""
Daily backup: snapshot all critical tables → JSON files → Google Drive.

Per owner policy:
- Member data MUST be preserved forever (can be restored anytime).
- Sessions / orders / top_ups retained for ≥ 35 days on Drive.
- Settings change history (audit_log) retained forever.

Usage:
  python3 scripts/backup/daily_backup.py [YYYY-MM-DD]   # default: today

Run via GitHub Actions on a daily schedule. See .github/workflows/daily-backup.yml.
"""
import os
import sys
import json
import datetime
from pathlib import Path

# Connect via existing helper
sys.path.insert(0, str(Path(__file__).parent.parent))
from run_sql import load_env, connect


TABLES = [
    'settings',
    'stations',
    'members',          # PRESERVED FOREVER (per owner policy)
    'sessions',
    'top_ups',
    'orders',
    'order_items',
    'menu_categories',
    'menu_items',
    'audit_log',
]


def table_to_json(cur, table):
    cur.execute(f'SELECT * FROM {table}')
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    return [
        {col: _safe(val) for col, val in zip(cols, row)}
        for row in rows
    ]


def _safe(v):
    """Make JSON-serializable."""
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, datetime.timedelta):
        return v.total_seconds()
    if hasattr(v, 'hex') and not isinstance(v, str):  # UUID, bytes
        return str(v)
    return v


def make_snapshot(out_dir: Path, snapshot_date: str):
    env = load_env()
    conn = connect(env)
    cur = conn.cursor()

    snapshot = {
        'snapshot_date': snapshot_date,
        'generated_at': datetime.datetime.utcnow().isoformat() + 'Z',
        'version': 1,
    }
    for table in TABLES:
        try:
            snapshot[table] = table_to_json(cur, table)
        except Exception as e:
            snapshot[table] = {'__error__': str(e)}
            print(f'  ⚠️  {table}: {e}', file=sys.stderr)

    cur.close()
    conn.close()

    # Write full snapshot
    out_dir.mkdir(parents=True, exist_ok=True)
    full_path = out_dir / f'yxd_full_{snapshot_date}.json'
    with full_path.open('w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2, default=str)
    print(f'✓ Full snapshot: {full_path} ({full_path.stat().st_size:,} bytes)', file=sys.stderr)

    # Write a separate members-only file (owner policy: always preserve)
    members_path = out_dir / f'yxd_members_only_{snapshot_date}.json'
    with members_path.open('w', encoding='utf-8') as f:
        json.dump({
            'snapshot_date': snapshot_date,
            'generated_at': snapshot['generated_at'],
            'members': snapshot.get('members', []),
            'top_ups': snapshot.get('top_ups', []),
        }, f, ensure_ascii=False, indent=2, default=str)
    print(f'✓ Members snapshot: {members_path}', file=sys.stderr)

    return full_path, members_path


def upload_to_drive(file_paths, drive_folder_id=None):
    """
    Upload to Google Drive using a service account.
    Reads GOOGLE_SERVICE_ACCOUNT_KEY env var (JSON string) or path from
    GOOGLE_SERVICE_ACCOUNT_FILE.

    Skips silently if no credentials set (so local runs don't fail).
    """
    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        from google.oauth2 import service_account
    except ImportError:
        print('⚠️  google-api-python-client not installed — skip Drive upload', file=sys.stderr)
        print('   pip install google-api-python-client google-auth', file=sys.stderr)
        return

    key_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_KEY')
    key_file = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
    if key_json:
        creds = service_account.Credentials.from_service_account_info(
            json.loads(key_json),
            scopes=['https://www.googleapis.com/auth/drive.file']
        )
    elif key_file and Path(key_file).exists():
        creds = service_account.Credentials.from_service_account_file(
            key_file,
            scopes=['https://www.googleapis.com/auth/drive.file']
        )
    else:
        print('⚠️  No Google credentials — skip Drive upload', file=sys.stderr)
        return

    drive = build('drive', 'v3', credentials=creds)
    drive_folder_id = drive_folder_id or os.environ.get('YXD_BACKUP_FOLDER_ID')

    for p in file_paths:
        meta = {'name': p.name}
        if drive_folder_id:
            meta['parents'] = [drive_folder_id]
        media = MediaFileUpload(str(p), mimetype='application/json', resumable=False)
        try:
            f = drive.files().create(body=meta, media_body=media, fields='id, name').execute()
            print(f"✓ Uploaded {f['name']} (Drive id: {f['id']})", file=sys.stderr)
        except Exception as e:
            print(f"✗ Drive upload failed for {p.name}: {e}", file=sys.stderr)


def cleanup_old(out_dir: Path, keep_days=35):
    """Remove local files older than keep_days, EXCEPT members_only_* (keep forever)."""
    cutoff = datetime.datetime.now() - datetime.timedelta(days=keep_days)
    removed = 0
    for f in out_dir.glob('yxd_*.json'):
        # Never delete members_only files — owner policy
        if 'members_only' in f.name:
            continue
        mtime = datetime.datetime.fromtimestamp(f.stat().st_mtime)
        if mtime < cutoff:
            f.unlink()
            removed += 1
    if removed:
        print(f'✓ Cleaned up {removed} old backup file(s)', file=sys.stderr)


def main():
    snapshot_date = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()

    out_dir = Path(__file__).parent / 'output'
    full_path, members_path = make_snapshot(out_dir, snapshot_date)

    upload_to_drive([full_path, members_path])
    cleanup_old(out_dir, keep_days=35)

    print(f'\n✓ Backup complete for {snapshot_date}', file=sys.stderr)


if __name__ == '__main__':
    main()
