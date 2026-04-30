@echo off
setlocal
echo === Building Homebase Docker image ===
cd /d "C:\Appdev\HomeBase"

:: Clean up stale tar files
if exist homebase.tar del homebase.tar

:: Build the image only - do NOT start it here.
:: Starting on Windows would attempt migrations against a missing /data volume
:: and could save a broken container state into the tar.
echo.
echo === Building image (this may take a few minutes)...
docker build -t homebase:latest .
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Docker build failed - check output above
    pause
    exit /b 1
)
echo ✓ Image built successfully

echo.
echo === Saving image to tar ===
docker save homebase:latest -o homebase.tar
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ Failed to save image tar
    pause
    exit /b 1
)
echo ✓ Image saved to %CD%\homebase.tar

echo.
echo === Resolving NAS IP (sovereign-main) ===
set NAS_IP=
for /f "tokens=2 delims=[]" %%a in ('ping -n 1 sovereign-main 2^>nul') do (
    if not defined NAS_IP set NAS_IP=%%a
)

if not defined NAS_IP (
    echo Could not resolve sovereign-main - check you are on the local network.
    echo.
    echo Copy these files to the NAS manually:
    echo   %CD%\homebase.tar    -^>  /volume1/docker/homebase/homebase.tar
    echo   %CD%\deploy-nas.sh   -^>  /volume1/docker/homebase/deploy-nas.sh
    echo   %CD%\.env.local      -^>  /volume1/docker/homebase/.env.local
    echo.
    echo Then on NAS SSH run:
    echo   sudo sh /volume1/docker/homebase/deploy-nas.sh
    pause
    exit /b 0
)

echo NAS IP: %NAS_IP%

echo.
echo === Copying files to NAS ===
scp homebase.tar deploy-nas.sh .env.local admin@%NAS_IP%:/volume1/docker/homebase/
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✗ SCP failed - copy these files to the NAS manually:
    echo   %CD%\homebase.tar    -^>  /volume1/docker/homebase/homebase.tar
    echo   %CD%\deploy-nas.sh   -^>  /volume1/docker/homebase/deploy-nas.sh
    echo   %CD%\.env.local      -^>  /volume1/docker/homebase/.env.local
    echo.
    echo Then on NAS SSH run:
    echo   sudo sh /volume1/docker/homebase/deploy-nas.sh
    pause
    exit /b 0
)

echo ✓ Files copied to NAS

echo.
echo ============================================
echo   Build complete.
echo   Now run on the NAS to deploy:
echo     sudo sh /volume1/docker/homebase/deploy-nas.sh
echo ============================================
pause
