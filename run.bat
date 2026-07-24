@echo off
title G-Drive Downloader - Inicializador
echo ==================================================
echo       INICIALIZANDO G-DRIVE DOWNLOADER
echo ==================================================
echo.

cd /d "%~dp0"

:: Verifica se a pasta node_modules existe
if not exist "node_modules\" (
    echo [INFO] Primeira execucao detectada. Instalando dependencias...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Houve uma falha ao instalar as dependencias. 
        echo Certifique-se de que o Node.js esta instalado corretamente.
        pause
        exit /b %errorlevel%
    )
)

echo [INFO] Iniciando o aplicativo...
start /b npm start
echo.
echo [INFO] Aplicativo iniciado com sucesso! Esta janela sera fechada automaticamente.
timeout /t 3 >nul
exit
