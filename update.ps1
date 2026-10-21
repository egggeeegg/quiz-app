# Run parse_docx.py to generate questions.json, then seed the database
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir
Write-Host "=== Step 1: Parse docx files (optional) ==="
if (Test-Path "parse_docx.py") {
  python parse_docx.py
} else {
  Write-Host "parse_docx.py not found, using existing questions.json"
}
Write-Host "=== Step 2: Seed database ==="
Set-Location (Join-Path $scriptDir "backend")
node src/seed.js
Write-Host "=== Done ==="
