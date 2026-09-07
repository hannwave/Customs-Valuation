param([string]$BaseUrl = 'http://localhost:5080')
$ErrorActionPreference = 'Stop'
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
$health = Invoke-RestMethod "$BaseUrl/health/live"
Assert-True ($health.mode -eq 'demo') 'Expected isolated demo mode.'
$rows = Invoke-RestMethod "$BaseUrl/api/hs-codes?search=0901.11"
Assert-True ($rows.totalCount -eq 1 -and $rows.items[0].code -eq '090111') 'HS leading-zero search failed.'
$revisions = Invoke-RestMethod "$BaseUrl/api/hs-revisions"
Assert-True ($revisions.Count -eq 1) 'Expected one synthetic revision.'
$empty = Invoke-RestMethod "$BaseUrl/api/hs-codes?search=missing-record"
Assert-True ($empty.totalCount -eq 0) 'Expected empty search result.'
function Assert-Status([string]$Url, [int]$Expected) {
    try { $null = Invoke-WebRequest $Url; throw "Expected HTTP $Expected from $Url" }
    catch {
        if ($null -eq $_.Exception.Response) { throw }
        $actual = [int]$_.Exception.Response.StatusCode
        Assert-True ($actual -eq $Expected) "Expected $Expected but got $actual from $Url"
    }
}
Assert-Status "$BaseUrl/api/hs-codes?page=0" 400
Assert-Status "$BaseUrl/api/hs-codes/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" 404
Assert-Status "$BaseUrl/api/valuation-decisions" 401
Assert-Status "$BaseUrl/api/audit-logs" 401
Write-Output 'PASS: liveness, HS search/revisions, empty state, validation, not-found and protected routes.'
