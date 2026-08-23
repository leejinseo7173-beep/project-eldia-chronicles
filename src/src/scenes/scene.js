// ============================================================
// scene.js — 씬 공통 인터페이스
// 모든 화면(기획서 §16 화면 13종)은 이 클래스를 상속한다.
// ============================================================

export class Scene {
  // 게임플레이 씬(전투·필드·거점 등)은 true — 플레이 시간이 Game.update에서 일괄 누적된다
  isGameplay = false;

  enter(game, params = {}) {}
  exit(game) {}
  update(dt, game) {}
  render(g, game) {}
  onKeyDown(code, game) {}
  onMouseMove(x, y, game) {}
  onMouseDown(x, y, button, game) {}
  onWheel(x, y, dy, game) {}
}
