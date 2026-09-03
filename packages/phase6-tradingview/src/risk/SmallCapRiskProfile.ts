/**
 * packages/phase6-tradingview/src/risk/SmallCapRiskProfile.ts
 * Artha AI — Phase 6 Small-Cap Risk Profile
 *
 * Provides specialized multipliers and thresholds for small cap stocks,
 * protecting personal account funds against extreme volatility and low liquidity.
 */

export type SmallCapTier = 'SMALLCAP_100' | 'SMALLCAP_250' | 'MIDCAP_100' | 'LARGECAP';

export interface RiskMultipliers {
  bull: number;
  neutral: number;
  volatile: number;
}

export class SmallCapRiskProfile {
  // Override ATR multipliers for small-caps to require wider stop distance
  private static readonly MULTIPLIERS: Record<SmallCapTier, RiskMultipliers> = {
    SMALLCAP_100: { bull: 2.8, neutral: 1.8, volatile: 3.5 },
    SMALLCAP_250: { bull: 3.2, neutral: 2.0, volatile: 4.0 },
    MIDCAP_100:   { bull: 2.5, neutral: 1.6, volatile: 3.2 },
    LARGECAP:     { bull: 2.2, neutral: 1.3, volatile: 2.8 },
  };

  private static readonly MIN_DAILY_VOLUME: Record<SmallCapTier, number> = {
    SMALLCAP_100: 50_000,
    SMALLCAP_250: 25_000,
    MIDCAP_100:   200_000,
    LARGECAP:     1_000_000,
  };

  /**
   * Get the ATR multiplier based on small-cap tier and current market volatility state.
   */
  static getAtrMultiplier(tier: SmallCapTier, isVolatile: boolean, isBull: boolean): number {
    const multipliers = this.MULTIPLIERS[tier] || this.MULTIPLIERS.LARGECAP;
    if (isVolatile) return multipliers.volatile;
    if (isBull) return multipliers.bull;
    return multipliers.neutral;
  }

  /**
   * Get minimum required average daily volume (shares) to allow trading.
   */
  static getMinDailyVolume(tier: SmallCapTier): number {
    return this.MIN_DAILY_VOLUME[tier] || this.MIN_DAILY_VOLUME.LARGECAP;
  }

  /**
   * Enforce order size cap relative to average daily volume.
   * Order quantity should not exceed 1% of average daily volume to prevent market impact.
   */
  static isOrderSizeSafe(qty: number, avgDailyVolume: number): boolean {
    if (avgDailyVolume <= 0) return false;
    return qty <= avgDailyVolume * 0.01;
  }
}
