"""
Hedged Strategy Selector.
Selects strictly defined-risk option structures (Debit Spreads, Credit Spreads, Iron Condors)
matched to directional signal and Implied Volatility regime.
"""

from typing import Dict, Any, List


def recommend_hedged_strategy(
    direction: str,
    iv_regime: str,
    spot_price: float,
    step_size: float = 50.0
) -> Dict[str, Any]:
    """
    Selects the optimal defined-risk spread structure.

    Zero-Naked-Options Guarantee: Every recommended strategy has a strictly defined maximum loss.
    """
    direction = direction.upper()
    atm_strike = round(spot_price / step_size) * step_size

    if direction == "BULLISH":
        if iv_regime == "elevated_sell_options":
            # High IV: Sell overpriced Put premium with downside hedge
            sell_strike = atm_strike - step_size
            buy_strike = atm_strike - (step_size * 2)
            return {
                "strategy_name": "Bull Put Spread",
                "strategy_type": "Credit Spread",
                "bias": "Bullish",
                "iv_regime": iv_regime,
                "legs": [
                    {"action": "SELL", "option_type": "PE", "strike": sell_strike, "ratio": 1},
                    {"action": "BUY", "option_type": "PE", "strike": buy_strike, "ratio": 1}
                ],
                "max_loss_defined": True,
                "risk_profile": f"Max Loss capped at spread width (₹{step_size}) minus net premium collected.",
                "rationale": "High IV environment allows selling inflated Put premium; lower long leg protects against tail risk."
            }
        else:
            # Low or Normal IV: Buy cheap Call with OTM Call financing
            buy_strike = atm_strike
            sell_strike = atm_strike + (step_size * 2)
            return {
                "strategy_name": "Bull Call Spread",
                "strategy_type": "Debit Spread",
                "bias": "Bullish",
                "iv_regime": iv_regime,
                "legs": [
                    {"action": "BUY", "option_type": "CE", "strike": buy_strike, "ratio": 1},
                    {"action": "SELL", "option_type": "CE", "strike": sell_strike, "ratio": 1}
                ],
                "max_loss_defined": True,
                "risk_profile": "Max Loss strictly capped at net debit paid.",
                "rationale": "Low/Normal IV offers cheap entry; selling OTM Call dampens time decay (Theta)."
            }

    elif direction == "BEARISH":
        if iv_regime == "elevated_sell_options":
            # High IV: Sell overpriced Call premium with upside hedge
            sell_strike = atm_strike + step_size
            buy_strike = atm_strike + (step_size * 2)
            return {
                "strategy_name": "Bear Call Spread",
                "strategy_type": "Credit Spread",
                "bias": "Bearish",
                "iv_regime": iv_regime,
                "legs": [
                    {"action": "SELL", "option_type": "CE", "strike": sell_strike, "ratio": 1},
                    {"action": "BUY", "option_type": "CE", "strike": buy_strike, "ratio": 1}
                ],
                "max_loss_defined": True,
                "risk_profile": f"Max Loss capped at spread width (₹{step_size}) minus net premium collected.",
                "rationale": "High IV environment allows selling inflated Call resistance; higher long leg caps maximum risk."
            }
        else:
            # Low or Normal IV: Buy cheap Put with OTM Put financing
            buy_strike = atm_strike
            sell_strike = atm_strike - (step_size * 2)
            return {
                "strategy_name": "Bear Put Spread",
                "strategy_type": "Debit Spread",
                "bias": "Bearish",
                "iv_regime": iv_regime,
                "legs": [
                    {"action": "BUY", "option_type": "PE", "strike": buy_strike, "ratio": 1},
                    {"action": "SELL", "option_type": "PE", "strike": sell_strike, "ratio": 1}
                ],
                "max_loss_defined": True,
                "risk_profile": "Max Loss strictly capped at net debit paid.",
                "rationale": "Low/Normal IV offers cheap entry for downside protection/profit; selling lower OTM Put offsets decay."
            }

    else:
        # Neutral Direction
        if iv_regime == "elevated_sell_options":
            # Short Iron Condor for range-bound high-volatility markets
            return {
                "strategy_name": "Iron Condor",
                "strategy_type": "Defined-Risk Non-Directional",
                "bias": "Neutral",
                "iv_regime": iv_regime,
                "legs": [
                    {"action": "SELL", "option_type": "CE", "strike": atm_strike + (step_size * 2), "ratio": 1},
                    {"action": "BUY", "option_type": "CE", "strike": atm_strike + (step_size * 4), "ratio": 1},
                    {"action": "SELL", "option_type": "PE", "strike": atm_strike - (step_size * 2), "ratio": 1},
                    {"action": "BUY", "option_type": "PE", "strike": atm_strike - (step_size * 4), "ratio": 1}
                ],
                "max_loss_defined": True,
                "risk_profile": "Max Loss capped at wing width minus net credit collected.",
                "rationale": "High IV with no directional bias; profit from volatility contraction and dual-sided theta decay."
            }
        else:
            return {
                "strategy_name": "No Trade (Observation)",
                "strategy_type": "Cash Preservation",
                "bias": "Neutral",
                "iv_regime": iv_regime,
                "legs": [],
                "max_loss_defined": True,
                "risk_profile": "Zero risk (sitting in cash).",
                "rationale": "Low/Normal IV with neutral market bias offers no statistical edge. Preserve capital."
            }
