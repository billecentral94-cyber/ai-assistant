import sqlite3
import json
import os

artifact_path = r"C:\Users\bille\.gemini\antigravity\brain\5953e429-fdb8-430c-9615-582e40d331e7\database_viewer.html"

conn = sqlite3.connect('fo_data.db')
c = conn.cursor()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]

db_dump = {}
for t in tables:
    cols = [d[0] for d in c.execute(f"SELECT * FROM {t} LIMIT 1").description] if c.description else []
    rows = c.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 100").fetchall()
    total_count = c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
    db_dump[t] = {
        'columns': cols,
        'rows': [dict(zip(cols, r)) for r in rows],
        'total': total_count
    }

json_payload = json.dumps(db_dump, default=str)

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Artha AI — Database Inspector</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 16px;
      background: #07090e;
      color: #f8fafc;
    }}
    ::-webkit-scrollbar {{ width: 6px; height: 6px; }}
    ::-webkit-scrollbar-track {{ background: #07090e; }}
    ::-webkit-scrollbar-thumb {{ background: rgba(99, 102, 241, 0.3); border-radius: 4px; }}
  </style>
</head>
<body class="p-4 bg-[#07090e] text-[#f8fafc]">
  <div class="max-w-7xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between pb-4 border-b border-white/10 mb-4 flex-wrap gap-2">
      <div>
        <h1 class="text-xl font-bold flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
          <span>fo_data.db (Live SQLite Store)</span>
        </h1>
        <p class="text-xs text-slate-400 mt-1">
          Real-time snapshot of market options, futures, signals & analytics tables
        </p>
      </div>
      <div class="flex items-center gap-3">
        <input 
          id="searchBox" 
          type="text" 
          placeholder="Filter records..." 
          class="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 w-48"
          oninput="renderCurrentTable()"
        />
        <span class="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded border border-indigo-500/30">
          9 Tables Active
        </span>
      </div>
    </div>

    <!-- Table Tabs -->
    <div class="flex gap-2 overflow-x-auto pb-2 border-b border-white/5 mb-4 text-xs font-mono" id="tabs">
    </div>

    <!-- Stats Bar -->
    <div class="flex justify-between items-center text-xs text-slate-400 mb-2 px-1">
      <span id="tableInfo">Loading table...</span>
      <span class="font-mono text-[11px] text-slate-500">Showing up to latest 100 entries</span>
    </div>

    <!-- Data Table Container -->
    <div class="overflow-x-auto rounded-xl border border-white/10 bg-[#0d121d] shadow-2xl">
      <table class="w-full text-left text-xs font-mono border-collapse" id="dataTable">
        <thead id="tableHead" class="bg-slate-900/80 text-slate-400 border-b border-white/10 uppercase tracking-wider text-[11px] sticky top-0">
        </thead>
        <tbody id="tableBody" class="divide-y divide-white/5">
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const data = {json_payload};
    let currentTable = Object.keys(data)[0] || '';

    function init() {{
      const tabsEl = document.getElementById('tabs');
      tabsEl.innerHTML = '';

      Object.keys(data).forEach(t => {{
        const btn = document.createElement('button');
        btn.textContent = `${{t}} (${{data[t].total}})`;
        btn.className = `px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${{
          t === currentTable 
            ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-600/30' 
            : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
        }}`;
        btn.onclick = () => {{
          currentTable = t;
          document.getElementById('searchBox').value = '';
          init();
          renderCurrentTable();
        }};
        tabsEl.appendChild(btn);
      }});

      renderCurrentTable();
    }}

    function renderCurrentTable() {{
      const tData = data[currentTable];
      if (!tData) return;

      const q = document.getElementById('searchBox').value.toLowerCase().trim();
      const filtered = tData.rows.filter(row => {{
        if (!q) return true;
        return Object.values(row).some(v => String(v).toLowerCase().includes(q));
      }});

      document.getElementById('tableInfo').textContent = `Table: ${{currentTable}} · ${{filtered.length}} of ${{tData.total}} records matching`;

      const thead = document.getElementById('tableHead');
      const tbody = document.getElementById('tableBody');

      thead.innerHTML = `<tr>${{tData.columns.map(c => `<th class="px-4 py-3 font-semibold text-slate-300">${{c}}</th>`).join('')}}</tr>`;

      if (filtered.length === 0) {{
        tbody.innerHTML = `<tr><td colspan="${{tData.columns.length}}" class="px-4 py-8 text-center text-slate-500">No records found matching query</td></tr>`;
        return;
      }}

      tbody.innerHTML = filtered.map(row => {{
        return `<tr class="hover:bg-indigo-500/5 transition-colors">
          ${{tData.columns.map(c => {{
            const val = row[c];
            let color = 'text-slate-300';
            if (c === 'option_type') {{
              color = val === 'CE' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
            }} else if (c === 'strike') {{
              color = 'text-amber-300 font-semibold';
            }} else if (c === 'ltp') {{
              color = 'text-cyan-300 font-bold';
            }} else if (c === 'oi') {{
              color = 'text-indigo-300';
            }}
            return `<td class="px-4 py-2.5 whitespace-nowrap ${{color}}">${{val !== null && val !== undefined ? val : '-'}}</td>`;
          }}).join('')}}
        </tr>`;
      }}).join('');
    }}

    init();
  </script>
</body>
</html>
"""

os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
with open(artifact_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Generated standalone viewer artifact at: {artifact_path}")
