$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$nodeFolder = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'node-*-win-x64' | Select-Object -First 1
if (-not $nodeFolder) { throw 'Локальный Node.js не найден. Установите Node.js LTS и выполните npm run dev.' }
& (Join-Path $nodeFolder.FullName 'node.exe') (Join-Path $PSScriptRoot 'npm-local.mjs') run dev
