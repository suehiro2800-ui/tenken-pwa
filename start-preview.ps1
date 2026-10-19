$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$prefix = 'http://127.0.0.1:8765/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host 'Preview server started.' -ForegroundColor Green
    Write-Host 'Opening http://127.0.0.1:8765 in your browser.'
    Write-Host 'Keep this window open while testing. Close it to stop the server.'
    Start-Process $prefix

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $response = $context.Response
        try {
            $path = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($path)) { $path = 'index.html' }
            $relative = $path.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $file = [System.IO.Path]::GetFullPath((Join-Path $root $relative))
            if (-not $file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $response.StatusCode = 403
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                $response.ContentType = 'text/plain; charset=utf-8'
            } elseif (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                $response.ContentType = 'text/plain; charset=utf-8'
            } else {
                $response.StatusCode = 200
                $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
                switch ($extension) {
                    '.html' { $response.ContentType = 'text/html; charset=utf-8' }
                    '.css'  { $response.ContentType = 'text/css; charset=utf-8' }
                    '.js'   { $response.ContentType = 'application/javascript; charset=utf-8' }
                    '.mjs'  { $response.ContentType = 'application/javascript; charset=utf-8' }
                    '.json' { $response.ContentType = 'application/json; charset=utf-8' }
                    '.svg'  { $response.ContentType = 'image/svg+xml' }
                    '.png'  { $response.ContentType = 'image/png' }
                    '.pdf'  { $response.ContentType = 'application/pdf' }
                    '.txt'  { $response.ContentType = 'text/plain; charset=utf-8' }
                    default { $response.ContentType = 'application/octet-stream' }
                }
                $bytes = [System.IO.File]::ReadAllBytes($file)
            }
            $response.ContentLength64 = $bytes.Length
            if ($context.Request.HttpMethod -ne 'HEAD') {
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            $response.StatusCode = 500
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('Server error')
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host $_.Exception.Message -ForegroundColor Red
        } finally {
            $response.Close()
        }
    }
} catch {
    Write-Host ('Preview server could not start: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'This window will stay open so the error can be read.'
    Read-Host 'Press Enter to close'
} finally {
    if ($listener.IsListening) { $listener.Stop() }
}
