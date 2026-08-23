# ============================================================
# build_hero_sword.py — 주인공(검사) 전투 원화 v2 변환 (2026-08-23 등신 통일 재발주분)
#
#   assets/sprites/_source_hero_v2/src01~12.png (1254×1254, 흰 배경)
#     → assets/sprites/hero_sword/*.png        (192×128, 전투 13포즈)
#     → assets/sprites/hero_sword/walk_side0~3 (96×64,  필드 옆걸음 전용)
#
#   python tools/build_hero_sword.py
#
# v2 재발주 (발주/전투원화_주인공검사/지침서.md): 구판이 3등신 대두(1호 생성분)라
# 동료·적 8종(4.5~5등신)과 등신을 통일했다. 파이프라인은 c02 표준.
#
# 포즈 매핑 (12장 시트 육안 + 인게임 검증 2026-08-23):
#   (1)대기 (2~5)걷기 4프레임 (6)치켜들기 (8)웅크림 (7)돌진임팩트 (9)잔심
#   (10)성물 시전-발광검·유일한 왼쪽보기 (11)피격 (12)무릎꿇기
#   공격 시퀀스 = 치켜들기(6) → 웅크림(8) → 돌진(7) → 잔심(9): 예비-압축-방출-복귀
#   idle1(호흡)은 미발주 — idle0에서 합성 (해골 궁수 전례: 상체 2px 가라앉힘)
# ============================================================

import os
import sys
from collections import deque
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'sprites', '_source_hero_v2')
OUT = os.path.join(ROOT, 'assets', 'sprites', 'hero_sword')

W, H = 192, 128
FOOT_ROW = 120
CHAR_H = 116           # 기준 체격 — 다른 세트가 전부 이 값에 상대다
THICK = 8
MIN_CC = 40

# 포즈 → 소스 파일 (12장 시트 번호)
SRC_OF = {
    'idle0': 'src01',
    'walk0': 'src02', 'walk1': 'src03', 'walk2': 'src04', 'walk3': 'src05',
    'attack0': 'src06', 'attack1': 'src08', 'attack2': 'src07', 'attack3': 'src09',
    'cast': 'src10', 'hurt': 'src11', 'down': 'src12',
}
NAMES = list(SRC_OF.keys())

# 이 세트는 cast(10)만 왼쪽을 보고 나머지 전부 오른쪽 보기 (시트 육안 → 인게임 확정)
FLIP = {n for n in NAMES if n != 'cast'}

TINT = {}
ALIGN_BBOX = {'down'}   # 무릎 꿇고 검을 짚은 자세 — 발 무게중심이 한쪽으로 쏠려 폭 중앙 정렬

# 검이 왼쪽으로 길게 뻗는 프레임의 잘림 방지용 가로 오프셋 (빌드 리포트 보고 조정)
OFFX = {}

# 원화 크기 불일치 보정 — idle0 두꺼운행 높이에 정규화할 포즈.
# 걷기 4장이 89.9~96.9%로 제각각(실측 2026-08-23) — 걸을 때마다 몸이 펄스친다.
# 공격·피격·쓰러짐의 크기 차이는 자세(웅크림·기울임)라 정규화하지 않는다.
NORM_TO_IDLE0 = {'walk0', 'walk1', 'walk2', 'walk3'}

# 필드 옆걸음 전용 출력 (96×64 — 필드는 1:1로 그리므로 구규격 유지)
FIELD_SIDE = [('walk_side0', 'walk0'), ('walk_side1', 'walk1'),
              ('walk_side2', 'walk2'), ('walk_side3', 'walk3')]

PALETTE_HEX = [
    '0d0b14', '161327', '1c1f3a', '283257', '3c4f82', '5a7fc4', '8fb8e8', 'f2ecdd',
    '3a3a4a', '6a6a7d', 'a5a5b5', 'd5d2dc', 'f2d251', 'c9992e', 'e8a33f', 'd94a3d',
    '8f2f33', 'e87a3f', 'f2b380', 'f2e28a', '4fc978', '2e7d4f', '1d4a33', '3fbfb0',
    '7fdde8', '8a4fc9', '4a2e6b', 'c95a9a', 'f2a5b8', 'a9743a', '6b4a2e', 'd9b98a',
]
PALETTE = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX], dtype=float)
LUMA = np.array([0.30, 0.59, 0.11])

_ink_cache = {}


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


def load_ink(src_name):
    if src_name in _ink_cache:
        return _ink_cache[src_name]
    im = Image.open(os.path.join(SRC, src_name + '.png')).convert('RGB')
    im.thumbnail((900, 900), Image.LANCZOS)      # 속도·노이즈 완화
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
    _ink_cache[src_name] = (a, ink)
    return a, ink


def thick_rows(ink):
    rows = ink.sum(axis=1)
    ys = np.where(rows >= THICK)[0]
    return ys.min(), ys.max()


def convert(name, src_name, do_flip, w, h, foot_row, scale, isl_min, out_name=None):
    a, ink = load_ink(src_name)
    if name in TINT:
        tr, tg, tb = TINT[name]
        a = np.clip(a * np.array([tr, tg, tb])[None, None, :], 0, 255).astype(int)
    ys, xs = np.where(ink)
    l, r = xs.min(), xs.max()
    t = ys.min()
    _, thickB = thick_rows(ink)

    footTop = thickB - max(6, int((thickB - t) * 0.16))
    band = ink[footTop:thickB + 1]
    bcols = band.sum(axis=0)
    bxs = np.where(bcols >= 2)[0]
    footC = (bxs.min() + bxs.max()) / 2 if len(bxs) else (l + r) / 2
    if name in ALIGN_BBOX:
        footC = (l + r) / 2

    rgba = np.zeros((a.shape[0], a.shape[1], 4), dtype=np.float64)
    rgba[:, :, :3] = a * ink[:, :, None]
    rgba[:, :, 3] = ink * 255.0
    sub = rgba[t:ys.max() + 1, l:r + 1]
    fc = footC - l
    if do_flip:
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

    dy = foot_row - int(round((thickB - t) * scale))
    dx = int(round(w / 2 - fc * scale)) + OFFX.get(name, 0)
    arr = np.zeros((h, w, 3))
    av = np.zeros((h, w))
    sy0, sx0 = max(0, -dy), max(0, -dx)
    dy0, dx0 = max(0, dy), max(0, dx)
    hgt = min(th - sy0, h - dy0)
    wdt = min(tw - sx0, w - dx0)
    if hgt > 0 and wdt > 0:
        arr[dy0:dy0 + hgt, dx0:dx0 + wdt] = col[sy0:sy0 + hgt, sx0:sx0 + wdt]
        av[dy0:dy0 + hgt, dx0:dx0 + wdt] = alpha[sy0:sy0 + hgt, sx0:sx0 + wdt]
    opaque = av > 127
    flat = arr.reshape(-1, 3).astype(float)
    d = ((flat[:, None, :] - PALETTE[None, :, :]) ** 2 * LUMA).sum(axis=2)
    q = PALETTE[d.argmin(axis=1)].reshape(arr.shape).astype(np.uint8)
    lab2 = np.zeros((h, w), dtype=np.int32)
    cur2 = 0
    op = opaque.copy()
    for sy in range(h):
        for sx in np.nonzero(op[sy] & (lab2[sy] == 0))[0]:
            cur2 += 1
            q2 = deque([(sy, sx)])
            lab2[sy, sx] = cur2
            cells = [(sy, sx)]
            while q2:
                yy, xx = q2.popleft()
                for ny, nx in ((yy - 1, xx), (yy + 1, xx), (yy, xx - 1), (yy, xx + 1)):
                    if 0 <= ny < h and 0 <= nx < w and op[ny, nx] and lab2[ny, nx] == 0:
                        lab2[ny, nx] = cur2
                        q2.append((ny, nx))
                        cells.append((ny, nx))
            if len(cells) < isl_min:
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
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = q
    out[:, :, 3] = np.where(opaque, 255, 0)
    fn = (out_name or name) + '.png'
    Image.fromarray(out, 'RGBA').save(os.path.join(OUT, fn))

    m = out[:, :, 3] > 0
    oys, oxs = np.where(m)
    clipT = '△위잘림' if t * scale + dy < 0 or oys.min() == 0 else ''
    clipS = '△좌우잘림' if oxs.min() == 0 or oxs.max() == w - 1 else ''
    return (fn, oxs.min(), oxs.max(), oys.min(), oys.max(), clipT + clipS)


def synth_idle1():
    """idle1 = idle0 상체 2px 가라앉힘 (192×128 기준 — 해골 궁수 전례의 2배 스케일)"""
    im = np.array(Image.open(os.path.join(OUT, 'idle0.png')).convert('RGBA'))
    a = im[:, :, 3] > 0
    ys = np.where(a.sum(axis=1) > 0)[0]
    split = ys.min() + int((ys.max() - ys.min()) * 0.62)   # 이 위를 '상체'로 본다
    idle1 = np.zeros_like(im)
    idle1[2:split] = im[0:split - 2]
    idle1[split:] = im[split:]
    Image.fromarray(idle1, 'RGBA').save(os.path.join(OUT, 'idle1.png'))
    print('합성: idle1 (상체 2px 호흡)')


def build():
    os.makedirs(OUT, exist_ok=True)
    _, ink0 = load_ink(SRC_OF['idle0'])
    t0, b0 = thick_rows(ink0)
    scale = CHAR_H / (b0 - t0 + 1)
    print(f'기준(idle0) 두꺼운 높이 {b0 - t0 + 1}px → 배율 {scale:.5f}')

    # 원화 크기 일관성 실측 — 세트 배율 대비 각 프레임의 두꺼운행 높이 비율
    print('프레임 크기 실측 (idle0 = 100%):')
    for name in NAMES:
        _, ink = load_ink(SRC_OF[name])
        tT, tB = thick_rows(ink)
        print(f'  {name:9} {(tB - tT + 1) / (b0 - t0 + 1) * 100:5.1f}%')

    def scale_of(name):
        if name not in NORM_TO_IDLE0:
            return scale
        _, ink = load_ink(SRC_OF[name])
        tT, tB = thick_rows(ink)
        return scale * ((b0 - t0 + 1) / (tB - tT + 1))

    report = []
    for name in NAMES:
        report.append(convert(name, SRC_OF[name], name in FLIP, W, H, FOOT_ROW, scale_of(name), 16))
    for out_name, src in FIELD_SIDE:
        report.append(convert(src, SRC_OF[src], src in FLIP, 96, 64, 60, scale_of(src) / 2, 4, out_name=out_name))

    print(f'{"file":15} {"x":>9} {"y":>9} {"경고":>8}')
    bad = 0
    for name, x0, x1, y0, y1, warn in report:
        print(f'{name:15} {x0:3}~{x1:3} {y0:3}~{y1:3} {warn:>8}')
        if warn:
            bad += 1
    print('경고', bad, '건')
    synth_idle1()


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    build()
