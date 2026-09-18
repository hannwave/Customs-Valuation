param([string]$BaseUrl = 'http://127.0.0.1:5080')

$ErrorActionPreference = 'Stop'
$origin = $BaseUrl.TrimEnd('/')

try {
    $health = Invoke-RestMethod -Uri "$origin/health/live"
} catch {
    throw "Cannot reach the API at $origin. Start the API and check portal/.env.local. $($_.Exception.Message)"
}

if ($health.capabilities.regionalEmployeeManagement -ne $true) {
    throw "The API at $origin does not expose the current regional employee access marker. Stop the process listening on port $(([Uri]$origin).Port), rebuild and restart the API, then run this check again. Pulling Git changes does not replace an already running process."
}

if ($health.mode -ne 'development-database') {
    throw "The API at $origin is running in '$($health.mode)' mode. Start it with Skeleton__UseDemoData=false and the configured PostgreSQL connection."
}

Write-Output "PASS: $origin is running the API with Customs Administrator employee access (mode: $($health.mode))."
