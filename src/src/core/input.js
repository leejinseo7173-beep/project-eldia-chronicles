// ============================================================
// input.js — 입력 처리 (절대 규칙 8: 마우스 완결 + 키보드 병행)
// 화면 좌표를 기준 해상도(960×540) 좌표로 변환해 delegate에 전달한다.
// ============================================================

// 게임이 사용하는 키 — 브라우저 기본 동작(스크롤 등)을 막는다
const PREVENT_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backquote', 'F1', 'Tab',
]);

// OS 키 반복을 허용하는 키 (커서 이동만). Enter 반복은 의도치 않은 결정을 만든다
const REPEAT_ALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas, baseW, baseH) {
    this.canvas = canvas;
    this.baseW = baseW;
    this.baseH = baseH;
    this.delegate = null;   // { onKeyDown(code), onMouseMove(x,y), onMouseDown(x,y,button) }
    this.mouse = { x: 0, y: 0 };
    // 눌린 채로 유지되는 상태 — 필드 이동처럼 "누르고 있는 동안" 동작하는 조작에 쓴다.
    // 메뉴·전투는 이벤트(onKeyDown)만 쓰므로 영향이 없다.
    this.keys = new Set();
    this.mouseHeld = false;

    window.addEventListener('keydown', (e) => {
      if (PREVENT_KEYS.has(e.code)) e.preventDefault();
      // 브라우저 단축키(Ctrl+S 등)와의 충돌 방지
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      if (e.repeat && !REPEAT_ALLOWED.has(e.code)) return;
      if (this.delegate) this.delegate.onKeyDown(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    // 창을 벗어나면 눌린 상태를 전부 턴다.
    // 안 그러면 Alt+Tab 한 순간의 키가 계속 눌린 것으로 남아 캐릭터가 혼자 걸어간다.
    window.addEventListener('blur', () => this.clearHeld());

    canvas.addEventListener('mousemove', (e) => {
      const p = this.toBase(e);
      this.mouse = p;
      if (this.delegate) this.delegate.onMouseMove(p.x, p.y);
    });

    canvas.addEventListener('mousedown', (e) => {
      const p = this.toBase(e);
      this.mouse = p;
      if (e.button === 0) this.mouseHeld = true;
      if (this.delegate) this.delegate.onMouseDown(p.x, p.y, e.button);
    });
    // 캔버스 밖에서 떼도 잡히도록 window에 건다
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseHeld = false; });

    // 휠 — 목록이 긴 화면(개발 콘솔 등)에서 스크롤에 쓴다
    canvas.addEventListener('wheel', (e) => {
      const p = this.toBase(e);
      this.mouse = p;
      if (this.delegate?.onWheel) {
        // 페이지가 같이 스크롤되면 캔버스가 화면 밖으로 밀린다
        e.preventDefault();
        this.delegate.onWheel(p.x, p.y, e.deltaY);
      }
    }, { passive: false });

    // 우클릭 = 취소 조작으로 쓰므로 컨텍스트 메뉴를 막는다
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }

  clearHeld() { this.keys.clear(); this.mouseHeld = false; }

  toBase(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * this.baseW,
      y: (e.clientY - r.top) / r.height * this.baseH,
    };
  }
}

// 사각형 히트 테스트 유틸
export function inRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}
