$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local-dev'
$settings = Get-Content -LiteralPath (Join-Path $localRoot 'settings.json') -Raw | ConvertFrom-Json
$toolRoot = Join-Path $localRoot 'tools'
$efTool = Join-Path $toolRoot 'dotnet-ef.exe'
if (!(Test-Path -LiteralPath $efTool)) {
    & dotnet tool install dotnet-ef --version 8.0.11 --tool-path $toolRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to install EF Core migration tool.' }
}
# Scope migrations to this script's new local database, even if the caller has
# an unrelated hosted database connection in their process environment.
$previous = @{}
$overrides = @{
    ASPNETCORE_ENVIRONMENT='Development'
    ConnectionStrings__Customs="Host=127.0.0.1;Port=$($settings.Port);Database=customs_local;Username=customs_app;Password=$($settings.AppPassword)"
    Jwt__Key=$settings.JwtKey
    Skeleton__UseDemoData='false'
}
Push-Location $projectRoot
try {
    foreach ($name in $overrides.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $overrides[$name], 'Process')
    }
    & $efTool database update --project backend/SES.Customs/Apps/Customs/SES.Customs.Infrastructure/SES.Customs.Infrastructure.csproj --startup-project backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj --context CustomsDbContext
    if ($LASTEXITCODE -ne 0) { throw 'Local database migration failed.' }
} finally {
    foreach ($name in $previous.Keys) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
    Pop-Location
}
