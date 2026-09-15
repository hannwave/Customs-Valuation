param([int]$Port = 55432)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localRoot = Join-Path $projectRoot '.local-dev'
$binaryRoot = Join-Path $localRoot 'postgresql'
$dataRoot = Join-Path $localRoot 'pgdata'
$settingsPath = Join-Path $localRoot 'settings.json'
$apiRoot = Join-Path $projectRoot 'backend/SES.Customs/Apps/Customs/SES.Customs.API'
$apiLocalPath = Join-Path $apiRoot 'appsettings.Local.json'
$archive = Join-Path $localRoot 'downloads/postgresql-17.11-3-windows-x64-binaries.zip'
$utf8 = [Text.UTF8Encoding]::new($false)

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
function Confirm-Exit([string]$Operation) {
    if ($LASTEXITCODE -ne 0) { throw "$Operation failed (exit $LASTEXITCODE)." }
}

New-Item -ItemType Directory -Force $localRoot, (Join-Path $localRoot 'downloads') | Out-Null
if (!(Test-Path -LiteralPath (Join-Path $binaryRoot 'runtime-ready.txt'))) {
    if (!(Test-Path -LiteralPath $archive)) {
        & curl.exe --fail --location --retry 2 --output $archive 'https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip'
        Confirm-Exit 'PostgreSQL download'
    }
    Write-Host 'Extracting PostgreSQL server, libraries and shared data...'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archive)
    $binaryPrefix = [IO.Path]::GetFullPath($binaryRoot) + [IO.Path]::DirectorySeparatorChar
    try {
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -notmatch '^pgsql/(bin|lib|share)/' -or !$entry.Name) { continue }
            $target = [IO.Path]::GetFullPath((Join-Path $binaryRoot $entry.FullName))
            if (!$target.StartsWith($binaryPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path escapes the local binary directory.' }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        }
    } finally { $zip.Dispose() }
    [IO.File]::WriteAllText((Join-Path $binaryRoot 'runtime-ready.txt'), '17.11-3', $utf8)
}
$bin = Join-Path $binaryRoot 'pgsql/bin'
if (!(Test-Path -LiteralPath $settingsPath)) {
    if ((Test-Path -LiteralPath $dataRoot) -or (Test-Path -LiteralPath $apiLocalPath)) {
        throw 'Existing local data/configuration found without matching settings. Refusing to replace it.'
    }
    $settings = @{ Port=$Port; AdminPassword=(New-LocalSecret); AppPassword=(New-LocalSecret); JwtKey=(New-LocalSecret) }
    [IO.File]::WriteAllText($settingsPath, ($settings | ConvertTo-Json), $utf8)
} else {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    $Port = [int]$settings.Port
}
if (!(Test-Path -LiteralPath (Join-Path $dataRoot 'PG_VERSION'))) {
    $passwordPath = Join-Path $localRoot 'init-password.txt'
    [IO.File]::WriteAllText($passwordPath, $settings.AdminPassword, $utf8)
    try {
        & (Join-Path $bin 'initdb.exe') -D $dataRoot -U postgres --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$passwordPath
        Confirm-Exit 'PostgreSQL initialization'
    } finally { Remove-Item -LiteralPath $passwordPath -ErrorAction SilentlyContinue }
}
& (Join-Path $bin 'pg_ctl.exe') status -D $dataRoot *> $null
if ($LASTEXITCODE -ne 0) {
    & (Join-Path $bin 'pg_ctl.exe') start -D $dataRoot -l (Join-Path $localRoot 'postgresql.log') -o "-h 127.0.0.1 -p $Port" -w -t 30
    Confirm-Exit 'PostgreSQL startup'
}
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $settings.AdminPassword
    $psql = Join-Path $bin 'psql.exe'
    $hasRole = & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='customs_app'"
    Confirm-Exit 'Role lookup'
    if ($hasRole -ne '1') {
        # Secret generated above contains only hexadecimal characters. Feed SQL
        # through stdin so no password is placed on a process command line.
        "CREATE ROLE customs_app LOGIN PASSWORD '$($settings.AppPassword)';" | & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1
        Confirm-Exit 'Application role creation'
    }
    $hasDatabase = & $psql -h 127.0.0.1 -p $Port -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='customs_local'"
    Confirm-Exit 'Database lookup'
    if ($hasDatabase -ne '1') {
        & (Join-Path $bin 'createdb.exe') -h 127.0.0.1 -p $Port -U postgres -O customs_app customs_local
        Confirm-Exit 'Database creation'
    }
} finally { $env:PGPASSWORD = $previousPassword }

if (!(Test-Path -LiteralPath $apiLocalPath)) {
    $apiSettings = @{
        ConnectionStrings=@{Customs="Host=127.0.0.1;Port=$Port;Database=customs_local;Username=customs_app;Password=$($settings.AppPassword)"}
        Jwt=@{Key=$settings.JwtKey}
        Skeleton=@{UseDemoData=$false}
    }
    [IO.File]::WriteAllText($apiLocalPath, ($apiSettings | ConvertTo-Json -Depth 4), $utf8)
}
$portalEnv = Join-Path $projectRoot 'portal/.env.local'
if (!(Test-Path -LiteralPath $portalEnv)) {
    [IO.File]::WriteAllText($portalEnv, "NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5080`nNEXT_PUBLIC_CUSTOMS_API_URL=http://127.0.0.1:5080/api/`n", $utf8)
}
Write-Host "Local PostgreSQL is ready on 127.0.0.1:$Port. Local credentials are stored in ignored files."
