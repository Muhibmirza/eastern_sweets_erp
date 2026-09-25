@echo off
echo Starting Eastern Sweets Database...

docker ps -a --filter "name=eastern-sweets-db" --format "{{.Names}}" | findstr eastern-sweets-db >nul
if %errorlevel%==0 (
    echo Database container exists. Starting it...
    docker start eastern-sweets-db
) else (
    echo Creating database container for the first time...
    node "%~dp0start-db.cjs"
    if errorlevel 1 exit /b 1
)

echo Waiting for database to be ready...
ping 127.0.0.1 -n 9 >nul
echo Database is ready!
