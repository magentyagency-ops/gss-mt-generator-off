@echo off
title GSS - Generateur de Memoire Technique
echo.
echo =================================================================
echo   DEMARRAGE : GENERATEUR DE MEMOIRE TECHNIQUE GSS
echo =================================================================
echo.

:: Vérification de la présence de Node.js
where node >nul 2>nul
if %errorlevel% equ 0 goto start_server

echo Ajout automatique de l'environnement Node.js (Visual Studio)...
set "PATH=C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Microsoft\VisualStudio\NodeJs;%PATH%"

where node >nul 2>nul
if %errorlevel% equ 0 goto start_server

echo.
echo [ERREUR] Node.js est requis mais introuvable sur votre systeme Windows.
echo Veuillez installer Node.js ou contacter votre administrateur.
echo.
pause
exit /b

:start_server
cd gss-app
echo Lancement du serveur local sur http://localhost:5173 ...
echo.
start http://localhost:5173
npm run dev
