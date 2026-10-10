@echo off
rem Starts the Customer Intelligence app on Windows.
rem First run: creates a private Python environment and installs the packages.
setlocal
cd /d "%~dp0backend"

set "PY=python"
where py >nul 2>nul && set "PY=py -3"

if not exist ".venv\Scripts\python.exe" (
  echo Creating a Python environment for this project. First run only.
  %PY% -m venv .venv || goto :error
)

if not exist ".venv\installed.txt" (
  echo Installing Python packages. This takes a few minutes the first time.
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -r requirements.txt || goto :error
  echo done> ".venv\installed.txt"
)

set "CI_OPEN_BROWSER=http://127.0.0.1:8010"
echo.
echo Starting Customer Intelligence at http://127.0.0.1:8010
echo The first start reads the two large CSV files and takes a little longer.
echo Close this window to stop the app.
echo.
".venv\Scripts\python.exe" -m uvicorn app.main:app --port 8010
if errorlevel 1 goto :error
goto :eof

:error
echo.
echo Something went wrong. The message above says what.
pause
