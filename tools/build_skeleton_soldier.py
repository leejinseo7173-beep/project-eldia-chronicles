# ============================================================
# build_skeleton_soldier.py — 해골 병사 전투 원화 13장 변환 (적 1호, c02 파이프라인)
#
#   assets/sprites/_source_skeleton_soldier/*.png  →  assets/sprites/c01/*.png (192×128)
#
#   python tools/build_c01.py
#
# 궁수 파이프라인(build_hero_archer.py) 기반 + 이번 세트 특이점:
# ① 배경 노이즈 — 이 세트는 배경에 잔점이 흩어져 있어 (<240 잉크 판정이 오염)
#    연결요소 분석으로 40px 미만 조각을 먼저 지운다. 속도 위해 긴 변 900px로 축소 후 처리
#    (최종 192×128라 품질 손실 없음).
# ② 방향 혼재 — 세트 안에서 좌/우 보기가 섞여 있다 (실측·육안 확정, FLIP 목록).
#    결과물은 전부 **왼쪽 보기** (파일 규격).
# ============================================================

import os
import sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', '_source_skeleton_soldier')
OUT = os.path.join(ROOT, 'assets', 'sprites', 'skeleton_soldier')

W, H = 192, 128
FOOT_ROW = 120
CHAR_H = 108            # 잡졸 체급 — 주인공(58)보다 약간 작게, 구부정한 자세 포함 실측
THICK = 8
MIN_CC = 40            # 이보다 작은 잉크 조각은 배경 노이즈로 제거

# 오른쪽을 보는 원본 — 왼쪽으로 반전 (줌 시트 육안 + 출력 검수로 확정)
FLIP = set()           # 이 세트는 전원 왼쪽 보기 (적 규격 그대로 — 지침서 준수 1호!)

# 지팡이가 왼쪽으로 길게 뻗는 프레임 — 발 중심 정렬에서 오른쪽으로 밀어 잘림 방지
OFFX = {}

# 숨쉬기 프레임(idle1)은 원화가 세트 배율보다 작게 생성됐다 (실측 c03 -12%, 해골병사 -8%)
# — 둠칫마다 몸 크기가 펄스친다. idle0 두꺼운행 높이에 정규화해 크기만 맞춘다 (자세 차이는 유지).
NORM_TO_IDLE0 = {'idle1'}

NAMES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3',
         'attack0', 'attack1', 'attack2', 'attack3', 'cast', 'hurt', 'down']

PALETTE_HEX = [
    '0d0b14', '161327', '1c1f3a', '283257', '3c4f82', '5a7fc4', '8fb8e8', 'f2ecdd',
    '3a3a4a', '6a6a7d', 'a5a5b5', 'd5d2dc', 'f2d251', 'c9992e', 'e8a33f', 'd94a3d',
    '8f2f33', 'e87a3f', 'f2b380', 'f2e28a', '4fc978', '2e7d4f', '1d4a33', '3fbfb0',
    '7fdde8', '8a4fc9', '4a2e6b', 'c95a9a', 'f2a5b8', 'a9743a', '6b4a2e', 'd9b98a',
    '2b55d4',   # 카시안 보주 로열블루 — 기존 남색으로는 보주가 검게 죽는다
]
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX], dtype=float)
LUMA = np.array([0.30, 0.59, 0.11])


def remove_small_cc(ink):
    h, w = ink.shape
    lab = np.zeros((h, w), dtype=np.int32)
    cur = 0
    for sy in range(h):
        for sx in np.nonzero(ink[sy] & (lab[sy] == 0))[0]:
            cur += 1
            q = deque([(sy, sx)])
            lab[sy, sx] = cur
            cells = [(sy, sx)]
            while q:
                y, x = q.popleft()
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and ink[ny, nx] and lab[ny, nx] == 0:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
                        cells.append((ny, nx))
            if len(cells) < MIN_CC:
                for y, x in cells:
                    ink[y, x] = False
    return ink


def load_ink(name):
    im = Image.open(os.path.join(SRC, name + '.png')).convert('RGB')
    im.thumbnail((900, 900), Image.LANCZOS)      # 속도·노이즈 완화 (최종 192×128)
    a = np.array(im).astype(int)
    luma = a[:, :, 0] * 0.30 + a[:, :, 1] * 0.59 + a[:, :, 2] * 0.11
    ink = luma < 235
    ink = remove_small_cc(ink)

    # 가장자리 조각 제거 (본체와 12px 이상 떨어진 열 구간)
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
        tT, thickB = thick_rows(ink)
        sc = scale
        if name in NORM_TO_IDLE0:
            sc = scale * ((b0 - t0 + 1) / (thickB - tT + 1))

        footTop = thickB - max(6, int((thickB - t) * 0.16))
        band = ink[footTop:thickB + 1]
        bcols = band.sum(axis=0)
        bxs = np.where(bcols >= 2)[0]
        footC = (bxs.min() + bxs.max()) / 2 if len(bxs) else (l + r) / 2

        # 배경 유출 원천 차단 (2026-08-22, 은발 사고 재발 방지):
        # 소스에서 잉크 마스크로 먼저 투명화하고 **프리멀티플라이드 알파**로 축소한다.
        # 흰 배경이 가장자리 색에 섞이지 않으므로 "밝은 경계 벗기기"가 아예 필요 없다
        # (벗기기는 문턱 150이면 은발을 깎고 225면 회색 잔광이 남는 딜레마였음).
        rgba = np.zeros((a.shape[0], a.shape[1], 4), dtype=np.float64)
        rgba[:, :, :3] = a * ink[:, :, None]
        rgba[:, :, 3] = ink * 255.0
        sub = rgba[t:ys.max() + 1, l:r + 1]
        fc = footC - l
        if name in FLIP:
            sub = sub[:, ::-1]
            fc = (r - l) - fc
        tw = max(1, int(round((r - l + 1) * sc)))
        th = max(1, int(round((ys.max() - t + 1) * sc)))
        sm = np.array(Image.fromarray(sub.astype(np.uint8), 'RGBA').resize((tw, th), Image.LANCZOS)).astype(np.float64)
        alpha = sm[:, :, 3]
        col = np.zeros((th, tw, 3))
        mm = alpha > 8
        col[mm] = sm[mm, :3] * (255.0 / alpha[mm, None])
        np.clip(col, 0, 255, out=col)

        dy = FOOT_ROW - int(round((thickB - t) * sc))
        dx = int(round(W / 2 - fc * sc)) + OFFX.get(name, 0)
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
        # 실루엣 밖 흰 잔점 제거 — 4px 미만 알파 섬은 배경 노이즈 잔재
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
        # (브란 세트용 질감 구제 블록은 이 세트에 불필요 — 은발·얼굴을 뭉개서 제거함)


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
        clipT = '△위잘림' if t * sc + dy < 0 or oys.min() == 0 else ''
        clipS = '△좌우잘림' if oxs.min() == 0 or oxs.max() == W - 1 else ''
        report.append((name, oxs.min(), oxs.max(), oys.min(), oys.max(), clipT + clipS))

    print(f'{"file":9} {"x":>9} {"y":>9} {"경고":>8}')
    bad = 0
    for name, x0, x1, y0, y1, warn in report:
        print(f'{name:9} {x0:3}~{x1:3} {y0:3}~{y1:3} {warn:>8}')
        if warn:
            bad += 1
    print('경고', bad, '건')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    build()
