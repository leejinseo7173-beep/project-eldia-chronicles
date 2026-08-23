// ============================================================
// audio.js — Web Audio 코드 생성 칩튠 (기획서 §16 — 외부 파일 제로)
// M1: UI 효과음만. BGM·전투 효과음은 M8에서 확장.
// AudioContext는 사용자 입력(클릭/키) 이후에만 생성한다 (브라우저 정책).
// ============================================================

export class AudioSystem {
  constructor(settings) {
    this.ctx = null;
    this.masterGain = null;
    this.seGain = null;
    this.bgmGain = null;
    this.bgmVolume = settings.bgmVolume;
    this.seVolume = settings.seVolume;
  }

  // 첫 사용자 입력 시 호출 — 이후에만 소리가 난다
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);
    this.seGain = this.ctx.createGain();
    this.seGain.connect(this.masterGain);
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.connect(this.masterGain);
    this.applyVolumes();
  }

  setVolumes(bgm, se) {
    this.bgmVolume = bgm;
    this.seVolume = se;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    // 0~10 → 지각 볼륨 곡선 (제곱)
    this.bgmGain.gain.value = Math.pow(this.bgmVolume / 10, 2);
    this.seGain.gain.value = Math.pow(this.seVolume / 10, 2);
  }

  // 단음 재생 헬퍼
  tone({ freq, dur = 0.08, type = 'square', gain = 0.25, when = 0, slideTo = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.seGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  playSE(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'move':    // 커서 이동
        this.tone({ freq: 740, dur: 0.05, gain: 0.15 });
        break;
      case 'confirm': // 결정
        this.tone({ freq: 659, dur: 0.06, type: 'triangle', gain: 0.3 });
        this.tone({ freq: 988, dur: 0.09, type: 'triangle', gain: 0.3, when: 0.06 });
        break;
      case 'cancel':  // 취소
        this.tone({ freq: 494, dur: 0.1, gain: 0.2, slideTo: 247 });
        break;
      case 'error':   // 불가
        this.tone({ freq: 131, dur: 0.12, gain: 0.25 });
        break;
      case 'save':    // 저장 완료
        this.tone({ freq: 523, dur: 0.07, type: 'triangle', gain: 0.28 });
        this.tone({ freq: 659, dur: 0.07, type: 'triangle', gain: 0.28, when: 0.07 });
        this.tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.28, when: 0.14 });
        break;
      case 'powerup': // 레벨업·성장 (M5-3)
        for (const [f, w] of [[392, 0], [523, 0.06], [659, 0.12], [880, 0.18]]) {
          this.tone({ freq: f, dur: 0.1, type: 'triangle', gain: 0.26, when: w });
        }
        break;
      case 'hit':     // 타격
        this.tone({ freq: 165, dur: 0.09, gain: 0.3, slideTo: 82 });
        break;
      case 'crit':    // 치명타
        this.tone({ freq: 220, dur: 0.06, gain: 0.32, slideTo: 110 });
        this.tone({ freq: 440, dur: 0.12, type: 'sawtooth', gain: 0.22, when: 0.04, slideTo: 165 });
        break;
      case 'shot':    // 원거리 발사 — 시위를 튕기듯 짧고 높게 위로 훑는다
        this.tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.18, slideTo: 1480 });
        break;
      case 'assist':  // 협공
        this.tone({ freq: 330, dur: 0.05, gain: 0.22 });
        this.tone({ freq: 494, dur: 0.07, gain: 0.22, when: 0.05 });
        break;
      case 'heal':    // 치유·재생
        this.tone({ freq: 587, dur: 0.09, type: 'triangle', gain: 0.24 });
        this.tone({ freq: 880, dur: 0.12, type: 'triangle', gain: 0.2, when: 0.08 });
        break;
      case 'buff':    // 버프·보호막
        this.tone({ freq: 440, dur: 0.06, type: 'triangle', gain: 0.2 });
        this.tone({ freq: 554, dur: 0.09, type: 'triangle', gain: 0.2, when: 0.06 });
        break;
      case 'debuff':  // 디버프 적용
        this.tone({ freq: 262, dur: 0.09, gain: 0.2, slideTo: 196 });
        break;
      case 'death':   // 전투불능
        this.tone({ freq: 196, dur: 0.25, type: 'sawtooth', gain: 0.2, slideTo: 49 });
        break;
      case 'victory': // 승리
        for (const [f, w] of [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]]) {
          this.tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.28, when: w });
        }
        break;
      case 'defeat':  // 패배
        this.tone({ freq: 330, dur: 0.3, type: 'triangle', gain: 0.22, slideTo: 165 });
        break;
    }
  }
}
