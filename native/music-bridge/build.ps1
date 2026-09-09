$ErrorActionPreference = 'Stop'
$bridgeRoot = $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /platform:x64 /target:winexe "/out:$bridgeRoot\11scat-Music.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "$bridgeRoot\Bridge.cs"
if ($LASTEXITCODE -ne 0) { throw 'Music bridge build failed' }
$archive = Join-Path $bridgeRoot '..\..\public\music\11scat-Music.zip'
Compress-Archive -LiteralPath (Join-Path $bridgeRoot '11scat-Music.exe'),(Join-Path $bridgeRoot 'README.txt') -DestinationPath $archive -Force
$digest = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$archive.sha256" -Value "$digest  11scat-Music.zip" -Encoding ascii
