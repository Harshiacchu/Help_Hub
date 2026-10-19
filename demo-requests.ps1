# demo-requests.ps1 - Sends one ticket through the API and one by email to HelpHub
#
# For the demo video. Run in PowerShell from the folder this file is in:
#   powershell -ExecutionPolicy Bypass -File .\demo-requests.ps1
#
# Nothing to paste: the script logs in as the Cascade demo admin and rotates the
# "Order System" API key (the same as clicking Rotate on the API Keys page),
# then uses that key. The email secret must match INBOUND_EMAIL_SECRET on the
# server you send to (on Vercel, enter it there without quotes).

$BaseUrl     = "https://help-hub-xtqe.vercel.app"   # or http://localhost:3000
$EmailSecret = "helphub-email-demo-2026"
$Org         = "cascade-health-demo"
$AdminEmail  = "admin@cascadehealth.example"
$Password    = "Password123"

$created = 0
function Show-Error($err) {
  $text = if ($err.ErrorDetails.Message) { $err.ErrorDetails.Message } else { $err.Exception.Message }
  Write-Host "Failed: $text" -ForegroundColor Red
}

# 0. A fresh API key: log in as the admin and rotate the "Order System" key
Write-Host "`n0. Getting a fresh API key for the order system" -ForegroundColor Cyan
$ApiKey = $null
try {
  $login = @{ tenantSlug = $Org; email = $AdminEmail; password = $Password } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/auth/login" -ContentType "application/json" `
    -Body $login -SessionVariable admin | Out-Null
  $keys = (Invoke-RestMethod -Uri "$BaseUrl/api/v1/api-keys" -WebSession $admin).data
  $orderSystem = $keys | Where-Object { $_.name -eq "Order System" } | Select-Object -First 1
  if ($orderSystem) {
    $ApiKey = (Invoke-RestMethod -Method Post -WebSession $admin `
      -Uri "$BaseUrl/api/v1/api-keys/$($orderSystem.keyId)/rotate").data.key
  } else {
    $ApiKey = (Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/api-keys" -WebSession $admin `
      -ContentType "application/json" -Body (@{ name = "Order System" } | ConvertTo-Json)).data.key
  }
  Write-Host "Using the Order System key $($ApiKey.Substring(0, 11))..."
} catch { Show-Error $_ }

# 1. Another system (the pharmacy system) opens a ticket with Cascade's API key
Write-Host "`n1. Ticket from another system (API key)" -ForegroundColor Cyan
if ($ApiKey) {
  try {
    $body = @{ description = "Pharmacy system error: the prior authorization request for member 1042 failed to submit." }
    $reply = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/tickets" -Headers @{ "X-API-Key" = $ApiKey } `
      -ContentType "application/json" -Body ($body | ConvertTo-Json)
    $reply.data | Select-Object ticketId, category, priority, status, source | Format-List
    $created++
  } catch { Show-Error $_ }
} else { Write-Host "Skipped: no API key" -ForegroundColor Red }

# 2. A member emails Cascade's support address
Write-Host "`n2. Ticket by email" -ForegroundColor Cyan
try {
  $email = @{
    from    = "Ava Anderson <ava.anderson.1@customer.example>"
    to      = "support@cascadehealth.example"
    subject = "Claim denied"
    text    = "My claim for last month's MRI was denied. I need this resolved before my next appointment."
  }
  $reply = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/v1/email/inbound" -Headers @{ "X-Inbound-Secret" = $EmailSecret } `
    -ContentType "application/json" -Body ($email | ConvertTo-Json)
  $reply.data | Format-List
  $created++
} catch { Show-Error $_ }

if ($created -eq 2) {
  Write-Host "Done: 2 tickets created. Open the agent's queue to see them (via API and via Email)." -ForegroundColor Green
} else {
  Write-Host "$created of 2 tickets created - see the red lines above." -ForegroundColor Yellow
}
