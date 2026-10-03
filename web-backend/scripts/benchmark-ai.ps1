# Local-only inference benchmark. Does not call Firebase or consume scan credits.
# Creates three test heatmaps through the existing AI endpoint; does not delete files.
$ErrorActionPreference = 'Stop'
$benchmarkBase = 'http://127.0.0.1:5001'
$benchmarkImage = Join-Path $PSScriptRoot '../src/assets/hero.png'
$benchmarkHealth = Invoke-RestMethod "$benchmarkBase/health" -TimeoutSec 10
if (-not $benchmarkHealth.success -or -not $benchmarkHealth.model_loaded) { throw 'AI model is not ready.' }
$benchmarkProcessIds = @(Get-NetTCPConnection -LocalPort 5001 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
if ($benchmarkProcessIds.Count -ne 1) { throw 'Cannot identify one AI listener process for memory measurements.' }
$benchmarkProcessId = $benchmarkProcessIds[0]
$benchmarkProcess = Get-Process -Id $benchmarkProcessId
$benchmarkBaseline = $benchmarkProcess.WorkingSet64
$benchmarkLifetimePeakBefore = $benchmarkProcess.PeakWorkingSet64
$benchmarkClient = [System.Net.Http.HttpClient]::new()
$benchmarkClient.Timeout = [TimeSpan]::FromSeconds(180)
$benchmarkRuns = @()
try {
  foreach ($benchmarkIndex in 1..3) {
    $benchmarkForm = [System.Net.Http.MultipartFormDataContent]::new()
    $benchmarkStream = [System.IO.File]::OpenRead($benchmarkImage)
    $benchmarkPart = [System.Net.Http.StreamContent]::new($benchmarkStream)
    $benchmarkPart.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('image/png')
    $benchmarkForm.Add($benchmarkPart, 'image', 'hero.png')
    $benchmarkResponse = $null
    $benchmarkPeak = (Get-Process -Id $benchmarkProcessId).WorkingSet64
    $benchmarkWatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      $benchmarkTask = $benchmarkClient.PostAsync("$benchmarkBase/predict", $benchmarkForm)
      while (-not $benchmarkTask.IsCompleted) {
        $benchmarkPeak = [Math]::Max($benchmarkPeak, (Get-Process -Id $benchmarkProcessId).WorkingSet64)
        Start-Sleep -Milliseconds 100
      }
      $benchmarkResponse = $benchmarkTask.GetAwaiter().GetResult()
      $benchmarkWatch.Stop()
      $null = $benchmarkResponse.EnsureSuccessStatusCode()
      $benchmarkBody = $benchmarkResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
      if (-not $benchmarkBody.success -or $benchmarkBody.data.heatmap_path -notmatch '^/heatmaps/[a-f0-9-]+\.png$') { throw 'AI response or heatmap path invalid.' }
      $benchmarkHeatmap = $benchmarkClient.GetByteArrayAsync("$benchmarkBase$($benchmarkBody.data.heatmap_path)").GetAwaiter().GetResult()
      if ($benchmarkHeatmap.Length -lt 8 -or [Convert]::ToHexString($benchmarkHeatmap[0..7]) -ne '89504E470D0A1A0A') { throw 'Heatmap is not a PNG.' }
      $benchmarkRuns += [ordered]@{
        run = $benchmarkIndex
        seconds = [Math]::Round($benchmarkWatch.Elapsed.TotalSeconds, 3)
        sampled_peak_working_set_mib = [Math]::Round($benchmarkPeak / 1MB, 1)
        heatmap_png_verified = $true
        heatmap_bytes = $benchmarkHeatmap.Length
      }
    } finally {
      if ($benchmarkResponse) { $benchmarkResponse.Dispose() }
      $benchmarkForm.Dispose()
    }
  }
  $benchmarkProcess = Get-Process -Id $benchmarkProcessId
  [ordered]@{
    measured_at = (Get-Date).ToUniversalTime().ToString('o')
    model = $benchmarkHealth.model_version
    baseline_working_set_mib = [Math]::Round($benchmarkBaseline / 1MB, 1)
    lifetime_peak_before_mib = [Math]::Round($benchmarkLifetimePeakBefore / 1MB, 1)
    lifetime_peak_after_mib = [Math]::Round($benchmarkProcess.PeakWorkingSet64 / 1MB, 1)
    current_working_set_mib = [Math]::Round($benchmarkProcess.WorkingSet64 / 1MB, 1)
    runs = $benchmarkRuns
    scope = 'Three sequential scans of the same bundled image on an already running Windows AI service. Startup time, Linux/container memory, concurrency, worst-case images and model accuracy are not measured.'
  } | ConvertTo-Json -Depth 5
} finally { $benchmarkClient.Dispose() }
