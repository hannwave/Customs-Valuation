<#
.SYNOPSIS
  Configures the Gemini document scanner on this machine and checks that the key works.

.DESCRIPTION
  Stores the Gemini API key in .NET user-secrets for the API project (never in a tracked file),
  then sends a tiny test request to the main and fallback models.

  The key is taken from, in order: -ApiKey, -KeyFile, gemini.secrets.json in the repository root,
  or a prompt. gemini.secrets.json is git-ignored and looks like:  { "Gemini": { "ApiKey": "..." } }

.EXAMPLE
  .\scripts\setup-gemini.ps1
  .\scripts\setup-gemini.ps1 -KeyFile C:\Users\me\Downloads\gemini.secrets.json
#>
param(
  [string]$ApiKey,
  [string]$KeyFile
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "backend/SES.Customs/Apps/Customs/SES.Customs.API/SES.Customs.API.csproj"

function Read-KeyFile([string]$path) {
  $text = (Get-Content -Raw -LiteralPath $path).Trim()
  if ($text.StartsWith("{")) {
    $json = $text | ConvertFrom-Json
    if ($json.Gemini -and $json.Gemini.ApiKey) { return [string]$json.Gemini.ApiKey }
    if ($json.ApiKey) { return [string]$json.ApiKey }
    throw "No Gemini.ApiKey found in $path."
  }
  return $text
}

if (-not $ApiKey) {
  if (-not $KeyFile) { $default = Join-Path $root "gemini.secrets.json"; if (Test-Path $default) { $KeyFile = $default } }
  if ($KeyFile) { $ApiKey = Read-KeyFile $KeyFile; Write-Host "Using the key from $KeyFile" }
  else { $ApiKey = Read-Host "Paste the Gemini API key (from https://aistudio.google.com/apikey)" }
}
$ApiKey = $ApiKey.Trim()
if (-not $ApiKey) { throw "No API key given." }

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw "The .NET SDK is not installed. Install .NET 8 SDK, then run this script again." }

Write-Host "Saving the key to the API's user-secrets..."
dotnet user-secrets set "Gemini:ApiKey" $ApiKey --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw "dotnet user-secrets failed (exit $LASTEXITCODE)." }

if ($env:Ocr__Provider -and $env:Ocr__Provider -ne "Gemini" -and $env:Ocr__Provider -ne "Auto") {
  Write-Warning "The environment variable Ocr__Provider is '$env:Ocr__Provider', which turns Gemini off. Remove it or set it to Auto."
}

$body = '{"contents":[{"parts":[{"text":"Reply with just: ok"}]}]}'
$working = $false
foreach ($model in @("gemini-flash-latest", "gemini-flash-lite-latest")) {
  try {
    $response = Invoke-RestMethod -Method Post -Uri "https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent" `
      -Headers @{ "x-goog-api-key" = $ApiKey } -ContentType "application/json" -Body $body -TimeoutSec 60
    Write-Host ("  {0,-26} OK ({1})" -f $model, $response.modelVersion) -ForegroundColor Green
    $working = $true
  }
  catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    $reason = switch ($status) {
      0       { "no connection - check the internet connection, VPN or firewall" }
      400     { "the key is not valid" }
      403     { "the key is not allowed to use the Gemini API (wrong project or key restrictions)" }
      429     { "free daily quota used up - try again tomorrow or enable billing" }
      503     { "Google is busy right now - this is temporary, the key itself works" }
      default { "HTTP $status" }
    }
    if ($status -eq 503) { $working = $true }
    Write-Host ("  {0,-26} {1}" -f $model, $reason) -ForegroundColor Yellow
  }
}

if ($working) {
  Write-Host "`nGemini is set up. Restart the API (dotnet run ...) so it picks up the key; document scans then use Gemini." -ForegroundColor Green
} else {
  Write-Host "`nThe key was saved, but Gemini did not answer. Fix the problem above, then run this script again." -ForegroundColor Red
  exit 1
}
