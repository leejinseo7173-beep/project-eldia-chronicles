# 크레딧

「엘디아 연대기: 여명의 맹세」가 사용하는 외부 저작물 목록.

절대 규칙 1(2026-08-03 개정)에 따라 **상업 이용 가능한 라이선스만** 채택한다.

> ⚠ **CC-BY 저작물은 표기가 의무다.** 이 파일만으로는 부족하고,
> **게임 안에서 접근 가능한 곳(타이틀 → 크레딧 화면)에도 같은 내용을 띄워야 한다.**
> 크레딧 화면은 아직 없다 — **M6(수직 슬라이스) 또는 그 이전에 반드시 만든다.**
> 그때까지 배포하지 않는다.

---

## 그래픽

### 필드 타일셋

**Slates [32x32px orthogonal tileset]** — Ivan Voirol
- 출처: https://opengameart.org/content/slates-32x32px-orthogonal-tileset-by-ivan-voirol
- 라이선스: **CC-BY 4.0** (페이지의 License(s) 필드에 단독 표기)
- 저작자 표기(페이지 원문): `Ivan Voirol`
- 사용: 석판 길
- **변경 사항**: 명도 −8% / 채도 −12%로 톤을 조정함. 크기·형태는 원본 그대로(네이티브 32×32).

**Basic map 32x32** — Ivan Voirol
- 출처: https://opengameart.org/content/basic-map-32x32-by-ivan-voirol
- 라이선스: 페이지에 **CC-BY 3.0 / GPL 3.0 / GPL 2.0** 다중 표기 →
  이 프로젝트는 그중 **CC-BY 3.0을 선택해 사용**한다 (GPL 전염 없음).
- 저작자 표기(페이지 원문): `Ivan Voirol`
  (시트 안 서명은 `by SILVER IV` — 같은 작가의 별칭이다. OGA 페이지의 공식
  Attribution 표기가 `Ivan Voirol`임을 2026-08-05에 페이지에서 재확인했다.)
- 사용: 풀밭 · 숲(수풀) · 바위 · 꽃 · 돌담(절벽) · 물 · 나무 다리
- **변경 사항**: 명도 −8% / 채도 −12%로 톤을 조정함. 일부 타일에 타일 자체 평균색 점무늬
  (스페클)를 추가함. 크기·형태는 원본 그대로.

### 필드 캐릭터 스프라이트

**32x32 RPG Character Sprites** — Eldiran
- 출처: https://opengameart.org/content/32x32-rpg-character-sprites
- 라이선스: **CC0** (표기 의무 없음, 예의상 기재)
- 사용: 주인공 3직업 + 적 심볼 5종의 4방향 걷기
- 변경 사항: 마젠타(255,0,255) 배경을 투명 처리, 명도·채도 소폭 조정,
  옆모습 한쪽을 좌우 반전해 반대 방향 생성.

### 필드 오브젝트 아이콘

**Ninja Adventure Asset Pack** — Pixel-Boy and AAA
- 출처: https://pixel-boy.itch.io/ninja-adventure-asset-pack
- 라이선스: **CC0 1.0 Universal**
- 팩 동봉 README 원문:
  > They are released under the Creative Commons Zero (CC0) license.
  > You can use any and all of the assets found in this package in your own games,
  > even commercial ones. Attribution is not required but appreciated.
- 사용: 보물상자, 채집물(약초·돌)만. **타일·캐릭터는 사용하지 않는다.**
- 변경 사항: 원본 16×16을 정수배 2로 확대, 톤 조정.

### 장비 아이콘

**자체 제작 (사용자 AI 생성, 2026-08-21)** — 12계열 전부
- 대검·창방패·활·지팡이·성장·쌍단검·중갑·경갑·로브·반지·목걸이·부적 (`assets/equip/`, 64×64)
- 원본은 장비아이콘_발주.md 프롬프트로 생성, 배경 투명화·크롭·정규화 후 등록
- 라이선스 표기 불요 (자체 저작물). 외부 에셋 의존 없음
  (한때 임시로 쓰던 7Soul·Dungeon Crawl 아이콘은 전부 교체 완료 — 사용 중단)

---

## 폰트

**Galmuri** — Quiple
- 라이선스: SIL Open Font License 1.1
- 프로젝트에 동봉

---

## 아직 외부 에셋을 쓰지 않는 영역

아래는 전부 **코드 생성** 또는 **자체 작화**다 (절대 규칙 1).

- 전투 사이드뷰 스프라이트 — 주인공(검사·궁수)·브란은 자체 작화, 나머지는 코드 생성
  (탑다운 팩은 사이드뷰 전투에 쓸 수 없다)
- VN 초상 · 컷신 일러스트 · 타이틀 아트 — 자체 작화 예정
- 전투 이펙트 · 파티클 · UI — 코드 생성 (이 영역은 코드 생성이 최종본이다)
- 효과음 — Web Audio 칩튠 코드 생성
- 정령 제단 — 코드 생성

## BGM

아직 없음. M8에서 조달한다 (CC0 우선, CC-BY는 여기에 추가 기재).
