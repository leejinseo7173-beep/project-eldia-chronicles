# ============================================================
# build_hero_walk16.py — 주인공 정면·뒷모습 걷기 8프레임 변환
#
#   assets/sprites/_source/walk_down0~7.png  →  assets/sprites/hero_sword/walk_down0~7.png
#   assets/sprites/_source/walk_up0~7.png    →  assets/sprites/hero_sword/walk_up0~7.png
#
#   python tools/build_hero_walk16.py
#
# ── convert_sprite.ps1 을 안 쓰고 따로 만든 이유 ──────────────
# ① 원본에 파일명 캡션이 회색 글자로 구워져 있다. 그대로 변환하면 bbox 아래끝이
#    글자가 되어 캐릭터가 공중에 뜨고 글자까지 스프라이트에 들어간다.
# ② PS 변환기의 가로 정렬(발 무게중심 / bbox 중심)이 이 세트에는 안 맞는다.
#    걷기 8프레임은 다리가 좌우로 크게 벌어져 발 중심이 프레임마다 48px(원본 기준)
#    움직인다. 그걸 캔버스 중앙에 고정하면 **몸통이 좌우로 덜덜 떨린다.**
#    걷기에서 가장 안 움직이는 건 머리다 → 머리 bbox 중심을 캔버스 중앙에 고정한다.
# ③ 정면/뒷모습 원화의 인물 높이가 서로 다르게 그려져 있다(정면 225 / 뒷모습 220).
#    방향이 바뀔 때 캐릭터 크기가 변하면 안 되므로 **방향별로 다른 배율**을 써서
#    둘 다 화면상 58px 이 되게 맞춘다. (한 방향 안에서는 배율 고정 — 그래야
#    걸을 때 몸이 오르내리는 물결이 살아 있고, 커졌다 작아지지는 않는다)
#
# ④ ★0~3번 프레임을 좌우 반전해서 쓴다.
#    원화 AI가 후반 사이클(4~7)을 **캐릭터째 좌우 반전**해서 그렸다. 그대로 쓰면
#    검이 4프레임마다 오른손↔왼손을 오간다 — 58px 크기에서도 뚜렷하게 보이는 결함이다.
#    실측: 정면 검 위치(머리 중심 대비) 0~3 = -21/-10/-19/-13, 4~7 = +23/+14/+13/+13.
#          뒷모습 칼집 위치도 같은 방향으로 갈린다.
#    기준은 전투 옆모습이다 — 왼쪽을 보며 검을 **몸 앞(=캐릭터의 왼손)** 에 든다.
#    정면에서 캐릭터의 왼손은 화면 오른쪽 → 4~7이 맞고 0~3이 틀렸다. 그래서 0~3을 뒤집는다.
#    반전하면 다리 선행발 교대는 사라지지만(반전은 좌우만 바꾼다), 정면·뒷모습에서
#    선행발은 거의 안 보이고 **몸의 상하 물결이 두 번**(한 걸음에 한 번) 도는 것은 유지된다.
#    검이 튀는 쪽이 훨씬 눈에 띈다.
#
# 발끝은 y=60 에 놓는다 — 전투 옆모습(build_hero_sword.ps1, Bottom=61)과 동일.
# ============================================================

import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', '_source')
OUT = os.path.join(ROOT, 'assets', 'sprites', 'hero_sword')

W, H = 96, 64          # 출력 캔버스 (전투 스프라이트와 동일)
FOOT_ROW = 60          # 발끝이 놓일 마지막 잉크 행
CHAR_H = 58            # 서 있는 자세 기준 인물 높이

# src/core/sprites.js PALETTE 와 동일한 32색
PALETTE_HEX = [
    '0d0b14', '161327', '1c1f3a', '283257', '3c4f82', '5a7fc4', '8fb8e8', 'f2ecdd',
    '3a3a4a', '6a6a7d', 'a5a5b5', 'd5d2dc', 'f2d251', 'c9992e', 'e8a33f', 'd94a3d',
    '8f2f33', 'e87a3f', 'f2b380', 'f2e28a', '4fc978', '2e7d4f', '1d4a33', '3fbfb0',
    '7fdde8', '8a4fc9', '4a2e6b', 'c95a9a', 'f2a5b8', 'a9743a', '6b4a2e', 'd9b98a',
]
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX], dtype=float)
# 사람 눈 가중 (PS 변환기와 같은 계수)
LUMA = np.array([0.30, 0.59, 0.11])


def load_ink(path):
    """RGB 배열과 잉크 마스크(캡션 제거·먼지 제거)를 돌려준다."""
    a = np.array(Image.open(path).convert('RGB')).astype(int)
    ink = (a < 240).any(axis=2)

    # ① 캡션 제거 — 아래에서 올라오며 만나는 첫 잉크 덩어리가 '무채색만'이면 글자다
    rows = ink.sum(axis=1)
    y = len(rows) - 1
    while y >= 0 and rows[y] == 0:
        y -= 1
    lo = y
    while y >= 0 and rows[y] > 0:
        y -= 1
    hi = y + 1
    if hi > lo:
        seg = np.zeros((0, 3))
    else:
        seg = a[hi:lo + 1][ink[hi:lo + 1]]
    if len(seg) and hi > a.shape[0] * 0.8:
        gray = np.all(np.abs(seg - seg.mean(axis=1, keepdims=True)) < 14, axis=1).mean()
        if gray > 0.9:
            ink[hi:, :] = False

    # ② 먼지 제거 — 잉크가 1픽셀뿐인 행/열은 내용으로 치지 않는다
    return a, ink


def bbox(ink):
    rows = ink.sum(axis=1)
    cols = ink.sum(axis=0)
    ys = np.where(rows >= 2)[0]
    xs = np.where(cols >= 2)[0]
    return xs.min(), ys.min(), xs.max(), ys.max()


def head_center(ink, top, bot):
    """머리 bbox 가로 중심. 걷기에서 가장 안 흔들리는 기준점."""
    band = ink[top:top + max(8, int((bot - top) * 0.19))]
    xs = np.where(band.any(axis=0))[0]
    return (xs.min() + xs.max()) / 2.0


def quantize(rgb):
    """32색 팔레트로 최근접 양자화 (H,W,3) → (H,W,3)"""
    flat = rgb.reshape(-1, 3).astype(float)
    d = ((flat[:, None, :] - PALETTE[None, :, :]) ** 2 * LUMA).sum(axis=2)
    return PALETTE[d.argmin(axis=1)].reshape(rgb.shape).astype(np.uint8)


def build(names, scale, label, flip_first_half=True):
    made = []
    for idx, name in enumerate(names):
        a, ink = load_ink(os.path.join(SRC, name))
        l, t, r, b = bbox(ink)
        hc = head_center(ink, t, b)

        # 잉크만 남기고 나머지는 순백으로 (캡션이 축소에 섞이지 않게)
        clean = np.where(ink[:, :, None], a, 255).astype(np.uint8)
        crop = Image.fromarray(clean[t:b + 1, l:r + 1])
        hx = hc - l                                  # 잘라낸 그림 안에서의 머리 중심
        if flip_first_half and idx < 4:              # 위 주석 ④ — 검을 한 손에 고정
            crop = crop.transpose(Image.FLIP_LEFT_RIGHT)
            hx = (r - l) - hx
        tw = max(1, int(round((r - l + 1) * scale)))
        th = max(1, int(round((b - t + 1) * scale)))
        small = crop.resize((tw, th), Image.LANCZOS)

        canvas = Image.new('RGB', (W, H), (255, 255, 255))
        dx = int(round(W / 2.0 - hx * scale))
        dy = FOOT_ROW + 1 - th
        canvas.paste(small, (dx, dy))

        arr = np.array(canvas).astype(int)
        opaque = ~((arr > 238).all(axis=2))
        out = np.zeros((H, W, 4), dtype=np.uint8)
        out[:, :, :3] = quantize(arr)
        out[:, :, 3] = np.where(opaque, 255, 0)
        # 캔버스 밖으로 나간 부분이 없어야 한다
        Image.fromarray(out, 'RGBA').save(os.path.join(OUT, name))
        made.append((name, out[:, :, 3] > 0))
    return made


def verify(made, label):
    bad = 0
    print(f'--- {label} ---')
    for name, m in made:
        ys, xs = np.where(m)
        note = []
        if ys.max() != FOOT_ROW:
            note.append(f'발끝 y={ys.max()} (기대 {FOOT_ROW})')
            bad += 1
        if xs.min() <= 0 or xs.max() >= W - 1 or ys.min() <= 0:
            note.append(f'캔버스 잘림 x{xs.min()}~{xs.max()} y{ys.min()}')
            bad += 1
        print(f'  {name:16} x{xs.min():3}~{xs.max():3}  y{ys.min():3}~{ys.max():3}  '
              f'높이{ys.max() - ys.min() + 1:3}  {" ".join(note)}')
    return bad


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    os.makedirs(OUT, exist_ok=True)

    # 방향별 기준 인물 높이 = '보통 높이' 프레임(0·3·4·7, 접지/밀어내기)의 평균.
    # 1·5(눌림)는 웅크려 낮고 2·6(통과)은 발돋움해 높으므로 기준에서 뺀다.
    plans = []
    for label, prefix in (('정면', 'walk_down'), ('뒷모습', 'walk_up')):
        names = [f'{prefix}{i}.png' for i in range(8)]
        hs = []
        for n in (0, 3, 4, 7):
            _, ink = load_ink(os.path.join(SRC, f'{prefix}{n}.png'))
            l, t, r, b = bbox(ink)
            hs.append(b - t + 1)
        ref = sum(hs) / len(hs)
        scale = CHAR_H / ref
        print(f'{label}: 기준 높이 {ref:.1f}px → 배율 {scale:.5f}')
        plans.append((names, scale, label))

    bad = 0
    for names, scale, label in plans:
        bad += verify(build(names, scale, label), label)
    print('OK — 이상 없음' if bad == 0 else f'경고 {bad}건')
