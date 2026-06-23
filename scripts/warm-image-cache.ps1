param(
    [Parameter(Mandatory = $true)]
    [string]$ImagesDir,
    [string]$BaseUrl = "https://homebase.liddleapps.com"
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$CacheToken = $env:IMAGE_CACHE_TOKEN
Write-Host "Server:     $BaseUrl"
Write-Host "Images dir: $ImagesDir"
Write-Host ""

if (-not $CacheToken) {
    Write-Error "Missing IMAGE_CACHE_TOKEN env var - set it to the same value configured on the server."
    exit 1
}

try {
    $items = Invoke-RestMethod -Uri "$BaseUrl/api/images/uncached" -Headers @{ 'x-cache-token' = $CacheToken } -ErrorAction Stop
} catch {
    Write-Error "Could not reach $BaseUrl/api/images/uncached"
    Write-Host "Make sure the server is running the latest code, then retry."
    exit 1
}

if ($items.Count -eq 0) {
    Write-Host "All images are already cached."
    exit 0
}

Write-Host "Found $($items.Count) uncached image(s)"
Write-Host ""
New-Item -ItemType Directory -Force -Path $ImagesDir | Out-Null

$ok = 0
$skip = 0
$fail = 0

foreach ($item in $items) {
    $url = $item.url
    $cachePath = $item.cachePath
    $outFile = Join-Path $ImagesDir $cachePath

    try {
        $origin = ([System.Uri]$url).GetLeftPart([System.UriPartial]::Authority)
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20 -Headers @{
            'User-Agent'      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            'Accept'          = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
            'Accept-Language' = 'en-US,en;q=0.9'
            'Referer'         = "$origin/"
        } -ErrorAction Stop

        [System.IO.File]::WriteAllBytes($outFile, $response.Content)
        $kb = [math]::Round($response.Content.Length / 1024)
        Write-Host "  OK   $cachePath  ($kb KB)"
        $ok++
    } catch {
        $msg = $_.Exception.Message.Split("`n")[0]
        Write-Host "  FAIL $cachePath  - $msg"
        $fail++
    }
}

Write-Host ""
Write-Host "Done: $ok cached, $skip skipped, $fail failed"
