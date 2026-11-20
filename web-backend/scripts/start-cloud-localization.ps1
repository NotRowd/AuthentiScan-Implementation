param([switch]$PaymentsTest)
$ErrorActionPreference = 'Stop'
$kitPath = 'D:\Amel-Mesorch-P-Windows-CPU-v1'
$appPath = Split-Path $PSScriptRoot -Parent
foreach ($required in @('.venv\Scripts\python.exe', 'service.py', 'weights\mesorch_p-118.pth', 'use-d-drive.ps1')) {
    if (!(Test-Path -LiteralPath (Join-Path $kitPath $required))) {
        throw "Missing CPU localization file $required in $kitPath"
    }
}
. (Join-Path $kitPath 'use-d-drive.ps1')
$env:AUTHENTISCAN_LOCALIZATION_ENABLED = '1'
$env:AUTHENTISCAN_LOCALIZATION_MODE = 'mesorch-p'
$env:MESORCH_LOCALIZATION_PYTHON = Join-Path $kitPath '.venv\Scripts\python.exe'
$env:MESORCH_LOCALIZATION_SERVICE_PATH = Join-Path $kitPath 'service.py'
$env:MESORCH_LOCALIZATION_WEIGHTS = Join-Path $kitPath 'weights\mesorch_p-118.pth'
Set-Location -LiteralPath $appPath
if ($PaymentsTest) {
    $paymentsPath = Join-Path $appPath '.secrets\payments.test.env'
    if (!(Test-Path -LiteralPath $paymentsPath)) {
        throw 'Saved PayMongo test settings are missing. Complete payment setup first.'
    }
    Write-Host 'Loading saved PayMongo TEST settings. No live payments are enabled.'
    & node.exe '--env-file=.secrets/payments.test.env' 'scripts/start-cloud.mjs'
} else {
    & npm.cmd run start:cloud
}
exit $LASTEXITCODE
