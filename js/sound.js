/**
 * sound.js - 掼蛋音效（Web Audio API，纯代码生成，零网络请求）
 * 所有声音用波形合成，无需任何音频文件，完全离线可用
 */

class GameSound {
  constructor() {
    this.enabled = true;
    this.vibrateEnabled = true; // 触感反馈
    this.ctx = null;
    this.volume = 0.3;
  }

  _ensure() {
    if (!this.enabled) return null;
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      return this.ctx;
    } catch (e) {
      this.enabled = false;
      return null;
    }
  }

  /** 触感反馈（仅移动端支持） */
  _vibrate(ms) {
    if (!this.vibrateEnabled) return;
    try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
  }

  _play(freq, duration, type = 'sine', volMul = 1) {
    const ctx = this._ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(this.volume * volMul, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  _noise(duration, volMul = 1) {
    const ctx = this._ensure();
    if (!ctx) return;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(this.volume * volMul, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  }

  /** 选中一张牌 */
  cardSelect() {
    this._play(800, 0.08, 'sine', 0.5);
    this._vibrate(8);
  }

  /** 出牌 */
  cardPlay() {
    this._play(600, 0.06, 'triangle');
    setTimeout(() => this._play(400, 0.08, 'triangle', 0.7), 50);
    this._vibrate(15);
  }

  /** 炸弹 */
  bomb() {
    this._noise(0.3, 0.8);
    this._play(120, 0.3, 'sawtooth', 0.6);
    setTimeout(() => this._play(80, 0.2, 'sawtooth', 0.4), 100);
    this._vibrate(50);
  }

  /** 过牌 */
  pass() {
    this._play(300, 0.1, 'sine', 0.3);
  }

  /** 轮到你的回合 */
  yourTurn() {
    this._play(660, 0.1, 'sine', 0.5);
    setTimeout(() => this._play(880, 0.15, 'sine', 0.5), 120);
    this._vibrate(20);
  }

  /** 赢得一轮 */
  winTrick() {
    this._play(523, 0.12, 'sine');
    setTimeout(() => this._play(659, 0.12, 'sine'), 100);
    setTimeout(() => this._play(784, 0.18, 'sine'), 200);
  }

  /** 头游/胜利 */
  winRound() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => this._play(f, 0.2, 'sine', 0.6), i * 120);
    });
  }

  /** 失败 */
  loseRound() {
    const notes = [400, 350, 300, 250];
    notes.forEach((f, i) => {
      setTimeout(() => this._play(f, 0.25, 'triangle', 0.5), i * 150);
    });
  }

  /** 游戏结束 */
  gameOver(won) {
    if (won) {
      this.winRound();
      setTimeout(() => this.winRound(), 800);
    } else {
      this.loseRound();
    }
  }

  setEnabled(v) {
    this.enabled = v;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}
