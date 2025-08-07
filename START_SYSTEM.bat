@echo off
echo Starting Certificate System...

echo.
echo [1/3] Starting Backend Server...
cd /d "%~dp0backend"
start "Backend" cmd /k "python -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

timeout /t 5 /nobreak >nul

echo.
echo [2/3] Starting Frontend Server...
cd /d "%~dp0frontend"
start "Frontend" cmd /k "npm start"

timeout /t 10 /nobreak >nul

echo.
echo [3/3] Opening Application...
start http://localhost:3000

echo.
echo ===============================================
echo   Certificate System is starting up...
echo   Backend:  http://localhost:8001
echo   Frontend: http://localhost:3000
echo   
echo   Login Credentials:
echo   Email:    superadmin@certificate-system.com
echo   Password: SuperAdmin123!
echo ===============================================
echo.
echo Press any key to close this window...
pause >nul
