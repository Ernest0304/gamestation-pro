#!/usr/bin/env python3
"""Run a SELECT query and print results as table."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from run_sql import load_env, connect


def main():
    if len(sys.argv) < 2:
        sys.exit('Usage: python3 scripts/query.py "SELECT ..." OR <sql_file>')

    arg = sys.argv[1]
    if Path(arg).exists():
        sql = Path(arg).read_text()
    else:
        sql = arg

    env = load_env()
    conn = connect(env)
    cur = conn.cursor()
    cur.execute(sql)
    cols = [d[0] for d in cur.description] if cur.description else []
    rows = cur.fetchall() if cur.description else []

    if cols:
        print(' | '.join(cols))
        print('-' * 80)
        for r in rows:
            print(' | '.join(str(v) for v in r))
        print(f'\n({len(rows)} rows)')
    else:
        print('OK (no result set)')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
