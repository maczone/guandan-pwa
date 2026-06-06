/**
 * settings.js - 掼蛋游戏设置
 * 持久化存储玩家偏好：昵称、头像、主题、统计开关等
 */

const THEMES = {
  classic: {
    name: '经典绿',
    vars: {
      '--bg-table': '#1a6b3c',
      '--bg-table-dark': '#145530',
      '--accent': '#ff6b35',
      '--gold': '#ffd700',
    },
    emoji: '🌿'
  },
  ocean: {
    name: '深海蓝',
    vars: {
      '--bg-table': '#1a3a5c',
      '--bg-table-dark': '#0f2840',
      '--accent': '#42a5f5',
      '--gold': '#ffd54f',
    },
    emoji: '🌊'
  },
  night: {
    name: '暗夜紫',
    vars: {
      '--bg-table': '#2d1b4e',
      '--bg-table-dark': '#1a0f2e',
      '--accent': '#ce93d8',
      '--gold': '#ffab40',
    },
    emoji: '🌙'
  },
  dawn: {
    name: '晨曦红',
    vars: {
      '--bg-table': '#5c2a1a',
      '--bg-table-dark': '#3d1a0f',
      '--accent': '#ef5350',
      '--gold': '#ffca28',
    },
    emoji: '🌅'
  }
};

const AVATARS = ['😎', '🦊', '🐯', '🦁', '🐺', '🐶', '🐱', '🐼', '🦄', '🐲', '🦅', '🐸'];

class GameSettings {
  constructor() {
    this._defaults = {
      playerName: '玩家',
      playerAvatar: '😎',
      theme: 'classic',
      autoSaveStats: true,
      autoNextRound: true
    };
    this._data = { ...this._defaults };
    this._load();
  }

  get playerName() { return this._data.playerName; }
  set playerName(v) { this._data.playerName = v || this._defaults.playerName; this._save(); }

  get playerAvatar() { return this._data.playerAvatar; }
  set playerAvatar(v) { this._data.playerAvatar = v || this._defaults.playerAvatar; this._save(); }

  get theme() { return this._data.theme; }
  set theme(v) {
    if (THEMES[v]) {
      this._data.theme = v;
      this._applyTheme(v);
      this._save();
    }
  }

  get autoSaveStats() { return this._data.autoSaveStats; }
  set autoSaveStats(v) { this._data.autoSaveStats = !!v; this._save(); }

  get autoNextRound() { return this._data.autoNextRound; }
  set autoNextRound(v) { this._data.autoNextRound = !!v; this._save(); }

  /** 应用主题到CSS变量 */
  applyTheme() {
    this._applyTheme(this._data.theme);
  }

  _applyTheme(themeKey) {
    const theme = THEMES[themeKey];
    if (!theme) return;
    const root = document.documentElement;
    for (const [key, val] of Object.entries(theme.vars)) {
      root.style.setProperty(key, val);
    }
    // 设置meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme.vars['--bg-table'];
  }

  /** 重置为默认 */
  reset() {
    this._data = { ...this._defaults };
    this._applyTheme(this._data.theme);
    this._save();
  }

  _save() {
    try { localStorage.setItem('guandan_settings', JSON.stringify(this._data)); } catch (e) { /* ignore */ }
  }

  _load() {
    try {
      const saved = JSON.parse(localStorage.getItem('guandan_settings'));
      if (saved) {
        // 合并保存的值（只保留有效key）
        for (const key of Object.keys(this._defaults)) {
          if (saved[key] !== undefined) this._data[key] = saved[key];
        }
      }
    } catch (e) { /* ignore */ }
  }
}
