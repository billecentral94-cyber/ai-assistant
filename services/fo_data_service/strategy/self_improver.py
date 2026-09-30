"""
Autonomous Self-Improvement & Parameter Adaptation Engine.
Analyzes post-market execution records, identifies failure patterns (micro-stops,
giant stops, directional asymmetry, over-trading in chop), and automatically
tunes execution guardrails for subsequent market sessions.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import pytz

logger = logging.getLogger(__name__)
IST = pytz.timezone("Asia/Kolkata")

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "adaptive_parameters.json"
DAILY_RECORDS_PATH = Path(__file__).resolve().parent.parent / "daily_records.json"
LIVE_STATE_PATH = Path(__file__).resolve().parent.parent / "live_trading_state.json"

DEFAULT_ADAPTIVE_CONFIG: Dict[str, Any] = {
    "version": 1,
    "last_optimized_at": None,
    "min_stop_distance": {
        "NIFTY": 35.0,
        "BANKNIFTY": 90.0
    },
    "max_stop_distance": {
        "NIFTY": 80.0,
        "BANKNIFTY": 220.0
    },
    "min_target_distance": {
        "NIFTY": 50.0,
        "BANKNIFTY": 130.0
    },
    "cooldown_minutes_after_stop": 20,
    "min_confluence_counter_trend": 4,
    "trailing_stop_enabled": True,
    "trail_trigger_ratio": 1.2,
    "trail_lock_ratio": 0.5,
    "max_daily_fo_trades": 6,
    "reasons_applied": []
}


def load_adaptive_config() -> Dict[str, Any]:
    """Loads active adaptive configuration from JSON or returns default."""
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {**DEFAULT_ADAPTIVE_CONFIG, **data}
        except Exception as e:
            logger.warning(f"Failed to read adaptive config: {e}. Using defaults.")
    return DEFAULT_ADAPTIVE_CONFIG.copy()


def save_adaptive_config(config: Dict[str, Any]) -> None:
    """Persists updated adaptive configuration."""
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
    logger.info(f"Adaptive parameters persisted to {CONFIG_PATH}")


class SelfImprover:
    """
    Evaluates trading history, extracts operational flaws, and updates
    trading parameters autonomously.
    """

    def __init__(self):
        self.config = load_adaptive_config()

    def analyze_session(self, trades: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        """
        Runs post-mortem diagnostics on trades. If not provided, loads from today's state/daily records.
        """
        if trades is None:
            trades = self._load_recent_trades()

        fo_trades = [t for t in trades if t.get("symbol") in ("NIFTY", "BANKNIFTY")]
        if not fo_trades:
            return {"status": "no_fo_trades", "message": "No F&O trades found to evaluate."}

        # 1. Identify Micro-Stops (Distance < 20 pts or duration < 60s)
        micro_stops = []
        giant_stops = []
        bullish_trades = []
        bearish_trades = []
        rapid_reentries = []

        prev_time = None
        prev_sym = None
        prev_dir = None

        for t in fo_trades:
            sym = t.get("symbol")
            entry = float(t.get("entry_price", 0))
            exit_p = float(t.get("exit_price", 0))
            reason = t.get("exit_reason", "")
            direction = t.get("direction", "")
            pnl = float(t.get("net_pnl", 0))
            pts = abs(entry - exit_p)

            if direction == "BULLISH":
                bullish_trades.append(t)
            elif direction == "BEARISH":
                bearish_trades.append(t)

            if reason == "STOP_LOSS":
                if (sym == "BANKNIFTY" and pts < 40.0) or (sym == "NIFTY" and pts < 15.0):
                    micro_stops.append(t)
                elif (sym == "BANKNIFTY" and pts > 250.0) or (sym == "NIFTY" and pts > 120.0):
                    giant_stops.append(t)

            # Check rapid re-entry (< 60 seconds between trades)
            entry_t = t.get("entry_time")
            if entry_t and prev_time:
                try:
                    dt_curr = datetime.fromisoformat(entry_t)
                    dt_prev = datetime.fromisoformat(prev_time)
                    gap_seconds = (dt_curr - dt_prev).total_seconds()
                    if 0 < gap_seconds < 120 and sym == prev_sym and direction == prev_dir:
                        rapid_reentries.append((t, gap_seconds))
                except Exception:
                    pass
            prev_time = entry_t
            prev_sym = sym
            prev_dir = direction

        # Win rate breakdown by direction
        bull_wins = sum(1 for t in bullish_trades if float(t.get("net_pnl", 0)) > 0)
        bear_wins = sum(1 for t in bearish_trades if float(t.get("net_pnl", 0)) > 0)
        bull_wr = (bull_wins / len(bullish_trades) * 100.0) if bullish_trades else 0.0
        bear_wr = (bear_wins / len(bearish_trades) * 100.0) if bearish_trades else 0.0

        # Formulate adaptations
        reasons = []
        new_config = dict(self.config)

        # Fix 1: Micro-stops detected
        if len(micro_stops) >= 2:
            reasons.append(
                f"Detected {len(micro_stops)} micro-stop whipsaws (loss in <40 pts). "
                f"Enforced minimum stop cushion: Bank Nifty >= 90 pts, Nifty >= 35 pts."
            )
            new_config["min_stop_distance"]["BANKNIFTY"] = max(new_config["min_stop_distance"]["BANKNIFTY"], 90.0)
            new_config["min_stop_distance"]["NIFTY"] = max(new_config["min_stop_distance"]["NIFTY"], 35.0)

        # Fix 2: Giant stop blowout detected
        if len(giant_stops) >= 1:
            reasons.append(
                f"Detected {len(giant_stops)} extreme stop blowout(s) (>250 Bank Nifty / >120 Nifty pts). "
                f"Capped maximum stop distance: Bank Nifty <= 200 pts, Nifty <= 75 pts."
            )
            new_config["max_stop_distance"]["BANKNIFTY"] = 200.0
            new_config["max_stop_distance"]["NIFTY"] = 75.0

        # Fix 3: Rapid re-entries detected
        if len(rapid_reentries) >= 1:
            reasons.append(
                f"Detected {len(rapid_reentries)} rapid-fire re-entry churn(s) (<2 mins apart). "
                f"Set post-loss cooldown to 20 minutes and capped max daily F&O trades to 6."
            )
            new_config["cooldown_minutes_after_stop"] = 20
            new_config["max_daily_fo_trades"] = 6

        # Fix 4: Directional Asymmetry (e.g. Bearish 100% win, Bullish 0% win)
        if len(bearish_trades) >= 3 and len(bullish_trades) >= 3:
            if bear_wr >= 75.0 and bull_wr <= 25.0:
                reasons.append(
                    f"Strong directional skew: Bearish win rate was {bear_wr:.1f}% vs Bullish {bull_wr:.1f}%. "
                    f"Counter-trend Bullish setups now require strict 4/5 confluence + EMA confirmation."
                )
                new_config["min_confluence_counter_trend"] = 4
            elif bull_wr >= 75.0 and bear_wr <= 25.0:
                reasons.append(
                    f"Strong directional skew: Bullish win rate was {bull_wr:.1f}% vs Bearish {bear_wr:.1f}%. "
                    f"Counter-trend Bearish setups now require strict 4/5 confluence + EMA confirmation."
                )
                new_config["min_confluence_counter_trend"] = 4

        # Fix 5: Ensure trailing stops are active
        new_config["trailing_stop_enabled"] = True
        new_config["last_optimized_at"] = datetime.now(IST).isoformat()
        new_config["reasons_applied"] = reasons

        # Save the new parameters
        save_adaptive_config(new_config)
        self.config = new_config

        return {
            "status": "success",
            "micro_stops_count": len(micro_stops),
            "giant_stops_count": len(giant_stops),
            "rapid_reentries_count": len(rapid_reentries),
            "bullish_win_rate": round(bull_wr, 1),
            "bearish_win_rate": round(bear_wr, 1),
            "reasons": reasons,
            "updated_config": new_config
        }

    def _load_recent_trades(self) -> List[Dict[str, Any]]:
        """Loads closed trades from live state or daily records."""
        if LIVE_STATE_PATH.exists():
            try:
                with open(LIVE_STATE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    trades = data.get("closed_trades", [])
                    if trades:
                        return trades
            except Exception:
                pass

        if DAILY_RECORDS_PATH.exists():
            try:
                with open(DAILY_RECORDS_PATH, "r", encoding="utf-8") as f:
                    records = json.load(f)
                    if records:
                        return records[-1].get("trades", [])
            except Exception:
                pass

        return []

    def format_report(self, analysis: Dict[str, Any]) -> str:
        """Generates a clean diagnostic text report for logs and notifications."""
        reasons = analysis.get("reasons", [])
        cfg = analysis.get("updated_config", self.config)
        min_stop = cfg.get("min_stop_distance", {})
        max_stop = cfg.get("max_stop_distance", {})

        lines = [
            "=====================================================",
            "  SELF-IMPROVEMENT ENGINE: POST-MARKET DIAGNOSTIC",
            "=====================================================",
            f"- Micro-Stop Whipsaws Detected: {analysis.get('micro_stops_count', 0)}",
            f"- Giant Stop Blowouts Detected: {analysis.get('giant_stops_count', 0)}",
            f"- Rapid Churn Re-entries: {analysis.get('rapid_reentries_count', 0)}",
            f"- Directional Breakdown: Bullish {analysis.get('bullish_win_rate', 0)}% WR | Bearish {analysis.get('bearish_win_rate', 0)}% WR",
            "",
            "ADAPTIVE PARAMETERS LOCKED FOR NEXT SESSION:",
            f"- Bank Nifty Stop Distance: Min {min_stop.get('BANKNIFTY')} pts | Max {max_stop.get('BANKNIFTY')} pts",
            f"- Nifty Stop Distance: Min {min_stop.get('NIFTY')} pts | Max {max_stop.get('NIFTY')} pts",
            f"- Post-Loss Cooldown Timer: {cfg.get('cooldown_minutes_after_stop')} minutes",
            f"- Counter-Trend Confluence Threshold: {cfg.get('min_confluence_counter_trend')}/5",
            f"- Max Daily F&O Trades Cap: {cfg.get('max_daily_fo_trades')}",
            f"- Trailing Profit Ratchet: Active (Breakeven after {cfg.get('trail_trigger_ratio')}x R)",
            "-----------------------------------------------------",
            "LESSONS LEARNED & APPLIED:"
        ]
        for r in reasons:
            lines.append(f"  [FIX] {r}")
        if not reasons:
            lines.append("  [OK] Operating within optimal tolerances. No structural anomalies detected.")

        return "\n".join(lines)
