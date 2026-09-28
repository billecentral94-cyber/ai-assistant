"""
generate_mobile_dashboard.py — Standalone Mobile & Web Performance Dashboard
Compiles live_trading_state.json, equity_trading_state.json, and daily_records.json
into an institutional, dark-themed, mobile-first single-page dashboard.
Can be opened directly in any browser or served locally for remote phone access.
"""

import os
import json
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
FO_STATE_FILE = os.path.join(DIR, "live_trading_state.json")
EQ_STATE_FILE = os.path.join(DIR, "equity_trading_state.json")
HISTORY_FILE = os.path.join(DIR, "daily_records.json")
OUTPUT_HTML = os.path.join(DIR, "mobile_dashboard.html")

def load_json(filepath, default):
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default
    return default

def generate():
    fo_data = load_json(FO_STATE_FILE, {})
    eq_data = load_json(EQ_STATE_FILE, {})
    history = load_json(HISTORY_FILE, [])

    fo_cap = fo_data.get("current_capital", 5000.0)
    fo_pnl = fo_data.get("daily_pnl", 0.0)
    fo_open = fo_data.get("open_positions", [])
    fo_closed = fo_data.get("closed_trades", [])
    gates = fo_data.get("readiness_gates", {})

    eq_cap = eq_data.get("current_capital", 2500.0)
    eq_pnl = eq_data.get("daily_pnl", 0.0)
    eq_open = eq_data.get("open_positions", [])
    eq_closed = eq_data.get("closed_trades", [])
    eq_power = eq_data.get("purchasing_power", eq_cap * 5.0)

    total_cap = fo_cap + eq_cap
    total_pnl = fo_pnl + eq_pnl
    all_open = fo_open + eq_open
    all_closed = fo_closed + eq_closed

    now_str = datetime.now().strftime("%d %b %Y, %H:%M:%S IST")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Artha AI Copilot — Mobile Performance Dashboard</title>
  <style>
    :root {{
      --bg: #07090e;
      --card-bg: #0d121c;
      --border: #1a2233;
      --cyan: #00f0ff;
      --green: #00ff88;
      --red: #ff3366;
      --text: #e2e8f0;
      --text-muted: #8b9bb4;
      --yellow: #ffd700;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; }}
    body {{ background: var(--bg); color: var(--text); padding: 14px; font-size: 14px; }}
    
    .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 14px; }}
    .logo {{ font-size: 18px; font-weight: 800; color: var(--cyan); letter-spacing: 0.5px; }}
    .status-badge {{ background: #00ff8822; color: var(--green); border: 1px solid var(--green); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; }}
    
    .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }}
    .card {{ background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }}
    .card-title {{ font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }}
    .card-val {{ font-size: 20px; font-weight: 700; }}
    
    .val-green {{ color: var(--green); }}
    .val-red {{ color: var(--red); }}
    .val-cyan {{ color: var(--cyan); }}
    
    .section-title {{ font-size: 13px; font-weight: 700; text-transform: uppercase; color: var(--cyan); margin: 16px 0 8px 0; border-left: 3px solid var(--cyan); padding-left: 8px; }}
    
    table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }}
    th, td {{ padding: 8px 6px; text-align: left; border-bottom: 1px solid var(--border); }}
    th {{ color: var(--text-muted); font-size: 11px; text-transform: uppercase; }}
    
    .gate-row {{ display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; }}
    .gate-pass {{ color: var(--green); font-weight: 600; }}
    .gate-pending {{ color: var(--yellow); font-weight: 600; }}
    
    .nav-tabs {{ display: flex; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }}
    .tab-btn {{ background: none; border: none; color: var(--text-muted); font-size: 13px; font-weight: 600; padding: 6px 10px; cursor: pointer; border-radius: 4px; }}
    .tab-btn.active {{ background: #00f0ff18; color: var(--cyan); border: 1px solid #00f0ff44; }}
    
    .tab-content {{ display: none; }}
    .tab-content.active {{ display: block; }}
    
    .footer {{ text-align: center; color: var(--text-muted); font-size: 11px; margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border); }}
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="logo">ARTHA COPILOT</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">{now_str}</div>
    </div>
    <div class="status-badge">Engine Active</div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Combined Capital</div>
      <div class="card-val val-cyan">₹{total_cap:,.2f}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Baseline: ₹7,500.00</div>
    </div>
    <div class="card">
      <div class="card-title">Today's Total P&L</div>
      <div class="card-val {'val-green' if total_pnl >= 0 else 'val-red'}">{'+' if total_pnl >= 0 else ''}₹{total_pnl:,.2f}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">{len(all_closed)} Completed Trades</div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">F&O Options Micro-Vault</div>
      <div style="font-size: 16px; font-weight: 700;">₹{fo_cap:,.2f}</div>
      <div style="font-size: 11px; color: {'var(--green)' if fo_pnl >= 0 else 'var(--red)'}; margin-top: 2px;">PnL: {'+' if fo_pnl >= 0 else ''}₹{fo_pnl:,.2f} (1 Lot)</div>
    </div>
    <div class="card">
      <div class="card-title">Equity Intraday (5x MIS)</div>
      <div style="font-size: 16px; font-weight: 700;">₹{eq_cap:,.2f}</div>
      <div style="font-size: 11px; color: var(--cyan); margin-top: 2px;">Buying Power: ₹{eq_power:,.2f}</div>
    </div>
  </div>

  <div class="nav-tabs">
    <button class="tab-btn active" onclick="showTab('tab-today')">Today's Activity</button>
    <button class="tab-btn" onclick="showTab('tab-history')">Daily Records</button>
    <button class="tab-btn" onclick="showTab('tab-gates')">Readiness Gates</button>
  </div>

  <!-- TAB 1: TODAY'S ACTIVITY -->
  <div id="tab-today" class="tab-content active">
    <div class="section-title">Open Positions ({len(all_open)})</div>
    <div class="card" style="margin-bottom: 12px;">
      {'<div style="text-align:center; padding:10px; color:var(--text-muted);">Zero open positions (All squared off at 15:15 IST)</div>' if not all_open else '<table><thead><tr><th>Symbol</th><th>Dir</th><th>Qty</th><th>Entry</th><th>SL</th><th>Target</th></tr></thead><tbody>' + ''.join([f"<tr><td><b>{p.get('symbol')}</b></td><td style='color:{'var(--green)' if p.get('direction')=='BUY' else 'var(--red)'}'>{p.get('direction')}</td><td>{p.get('quantity') or p.get('qty')}</td><td>₹{p.get('entry_price')}</td><td>₹{p.get('stop_loss')}</td><td>₹{p.get('target') or p.get('target_1')}</td></tr>" for p in all_open]) + '</tbody></table>'}
    </div>

    <div class="section-title">Today's Closed Trades ({len(all_closed)})</div>
    <div class="card">
      {'<div style="text-align:center; padding:10px; color:var(--text-muted);">No closed trades yet today.</div>' if not all_closed else '<table><thead><tr><th>Trade</th><th>Exit</th><th>PnL</th><th>Reason</th></tr></thead><tbody>' + ''.join([f"<tr><td><b>{t.get('symbol')}</b><br><small style='color:var(--text-muted)'>{t.get('direction')} ({t.get('quantity') or t.get('qty')} shs)</small></td><td>₹{t.get('exit_price')}</td><td style='color:{'var(--green)' if (t.get('net_pnl') or t.get('pnl',0)) >= 0 else 'var(--red)'}; font-weight:700;'>{'+' if (t.get('net_pnl') or t.get('pnl',0)) >= 0 else ''}₹{(t.get('net_pnl') or t.get('pnl',0)):,.2f}</td><td><small>{t.get('exit_reason')}</small></td></tr>" for t in all_closed]) + '</tbody></table>'}
    </div>
  </div>

  <!-- TAB 2: HISTORICAL DAILY RECORDS -->
  <div id="tab-history" class="tab-content">
    <div class="section-title">Prior Session Archives</div>
    <div class="card">
      {'<div style="text-align:center; padding:10px; color:var(--text-muted);">No historical sessions archived yet. Tomorrow will be recorded as Day #1.</div>' if not history else '<table><thead><tr><th>Date</th><th>Trades</th><th>F&O</th><th>Equity</th><th>Net P&L</th></tr></thead><tbody>' + ''.join([f"<tr><td><b>{h.get('date')}</b></td><td>{h.get('trades_count',0)}</td><td>₹{h.get('fo_pnl',0):,.2f}</td><td>₹{h.get('equity_pnl',0):,.2f}</td><td style='color:{'var(--green)' if h.get('total_pnl',0) >= 0 else 'var(--red)'}; font-weight:700;'>{'+' if h.get('total_pnl',0) >= 0 else ''}₹{h.get('total_pnl',0):,.2f}</td></tr>" for h in reversed(history)]) + '</tbody></table>'}
    </div>
  </div>

  <!-- TAB 3: READINESS GATES -->
  <div id="tab-gates" class="tab-content">
    <div class="section-title">3 Live Readiness Gates (Live Broker Verification)</div>
    <div class="card">
      <div class="gate-row">
        <span>Gate 1: Win Rate (>= 55%)</span>
        <span class="{'gate-pass' if gates.get('gate_1_win_rate',{}).get('passed') else 'gate-pending'}">{'PASSED' if gates.get('gate_1_win_rate',{}).get('passed') else 'PENDING'} ({gates.get('gate_1_win_rate',{}).get('value',0):.1f}%)</span>
      </div>
      <div class="gate-row">
        <span>Gate 2: Profit Factor (>= 1.5)</span>
        <span class="{'gate-pass' if gates.get('gate_2_profit_factor',{}).get('passed') else 'gate-pending'}">{'PASSED' if gates.get('gate_2_profit_factor',{}).get('passed') else 'PENDING'} ({gates.get('gate_2_profit_factor',{}).get('value',0):.2f})</span>
      </div>
      <div class="gate-row">
        <span>Gate 3: Max Drawdown (<= 4.0%)</span>
        <span class="{'gate-pass' if gates.get('gate_3_max_drawdown',{}).get('passed') else 'gate-pending'}">{'PASSED' if gates.get('gate_3_max_drawdown',{}).get('passed') else 'PENDING'} ({gates.get('gate_3_max_drawdown',{}).get('value',0):.2f}%)</span>
      </div>
      <div style="margin-top: 12px; font-size: 11px; color: var(--text-muted); line-height: 1.4;">
        Requirements for full real-money live execution on Angel One. Tracks rolling 5 sessions of live market data.
      </div>
    </div>
  </div>

  <div class="footer">
    Artha AI Copilot • Dual Engine (F&O + Equity) • Auto-Generated
  </div>

  <script>
    function showTab(tabId) {{
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');
      event.target.classList.add('active');
    }}
  </script>
</body>
</html>"""

    with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Mobile dashboard updated: {OUTPUT_HTML}")

if __name__ == "__main__":
    generate()
