@echo off
echo === Building Homebase Docker image ===
cd /d "C:\Users\liddlem\Downloads\Claude Apps\HomeBase\homebase"

docker-compose down
docker image rm homebase:latest -f
docker-compose up -d --build --force-recreate

echo === Saving image to tar ===
docker save homebase:latest -o homebase.tar
echo.
echo Image saved to:
echo   %CD%\homebase.tar

echo.
echo === Resolving NAS IP (sovereign-main) ===
set NAS_IP=
for /f "tokens=2 delims=[]" %%a in ('ping -n 1 sovereign-main 2^>nul') do (
    if not defined NAS_IP set NAS_IP=%%a
)

if not defined NAS_IP (
    echo Could not resolve sovereign-main - check you are on the local network.
    echo Copy these files to the NAS manually:
    echo   %CD%\homebase.tar    ^>  /volume1/docker/homebase/homebase.tar
    echo   %CD%\deploy-nas.sh  ^>  /volume1/docker/homebase/deploy-nas.sh
    echo   %CD%\.env.local     ^>  /volume1/docker/homebase/.env.local
    echo.
    echo Then on NAS SSH run:
    echo   sudo sh /volume1/docker/homebase/deploy-nas.sh
    pause
    exit /b 1
)

echo NAS IP: %NAS_IP%

echo.
echo === Copying files to NAS ===
scp homebase.tar deploy-nas.sh .env.local admin@%NAS_IP%:/volume1/docker/homebase/

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo SCP failed - copy these files to the NAS manually:
    echo   %CD%\homebase.tar    ^>  /volume1/docker/homebase/homebase.tar
    echo   %CD%\deploy-nas.sh  ^>  /volume1/docker/homebase/deploy-nas.sh
    echo   %CD%\.env.local     ^>  /volume1/docker/homebase/.env.local
    echo.
    echo Then on NAS SSH run:
    echo   sudo sh /volume1/docker/homebase/deploy-nas.sh
) else (
    echo.
    echo === Done! Now run on the NAS: ===
    echo   sudo sh /volume1/docker/homebase/deploy-nas.sh
)

pause
