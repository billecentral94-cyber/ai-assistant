"""
Daily Audit Report Generator and Publisher.
Formats EOD reconciliation data into human-readable tables and persists audit summaries.
"""

from datetime import datetime, date
from typing import Dict, Any, Optional
import pytz

from audit.gap_detector import EODGapDetector
from db.repository import DataRepository

IST = pytz.timezone("Asia/Kolkata")


class DailyAuditReporter:
    """
    Generates structured markdown and text audit reports for EOD review.
    """

    def __init__(self, gap_detector: Optional[EODGapDetector] = None, repo: Optional[DataRepository] = None, engine=None):
        self.engine = engine
        self.repo = repo or DataRepository(engine=engine)
        self.gap_detector = gap_detector or EODGapDetector(repo=self.repo, engine=engine)

    def generate_report(self, trade_date: date, underlyings: Optional[list] = None) -> Dict[str, Any]:
        """
        Executes gap reconciliation and produces a formatted markdown report.
        """
        recon = self.gap_detector.reconcile_day(trade_date=trade_date, underlyings=underlyings)

        if not recon.get("is_trading_day"):
            return {
                "trade_date": trade_date.isoformat(),
                "report_text": f"# Daily F&O Data Retrieval Audit — {trade_date.isoformat()}\n\nMarket was CLOSED (Weekend or NSE Holiday). No retrieval cycles scheduled.",
                "overall_severity": "OK",
                "recon_data": recon
            }

        overall_severity = "OK"
        total_expected = 0
        total_captured = 0
        total_missing = 0
        total_fallback = 0

        lines = [
            f"# Daily F&O Data Retrieval Audit — {trade_date.isoformat()}",
            f"**Audit Execution Time**: {datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')}",
            "",
            "## 1. Summary by Data Channel",
            "",
            "| Underlying | Data Type | Expected Slots | Captured Slots | Coverage | Missing Slots | Fallback Cycles | Severity |",
            "|---|---|---|---|---|---|---|---|",
        ]

        for sym, channels in recon["underlyings"].items():
            for d_type, stats in channels.items():
                total_expected += stats["expected_slots"]
                total_captured += stats["captured_slots"]
                total_missing += stats["missing_slots_count"]
                total_fallback += stats["fallback_cycles"]

                if stats["severity"] == "CRITICAL" or overall_severity == "CRITICAL":
                    overall_severity = "CRITICAL"
                elif stats["severity"] == "MAJOR" and overall_severity != "CRITICAL":
                    overall_severity = "MAJOR"
                elif stats["severity"] == "MINOR" and overall_severity not in ("CRITICAL", "MAJOR"):
                    overall_severity = "MINOR"

                lines.append(
                    f"| **{sym}** | {d_type} | {stats['expected_slots']} | {stats['captured_slots']} | "
                    f"{stats['coverage_pct']}% | {stats['missing_slots_count']} | {stats['fallback_cycles']} | **{stats['severity']}** |"
                )

        lines.extend([
            "",
            "## 2. Overall Health & Gap Analysis",
            f"- **Overall Severity**: **{overall_severity}**",
            f"- **Total Expected Snapshots**: {total_expected}",
            f"- **Total Successfully Captured**: {total_captured} ({round(total_captured/total_expected*100, 2) if total_expected else 100}%)",
            f"- **Total Gaps Detected**: {total_missing}",
            f"- **Total Fallback Invocations**: {total_fallback}",
            ""
        ])

        # Detail any missing intervals
        gap_details = []
        for sym, channels in recon["underlyings"].items():
            for d_type, stats in channels.items():
                if stats["missing_timestamps"]:
                    gap_details.append(f"### {sym} ({d_type}) Missing Intervals:")
                    for ts in stats["missing_timestamps"]:
                        gap_details.append(f"- `{ts}`")

        if gap_details:
            lines.append("## 3. Detailed Missing Interval Log")
            lines.extend(gap_details)
        else:
            lines.append("## 3. Detailed Missing Interval Log")
            lines.append("Zero gaps detected. 100% complete snapshot continuity achieved.")

        report_text = "\n".join(lines)

        # Log EOD reconciliation to retrieval_audit_log
        self.repo.record_audit(
            run_timestamp=datetime.now(IST),
            data_type="eod_reconciliation",
            underlying="ALL",
            rows_expected=total_expected,
            rows_captured=total_captured,
            rows_rejected=0,
            rows_deduped=0,
            source_used="primary" if total_fallback == 0 else "fallback",
            severity=overall_severity,
            message=f"EOD Audit Complete: {total_captured}/{total_expected} captured ({total_missing} gaps)"
        )

        return {
            "trade_date": trade_date.isoformat(),
            "report_text": report_text,
            "overall_severity": overall_severity,
            "total_expected": total_expected,
            "total_captured": total_captured,
            "total_missing": total_missing,
            "recon_data": recon
        }
