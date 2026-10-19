$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$port = 8766

try {
    $ipConfigs = @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' -and $_.IPv4DefaultGateway })
    $addresses = @($ipConfigs | ForEach-Object { $_.IPv4Address } | Where-Object { $_ -and $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress -Unique)
} catch {
    $addresses = @()
}

if ($addresses.Count -eq 0) {
    Write-Host 'ERROR: No network address found. Connect this PC to the same network as the iPad.' -ForegroundColor Red
    Read-Host 'Press Enter to continue'
    return
}

Write-Host 'Open this address on the iPad:' -ForegroundColor Green
foreach ($address in $addresses) {
    Write-Host "  http://${address}:$port/" -ForegroundColor Cyan
}
Write-Host ''
Write-Host 'Keep this window open. Close it when finished.' -ForegroundColor Yellow
Write-Host 'Use only while the iPad and PC are on the same local network.' -ForegroundColor Yellow
Write-Host ''

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
try {
    $listener.Start()
    Write-Host 'Local preview server started.' -ForegroundColor Green
    Write-Host 'If Windows Firewall asks, allow Private networks only.'
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { $client.Close(); continue }
            $parts = $requestLine.Split(' ')
            $method = $parts[0]
            $target = if ($parts.Length -gt 1) { $parts[1] } else { '/' }
            while ($true) { $header = $reader.ReadLine(); if ($null -eq $header -or $header -eq '') { break } }

            $status = '200 OK'
            $body = [byte[]]@()
            $contentType = 'text/plain; charset=utf-8'
            if ($method -ne 'GET' -and $method -ne 'HEAD') {
                $status = '405 Method Not Allowed'
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method not allowed')
            } else {
                $urlPath = ($target.Split('?')[0])
                $decoded = [System.Uri]::UnescapeDataString($urlPath.TrimStart('/'))
                if ([string]::IsNullOrWhiteSpace($decoded)) { $decoded = 'index.html' }
                $relative = $decoded.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
                $file = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
                if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $status = '403 Forbidden'; $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                } elseif (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
                    $status = '404 Not Found'; $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                } else {
                    $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
                    switch ($extension) {
                        '.html' { $contentType = 'text/html; charset=utf-8' }
                        '.css'  { $contentType = 'text/css; charset=utf-8' }
                        '.js'   { $contentType = 'application/javascript; charset=utf-8' }
                        '.mjs'  { $contentType = 'application/javascript; charset=utf-8' }
                        '.json' { $contentType = 'application/json; charset=utf-8' }
                        '.svg'  { $contentType = 'image/svg+xml' }
                        '.png'  { $contentType = 'image/png' }
                        '.pdf'  { $contentType = 'application/pdf' }
                        '.txt'  { $contentType = 'text/plain; charset=utf-8' }
                        default { $contentType = 'application/octet-stream' }
                    }
                    $body = [System.IO.File]::ReadAllBytes($file)
                }
            }
            $head = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n"
            $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
            $stream.Write($headBytes, 0, $headBytes.Length)
            if ($method -ne 'HEAD' -and $body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
            $stream.Flush()
        } catch {
            Write-Host ('Connection error: ' + $_.Exception.Message) -ForegroundColor DarkYellow
        } finally {
            $client.Close()
        }
    }
} catch {
    Write-Host 'ERROR: Could not start the local server.' -ForegroundColor Red
    Write-Host ('Details: ' + $_.Exception.Message) -ForegroundColor Red
    Read-Host 'Press Enter to continue'
} finally {
    if ($listener) { $listener.Stop() }
}
