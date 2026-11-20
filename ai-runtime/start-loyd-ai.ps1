param([int]$Port = 5001)
$ErrorActionPreference = 'Stop'
$runtimeRoot = Split-Path -Parent $PSScriptRoot
$python = 'D:\AuthentiScan-AI-Foundation\ai-service\.venv\Scripts\python.exe'
$env:AUTHENTISCAN_MODEL_PATH = Join-Path $runtimeRoot 'ai-work\2026-10-04\loyd-return-verified\runs\classifier-v1\finetune.keras'
$env:AUTHENTISCAN_POLICY_PATH = Join-Path $runtimeRoot 'ai-runtime\loyd-v1\policy.manuscript-60.json'
$env:PYTHONUTF8 = '1'
$env:TF_NUM_INTRAOP_THREADS = '2'
$env:TF_NUM_INTEROP_THREADS = '2'
foreach ($required in @($python,$env:AUTHENTISCAN_MODEL_PATH,$env:AUTHENTISCAN_POLICY_PATH)) {
    if (!(Test-Path -LiteralPath $required)) { throw "Missing required file: $required" }
}
Write-Host 'Starting Loyd classifier v1 research candidate. Old model files are unchanged.'
Write-Host 'Manuscript policy: class score >= 60% selects that class; both below 60% = Uncertain.'
Push-Location (Join-Path $PSScriptRoot 'loyd-v1')
try { & $python -m uvicorn service.app:app --host 127.0.0.1 --port $Port }
finally { Pop-Location }
