Add-Type -AssemblyName System.Drawing

function Create-Icon($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    
    # Dark background
    $bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(17, 17, 34))
    $g.FillRectangle($bgBrush, 0, 0, $size, $size)
    
    # Purple circle
    $p = [int]($size * 0.12)
    $circleSize = $size - (2 * $p)
    $purpleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(139, 92, 246))
    $g.FillEllipse($purpleBrush, $p, $p, $circleSize, $circleSize)
    
    # Inner dark circle
    $p2 = [int]($size * 0.2)
    $innerSize = $size - (2 * $p2)
    $darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(20, 15, 40))
    $g.FillEllipse($darkBrush, $p2, $p2, $innerSize, $innerSize)
    
    # Lightning bolt
    $cx = $size / 2
    $cy = $size / 2
    $s = $size * 0.18
    
    $points = @(
        [System.Drawing.PointF]::new(($cx - $s*0.1), ($cy - $s*1.8)),
        [System.Drawing.PointF]::new(($cx + $s*0.8), ($cy - $s*1.8)),
        [System.Drawing.PointF]::new(($cx + $s*0.1), ($cy - $s*0.2)),
        [System.Drawing.PointF]::new(($cx + $s*0.9), ($cy - $s*0.2)),
        [System.Drawing.PointF]::new(($cx - $s*0.3), ($cy + $s*1.8)),
        [System.Drawing.PointF]::new(($cx + $s*0.1), ($cy + $s*0.3)),
        [System.Drawing.PointF]::new(($cx - $s*0.7), ($cy + $s*0.3))
    )
    
    $boltBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(167, 139, 250))
    $g.FillPolygon($boltBrush, $points)
    
    $g.Dispose()
    
    $dir = [System.IO.Path]::GetDirectoryName($path)
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created icon at $path"
}

Create-Icon 16 'e:\extension\assets\icons\icon16.png'
Create-Icon 32 'e:\extension\assets\icons\icon32.png'
Create-Icon 48 'e:\extension\assets\icons\icon48.png'
Create-Icon 128 'e:\extension\assets\icons\icon128.png'
Write-Host 'All icons created!'
