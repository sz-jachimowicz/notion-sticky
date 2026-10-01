# Ikony i ekran startowy aplikacji na Androida w stylu logo: ciemne tło + jasna karteczka z zagiętym rogiem.
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$res = Join-Path $root 'android\app\src\main\res'
$BG = [System.Drawing.Color]::FromArgb(255, 32, 32, 32)
$PAGE = [System.Drawing.Color]::FromArgb(255, 25, 25, 25)

# karteczka o boku $w, lewy górny róg w ($x,$y)
function DrawNote($g, [float]$x, [float]$y, [float]$w) {
  $r = $w * 0.12; $fold = $w * 0.30
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddArc($x, $y, $r * 2, $r * 2, 180, 90)
  $p.AddArc($x + $w - $r * 2, $y, $r * 2, $r * 2, 270, 90)
  $p.AddLine($x + $w, $y + $r, $x + $w, $y + $w - $fold)
  $p.AddLine($x + $w, $y + $w - $fold, $x + $w - $fold, $y + $w)
  $p.AddArc($x, $y + $w - $r * 2, $r * 2, $r * 2, 90, 90)
  $p.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 236, 236, 236))), $p)
  $f = New-Object System.Drawing.Drawing2D.GraphicsPath
  $f.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF ($x + $w), ($y + $w - $fold)),
    (New-Object System.Drawing.PointF ($x + $w - $fold), ($y + $w - $fold)),
    (New-Object System.Drawing.PointF ($x + $w - $fold), ($y + $w))))
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 150, 150, 150))), $f)
}

function NewCanvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  return @($bmp, $g)
}

function RoundRect($g, $brush, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); $g.FillPath($brush, $p)
}

$legacy = @{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }
foreach ($d in $legacy.Keys) {
  $s = $legacy[$d]
  $dir = Join-Path $res "mipmap-$d"

  # zwykła ikona (zaokrąglony kwadrat)
  $c = NewCanvas $s $s; $bmp = $c[0]; $g = $c[1]
  RoundRect $g (New-Object System.Drawing.SolidBrush $BG) ($s * 0.04) ($s * 0.04) ($s * 0.92) ($s * 0.92) ($s * 0.22)
  DrawNote $g ($s * 0.27) ($s * 0.27) ($s * 0.46)
  $bmp.Save((Join-Path $dir 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()

  # okrągła
  $c = NewCanvas $s $s; $bmp = $c[0]; $g = $c[1]
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $BG), ($s * 0.04), ($s * 0.04), ($s * 0.92), ($s * 0.92))
  DrawNote $g ($s * 0.28) ($s * 0.28) ($s * 0.44)
  $bmp.Save((Join-Path $dir 'ic_launcher_round.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()

  # pierwszy plan ikony adaptacyjnej (108dp, bezpieczna strefa 66dp)
  $fs = [int]($s * 108 / 48)
  $c = NewCanvas $fs $fs; $bmp = $c[0]; $g = $c[1]
  DrawNote $g ($fs * 0.335) ($fs * 0.335) ($fs * 0.33)
  $bmp.Save((Join-Path $dir 'ic_launcher_foreground.png'), [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}

# tło ikony adaptacyjnej
Set-Content -Path (Join-Path $res 'values\ic_launcher_background.xml') -Encoding utf8 -Value @'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#202020</color>
</resources>
'@

# ekrany startowe (zamiast logo Capacitora): ciemne tło + mała karteczka
Get-ChildItem $res -Recurse -Filter 'splash.png' | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName); $w = $img.Width; $h = $img.Height; $img.Dispose()
  $c = NewCanvas $w $h; $bmp = $c[0]; $g = $c[1]
  $g.Clear($PAGE)
  $n = [math]::Min($w, $h) * 0.16
  DrawNote $g (($w - $n) / 2) (($h - $n) / 2) $n
  $bmp.Save($_.FullName, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $bmp.Dispose()
}
Write-Output 'ok'
