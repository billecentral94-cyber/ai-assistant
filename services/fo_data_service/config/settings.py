"""
Application configuration for F&O Data Retrieval Service.
Loads isolated environment variables from fo_data_service/.env without external project leakage.
"""

import os
from pathlib import Path
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv

# Path to the local fo_data_service directory and its own .env
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH)


class Settings(BaseSettings):
    # Database Settings (Unified database: artha)
    DATABASE_URL: str = Field(
        default="postgresql://artha:artha_dev@localhost:5432/artha",
        description="PostgreSQL DB connection string for artha"
    )

    # Angel One SmartAPI Credentials (local to this project)
    ANGELONE_CLIENT_ID: str = Field(default="", description="Angel One Client Code")
    ANGELONE_PIN: str = Field(default="", description="Angel One MPIN / Password")
    ANGELONE_API_KEY: str = Field(default="", description="Angel One SmartAPI Key")
    ANGELONE_TOTP_SECRET: str = Field(default="", description="Angel One TOTP Secret")

    # Underlyings locked to v1 scope
    UNDERLYINGS: List[str] = Field(default=["NIFTY", "BANKNIFTY"])

    # Scheduler Settings
    TIMEZONE: str = Field(default="Asia/Kolkata")
    MARKET_START_TIME: str = Field(default="09:15")
    MARKET_END_TIME: str = Field(default="15:30")
    INTERVAL_MINUTES: int = Field(default=15)

    # Reliability & Circuit Breaker Settings
    MAX_RETRIES: int = Field(default=2)
    CIRCUIT_BREAKER_FAILURES: int = Field(default=2)
    CIRCUIT_BREAKER_COOLDOWN_SECONDS: int = Field(default=300)
    REQUEST_TIMEOUT_SECONDS: int = Field(default=15)

    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
