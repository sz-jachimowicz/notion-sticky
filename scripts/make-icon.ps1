# Generuje minimalistyczne logo: ciemny squircle + jasna karteczka z zagiętym rogiem.
# Wynik: assets/icon.png (256) oraz assets/icon-<rozmiar>.png do pliku .ico
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$assets = Join-Path $root 'assets'

function RoundedPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

function Draw([int]$size, [string]$out) {
  $S = 1024
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)

  # tło
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 32, 32, 32))
  $g.FillPath($bg, (RoundedPath 40 40 944 944 230))

  # karteczka z zagiętym prawym dolnym rogiem
  $x = 262; $y = 262; $w = 500; $h = 500; $r = 60; $fold = 150
  $note = New-Object System.Drawing.Drawing2D.GraphicsPath
  $note.AddArc($x, $y, $r * 2, $r * 2, 180, 90)
  $note.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)
  $note.AddLine($x + $w, $y + $r, $x + $w, $y + $h - $fold)
  $note.AddLine($x + $w, $y + $h - $fold, $x + $w - $fold, $y + $h)
  $note.AddArc($x, $y + $h - $r * 2, $r * 2, $r * 2, 90, 90)
  $note.CloseFigure()
  $fg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 236, 236, 236))
  $g.FillPath($fg, $note)

  # zagięcie
  $foldPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $foldPath.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($x + $w), ($y + $h - $fold)),
    (New-Object System.Drawing.PointF ($x + $w - $fold), ($y + $h - $fold)),
    (New-Object System.Drawing.PointF ($x + $w - $fold), ($y + $h))
  ))
  $fb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 150, 150, 150))
  $g.FillPath($fb, $foldPath)

  $small = New-Object System.Drawing.Bitmap $size, $size
  $g2 = [System.Drawing.Graphics]::FromImage($small)
  $g2.InterpolationMode = 'HighQualityBicubic'
  $g2.SmoothingMode = 'AntiAlias'
  $g2.PixelOffsetMode = 'HighQuality'
  $g2.DrawImage($bmp, 0, 0, $size, $size)
  $small.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $g2.Dispose(); $small.Dispose()
}

Draw 256 (Join-Path $assets 'icon.png')
foreach ($s in 16, 24, 32, 48, 64, 128, 256) { Draw $s (Join-Path $assets "icon-$s.png") }
Write-Output 'ok'
