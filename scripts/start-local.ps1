$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local-dev'
$settingsPath = Join-Path $localRoot 'settings.json'
if (!(Test-Path -LiteralPath $settingsPath)) { throw 'Run scripts/setup-local-database.ps1 first.' }
$settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
$pgControl = Join-Path $localRoot 'postgresql/pgsql/bin/pg_ctl.exe'
$dataRoot = Join-Path $localRoot 'pgdata'
& $pgControl status -D $dataRoot *> $null
if ($LASTEXITCODE -ne 0) {
    & $pgControl start -D $dataRoot -l (Join-Path $localRoot 'postgresql.log') -o "-h 127.0.0.1 -p $($settings.Port)" -w -t 30
    if ($LASTEXITCODE -ne 0) { throw 'Local database could not start. See .local-dev/postgresql.log.' }
}

function Test-LocalUrl([string]$Url) {
    try { return (Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 3).StatusCode -eq 200 }
    catch { return $false }
}

if (!(Test-LocalUrl 'http://127.0.0.1:5080/health/live')) {
    $priorEnvironment = $env:ASPNETCORE_ENVIRONMENT
    $priorUrls = $env:ASPNETCORE_URLS
    try {
        $env:ASPNETCORE_ENVIRONMENT = 'Development'
        $env:ASPNETCORE_URLS = 'http://127.0.0.1:5080'
        $api = Start-Process -FilePath 'dotnet' -ArgumentList @('run', '--project', 'backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj', '--no-build', '--no-launch-profile') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'api.stdout.log') -RedirectStandardError (Join-Path $localRoot 'api.stderr.log')
        $api.Id | Set-Content -LiteralPath (Join-Path $localRoot 'api.pid')
    } finally { $env:ASPNETCORE_ENVIRONMENT = $priorEnvironment; $env:ASPNETCORE_URLS = $priorUrls }
}
if (!(Test-LocalUrl 'http://127.0.0.1:3000/login')) {
    $portal = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/c', 'npm run dev') -WorkingDirectory (Join-Path $projectRoot 'portal') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $localRoot 'portal.stdout.log') -RedirectStandardError (Join-Path $localRoot 'portal.stderr.log')
    $portal.Id | Set-Content -LiteralPath (Join-Path $localRoot 'portal.pid')
}

$deadline = [DateTime]::UtcNow.AddSeconds(60)
do {
    $apiReady = Test-LocalUrl 'http://127.0.0.1:5080/health/live'
    $portalReady = Test-LocalUrl 'http://127.0.0.1:3000/login'
    if ($apiReady -and $portalReady) { break }
    Start-Sleep -Seconds 1
} while ([DateTime]::UtcNow -lt $deadline)
if (!$apiReady -or !$portalReady) { throw 'Startup did not finish. Inspect .local-dev/*.log.' }
Write-Host 'Portal: http://127.0.0.1:3000/login'
Write-Host 'API:    http://127.0.0.1:5080/health/live'
