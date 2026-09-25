"""
launch_auto_trade.py — Windows Auto-Wake & Paper Trading Runner
Acquires Windows System Wake Lock (prevents sleep during market hours 09:15-15:40 IST).
Runs the autonomous paper trading engine every 15 minutes.
Enforces 15:15 IST EOD square-offs, runs 15:35 IST Readiness Gates reconciliation,
and releases the wake lock after market closes so the laptop can sleep.
"""

import sys
import os
import ctypes
import logging
from datetime import datetime, date
import pytz

# Add current directory to path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# Ensure logs directory exists
logs_dir = os.path.join(current_dir, "logs")
os.makedirs(logs_dir, exist_ok=True)

# Configure logging to both console and date-stamped file
log_filename = os.path.join(logs_dir, f"paper_trader_{datetime.now().strftime('%Y%m%d')}.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_filename, encoding="utf-8")
    ]
)
logger = logging.getLogger("artha_auto_trader")

# ── Windows Wake Lock Flags ───────────────────────────────────────────────────
ES_CONTINUOUS = 0x80000000
ES_SYSTEM_REQUIRED = 0x00000001
ES_AWAYMODE_REQUIRED = 0x00000040

def set_wake_lock(enable: bool = True):
    """Prevents Windows from entering sleep or standby while active."""
    if os.name != 'nt':
        return
    try:
        if enable:
            ctypes.windll.kernel32.SetThreadExecutionState(
                ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
            )
            logger.info("Windows Wake Lock ACQUIRED. System will stay awake during market hours.")
        else:
            ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS)
            logger.info("Windows Wake Lock RELEASED. Normal sleep behavior restored.")
    except Exception as e:
        logger.warning(f"Could not configure Windows wake lock: {e}")

class Args:
    simulate_cycle = False

def main():
    logger.info("================================================================")
    logger.info("  ARTHA AI COPILOT — AUTONOMOUS PAPER TRADING LAUNCHER")
    logger.info("  Schedule: 09:14 AM - 15:40 PM IST (Mon-Fri)")
    logger.info("  Logging to: " + log_filename)
    logger.info("================================================================")

    set_wake_lock(True)

    try:
        from main import cmd_auto_trade
        args = Args()
        cmd_auto_trade(args)
    except KeyboardInterrupt:
        logger.info("Paper trading launcher stopped by user.")
    except Exception as e:
        logger.error(f"Paper trading launcher encountered an error: {e}", exc_info=True)
    finally:
        set_wake_lock(False)
        logger.info("Session complete. Exiting launcher.")

if __name__ == "__main__":
    main()
