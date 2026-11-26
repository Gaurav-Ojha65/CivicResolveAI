param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$report = Join-Path $root 'backend/target/civicassist_gemini_benchmark.json'
$reply = Read-Host 'Confirm this key belongs to an AI Studio Free-tier project with billing disabled (type YES)'
if ($reply -cne 'YES') { throw 'Benchmark cancelled before any API requests.' }

$previousKey = $env:GEMINI_API_KEY
$key = $previousKey
if ([string]::IsNullOrWhiteSpace($key)) {
    $secure = Read-Host 'Gemini API key (hidden input)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
if ([string]::IsNullOrWhiteSpace($key)) { throw 'No API key supplied; no requests sent.' }

try {
    # The key is inherited by this child process; it is never placed on the command line.
    $env:GEMINI_API_KEY = $key
    & python (Join-Path $PSScriptRoot 'benchmark_civicassist_gemini.py')
    if ($LASTEXITCODE -ne 0) { throw "Benchmark stopped with exit code $LASTEXITCODE." }
    Write-Host "Review the public-output report at $report"
} finally {
    if ($null -eq $previousKey) { Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue }
    else { $env:GEMINI_API_KEY = $previousKey }
    $key = $null
    $secure = $null
}
