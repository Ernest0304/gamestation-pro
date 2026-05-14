#!/usr/bin/env python3
"""
Apply a Supabase Postgres migration file directly.

Reads SUPABASE_DB_PASSWORD + SUPABASE_PROJECT_REF from .env (in the same
directory or one level up). Connects to the project's direct Postgres
endpoint and executes the given SQL file.

Usage:
  python3 scripts/run_migration.py scripts/migrations/009_multi_branch.sql

Migrations should be idempotent (CREATE TABLE IF NOT EXISTS, INSERT ON
CONFLICT DO NOTHING, etc.) so re-running is safe.
"""
import os
import re
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip3 install psycopg2-binary")


def load_env():
    here = Path(__file__).resolve().parent
    for env_path in [here.parent / '.env', here / '.env']:
        if not env_path.exists():
            continue
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: run_migration.py <path-to-sql-file>")
    sql_path = Path(sys.argv[1])
    if not sql_path.exists():
        sys.exit(f"File not found: {sql_path}")

    load_env()
    pwd = os.environ.get('SUPABASE_DB_PASSWORD')
    ref = os.environ.get('SUPABASE_PROJECT_REF')
    if not pwd or not ref:
        sys.exit("Missing SUPABASE_DB_PASSWORD or SUPABASE_PROJECT_REF in .env")

    # Connection strategy:
    # 1. Try direct endpoint first (db.<ref>.supabase.co:5432) — best for DDL.
    # 2. Fall back to session pooler (aws-0-<region>.pooler.supabase.com:5432)
    #    which also supports DDL (transaction pooler on 6543 does NOT).
    region = os.environ.get('SUPABASE_REGION', 'ap-southeast-1')
    # YXD project uses newer aws-1 prefix pooler (ap-southeast-1). Direct
    # endpoint (db.<ref>.supabase.co) is disabled by Supabase on newer
    # projects — pooler only.
    candidates = [
        ("session-pooler-aws-1", f"postgresql://postgres.{ref}:{pwd}@aws-1-{region}.pooler.supabase.com:5432/postgres"),
        ("session-pooler-aws-0", f"postgresql://postgres.{ref}:{pwd}@aws-0-{region}.pooler.supabase.com:5432/postgres"),
        ("direct",               f"postgresql://postgres:{pwd}@db.{ref}.supabase.co:5432/postgres"),
    ]

    sql = sql_path.read_text()
    print(f"\n📄 Applying {sql_path.name} ({len(sql)} bytes)...")

    conn = None
    last_err = None
    for label, dsn in candidates:
        try:
            print(f"   Trying {label}...")
            conn = psycopg2.connect(dsn, connect_timeout=8)
            print(f"   ✓ Connected via {label}")
            break
        except psycopg2.OperationalError as e:
            last_err = e
            print(f"   ✗ {label} failed: {str(e).strip().splitlines()[0]}")
    if conn is None:
        sys.exit(f"All connection attempts failed. Last error: {last_err}")
    conn.autocommit = True   # let migration handle its own transactions if needed
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
            # Drain any RAISE NOTICE output
            for notice in conn.notices:
                print(f"   NOTICE: {notice.strip()}")
        print(f"✅ {sql_path.name} applied successfully.")
    except psycopg2.Error as e:
        print(f"\n❌ Failed: {e.pgerror or e}")
        sys.exit(2)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
