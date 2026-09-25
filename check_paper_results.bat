@echo off
title Artha AI Copilot - Post-Market Paper Trading Report
cd /d "c:\Users\bille\OneDrive\Documents\Desktop\artha-ai-copilot\services\fo_data_service"
"C:\Users\bille\.local\bin\uv.exe" run python check_paper_results.py
pause
