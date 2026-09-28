import sqlite3
import json

conn = sqlite3.connect('fo_data.db')
c = conn.cursor()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
print(f"Database Tables in fo_data.db ({len(tables)} tables):")

output = {}

for t in tables:
    count = c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
    print(f"Table: {t} -> {count} rows")
    if count > 0:
        cols = [d[0] for d in c.execute(f"SELECT * FROM {t} LIMIT 1").description]
        rows = c.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 3").fetchall()
        output[t] = {
            "total_rows": count,
            "sample_rows": [dict(zip(cols, r)) for r in rows]
        }

with open("db_preview.json", "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, default=str)

print("\nDetailed snapshot written to services/fo_data_service/db_preview.json")
