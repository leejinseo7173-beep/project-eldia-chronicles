# ============================================================
# convert_sprite.ps1 — AI/손그림 PNG를 게임용 스프라이트로 변환
#
#   ① 여백 잘라내기(불투명·비백색 영역 바운딩 박스)
#   ② 목표 해상도로 축소 (고품질 보간)
#   ③ 팔레트 32색으로 양자화
#   ④ 흰 배경 → 투명, 발끝을 캔버스 아래에 정렬
#
# 사용법:
#   .\tools\convert_sprite.ps1 -In "원본.png" -Out "assets\sprites\hero_idle0.png"
#   .\tools\convert_sprite.ps1 -In "폴더\*.png" -OutDir "assets\sprites"
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$In,
  [string]$Out,
  [string]$OutDir,
  [int]$Size = 64,          # 출력 캔버스 높이
  [int]$Width = 96,         # 출력 캔버스 너비 (무기를 뻗은 포즈를 담기 위해 세로보다 넓게)
  [int]$CharHeight = 58,    # 캔버스 안에서 캐릭터가 차지할 높이 (Scale 미지정 시에만 사용)
  [double]$Scale = 0,       # ★원본→출력 고정 배율. 0이면 높이 기준 자동.
                            #   포즈마다 bbox 높이가 다르므로(선 자세 694 / 돌진 514 / 쓰러짐 283)
                            #   높이를 일괄 58px로 맞추면 캐릭터가 프레임마다 커졌다 작아진다.
                            #   한 세트는 반드시 같은 배율로 변환해 몸 크기를 고정한다.
  [int]$Bottom = 62,        # 발끝(또는 몸 아랫면)이 놓일 y 좌표
  [ValidateSet('foot','bbox')]
  [string]$Align = 'foot',  # foot = 아래쪽 다리 무게중심을 캔버스 중앙에 (서 있는 포즈용)
                            # bbox = 전체 폭의 중앙에 (쓰러짐처럼 발이 기준이 안 되는 포즈용)
  [double[]]$Tint = @(1.0, 1.0, 1.0),
                            # 양자화 전 RGB 채널 배율. 원본마다 조명 색이 달라(주황 역광 등)
                            # 같은 캐릭터인데 머리·갑옷 색이 프레임마다 튀는 것을 잡는다.
  [ValidateSet('auto','left','right','keep','flip')]
  [string]$Facing = 'auto'  # auto = 무기가 뻗은 쪽을 감지해 left로 맞춤
                            # flip = 감지 결과와 무관하게 무조건 좌우 반전 (자동 감지 실패 프레임용)
                            # keep = 반전 안 함
)

Add-Type -AssemblyName System.Drawing

# --- 공용 팔레트 32색 (src/core/sprites.js PALETTE와 동일) ---
$PaletteHex = @(
  '#0d0b14','#161327','#1c1f3a','#283257','#3c4f82','#5a7fc4','#8fb8e8','#f2ecdd',
  '#3a3a4a','#6a6a7d','#a5a5b5','#d5d2dc','#f2d251','#c9992e','#e8a33f','#d94a3d',
  '#8f2f33','#e87a3f','#f2b380','#f2e28a','#4fc978','#2e7d4f','#1d4a33','#3fbfb0',
  '#7fdde8','#8a4fc9','#4a2e6b','#c95a9a','#f2a5b8','#a9743a','#6b4a2e','#d9b98a'
)
$Palette = $PaletteHex | ForEach-Object {
  [PSCustomObject]@{
    R = [Convert]::ToInt32($_.Substring(1,2),16)
    G = [Convert]::ToInt32($_.Substring(3,2),16)
    B = [Convert]::ToInt32($_.Substring(5,2),16)
  }
}

function Convert-One([string]$srcPath, [string]$dstPath) {
  $src = [System.Drawing.Bitmap]::FromFile($srcPath)
  try {
    # ① 바운딩 박스 — 행·열별 내용 픽셀 수를 세고 **일정 밀도 이상인 줄만** 내용으로 친다.
    #    옅은 배경 얼룩·먼지 자국 한두 픽셀 때문에 박스가 캔버스 전체로 커지는 것을 막는다.
    $step = [Math]::Max(1, [int]($src.Width / 400))
    $cols = New-Object 'int[]' $src.Width
    $rows = New-Object 'int[]' $src.Height
    for ($y = 0; $y -lt $src.Height; $y += $step) {
      for ($x = 0; $x -lt $src.Width; $x += $step) {
        $p = $src.GetPixel($x, $y)
        $isBg = ($p.A -lt 24) -or ($p.R -gt 232 -and $p.G -gt 232 -and $p.B -gt 232)
        if (-not $isBg) { $cols[$x]++; $rows[$y]++ }
      }
    }
    $sampledW = [Math]::Ceiling($src.Width / $step)
    $sampledH = [Math]::Ceiling($src.Height / $step)
    $rowMin = [Math]::Max(2, [int]($sampledW * 0.012))   # 가로 1.2% 이상 차야 내용 행
    $colMin = [Math]::Max(2, [int]($sampledH * 0.012))
    $minX = $src.Width; $maxX = -1; $minY = $src.Height; $maxY = -1
    for ($x = 0; $x -lt $src.Width; $x++) { if ($cols[$x] -ge $colMin) { if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x } } }
    for ($y = 0; $y -lt $src.Height; $y++) { if ($rows[$y] -ge $rowMin) { if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y } } }
    if ($maxX -lt 0) { Write-Warning "$srcPath : 내용이 없습니다"; return }
    $bw = $maxX - $minX + 1; $bh = $maxY - $minY + 1

    # ②-1 ★발 기준 정렬용: 아래쪽 18% 구간(다리·발)의 가로 중심을 찾는다.
    #     전체 바운딩 박스로 중앙 정렬하면 무기를 뻗은 프레임에서 몸이 옆으로 밀려
    #     애니메이션이 좌우로 덜덜 떨린다. 발은 포즈가 바뀌어도 거의 안 움직이므로
    #     발 중심을 고정하면 흔들림이 사라진다.
    # 최소/최대 대신 **무게중심**을 쓴다. 검 끝처럼 얇은 것이 발 높이까지 내려와도
    # 픽셀 수가 적어 영향이 작고, 두꺼운 다리·부츠가 중심을 지배한다.
    $footTop = $maxY - [int]($bh * 0.16)
    $sumX = 0.0; $cnt = 0
    for ($y = $footTop; $y -le $maxY; $y += 1) {
      for ($x = $minX; $x -le $maxX; $x += 1) {
        $p = $src.GetPixel($x, $y)
        $isBg = ($p.A -lt 20) -or ($p.R -gt 242 -and $p.G -gt 242 -and $p.B -gt 242)
        if (-not $isBg) { $sumX += $x; $cnt++ }
      }
    }
    $footCenterSrc = if ($Align -eq 'bbox') { ($minX + $maxX) / 2.0 }
                     elseif ($cnt -gt 0) { $sumX / $cnt }
                     else { ($minX + $maxX) / 2.0 }

    # ②-2 ★바라보는 방향 통일: 무기·망토가 뻗은 쪽(발 중심에서 먼 쪽)을 정면으로 본다.
    #     프레임마다 방향이 다르면 캐릭터가 홱홱 돌아 보인다.
    $needFlip = $false
    if ($Facing -eq 'flip') {
      # 자동 감지가 못 잡는 프레임(망토가 뒤로 길게 뻗어 좌우 폭이 비슷한 돌진 포즈 등)은 수동 지정
      $needFlip = $true
    } elseif ($Facing -ne 'keep') {
      $extLeft = $footCenterSrc - $minX
      $extRight = $maxX - $footCenterSrc
      $facesRight = $extRight -gt ($extLeft * 1.25)
      $facesLeft = $extLeft -gt ($extRight * 1.25)
      $detected = if ($facesRight) { 'right' } elseif ($facesLeft) { 'left' } else { 'unknown' }
      $want = if ($Facing -eq 'auto') { 'left' } else { $Facing }
      if ($detected -ne 'unknown' -and $detected -ne $want) { $needFlip = $true }
      # 반전은 그리기 단계에서 처리한다 (Bitmap.RotateFlip은 이후 GetPixel이 깨짐)
    }

    # ② 축소 — **항상 높이 기준**으로 크기를 맞춘다. 캐릭터 크기가 프레임마다 달라지면
    #    애니메이션에서 커졌다 작아졌다 하므로, 가로가 넘치면 캔버스를 넓게 쓰고
    #    그래도 넘칠 때만 최대 12%까지 줄인다.
    if ($Scale -gt 0) {
      $scale = $Scale                      # 세트 공통 배율 — 몸 크기가 프레임마다 흔들리지 않는다
    } else {
      $scale = $CharHeight / $bh
    }
    if ($bw * $scale -gt $Width) {
      $scale = [Math]::Max($Width / $bw, $scale * 0.88)
    }
    $tw = [Math]::Max(1, [int][Math]::Round($bw * $scale))
    $th = [Math]::Max(1, [int][Math]::Round($bh * $scale))

    # 발 중심이 캔버스 가로 중앙에 오도록 배치
    $footOffsetInBox = ($footCenterSrc - $minX) * $scale
    $destX = [int][Math]::Round($Width / 2.0 - $footOffsetInBox)

    $dst = New-Object System.Drawing.Bitmap($Width, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    if ($needFlip) {
      # 캔버스를 좌우 반전해서 그린다. 발 중심을 중앙에 두는 destX 계산식은 그대로 성립한다.
      $g.TranslateTransform([float]$Width, 0.0)
      $g.ScaleTransform(-1.0, 1.0)
    }
    $destRect = New-Object System.Drawing.Rectangle($destX, [int]($Bottom - $th), $tw, $th)
    $srcRect = New-Object System.Drawing.Rectangle($minX, $minY, $bw, $bh)
    $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $g.ResetTransform()
    $g.Dispose()

    # ③④ 양자화 + 흰 배경 투명
    for ($y = 0; $y -lt $Size; $y++) {
      for ($x = 0; $x -lt $Width; $x++) {
        $p = $dst.GetPixel($x, $y)
        if ($p.A -lt 110) { $dst.SetPixel($x, $y, [System.Drawing.Color]::Transparent); continue }
        if ($p.R -gt 238 -and $p.G -gt 238 -and $p.B -gt 238) { $dst.SetPixel($x, $y, [System.Drawing.Color]::Transparent); continue }
        $pr = [Math]::Min(255, [int]($p.R * $Tint[0]))
        $pg = [Math]::Min(255, [int]($p.G * $Tint[1]))
        $pb = [Math]::Min(255, [int]($p.B * $Tint[2]))
        $best = $null; $bd = [double]::MaxValue
        foreach ($c in $Palette) {
          $dr = $pr - $c.R; $dg = $pg - $c.G; $db = $pb - $c.B
          $d = $dr*$dr*0.30 + $dg*$dg*0.59 + $db*$db*0.11
          if ($d -lt $bd) { $bd = $d; $best = $c }
        }
        $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $best.R, $best.G, $best.B))
      }
    }

    $dir = Split-Path $dstPath -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
    $dst.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
    "OK  {0}  ->  {1}  (원본 {2}x{3} 영역 {4}x{5})" -f (Split-Path $srcPath -Leaf), (Split-Path $dstPath -Leaf), $src.Width, $src.Height, $bw, $bh
  } finally { $src.Dispose() }
}

$files = @(Get-ChildItem $In -File -ErrorAction SilentlyContinue)
if ($files.Count -eq 0) { Write-Error "입력 파일 없음: $In"; exit 1 }
foreach ($f in $files) {
  $target = if ($Out) { $Out } else { Join-Path $OutDir ($f.BaseName + '.png') }
  Convert-One $f.FullName $target
}
