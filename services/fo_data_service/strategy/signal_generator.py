"""
Confluence-Based Signal Generator.
Combines Futures Buildup, Open Interest Walls, PCR Dynamics, Max Pain, and IV Regimes
to produce institutional trade setups with defined risk.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from dataclasses import dataclass, field

from .trade_recommender import recommend_hedged_strategy
from .risk_manager import RiskManager


@dataclass
class Signal:
    """Represents a generated trade recommendation."""
    symbol: str
    direction: str                          # 'BULLISH' | 'BEARISH' | 'NEUTRAL'
    confluence_score: int                   # 0 to 5
    confluences_triggered: List[str]
    entry_price: float
    stop_loss: float
    target_1: float
    target_2: float
    risk_reward_ratio: float
    recommended_strategy: Dict[str, Any]
    position_size: Dict[str, Any]
    is_actionable: bool                     # True if confluence >= 3
    timestamp: datetime
    notes: str = ""


class SignalGenerator:
    """
    Generates rule-based signals requiring >= 3 independent confirmations.
    """

    def __init__(self, risk_manager: Optional[RiskManager] = None):
        self.risk_manager = risk_manager or RiskManager()

    def generate_signal(
        self,
        underlying: str,
        spot_price: float,
        oi_walls: List[Dict[str, Any]],
        pcr_data: Dict[str, Any],
        buildup_data: Dict[str, Any],
        iv_data: Dict[str, Any],
        max_pain_data: Dict[str, Any],
        account_capital: float = 500000.0,
        step_size: float = 50.0,
        lot_size: int = 25,
        timestamp: Optional[datetime] = None
    ) -> Signal:
        """
        Evaluates 5 confluence factors and constructs a structured Signal.
        """
        now = timestamp or datetime.now()

        # Extract analytics inputs
        buildup_type = buildup_data.get("buildup_type", "Neutral")
        overall_pcr = float(pcr_data.get("overall_pcr", 1.0))
        pcr_trend = pcr_data.get("pcr_trend", "flat")
        sentiment_zone = pcr_data.get("sentiment_zone", "neutral")
        max_pain_strike = float(max_pain_data.get("max_pain_strike", spot_price))
        iv_percentile = float(iv_data.get("iv_percentile", 50.0))
        iv_regime = iv_data.get("iv_regime", "normal")

        ce_walls = [w for w in oi_walls if w.get("option_type") == "CE"]
        pe_walls = [w for w in oi_walls if w.get("option_type") == "PE"]

        # 1. Evaluate Bullish Confluences
        bullish_reasons = []

        # A. Futures Buildup
        if buildup_type in ("Long Buildup", "Short Covering"):
            bullish_reasons.append(f"Futures: {buildup_type}")

        # B. PCR Bullish confirmation
        if overall_pcr >= 1.0 or pcr_trend == "rising" or sentiment_zone == "oversold_bullish":
            bullish_reasons.append(f"PCR: {overall_pcr} ({pcr_trend}, {sentiment_zone})")

        # C. Max Pain confirmation (Spot at or above Max Pain)
        if spot_price >= max_pain_strike:
            bullish_reasons.append(f"Price ({spot_price:.1f}) >= Max Pain ({max_pain_strike:.1f})")

        # D. OI Put Wall support below or near spot
        pe_strikes_below = [w.get("strike", 0) for w in pe_walls if w.get("strike", 0) <= spot_price + step_size]
        if len(pe_strikes_below) > 0:
            bullish_reasons.append(f"Major Put Wall support near/below spot (Peak: {pe_strikes_below[0]})")

        # E. IV not overpriced
        if iv_percentile <= 60.0:
            bullish_reasons.append(f"IV Percentile reasonable ({iv_percentile:.1f}%)")

        # 2. Evaluate Bearish Confluences
        bearish_reasons = []

        # A. Futures Buildup
        if buildup_type in ("Short Buildup", "Long Unwinding"):
            bearish_reasons.append(f"Futures: {buildup_type}")

        # B. PCR Bearish confirmation
        if overall_pcr <= 0.85 or pcr_trend == "falling" or sentiment_zone == "overbought_bearish":
            bearish_reasons.append(f"PCR: {overall_pcr} ({pcr_trend}, {sentiment_zone})")

        # C. Max Pain confirmation (Spot below Max Pain)
        if spot_price <= max_pain_strike:
            bearish_reasons.append(f"Price ({spot_price:.1f}) <= Max Pain ({max_pain_strike:.1f})")

        # D. OI Call Wall resistance above or near spot
        ce_strikes_above = [w.get("strike", 0) for w in ce_walls if w.get("strike", 0) >= spot_price - step_size]
        if len(ce_strikes_above) > 0:
            bearish_reasons.append(f"Major Call Wall ceiling near/above spot (Peak: {ce_strikes_above[0]})")

        # E. IV not overpriced
        if iv_percentile <= 60.0:
            bearish_reasons.append(f"IV Percentile reasonable ({iv_percentile:.1f}%)")

        # 3. Determine Overall Direction & Confluence
        bullish_score = len(bullish_reasons)
        bearish_score = len(bearish_reasons)

        if bullish_score >= 3 and bullish_score > bearish_score:
            direction = "BULLISH"
            confluence_score = bullish_score
            confluences = bullish_reasons
            is_actionable = True
        elif bearish_score >= 3 and bearish_score > bullish_score:
            direction = "BEARISH"
            confluence_score = bearish_score
            confluences = bearish_reasons
            is_actionable = True
        else:
            direction = "NEUTRAL"
            confluence_score = max(bullish_score, bearish_score)
            confluences = bullish_reasons if bullish_score >= bearish_score else bearish_reasons
            is_actionable = False

        # 4. Entry, Stop Loss & Targets
        entry_price = spot_price
        if direction == "BULLISH":
            # SL placed below nearest strong Put wall or 2 steps down
            pe_strikes_under = [w.get("strike") for w in pe_walls if w.get("strike") < spot_price]
            stop_loss = pe_strikes_under[0] if pe_strikes_under else (spot_price - step_size * 2)
            # Targets based on Call walls above
            ce_strikes_over = [w.get("strike") for w in ce_walls if w.get("strike") > spot_price]
            target_1 = ce_strikes_over[0] if ce_strikes_over else (spot_price + step_size * 3)
            target_2 = ce_strikes_over[1] if len(ce_strikes_over) > 1 else (spot_price + step_size * 5)
        elif direction == "BEARISH":
            # SL placed above nearest strong Call wall or 2 steps up
            ce_strikes_over = [w.get("strike") for w in ce_walls if w.get("strike") > spot_price]
            stop_loss = ce_strikes_over[0] if ce_strikes_over else (spot_price + step_size * 2)
            # Targets based on Put walls below
            pe_strikes_under = [w.get("strike") for w in pe_walls if w.get("strike") < spot_price]
            target_1 = pe_strikes_under[0] if pe_strikes_under else (spot_price - step_size * 3)
            target_2 = pe_strikes_under[1] if len(pe_strikes_under) > 1 else (spot_price - step_size * 5)
        else:
            stop_loss = spot_price - step_size * 2
            target_1 = spot_price + step_size * 2
            target_2 = spot_price + step_size * 4

        risk_distance = abs(entry_price - stop_loss)
        reward_distance = abs(target_1 - entry_price)
        risk_reward_ratio = round(reward_distance / risk_distance, 2) if risk_distance > 0 else 1.0

        # 5. Hedged Strategy Recommendation
        strategy_rec = recommend_hedged_strategy(
            direction=direction,
            iv_regime=iv_regime,
            spot_price=spot_price,
            step_size=step_size
        )

        # 6. Capital-Guarded Position Sizing
        # Max loss per lot in defined spread: roughly spread width * lot_size (e.g. 100 pt spread * 25 = ₹2,500)
        spread_width = step_size * 2
        estimated_max_loss_per_lot = spread_width * lot_size * 0.60  # net debit or max loss
        position_size = self.risk_manager.calculate_position_size(
            account_capital=account_capital,
            max_loss_per_lot=estimated_max_loss_per_lot,
            lot_size=lot_size
        )

        notes = (
            f"{direction} setup with {confluence_score}/5 confirmations. "
            f"Strategy: {strategy_rec['strategy_name']}. "
            f"Max risk strictly capped at ₹{position_size['max_risk_ceiling_rupees']} ({self.risk_manager.max_risk_per_trade_pct}%)."
        )

        return Signal(
            symbol=underlying,
            direction=direction,
            confluence_score=confluence_score,
            confluences_triggered=confluences,
            entry_price=round(entry_price, 2),
            stop_loss=round(stop_loss, 2),
            target_1=round(target_1, 2),
            target_2=round(target_2, 2),
            risk_reward_ratio=risk_reward_ratio,
            recommended_strategy=strategy_rec,
            position_size=position_size,
            is_actionable=is_actionable,
            timestamp=now,
            notes=notes
        )
