import sqlite3

conn = sqlite3.connect('fo_data.db')
c = conn.cursor()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
print('Database Tables in fo_data.db:')
for t in tables:
    count = c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
    print(f"  {t}: {count} rows")

print("\n--- Recent Logs / Records ---")
for t in tables:
    cols = [d[0] for d in c.execute(f"SELECT * FROM {t} LIMIT 1").description] if c.description else []
    print(f"\nSample from {t} ({', '.join(cols)}):")
    rows = c.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 5").fetchall()
    for r in rows:
        print(" ", r)
