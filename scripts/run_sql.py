#!/usr/bin/env python3
"""
Run a SQL file against the Supabase Postgres database.

Usage:
  python3 scripts/run_sql.py <path_to_sql_file>

Loads connection info from gaming-cafe/.env:
  SUPABASE_DB_PASSWORD=...
  SUPABASE_PROJECT_REF=...

Tries Session Pooler hostnames (IPv4-compatible) for ap-southeast-1.
"""
import os
import sys
from pathlib import Path
import psycopg2


def load_env():
    env_path = Path(__file__).parent.parent / '.env'
    env = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env


def connect(env):
    password = env.get('SUPABASE_DB_PASSWORD')
    project_ref = env.get('SUPABASE_PROJECT_REF')
    if not password or not project_ref:
        sys.exit('Missing SUPABASE_DB_PASSWORD or SUPABASE_PROJECT_REF in .env')

    # Try session pooler hostnames (IPv4-compatible). Singapore region.
    pooler_hosts = [
        f'aws-0-ap-southeast-1.pooler.supabase.com',
        f'aws-1-ap-southeast-1.pooler.supabase.com',
    ]
    last_err = None
    for host in pooler_hosts:
        try:
            conn = psycopg2.connect(
                host=host,
                port=5432,
                dbname='postgres',
                user=f'postgres.{project_ref}',
                password=password,
                sslmode='require',
                connect_timeout=10,
            )
            print(f'✓ Connected via {host}', file=sys.stderr)
            return conn
        except Exception as e:
            last_err = e
            print(f'✗ {host}: {e}', file=sys.stderr)

    # Fallback: direct connection (IPv6 only, may fail on IPv4)
    try:
        conn = psycopg2.connect(
            host=f'db.{project_ref}.supabase.co',
            port=5432,
            dbname='postgres',
            user='postgres',
            password=password,
            sslmode='require',
            connect_timeout=10,
        )
        print(f'✓ Connected via direct connection', file=sys.stderr)
        return conn
    except Exception as e:
        sys.exit(f'All connection attempts failed. Last error: {e}')


def main():
    if len(sys.argv) < 2:
        sys.exit('Usage: python3 scripts/run_sql.py <sql_file>')

    sql_path = Path(sys.argv[1])
    if not sql_path.exists():
        sys.exit(f'File not found: {sql_path}')

    sql = sql_path.read_text()
    env = load_env()
    conn = connect(env)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        cur.execute(sql)
        print(f'✓ Executed {sql_path.name}', file=sys.stderr)
        # Print any notices
        for notice in conn.notices:
            print(f'  {notice.strip()}', file=sys.stderr)
    except Exception as e:
        sys.exit(f'SQL execution failed: {e}')
    finally:
        cur.close()
        conn.close()


if __name__ == '__main__':
    main()
