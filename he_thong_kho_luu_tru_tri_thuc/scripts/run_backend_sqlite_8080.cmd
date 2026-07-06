@echo off
set DATABASE_PROVIDER=sqlite
cd /d %~dp0\..
python run_mvp.py
