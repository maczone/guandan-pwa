/**
 * ui.js v2 - 掼蛋竞赛版UI渲染
 * 支持：贡牌/还牌交互、报牌横幅、借风提示、A必打显示
 */

class GameUI {
  constructor(game) {
    this.game = game;
    this._settingsOpen = false;
    this._statsOpen = false;
    this._rulesOpen = false;
    this._selectedCards = new Set();
    this._showWelcome = true;   // 首次显示欢迎/规则
    this._bindEvents();
  }

  render() {
    const g = this.game;
    const state = g.getGameState();
    const level = g.levelManager.currentLevel;
    const human = g.players[0];
    const tm = g.players[2];
    const ai1 = g.players[1];
    const ai3 = g.players[3];

    const isHumanTurn = g.currentPlayer === 0 && !human.finished
      && g.phase !== PHASE.ROUND_END && g.phase !== PHASE.GAME_OVER
      && g.phase !== PHASE.TRIBUTE && g.phase !== PHASE.RETURN;

    const isLeading = state.isLeading;

    // 报牌信息
    const humanRemaining = human.hand.length;
    const showDeclaration = humanRemaining <= 10 && humanRemaining > 0 && !human.finished;

    document.getElementById('app').innerHTML = `
      ${this._showWelcome ? this._renderWelcomeModal() : ''}

      <!-- 顶栏 -->
      <div class="top-bar">
        <div class="top-left">
          <span class="level-value">${level}</span>
          <span class="level-label">级牌</span>
          ${g.levelManager.aFailCount > 0 ? `<span class="a-fail-badge">A${'❌'.repeat(g.levelManager.aFailCount)}</span>` : ''}
        </div>
        <div class="top-center">
          <span class="round-num">第 ${g.roundNum} 局</span>
          <span class="score-display">🏆 ${g.humanWonRounds} : ${g.aiWonRounds}</span>
          ${g.phase === PHASE.GAME_OVER ? '<span class="phase-badge end">🏁 终局</span>' : ''}
        </div>
        <div class="top-right">
          ${this._turnBadge(g, isHumanTurn, isLeading)}
          <button class="btn-icon" id="btn-rules" title="竞赛规则">📖</button>
          <button class="btn-icon" id="btn-settings" title="设置">⚙</button>
          <button class="btn-icon" id="btn-stats" title="记牌器/统计">📊</button>
          <button class="btn-icon" id="btn-sound" title="音效开关">${g.sound.enabled ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <!-- 规则面板（折叠） -->
      <div class="rules-panel" id="rules-panel" style="display:${this._rulesOpen ? 'flex' : 'none'}">
        ${this._renderRulesPanel()}
      </div>

      <!-- 设置面板（折叠） -->
      <div class="settings-panel" id="settings-panel" style="display:${this._settingsOpen ? 'block' : 'none'}">
        ${this._renderSettingsPanel(g)}
      </div>

      <!-- 统计面板（折叠） -->
      <div class="stats-panel" id="stats-panel" style="display:${this._statsOpen ? 'block' : 'none'}">
        ${this._statsOpen ? this._renderStatsPanel(g) : ''}
      </div>

      ${this._renderMainContent(g, human, tm, ai1, ai3, state, isHumanTurn, isLeading, showDeclaration)}
    `;
    this._bindDynamicEvents();
  }

  _renderMainContent(g, human, tm, ai1, ai3, state, isHumanTurn, isLeading, showDeclaration) {
    // 兜底：4人都已出完 — 强制显示结算画面（防止阶段切换竞态）
    if (g.finishOrder && g.finishOrder.length >= 4) {
      if (g.phase === PHASE.GAME_OVER) return this._renderGameOverScreen(g);
      return this._renderRoundEndScreen(g);
    }

    // 终局
    if (g.phase === PHASE.GAME_OVER) {
      return this._renderGameOverScreen(g);
    }

    // 局末
    if (g.phase === PHASE.ROUND_END) {
      return this._renderRoundEndScreen(g);
    }

    // 贡牌/还牌阶段
    if (g.phase === PHASE.TRIBUTE || g.phase === PHASE.RETURN) {
      return this._renderTributeUI(g, human);
    }

    return `
      <!-- 报牌横幅 -->
      ${showDeclaration ? `<div class="declaration-banner">📢 ${human.hand.length} 张</div>` : ''}

      <!-- 中场 -->
      <div class="middle-area">
        <div class="opponent opponent-top ${tm.finished ? 'done' : ''}">
          <span class="op-name">${tm.name}</span>
          <span class="op-cards">${tm.finished ? '✅' : '🂠×' + tm.hand.length}</span>
          ${this._rankBadge(tm)}
          ${this._declarationTag(2, g)}
          ${g.currentPlayer === 2 && !tm.finished ? '<span class="op-thinking">⏳</span>' : ''}
        </div>

        <div class="play-area">
          <div class="opponent-side left ${ai3.finished ? 'done' : ''}">
            <span class="op-name">${ai3.name}</span>
            <span class="op-cards">${ai3.finished ? '✅' : '🂠×' + ai3.hand.length}</span>
            ${this._rankBadge(ai3)}
            ${this._declarationTag(3, g)}
            ${g.currentPlayer === 3 && !ai3.finished ? '<span class="op-thinking">⏳</span>' : ''}
          </div>

          <div class="table-center">
            ${this._renderPlayArea()}
            ${state.borrowWind ? '<div class="borrow-wind-hint">🌬️ 接风</div>' : ''}
          </div>

          <div class="opponent-side right ${ai1.finished ? 'done' : ''}">
            <span class="op-name">${ai1.name}</span>
            <span class="op-cards">${ai1.finished ? '✅' : '🂠×' + ai1.hand.length}</span>
            ${this._rankBadge(ai1)}
            ${this._declarationTag(1, g)}
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
          ${state.borrowWind && isHumanTurn ? '<span class="borrow-tag">🌬️ 接风</span>' : ''}
        </div>

        <div class="hand-cards" id="hand-area">
          ${this._renderHand(human.hand)}
        </div>

        ${this._renderButtons(g, human, isHumanTurn, isLeading)}
      </div>
    `;
  }

  /** 局末结束画面 */
  _renderRoundEndScreen(g) {
    const result = GameScorer.score(g.finishOrder, g.humanPlayerIdx, g.teammateIdx);
    const isWin = result.levelAdvance > 0;
    const emoji = isWin ? '🎉' : result.levelAdvance < 0 ? '💔' : '🤝';
    const level = g.levelManager.currentLevel;

    const rankNames = ['🏆', '🥈', '🥉', '💔'];
    const rankLabels = ['头游', '二游', '三游', '末游'];
    const rankingHtml = g.finishOrder.map((pIdx, i) =>
      `<div class="re-rank-row">
        <span class="re-rank-icon">${rankNames[i]}</span>
        <span class="re-rank-name">${g.players[pIdx].name}</span>
        <span class="re-rank-label">${rankLabels[i]}</span>
      </div>`
    ).join('');

    return `
      <div class="round-end-screen">
        <div class="re-icon">${emoji}</div>
        <div class="re-result">${result.desc}</div>
        <div class="re-level">当前级牌: <b>${level}</b></div>
        <div class="re-rankings">${rankingHtml}</div>
        <div class="re-buttons">
          <button class="btn btn-p" id="btn-next-round">🔄 再来一局</button>
        </div>
      </div>
    `;
  }

  /** 终局画面（打过A） */
  _renderGameOverScreen(g) {
    const summary = g.stats.getSummary();
    // 通过最近一局看是否赢了
    const lastResult = g.finishOrder.length >= 4
      ? GameScorer.score(g.finishOrder, g.humanPlayerIdx, g.teammateIdx)
      : null;
    const isWin = lastResult && lastResult.levelAdvance > 0;

    return `
      <div class="round-end-screen game-over">
        <div class="re-icon">${isWin ? '🏆' : '💔'}</div>
        <div class="re-result">${isWin ? '🎉 恭喜通关！成功打过A！' : '游戏结束'}</div>
        <div class="re-stats">
          <div class="re-stat"><span>总局数</span><b>${summary.totalRounds}</b></div>
          <div class="re-stat"><span>胜率</span><b>${summary.winRate}</b></div>
          <div class="re-stat"><span>💣炸弹</span><b>${summary.bombsPlayed}</b></div>
        </div>
        <div class="re-buttons">
          <button class="btn btn-p" id="btn-new-game">🔄 新游戏</button>
        </div>
      </div>
    `;
  }

  /** 报牌标签（对手剩余≤10张时显示） */
  _declarationTag(playerIdx, g) {
    const p = g.players[playerIdx];
    if (p.finished) return '';
    const count = p.hand.length;
    if (count <= 10) {
      return `<span class="declaration-tag">📢 ${count}</span>`;
    }
    return '';
  }

  /** 贡牌/还牌UI */
  _renderTributeUI(g, human) {
    const isTribute = g.phase === PHASE.TRIBUTE;
    const step = g.tributeStep;
    const info = g.tributeInfo;
    
    let title = '';
    let instruction = '';
    let selectable = false;
    let availableCards = [];

    if (info) {
      if (isTribute && step === 'choose_tribute') {
        title = '📤 进贡';
        instruction = `请选择一张牌进贡给 ${g.players[info.to].name}`;
        selectable = true;
        // 可进贡的牌（红心级牌不可进贡）
        const levelRank = g.levelManager.currentLevel;
        availableCards = human.hand.filter(c => !(c.suit === '♥' && c.rank === levelRank));
      } else if (!isTribute && step === 'choose_return') {
        title = '📥 还牌';
        instruction = `请选择一张10及以下的牌还给 ${g.players[info.from].name}`;
        selectable = true;
        availableCards = human.hand;
      } else {
        title = isTribute ? '⏳ 对手进贡中...' : '⏳ 对手还牌中...';
        instruction = '请稍候';
      }
    } else {
      title = isTribute ? '⏳ 进贡中...' : '⏳ 还牌中...';
      instruction = '请稍候';
    }

    return `
      <div class="middle-area tribute-phase">
        <div class="tribute-header">${title}</div>
        <div class="tribute-instruction">${instruction}</div>
        <div class="tribute-hand" id="tribute-hand">
          ${selectable ? this._renderTributeCards(human.hand, availableCards, g) : 
            `<div class="empty-hand">⏳ 等待对手操作...</div>`}
        </div>
        ${selectable ? `
          <div class="btn-row">
            <button class="btn btn-p" id="btn-tribute-confirm" ${this._selectedCards.size !== 1 ? 'disabled' : ''}>
              ${isTribute ? '📤 确认进贡' : '📥 确认还牌'}
            </button>
          </div>
        ` : ''}
      </div>
      <div class="message-area" id="msg-area">
        ${this._renderMessages()}
      </div>
    `;
  }

  /** 贡牌手牌渲染 */
  _renderTributeCards(hand, available, g) {
    const sorted = CardUtils.sortCards([...hand]);
    const levelRank = g.levelManager.currentLevel;
    const isReturn = g.phase === PHASE.RETURN;

    return sorted.map(c => {
      const canSelect = available.some(ac => ac.id === c.id);
      const isSelected = this._selectedCards.has(c.id);
      const isWild = c.suit === '♥' && c.rank === levelRank;
      const isRed = !c.isJoker && (c.suit === '♥' || c.suit === '♦');
      const cls = [
        'card',
        isRed ? 'red' : 'black',
        isWild ? 'wild' : '',
        isSelected ? 'sel' : '',
        !canSelect ? 'disabled' : ''
      ].filter(Boolean).join(' ');

      return `<div class="${cls}" data-card-id="${c.id}" data-action="tribute-select">
        ${this._cardHTML(c)}
        ${isWild ? '<span class="wild-tag">配</span>' : ''}
        ${!canSelect && isReturn ? '<span class="wild-tag" style="background:#555">禁</span>' : ''}
      </div>`;
    }).join('');
  }

  _turnBadge(g, isHumanTurn, isLeading) {
    if (isHumanTurn && isLeading) return '<span class="phase-badge active">🎯 出牌</span>';
    if (isHumanTurn) return '<span class="phase-badge active">⚡ 回合</span>';
    return '<span class="phase-badge">💤 等待</span>';
  }

  _rankBadge(p) {
    if (p.finished && p.finishRank) {
      return `<span class="rank-badge">${this._rankEmoji(p.finishRank)}</span>`;
    }
    return '';
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
              return `<button class="theme-btn ${s.theme === k ? 't-sel' : ''}" style="--tbg:${t.vars['--bg-table']};--tac:${t.vars['--accent']}" data-theme="${k}">
                <span class="theme-swatch" style="background:${t.vars['--accent']}"></span>
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
    if (!cards || cards.length === 0) return '<div class="empty-hand">🃏 手牌已空</div>';

    // 分成两行显示
    const sorted = CardUtils.sortCards([...cards]);
    const mid = Math.ceil(sorted.length / 2);
    const topRow = sorted.slice(0, mid);
    const botRow = sorted.slice(mid);

    return `
      <div class="hand-row">${topRow.map(c => this._cardHTMLWrapper(c)).join('')}</div>
      ${botRow.length > 0 ? `<div class="hand-row">${botRow.map(c => this._cardHTMLWrapper(c)).join('')}</div>` : ''}
    `;
  }

  _cardHTMLWrapper(c) {
    const isSelected = this._selectedCards.has(c.id);
    const isRed = !c.isJoker && (c.suit === '♥' || c.suit === '♦');
    const cls = ['card', isRed ? 'red' : 'black', c.isWild ? 'wild' : '', isSelected ? 'sel' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-card-id="${c.id}">
      ${this._cardHTML(c)}
      ${c.isWild ? '<span class="wild-tag">配</span>' : ''}
    </div>`;
  }

  _cardHTML(c) {
    if (c.isJoker) {
      const emoji = c.rank === 'big' ? '👑' : '🃏';
      return `<span class="cjoker" style="color:${c.rank === 'big' ? '#d32f2f' : '#1565c0'}">${emoji}</span>`;
    }
    const color = (c.suit === '♥' || c.suit === '♦') ? 'red' : 'black';
    return `<span class="crank" style="color:${color}">${c.rank}</span><span class="csuit" style="color:${color}">${c.suit}</span>`;
  }

  _renderPlayArea() {
    const g = this.game;
    if (!g.lastPlay) return '<div class="play-hint">🃏 等待出牌...</div>';

    const lp = g.lastPlay;
    const player = g.players[lp.playerIdx];
    const displayName = handTypeDisplayName(lp.hand.type);

    return `<div class="last-play">
      <div class="lp-player">${player.name}</div>
      <div class="lp-type">${displayName}</div>
      <div class="lp-cards">${lp.cards.map(c => {
        if (c.isJoker) {
          const emoji = c.rank === 'big' ? '👑' : '🃏';
          return `<span class="mc" style="color:${c.rank === 'big' ? '#d32f2f' : '#1565c0'}">${emoji}</span>`;
        }
        const color = (c.suit === '♥' || c.suit === '♦') ? 'red' : 'black';
        return `<span class="mc ${color}">${c.suit}${c.rank}</span>`;
      }).join('')}</div>
    </div>`;
  }

  _renderMessages() {
    const msgs = this.game.messages.slice(-6);
    return msgs.map(m => `<div class="msg">${m.text}</div>`).join('');
  }

  _renderButtons(g, human, isHumanTurn, isLeading) {
    if (g.phase === PHASE.ROUND_END) {
      return `<div class="btn-row">
        <button class="btn btn-p" id="btn-next-round">🔄 再来一局</button>
      </div>`;
    }
    if (g.phase === PHASE.GAME_OVER) {
      return `<div class="btn-row">
        <button class="btn btn-p" id="btn-new-game">🔄 新游戏</button>
      </div>`;
    }
    if (human.finished || !isHumanTurn) {
      return `<div class="btn-row wait">⏳ 等待其他玩家...</div>`;
    }
    return `<div class="btn-row">
      <button class="btn btn-p" id="btn-play" ${this._selectedCards.size === 0 ? 'disabled' : ''}>
        ${isLeading ? '🎯 出牌' : '⚡ 出牌'}
      </button>
      ${!isLeading ? '<button class="btn btn-s" id="btn-pass">⏭ 过</button>' : ''}
      <button class="btn btn-h" id="btn-hint">💡 提示</button>
    </div>`;
  }

  _rankEmoji(r) {
    const map = { 1: '🏆', 2: '🥈', 3: '🥉', 4: '💔' };
    return map[r] || '';
  }

  /** 欢迎模态框（首次打开时显示竞赛规则简介） */
  _renderWelcomeModal() {
    return `
      <div class="modal-mask">
        <div class="modal-box welcome-box">
          <div class="welcome-icon">🃏</div>
          <h2>掼蛋 · 竞赛规则版</h2>
          <p style="font-size:12px;color:#888;margin:2px 0 8px">基于《掼蛋竞赛规则(2023)》</p>
          <div class="welcome-rules">
            <div class="wr-item"><span class="wr-icon">🎯</span><span>四人两副牌，两组对抗，27张/人</span></div>
            <div class="wr-item"><span class="wr-icon">🃏</span><span><b>逢人配</b>：红心级牌为万能牌</span></div>
            <div class="wr-item"><span class="wr-icon">📤</span><span><b>贡牌还牌</b>：末游进贡，上游还牌</span></div>
            <div class="wr-item"><span class="wr-icon">🌬️</span><span><b>接风</b>：出完牌由搭档出牌</span></div>
            <div class="wr-item"><span class="wr-icon">📢</span><span><b>报牌</b>：≤10张自动报数</span></div>
            <div class="wr-item"><span class="wr-icon">👑</span><span><b>四大天王</b>：2小王+2大王=最大牌型</span></div>
            <div class="wr-item"><span class="wr-icon">⬆️</span><span>从2打到<b>A</b>，三次不过A回2</span></div>
          </div>
          <div class="welcome-buttons">
            <button class="btn btn-p" id="btn-welcome-start">🎮 开始游戏</button>
            <button class="btn btn-s" id="btn-welcome-rules" style="margin-top:4px">📖 查看完整规则</button>
          </div>
          <button class="btn-icon welcome-close" id="btn-welcome-close" title="关闭">✕</button>
        </div>
      </div>
    `;
  }

  /** 竞赛规则面板（右侧滑出） */
  _renderRulesPanel() {
    return `
      <div class="rp-title">📖 竞赛规则</div>
      <div class="rp-scroll">
        <div class="rp-section">
          <div class="rp-h">🎯 游戏目标</div>
          <div class="rp-b">四人两两组队，从<b>2</b>开始升级，率先打过<b>A</b>的一方获胜。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">🃏 逢人配（万能牌）</div>
          <div class="rp-b">当前级牌的<b>红心</b>牌为逢人配（如打5，♥5是万能）。可替代任意牌张（不含大小王）参与组合。<b>不可进贡</b>。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">📤 贡牌与还牌</div>
          <div class="rp-b"><b>单向进贡</b>：末游向头游进贡一张除红心级牌外最大的牌。头游还一张10及以下的牌。<br><b>双下进贡</b>：两个输家分别向头游和二游进贡。<br><b>抗贡</b>：进贡者抓到两个大王可免于进贡。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">🌬️ 借风出牌（接风）</div>
          <div class="rp-b">玩家出完全手牌后，无人压牌时其搭档获得下一圈出牌权。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">📢 报牌</div>
          <div class="rp-b">出牌后剩余手牌≤10张时，必须报出剩余张数。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">👑 四大天王</div>
          <div class="rp-b">2小王+2大王组成，是掼蛋中<b>最大</b>的牌型。大小顺序：四大天王 > 六炸(6~8同张) > 同花顺 > 五炸 > 四炸 > 普通牌型。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">⬆️ 升级规则</div>
          <div class="rp-b">
            • 头游+二游（双上）：<b>升3级</b><br>
            • 头游+三游：<b>升2级</b><br>
            • 头游+末游：<b>升1级</b><br>
            • 二游+三游（中游）：不升级<br>
            • 二游+末游（被双下）：<b>降1级</b><br>
            • 三游+末游（双下）：<b>降2级</b>
          </div>
        </div>
        <div class="rp-section">
          <div class="rp-h">🏆 A必打</div>
          <div class="rp-b">打到A后必须赢得一局才能获胜。打A失败累计<b>三次</b>则退回2重新开始。</div>
        </div>
        <div class="rp-section">
          <div class="rp-h">💥 牌型大小（全）</div>
          <div class="rp-b">
            <b>普通牌型</b>：单张 < 对子 < 三同张 < 三带一 < 三带对 < 顺子(5张) < 同花(5张)<br>
            <b>炸弹牌型</b>：四炸(4同张) < 五炸(5同张) < 同花顺(5张) < 六~八炸(6~8同张) < 四大天王(2小王+2大王)<br>
            炸弹可压任何普通牌型。同类型须张数相同且牌点更大。
          </div>
        </div>
        <div class="rp-section">
          <div class="rp-h">🔄 出牌顺序</div>
          <div class="rp-b">
            <b>首局</b>：持有♠2的玩家先出。<br>
            <b>后续</b>：非双下由进贡者先出；双下由进贡大者先出。<br>
            按逆时针方向轮流出牌，可出牌或过牌。<br>
            一轮中三人过牌则最后出牌者赢得本轮并获得下一轮首出权。
          </div>
        </div>
      </div>
      <button class="btn btn-s" id="btn-rules-close" style="margin:8px auto;display:block">关闭</button>
    `;
  }

  _bindEvents() {
    // 全局事件委托
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const id = btn.id;

      if (id === 'btn-settings') { this._settingsOpen = !this._settingsOpen; this._statsOpen = false; this._rulesOpen = false; this.render(); }
      if (id === 'btn-stats') { this._statsOpen = !this._statsOpen; this._settingsOpen = false; this._rulesOpen = false; this.render(); }
      if (id === 'btn-rules') { this._rulesOpen = !this._rulesOpen; this._settingsOpen = false; this._statsOpen = false; this.render(); }
      if (id === 'btn-sound') { this.game.sound.toggle(); this.render(); }
      if (id === 'btn-play') { this._onPlay(); }
      if (id === 'btn-pass') { this._onPass(); }
      if (id === 'btn-hint') { this._onHint(); }
      if (id === 'btn-next-round') { this.game.continueGame(); }
      if (id === 'btn-new-game') { this.game.startNewGame(); this._showWelcome = false; }
      if (id === 'btn-tribute-confirm') { this._onTributeConfirm(); }
      if (id === 'btn-welcome-start') { this._showWelcome = false; this.game.startNewGame(); this.render(); }
      if (id === 'btn-welcome-close') { this._showWelcome = false; this.game.startNewGame(); this.render(); }
      if (id === 'btn-welcome-rules') { this._showWelcome = false; this._rulesOpen = true; this.game.startNewGame(); this.render(); }
      if (id === 'btn-rules-close') { this._rulesOpen = false; this.render(); }
    });
  }

  _bindDynamicEvents() {
    const $ = id => document.getElementById(id);

    // 手牌点击
    const handArea = document.getElementById('hand-area');
    if (handArea) {
      handArea.querySelectorAll('.card').forEach(el => {
        el.addEventListener('click', () => this._onCardClick(el));
      });
    }

    // 贡牌手牌点击
    const tributeHand = document.getElementById('tribute-hand');
    if (tributeHand) {
      tributeHand.querySelectorAll('.card').forEach(el => {
        el.addEventListener('click', () => this._onCardClick(el));
      });
    }

    // 头像选择
    document.querySelectorAll('.av-opt').forEach(el => {
      el.addEventListener('click', () => {
        this.game.settings.playerAvatar = el.dataset.av;
        this.render();
      });
    });

    // 主题选择
    document.querySelectorAll('.theme-btn').forEach(el => {
      el.addEventListener('click', () => {
        this.game.settings.theme = el.dataset.theme;
        this.render();
      });
    });

    // 昵称输入
    const nameInput = document.getElementById('input-name');
    if (nameInput) {
      nameInput.addEventListener('change', () => {
        this.game.settings.playerName = nameInput.value.trim() || '玩家';
      });
    }

    // 统计设置开关
    const chkSave = document.getElementById('chk-save-stats');
    if (chkSave) chkSave.addEventListener('change', () => { this.game.settings.autoSaveStats = chkSave.checked; });
    const chkAuto = document.getElementById('chk-auto-next');
    if (chkAuto) chkAuto.addEventListener('change', () => { this.game.settings.autoNextRound = chkAuto.checked; });

    // 消息区自动滚动
    this._setupAutoScroll();
  }

  _onCardClick(el) {
    const cardId = parseInt(el.dataset.cardId);
    if (isNaN(cardId)) return;

    const g = this.game;

    // 贡牌/还牌阶段选中
    if (g.phase === PHASE.TRIBUTE || g.phase === PHASE.RETURN) {
      if (el.classList.contains('disabled')) return;
      this._selectedCards.clear();
      this._selectedCards.add(cardId);
      this.render();
      return;
    }

    // 正常出牌阶段
    if (g.currentPlayer !== 0) return;

    if (this._selectedCards.has(cardId)) {
      this._selectedCards.delete(cardId);
    } else {
      this._selectedCards.add(cardId);
    }
    this.render();
  }

  _onPlay() {
    if (this._selectedCards.size === 0) return;
    const cards = [];
    for (const id of this._selectedCards) {
      const card = this.game.players[0].hand.find(c => c.id === id);
      if (card) cards.push(card);
    }
    if (cards.length === 0) return;

    const result = this.game.humanPlay(cards);
    if (result) {
      this._selectedCards.clear();
    }
  }

  _onPass() {
    this.game.humanPass();
  }

  _onHint() {
    const g = this.game;
    const hand = g.players[0].hand;
    const state = g.getGameState();
    const allPlays = CardUtils.findPlays(hand, g.levelManager.currentLevel);

    let bestPlay = null;

    if (state.isLeading) {
      // 首出：选最小的可出组合
      if (allPlays.length > 0) {
        bestPlay = allPlays[0];
      }
    } else if (g.lastPlay) {
      // 找能打过的
      const beatPlays = allPlays.filter(p => HandDetector.canBeat(p, g.lastPlay.hand));
      if (beatPlays.length > 0) {
        beatPlays.sort((a, b) => {
          const pA = HAND_TYPE_POWER[a.type] || 0;
          const pB = HAND_TYPE_POWER[b.type] || 0;
          if (pA !== pB) return pA - pB;
          return RANK_POWER[a.mainRank] - RANK_POWER[b.mainRank];
        });
        bestPlay = beatPlays[0];
      }
    }

    if (bestPlay) {
      this._selectedCards.clear();
      for (const c of bestPlay.cards) this._selectedCards.add(c.id);
      this.render();
    } else {
      this.game._msg('💡 没有合适的牌可以出');
    }
  }

  _onTributeConfirm() {
    if (this._selectedCards.size !== 1) return;
    const cardId = [...this._selectedCards][0];
    const g = this.game;
    const card = g.players[0].hand.find(c => c.id === cardId);
    if (!card) return;

    let result = false;
    if (g.phase === PHASE.TRIBUTE && g.tributeStep === 'choose_tribute') {
      result = g.humanChooseTribute(card);
    } else if (g.phase === PHASE.RETURN && g.tributeStep === 'choose_return') {
      result = g.humanChooseReturn(card);
    }

    if (result) {
      this._selectedCards.clear();
    }
  }

  _setupAutoScroll() {
    const msgArea = document.getElementById('msg-area');
    if (msgArea) {
      msgArea.scrollTop = msgArea.scrollHeight;
    }
  }
}
