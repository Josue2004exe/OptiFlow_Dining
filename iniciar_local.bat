@echo off
title OptiFlow Dining - Servidor Local
echo ========================================================
echo   OPTIFLOW DINING - INICIANDO SISTEMA EN MODO LOCAL
echo ========================================================
echo.
cd /d "%~dp0"

if not exist ".env" (
    echo Generando archivo .env con credenciales seguras...
    python scripts\generate_env.py
)

cd web
echo Aplicando migraciones de la base de datos...
python manage.py migrate --noinput
echo Inicializando mesas, zonas y usuarios demo...
python manage.py seed_demo

echo.
echo ========================================================
echo   SISTEMA LISTO EN: http://127.0.0.1:8000
echo.
echo   Usuarios disponibles:
echo     - Administrador:  admin        (Clave: 1234)
echo     - Mesero demo:    mesero_demo  (Clave en .env)
echo     - Capitan demo:   capitan_demo (Clave en .env)
echo     - Gerente demo:   gerente_demo (Clave en .env)
echo ========================================================
echo.

start http://127.0.0.1:8000
python manage.py runserver 127.0.0.1:8000
pause
