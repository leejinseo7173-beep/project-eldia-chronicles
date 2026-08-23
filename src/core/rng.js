// ============================================================
// rng.js — 시드 기반 RNG (절대 규칙 5: Math.random() 직접 호출 금지)
// xmur3(문자열 → 32bit 시드) + mulberry32(PRNG).
// 상태(getState/setState)를 세이브에 넣어 재현 가능성을 유지한다.
// ============================================================

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export class RNG {
  // seed: 문자열 또는 32bit 정수 상태값
  constructor(seed) {
    if (typeof seed === 'number') this.s = seed >>> 0;
    else this.s = xmur3(String(seed));
  }

  // [0, 1) 실수
  next() {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // [min, max] 정수 (양 끝 포함)
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  // 확률 p(0~1)로 true
  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  // 원본을 바꾸지 않는 셔플 사본 (Fisher–Yates)
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  getState() { return this.s; }
  setState(s) { this.s = s >>> 0; }
}

export function createRNG(seed) { return new RNG(seed); }
