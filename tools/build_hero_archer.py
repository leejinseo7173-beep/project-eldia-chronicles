# ============================================================
# build_hero_archer.py — 주인공 궁수 전투 원화 13장 변환 (192×128 고해상도판)
#
#   assets/sprites/_source_archer/*.png (320×384)  →  assets/sprites/hero_archer/*.png (192×128)
#
#   python tools/build_hero_archer.py
#
# 해상도 2배 개정(2026-08-23)에서 초판의 "흰 캔버스 합성 + 밝은 경계 벗기기"를
# c02 파이프라인(프리멀티플라이드 알파 축소)으로 교체 — 헤일로가 원천적으로 안 생기므로
# 벗기기가 필요 없다 (구판은 해상도를 키우면 헤일로 띠도 두꺼워져 3회 벗기기로 부족).
# 초판에서 승계한 것:
#   · FLIP 실측 확정값 (v2 세트: 공격 4장 + down이 오른쪽 보기)
#   · 가장자리 조각 제거 (빈 열로 분리된 이웃 스프라이트 잔재)
#   · attack_up 포즈 (cast 슬롯은 등록표에서 attack_up 재사용)
# ============================================================

import os
import sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', '_source_archer')
OUT = os.path.join(ROOT, 'assets', 'sprites', 'hero_archer')

W, H = 192, 128
FOOT_ROW = 120
CHAR_H = 116           # 검사와 동일 체격
THICK = 8

# 실측 확정 (초판 v2 로그) — 세트를 다시 뽑기 전까지 불변
FLIP = {'attack0', 'attack1', 'attack2', 'attack3', 'down'}

NAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3',
         'attack0', 'attack1', 'attack2', 'attack3', 'attack_up', 'hurt', 'down']

PALETTE_HEX = [
    '0d0b14', '161327', '1c1f3a', '283257', '3c4f82', '5a7fc4', '8fb8e8', 'f2ecdd',
    '3a3a4a', '6a6a7d', 'a5a5b5', 'd5d2dc', 'f2d251', 'c9992e', 'e8a33f', 'd94a3d',
    '8f2f33', 'e87a3f', 'f2b380', 'f2e28a', '4fc978', '2e7d4f', '1d4a33', '3fbfb0',
    '7fdde8', '8a4fc9', '4a2e6b', 'c95a9a', 'f2a5b8', 'a9743a', '6b4a2e', 'd9b98a',
]
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX], dtype=float)
LUMA = np.array([0.30, 0.59, 0.11])


def load_ink(name):
    a = np.array(Image.open(os.path.join(SRC, name + '.png')).convert('RGB')).astype(int)
    ink = (a < 240).any(axis=2)
    # 가장자리 조각 제거 — 빈 열로 나뉜 구간 중 잉크가 가장 많은 것만 본체로.
    # 본체와 12px 이내로 붙은 구간은 활 끝일 수 있으니 살린다.
    cols = ink.sum(axis=0)
    runs, start = [], None
    for x in range(a.shape[1]):
        if cols[x] > 0 and start is None:
            start = x
        if cols[x] == 0 and start is not None:
            runs.append((start, x - 1)); start = None
    if start is not None:
        runs.append((start, a.shape[1] - 1))
    if len(runs) > 1:
        main = max(runs, key=lambda r: ink[:, r[0]:r[1] + 1].sum())
        for r in runs:
            if r == main:
                continue
            gap = main[0] - r[1] if r[1] < main[0] else r[0] - main[1]
            if gap > 12:
                ink[:, r[0]:r[1] + 1] = False
    return a, ink


def thick_rows(ink):
    rows = ink.sum(axis=1)
    ys = np.where(rows >= THICK)[0]
    return ys.min(), ys.max()


def build():
    os.makedirs(OUT, exist_ok=True)
    _, ink0 = load_ink('idle0')
    t0, b0 = thick_rows(ink0)
    scale = CHAR_H / (b0 - t0 + 1)
    print(f'기준(idle0) 두꺼운 높이 {b0 - t0 + 1}px → 배율 {scale:.5f}')

    report = []
    for name in NAMES:
        a, ink = load_ink(name)
        ys, xs = np.where(ink)
        l, r = xs.min(), xs.max()
        t = ys.min()
        _, thickB = thick_rows(ink)

        footTop = thickB - max(6, int((thickB - t) * 0.16))
        band = ink[footTop:thickB + 1]
        bcols = band.sum(axis=0)
        bxs = np.where(bcols >= 2)[0]
        footC = (bxs.min() + bxs.max()) / 2 if len(bxs) else (l + r) / 2

        rgba = np.zeros((a.shape[0], a.shape[1], 4), dtype=np.float64)
        rgba[:, :, :3] = a * ink[:, :, None]
        rgba[:, :, 3] = ink * 255.0
        sub = rgba[t:ys.max() + 1, l:r + 1]
        fc = footC - l
        if name in FLIP:
            sub = sub[:, ::-1]
            fc = (r - l) - fc
        tw = max(1, int(round((r - l + 1) * scale)))
        th = max(1, int(round((ys.max() - t + 1) * scale)))
        sm = np.array(Image.fromarray(sub.astype(np.uint8), 'RGBA').resize((tw, th), Image.LANCZOS)).astype(np.float64)
        alpha = sm[:, :, 3]
        col = np.zeros((th, tw, 3))
        mm = alpha > 8
        col[mm] = sm[mm, :3] * (255.0 / alpha[mm, None])
        np.clip(col, 0, 255, out=col)

        dy = FOOT_ROW - int(round((thickB - t) * scale))
        dx = int(round(W / 2 - fc * scale))
        arr = np.zeros((H, W, 3))
        av = np.zeros((H, W))
        sy0, sx0 = max(0, -dy), max(0, -dx)
        dy0, dx0 = max(0, dy), max(0, dx)
        hgt = min(th - sy0, H - dy0)
        wdt = min(tw - sx0, W - dx0)
        if hgt > 0 and wdt > 0:
            arr[dy0:dy0 + hgt, dx0:dx0 + wdt] = col[sy0:sy0 + hgt, sx0:sx0 + wdt]
            av[dy0:dy0 + hgt, dx0:dx0 + wdt] = alpha[sy0:sy0 + hgt, sx0:sx0 + wdt]
        opaque = av > 127
        flat = arr.reshape(-1, 3).astype(float)
        d = ((flat[:, None, :] - PALETTE[None, :, :]) ** 2 * LUMA).sum(axis=2)
        q = PALETTE[d.argmin(axis=1)].reshape(arr.shape).astype(np.uint8)
        # 실루엣 밖 잔점 제거 — 16px 미만 알파 섬 (192×128 기준, 구판 4px의 면적 등가)
        lab2 = np.zeros((H, W), dtype=np.int32)
        cur2 = 0
        op = opaque.copy()
        for sy in range(H):
            for sx in np.nonzero(op[sy] & (lab2[sy] == 0))[0]:
                cur2 += 1
                q2 = deque([(sy, sx)])
                lab2[sy, sx] = cur2
                cells = [(sy, sx)]
                while q2:
                    yy, xx = q2.popleft()
                    for ny, nx in ((yy - 1, xx), (yy + 1, xx), (yy, xx - 1), (yy, xx + 1)):
                        if 0 <= ny < H and 0 <= nx < W and op[ny, nx] and lab2[ny, nx] == 0:
                            lab2[ny, nx] = cur2
                            q2.append((ny, nx))
                            cells.append((ny, nx))
                if len(cells) < 16:
                    for yy, xx in cells:
                        opaque[yy, xx] = False


        # 외곽 흰 점 제거 (2026-08-24): 투명에 접한 밝은(luma>150) 픽셀 중 연결 3px 이하로
        # 고립된 것은 흰 배경 안티에일리어싱 잔여다 — 가장 어두운 이웃 불투명 색으로 눌러
        # 붙인다 (지우면 외곽선에 핀홀이 생긴다). 드레스 자락·검날·뼈처럼 밝은 재질이
        # 실루엣을 이루는 긴 띠는 연결 크기로 살아남는다. 소스 해상도 벗기기(v1)는
        # 얇은 외곽선을 뚫고 은발·금 지팡이를 파먹어 폐기 — 이건 출력 픽셀 단위 국소 수술.
        lumaq = q[:, :, 0] * 0.30 + q[:, :, 1] * 0.59 + q[:, :, 2] * 0.11
        nbT = np.zeros_like(opaque)
        nbT[1:, :] |= ~opaque[:-1, :]; nbT[:-1, :] |= ~opaque[1:, :]
        nbT[:, 1:] |= ~opaque[:, :-1]; nbT[:, :-1] |= ~opaque[:, 1:]
        rim = opaque & nbT & (lumaq > 150)
        seen = np.zeros_like(rim)
        for ry in range(rim.shape[0]):
            for rx in np.nonzero(rim[ry] & (~seen[ry]))[0]:
                comp = [(ry, rx)]
                seen[ry, rx] = True
                qq = deque([(ry, rx)])
                while qq:
                    cy, cx = qq.popleft()
                    for dy2 in (-1, 0, 1):
                        for dx2 in (-1, 0, 1):
                            ny, nx = cy + dy2, cx + dx2
                            if 0 <= ny < rim.shape[0] and 0 <= nx < rim.shape[1] \
                               and rim[ny, nx] and not seen[ny, nx]:
                                seen[ny, nx] = True
                                qq.append((ny, nx))
                                comp.append((ny, nx))
                if len(comp) <= 3:
                    for cy, cx in comp:
                        best, bl = None, 1e9
                        for dy2 in (-1, 0, 1):
                            for dx2 in (-1, 0, 1):
                                ny, nx = cy + dy2, cx + dx2
                                if (dy2 or dx2) and 0 <= ny < rim.shape[0] \
                                   and 0 <= nx < rim.shape[1] and opaque[ny, nx] \
                                   and not rim[ny, nx] and lumaq[ny, nx] < bl:
                                    bl, best = lumaq[ny, nx], (ny, nx)
                        if best is not None:
                            q[cy, cx] = q[best[0], best[1]]
        out = np.zeros((H, W, 4), dtype=np.uint8)
        out[:, :, :3] = q
        out[:, :, 3] = np.where(opaque, 255, 0)
        Image.fromarray(out, 'RGBA').save(os.path.join(OUT, name + '.png'))

        m = out[:, :, 3] > 0
        oys, oxs = np.where(m)
        clipT = '△위잘림' if t * scale + dy < 0 or oys.min() == 0 else ''
        clipS = '△좌우잘림' if oxs.min() == 0 or oxs.max() == W - 1 else ''
        report.append((name, oxs.min(), oxs.max(), oys.min(), oys.max(), clipT + clipS))

    print(f'{"file":11} {"x":>9} {"y":>9} {"경고":>6}')
    bad = 0
    for name, x0, x1, y0, y1, warn in report:
        print(f'{name:11} {x0:3}~{x1:3} {y0:3}~{y1:3} {warn:>6}')
        if warn:
            bad += 1
    print('경고', bad, '건 (상향 사격의 위 잘림은 활 끝 소량이면 허용)')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    build()
