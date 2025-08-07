@echo off
title Secure Certificate System
color 0A

echo ========================================
echo     Certificate System - QUICK START
echo ========================================
echo.

REM Check prerequisites
echo [INFO] Checking prerequisites...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed!
    echo Please install Python from: https://python.org/
    pause
    exit /b 1
)

echo ✅ Prerequisites check passed
echo.

REM Stop existing processes
echo [1/4] Stopping existing processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 2 >nul

REM Initialize database
echo [2/4] Initializing database...
cd /d "%~dp0backend"
python init_db.py
if errorlevel 1 (
    echo ERROR: Database initialization failed!
    pause
    exit /b 1
)

REM Install dependencies
echo [3/4] Installing dependencies...
pip install -r requirements.txt >nul 2>&1
cd /d "%~dp0frontend"
if not exist "node_modules" (
    npm install >nul 2>&1
)

REM Start services
echo [4/4] Starting services...
cd /d "%~dp0backend"
start "Backend Server" cmd /k "python -m uvicorn main:app --reload --host 0.0.0.0 --port 8001"
timeout /t 3 >nul

cd /d "%~dp0frontend"
start "Frontend Server" cmd /k "npm start"

echo.
echo ✅ System started successfully!
echo.
echo 🌐 Frontend: http://localhost:3000
echo 🔧 Backend API: http://localhost:8001
echo 📖 API Docs: http://localhost:8001/docs
echo.
echo 👤 LOGIN CREDENTIALS:
echo   Super Admin: superadmin@certificate-system.com / SuperAdmin123!
echo   Admin: admin@certificate-system.com / Admin123!
echo   User: testuser@certificate-system.com / User123!
echo.
echo ⏳ Opening browser in 5 seconds...
timeout /t 5 >nul
start http://localhost:3000
echo.
echo Press any key to close this launcher...
pause >nul
