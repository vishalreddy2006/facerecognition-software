# Auto-Restart Backend Server
# This keeps the server running even if it crashes

$projectPath = "c:\Users\k.vishal reddy\Pictures\FED FOLDER\face recognition software using web page\server"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Backend Server - Auto-Restart Mode" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This window will keep the server running." -ForegroundColor Yellow
Write-Host "DO NOT CLOSE THIS WINDOW!" -ForegroundColor Red
Write-Host ""

Set-Location $projectPath

while ($true) {
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting backend server..." -ForegroundColor Green
    
    # Start Node.js process
    $process = Start-Process -FilePath "node" -ArgumentList "server-quick.js" -NoNewWindow -PassThru -Wait
    
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Server stopped. Exit code: $($process.ExitCode)" -ForegroundColor Yellow
    
    if ($process.ExitCode -eq 0) {
        Write-Host "Server shut down cleanly. Exiting." -ForegroundColor Green
        break
    } else {
        Write-Host "Server crashed! Restarting in 3 seconds..." -ForegroundColor Red
        Start-Sleep -Seconds 3
    }
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
