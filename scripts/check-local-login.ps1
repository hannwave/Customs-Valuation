param([string]$BaseUrl = 'http://127.0.0.1:5080')
$ErrorActionPreference = 'Stop'
function Assert-True($Condition, [string]$Message) { if (!$Condition) { throw $Message } }
function Assert-Status([string]$Url, [int]$Expected, [hashtable]$Headers = @{}, [string]$Body = '') {
    try {
        if ($Body) { $null = Invoke-WebRequest $Url -UseBasicParsing -Method Post -ContentType 'application/json' -Body $Body -Headers $Headers }
        else { $null = Invoke-WebRequest $Url -UseBasicParsing -Headers $Headers }
        throw "Expected HTTP $Expected."
    } catch {
        if ($null -eq $_.Exception.Response) { throw }
        Assert-True ([int]$_.Exception.Response.StatusCode -eq $Expected) "Expected HTTP $Expected."
    }
}
$health = Invoke-RestMethod "$BaseUrl/health/live"
Assert-True ($health.mode -eq 'development-database') 'Expected persistent development database mode.'
Assert-Status "$BaseUrl/api/auth/me" 401
Assert-Status "$BaseUrl/api/auth/login" 401 -Body (@{ identity='sysadmin'; password='incorrect-password' } | ConvertTo-Json)

foreach ($account in @(@{Username='sysadmin'; Role='SystemAdministrator'}, @{Username='officer'; Role='CustomsOfficer'}, @{Username='admin'; Role='CustomsAdministrator'})) {
    $login = Invoke-RestMethod "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body (@{ identity=$account.Username; password='DemoPass1!' } | ConvertTo-Json)
    Assert-True ([bool]$login.accessToken) 'Login did not return an access token.'
    $headers = @{ Authorization="Bearer $($login.accessToken)" }
    $profile = Invoke-RestMethod "$BaseUrl/api/auth/me" -Headers $headers
    Assert-True ($profile.username -eq $account.Username -and $profile.role -eq $account.Role) 'Profile does not match the signed-in account.'
    $null = Invoke-RestMethod "$BaseUrl/api/hs-codes" -Headers $headers
    if ($account.Role -eq 'SystemAdministrator') {
        $users = Invoke-RestMethod "$BaseUrl/api/auth/users" -Headers $headers
        Assert-True ($users.users.Count -ge 3) 'Development accounts were not persisted.'
    } else { Assert-Status "$BaseUrl/api/auth/users" 403 -Headers $headers }
    Write-Host "PASS: $($account.Username) login, profile, HS access and role enforcement."
}
$cors = Invoke-WebRequest "$BaseUrl/api/auth/login" -UseBasicParsing -Method Options -Headers @{ Origin='http://127.0.0.1:3000'; 'Access-Control-Request-Method'='POST'; 'Access-Control-Request-Headers'='content-type' }
Assert-True ($cors.Headers['Access-Control-Allow-Origin'] -eq 'http://127.0.0.1:3000') 'Portal CORS origin is not allowed.'
Write-Host 'PASS: missing-token and wrong-password rejection; portal CORS. Tokens were not logged.'
