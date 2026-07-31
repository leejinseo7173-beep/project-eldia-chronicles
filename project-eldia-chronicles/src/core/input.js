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

    window.addEventListener('keydown', (e) => {
      if (PREVENT_KEYS.has(e.code)) e.preventDefault();
      // 브라우저 단축키(Ctrl+S 등)와의 충돌 방지
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.repeat && !REPEAT_ALLOWED.has(e.code)) return;
      if (this.delegate) this.delegate.onKeyDown(e.code);
    });

    canvas.addEventListener('mousemove', (e) => {
      const p = this.toBase(e);
      this.mouse = p;
      if (this.delegate) this.delegate.onMouseMove(p.x, p.y);
    });

    canvas.addEventListener('mousedown', (e) => {
      const p = this.toBase(e);
      this.mouse = p;
      if (this.delegate) this.delegate.onMouseDown(p.x, p.y, e.button);
    });

    // 우클릭 = 취소 조작으로 쓰므로 컨텍스트 메뉴를 막는다
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

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
