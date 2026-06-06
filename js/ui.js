/**
 * ui.js v2 - 掼蛋PWA界面（增强版）
 * 更清晰的回合指示、对手状态、出牌动画
 */

class GameUI {
  constructor(game) {
    this.game = game;
    this.selectedCards = new Set();
    this._settingsOpen = false;
    this._statsOpen = false;
    this._bindEvents();
    this._setupAutoScroll();
  }

  render() {
    const g = this.game;
    const state = g.getGameState();
    const level = g.levelManager.currentLevel;
    const human = g.players[0];
    const tm = g.players[2];
    const ai1 = g.players[1];
    const ai3 = g.players[3];

    // 判断当前是否轮到人类
    const isHumanTurn = g.currentPlayer === 0 && !human.finished
      && g.phase !== PHASE.ROUND_END && g.phase !== PHASE.GAME_OVER;

    // 判断是否首攻（自由出牌）
    const isLeading = state.isLeading;

    document.getElementById('app').innerHTML = `
      <!-- 顶栏 -->
      <div class="top-bar">
        <div class="top-left">
          <span class="level-value">${level}</span>
          <span class="level-label">级牌</span>
        </div>
        <div class="top-center">
          <span class="round-num">第 ${g.roundNum} 局</span>
          <span class="score-display">🏆 ${g.humanWonRounds} : ${g.aiWonRounds}</span>
        </div>
        <div class="top-right">
          ${this._turnBadge(g, isHumanTurn, isLeading)}
          <button class="btn-icon" id="btn-settings" title="设置">⚙</button>
          <button class="btn-icon" id="btn-stats" title="记牌器/统计">📊</button>
          <button class="btn-icon" id="btn-sound" title="音效开关">${g.sound.enabled ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <!-- 设置面板（折叠） -->
      <div class="settings-panel" id="settings-panel" style="display:${this._settingsOpen ? 'block' : 'none'}">
        ${this._renderSettingsPanel(g)}
      </div>

      <!-- 统计面板（折叠） -->
      <div class="stats-panel" id="stats-panel" style="display:${this._statsOpen ? 'block' : 'none'}">
        ${this._statsOpen ? this._renderStatsPanel(g) : ''}
      </div>

      <!-- 中场 -->
      <div class="middle-area">
        <div class="opponent opponent-top ${tm.finished ? 'done' : ''}">
          <span class="op-name">${tm.name}</span>
          <span class="op-cards">${tm.finished ? '✅' : '🂠×' + tm.hand.length}</span>
          ${this._rankBadge(tm)}
          ${g.currentPlayer === 2 && !tm.finished ? '<span class="op-thinking">⏳</span>' : ''}
        </div>

        <div class="play-area">
          <div class="opponent-side left ${ai3.finished ? 'done' : ''}">
            <span class="op-name">${ai3.name}</span>
            <span class="op-cards">${ai3.finished ? '✅' : '🂠×' + ai3.hand.length}</span>
            ${this._rankBadge(ai3)}
            ${g.currentPlayer === 3 && !ai3.finished ? '<span class="op-thinking">⏳</span>' : ''}
          </div>

          <div class="table-center">
            ${this._renderPlayArea()}
          </div>

          <div class="opponent-side right ${ai1.finished ? 'done' : ''}">
            <span class="op-name">${ai1.name}</span>
            <span class="op-cards">${ai1.finished ? '✅' : '🂠×' + ai1.hand.length}</span>
            ${this._rankBadge(ai1)}
            ${g.currentPlayer === 1 && !ai1.finished ? '<span class="op-thinking">⏳</span>' : ''}
          </div>
        </div>

        <div class="message-area" id="msg-area">
          ${this._renderMessages()}
        </div>
      </div>

      <!-- 底栏 -->
      <div class="bottom-area">
        <div class="player-bar">
          <span class="player-name">${g.settings.playerAvatar} ${g.settings.playerName}</span>
          ${human.finished
            ? `<span class="rank-badge big">${this._rankEmoji(human.finishRank)}</span>`
            : `<span class="card-count">${human.hand.length} 张</span>`
          }
          ${isHumanTurn && !human.finished
            ? `<span class="your-turn ${isLeading ? 'lead' : ''}">${isLeading ? '🎯 自由出牌' : '⚡ 你的回合'}</span>`
            : ''}
        </div>

        <div class="hand-cards" id="hand-area">
          ${this._renderHand(human.hand)}
        </div>

        ${this._renderButtons(g, human, isHumanTurn, isLeading)}
      </div>

      ${g.phase === PHASE.GAME_OVER ? this._renderGameOverModal() : ''}
    `;
    this._bindDynamicEvents();
  }

  _turnBadge(g, isHumanTurn, isLeading) {
    if (g.phase === PHASE.ROUND_END) return '<span class="phase-badge end">本局结束</span>';
    if (g.phase === PHASE.GAME_OVER) return '<span class="phase-badge end">🏆 终局</span>';
    if (g.phase === PHASE.DEALING) return '<span class="phase-badge">发牌中...</span>';
    if (g.currentPlayer === 0) return '<span class="phase-badge active">你的回合</span>';
    const p = g.players[g.currentPlayer];
    if (p && !p.finished) return `<span class="phase-badge">${p.name}思考中</span>`;
    return '';
  }

  _rankBadge(p) {
    return p.finishRank ? `<span class="rank-badge">${this._rankEmoji(p.finishRank)}</span>` : '';
  }

  _renderStatsPanel(g) {
    const mem = g.memory.getStats();
    const summary = g.stats.getSummary();
    const recent = g.stats.getRecentRounds(5);
    
    let rankRows = '';
    for (const r of mem.rankStats) {
      const pct = r.total > 0 ? (r.remain / r.total * 100) : 0;
      const barW = Math.round(pct);
      rankRows += `<div class="sr-row">
        <span class="sr-rank">${r.label}</span>
        <div class="sr-bar-bg"><div class="sr-bar" style="width:${barW}%"></div></div>
        <span class="sr-num">${r.remain}/${r.total}</span>
      </div>`;
    }

    const bombRisks = mem.bombRisks.map(b =>
      `<span class="bomb-risk ${b.bombLikely}">${b.rank}×${b.count}</span>`
    ).join('');

    const recentStr = recent.map(r => r.won ? '✔' : '✘').join(' ');

    return `
      <div class="sp-title">📊 记牌器 & 统计</div>
      <div class="sp-grid">
        <div class="sp-col">
          <div class="sp-sub">剩余牌数</div>
          <div class="stats-ranks">${rankRows}</div>
          ${bombRisks ? `<div class="sp-sub">⚠ 炸弹风险</div><div class="bomb-risks">${bombRisks}</div>` : ''}
        </div>
        <div class="sp-col">
          <div class="sp-sub">战绩</div>
          <div class="stats-summary">
            <div><b>${summary.totalRounds}</b> 局</div>
            <div>胜率 <b>${summary.winRate}</b></div>
            <div>平均排名 <b>${summary.avgRank}</b></div>
            <div>最高级牌 <b>${summary.bestLevel}</b></div>
            <div>💣 ${summary.bombsPlayed} 次</div>
            <div>近况 ${summary.recentForm}</div>
          </div>
        </div>
      </div>
    `;
  }

  _renderSettingsPanel(g) {
    const s = g.settings;
    const themeKeys = Object.keys(THEMES);
    return `
      <div class="sp-title">⚙ 游戏设置</div>
      <div class="set-grid">
        <div class="set-group">
          <div class="sp-sub">玩家信息</div>
          <div class="set-row">
            <span>头像</span>
            <div class="avatar-picker">
              ${AVATARS.map(a => `<span class="av-opt ${s.playerAvatar === a ? 'av-sel' : ''}" data-av="${a}">${a}</span>`).join('')}
            </div>
          </div>
          <div class="set-row">
            <span>昵称</span>
            <input class="set-input" id="input-name" type="text" value="${s.playerName}" maxlength="8" placeholder="输入昵称">
          </div>
        </div>
        <div class="set-group">
          <div class="sp-sub">主题配色</div>
          <div class="theme-picker">
            ${themeKeys.map(k => {
              const t = THEMES[k];
              return `<button class="theme-btn ${s.theme === k ? 't-sel' : ''}" data-theme="${k}" style="--tbg:${t.vars['--bg-table']};--tac:${t.vars['--accent']}">
                <span class="theme-swatch"></span>
                <span>${t.emoji} ${t.name}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
        <div class="set-group">
          <div class="sp-sub">游戏行为</div>
          <label class="set-toggle">
            <input type="checkbox" ${s.autoSaveStats ? 'checked' : ''} id="chk-save-stats">
            <span>自动保存战绩到统计</span>
          </label>
          <label class="set-toggle">
            <input type="checkbox" ${s.autoNextRound ? 'checked' : ''} id="chk-auto-next">
            <span>一局结束后自动继续下一局</span>
          </label>
        </div>
      </div>
    `;
  }

  _renderHand(cards) {
    if (!cards || cards.length === 0) return '<div class="empty-hand">—</div>';
    const sorted = CardUtils.sortCards(cards);
    // 分两排显示：高牌在上排，低牌在下排
    const mid = Math.ceil(sorted.length / 2);
    const topRow = sorted.slice(0, mid);
    const bottomRow = sorted.slice(mid);
    return `
      <div class="hand-row">${topRow.map(c => this._cardHTML(c)).join('')}</div>
      <div class="hand-row">${bottomRow.map(c => this._cardHTML(c)).join('')}</div>
    `;
  }

  _cardHTML(c) {
    const isSel = this.selectedCards.has(c.id);
    const isRed = c.suit === '♥' || c.suit === '♦';
    return `
      <div class="card ${isRed ? 'red' : 'black'} ${c.isWild ? 'wild' : ''} ${isSel ? 'sel' : ''}"
           data-cid="${c.id}">
        ${c.isJoker ? `
          <span class="cjoker">${c.rank === 'big' ? '👑' : '🃏'}</span>
          <span class="crank">${c.rank === 'big' ? '大王' : '小王'}</span>
        ` : `
          <span class="crank">${c.rank}</span>
          <span class="csuit">${c.suit}</span>
        `}
        ${c.isWild ? '<i class="wild-tag">逢</i>' : ''}
      </div>
    `;
  }

  _renderPlayArea() {
    const lp = this.game.lastPlay;
    if (!lp) {
      const state = this.game.getGameState();
      return `<div class="play-hint">${state.isLeading ? '🎯 自由出牌' : '等待出牌...'}</div>`;
    }
    return `
      <div class="lp-player">${this.game.players[lp.playerIdx].name}</div>
      <div class="lp-type">${lp.typeName || ''}</div>
      <div class="lp-cards">
        ${lp.cards.map(c => {
          const r = c.suit === '♥' || c.suit === '♦' ? 'red' : 'black';
          return `<span class="mc ${r} ${c.isWild ? 'w' : ''}">${c.isJoker ? (c.rank === 'big' ? '👑' : '🃏') : c.suit + c.rank}</span>`;
        }).join('')}
      </div>
    `;
  }

  _renderMessages() {
    const g = this.game;
    // 合并系统消息和出牌记录
    const msgs = g.messages.slice(-6).map(m =>
      `<div class="msg">${m}</div>`
    ).join('');
    return msgs;
  }

  _renderButtons(g, human, isHumanTurn, isLeading) {
    const autoNext = g.settings.autoNextRound;

    // 本局结束：根据设置显示等待或手动按钮
    if (g.phase === PHASE.ROUND_END) {
      if (autoNext) {
        return '<div class="btn-row wait">⏳ 下一局自动开始...</div>';
      } else {
        return '<div class="btn-row"><button class="btn btn-p" id="btn-r">🔄 再来一局</button></div>';
      }
    }

    if (human.finished) {
      if (g.phase === PHASE.GAME_OVER) return '<div class="btn-row"><button class="btn btn-p" id="btn-r">🔄 再来一局</button></div>';
      return '<div class="btn-row wait">✅ 已出完，观战中</div>';
    }
    if (g.phase === PHASE.GAME_OVER) return '<div class="btn-row"><button class="btn btn-p" id="btn-r">🔄 再来一局</button></div>';

    return `
      <div class="btn-row">
        <button class="btn btn-p" id="btn-play" ${!isHumanTurn ? 'disabled' : ''}>▶ 出牌</button>
        <button class="btn btn-s" id="btn-pass" ${(!isHumanTurn || isLeading) ? 'disabled' : ''}>⏭ 过牌</button>
        <button class="btn btn-h" id="btn-hint">💡 提示</button>
        ${this.selectedCards.size > 0 ? '<button class="btn btn-c" id="btn-clear">✕ 清除</button>' : ''}
      </div>
    `;
  }

  _renderGameOverModal() {
    const g = this.game;
    const won = g.humanWonRounds >= g.aiWonRounds;
    const summary = g.stats.getSummary();
    return `
      <div class="modal-mask">
        <div class="modal-box">
          <div class="modal-icon">${won ? '🎉' : '💪'}</div>
          <h2>${won ? '恭喜通关！' : '再接再厉！'}</h2>
          <p>最终级牌: <b>${g.levelManager.currentLevel}</b></p>
          <p>你方 ${g.humanWonRounds} : ${g.aiWonRounds} 对方</p>
          ${summary.totalRounds > 0 ? `
          <div class="modal-stats">
            <span>总局 <b>${summary.totalRounds}</b></span>
            <span>胜率 <b>${summary.winRate}</b></span>
            <span>均排 <b>${summary.avgRank}</b></span>
            <span>💣 <b>${summary.bombsPlayed}</b></span>
          </div>` : ''}
          <button class="btn btn-p" id="btn-r" style="margin-top:16px;padding:12px 40px">🔄 再来一局</button>
        </div>
      </div>
    `;
  }

  _rankEmoji(r) {
    return r === 1 ? '🏆' : r === 2 ? '🥈' : r === 3 ? '🥉' : '';
  }

  // ─── 事件 ───

  _bindEvents() {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-cid]');
      if (el) this._onCardClick(el);
    });
  }

  _bindDynamicEvents() {
    const $ = id => document.getElementById(id);
    const btnPlay = $('btn-play');
    const btnPass = $('btn-pass');
    const btnHint = $('btn-hint');
    const btnRestart = $('btn-r');
    const btnStats = $('btn-stats');
    const btnSound = $('btn-sound');
    const btnSettings = $('btn-settings');
    const btnClear = $('btn-clear');

    if (btnPlay) btnPlay.addEventListener('click', () => this._onPlay());
    if (btnPass) btnPass.addEventListener('click', () => this._onPass());
    if (btnHint) btnHint.addEventListener('click', () => this._onHint());
    if (btnClear) btnClear.addEventListener('click', () => {
      this.selectedCards.clear();
      this.render();
    });
    if (btnRestart) btnRestart.addEventListener('click', () => {
      this.selectedCards.clear();
      if (this.game.phase === PHASE.GAME_OVER) {
        this.game.startNewGame(); // 终局：重新开始
      } else {
        this.game.continueGame(); // 普通结束：继续下一局
      }
    });

    // 设置面板
    if (btnSettings) btnSettings.addEventListener('click', () => {
      this._settingsOpen = !this._settingsOpen;
      if (this._settingsOpen) this._statsOpen = false; // 互斥
      this.render();
    });
    // 统计面板
    if (btnStats) btnStats.addEventListener('click', () => {
      this._statsOpen = !this._statsOpen;
      if (this._statsOpen) this._settingsOpen = false; // 互斥
      this.render();
    });
    // 音效开关
    if (btnSound) btnSound.addEventListener('click', () => {
      const enabled = this.game.sound.toggle();
      btnSound.textContent = enabled ? '🔊' : '🔇';
    });

    // 设置面板内的事件
    const s = this.game.settings;
    // 头像选择
    document.querySelectorAll('.av-opt').forEach(el => {
      el.addEventListener('click', () => {
        s.playerAvatar = el.dataset.av;
        this.render();
      });
    });
    // 昵称输入
    const nameInput = $('input-name');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        s.playerName = nameInput.value.trim() || '玩家';
        this.render();
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { nameInput.blur(); }
      });
    }
    // 主题选择
    document.querySelectorAll('.theme-btn').forEach(el => {
      el.addEventListener('click', () => {
        s.theme = el.dataset.theme;
        this.render();
      });
    });
    // 自动保存统计
    const chkSave = $('chk-save-stats');
    if (chkSave) chkSave.addEventListener('change', () => { s.autoSaveStats = chkSave.checked; });
    // 自动下一局
    const chkNext = $('chk-auto-next');
    if (chkNext) chkNext.addEventListener('change', () => { s.autoNextRound = chkNext.checked; });
  }

  _onCardClick(el) {
    const cid = parseInt(el.dataset.cid);
    const g = this.game;
    if (g.phase === PHASE.ROUND_END || g.phase === PHASE.GAME_OVER) return;
    if (g.currentPlayer !== 0) return;
    if (g.players[0].finished) return;

    if (this.selectedCards.has(cid)) {
      this.selectedCards.delete(cid);
    } else {
      this.selectedCards.add(cid);
      g.sound.cardSelect(); // 选牌音效
    }
    this.render();
  }

  _onPlay() {
    if (this.selectedCards.size === 0) return;
    const human = this.game.players[0];
    const selected = human.hand.filter(c => this.selectedCards.has(c.id));
    if (selected.length === 0) return;

    if (this.game.humanPlay(selected)) {
      this.selectedCards.clear();
    }
    this.render();
  }

  _onPass() {
    this.game.humanPass();
    this.selectedCards.clear();
    this.render();
  }

  _onHint() {
    const human = this.game.players[0];
    const allPlays = CardUtils.findPlays(human.hand, this.game.levelManager.currentLevel);
    const state = this.game.getGameState();
    const candidates = state.isLeading ? allPlays : allPlays.filter(p => HandDetector.canBeat(p, state.lastPlay.hand));

    if (candidates.length === 0) {
      this.game._msg('💡 没有能出的牌，建议过牌');
      this.render();
      return;
    }

    candidates.sort((a, b) => {
      const pa = HAND_TYPE_POWER[a.type] || 0;
      const pb = HAND_TYPE_POWER[b.type] || 0;
      return pa !== pb ? pa - pb : RANK_POWER[a.mainRank] - RANK_POWER[b.mainRank];
    });

    const best = candidates[0];
    this.selectedCards.clear();
    best.cards.forEach(c => this.selectedCards.add(c.id));
    this.game._msg(`💡 提示: ${handTypeDisplayName(best.type)} (${CardUtils.cardsToString(best.cards)})`);
    this.render();
  }

  _setupAutoScroll() {
    setInterval(() => {
      const el = document.getElementById('msg-area');
      if (el) el.scrollTop = el.scrollHeight;
    }, 400);
  }
}
