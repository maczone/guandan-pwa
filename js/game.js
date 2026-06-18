/**
 * game.js v2 - 掼蛋竞赛版游戏状态机
 * 特性：贡牌还牌、借风出牌、报牌、A必打/三次不过回2、四大天王
 */

// ─── 游戏阶段 ───
const PHASE = {
  WAITING: 'waiting',
  TRIBUTE: 'tribute',         // 贡牌阶段（新）
  RETURN: 'return',           // 还牌阶段（新）
  DEALING: 'dealing',
  LEADING: 'leading',         // 首出（自由出牌）
  PLAYING: 'playing',
  TRICK_END: 'trick_end',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over'
};

class Game {
  constructor() {
    this.phase = PHASE.WAITING;
    this.levelManager = new LevelManager();
    this.memory = new CardMemory();
    this.stats = new GameStats();
    this.sound = new GameSound();
    this.settings = new GameSettings();
    this.humanPlayerIdx = 0;
    this.teammateIdx = 2;
    this.players = [
      { id: 0, name: '你', hand: [], isHuman: true, finished: false, finishRank: 0 },
      { id: 1, name: 'AI-乙', hand: [], isHuman: false, finished: false, finishRank: 0 },
      { id: 2, name: 'AI-丙', hand: [], isHuman: false, finished: false, finishRank: 0 },
      { id: 3, name: 'AI-丁', hand: [], isHuman: false, finished: false, finishRank: 0 }
    ];
    this.lastPlay = null;
    this.lastPlayPlayer = -1;
    this.passCount = 0;
    this.finishOrder = [];
    this.trickHistory = [];
    this.messages = [];
    this.roundNum = 1;
    this.humanWonRounds = 0;
    this.aiWonRounds = 0;
    this.callbacks = { onUpdate: null, onMessage: null };
    this._bombSoundPlayed = false;

    // ─── v2 竞赛状态 ───
    this.tributeState = null;           // 贡牌状态 { type, tributeList, leaderIdx }
    this.tributeStep = null;           // 'choose_tribute' | 'choose_return' | null
    this.tributeInfo = null;           // 当前贡牌交互 { from, to, card, returnCard }
    this.lastFinisher = -1;            // 最后一个出完牌的玩家（用于借风/接风）
    this.borrowWind = false;           // 是否借风状态
    this.aFailCount = 0;               // A必打失败次数
    this.declaredCards = {};          // 报牌记录 { playerIdx: declaredCount }
  }

  onUpdate(cb) { this.callbacks.onUpdate = cb; }
  onMessage(cb) { this.callbacks.onMessage = cb; }

  _msg(text) {
    this.messages.push({ text, time: Date.now() });
    if (this.callbacks.onMessage) this.callbacks.onMessage(text);
    console.log('[掼蛋]', text);
  }

  _update() {
    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
  }

  startNewGame() {
    this.levelManager.reset();
    this.roundNum = 1;
    this.humanWonRounds = 0;
    this.aiWonRounds = 0;
    this.aFailCount = 0;
    this._msg('🎮 新游戏开始！');
    this._startNewRound();
  }

  continueGame() {
    if (this.phase === PHASE.ROUND_END || this.phase === PHASE.GAME_OVER) {
      this._startNewRound();
    }
  }

  /** 开始新一局（含贡牌流程） */
  _startNewRound() {
    this.phase = PHASE.DEALING;
    this.memory.reset();
    this.finishOrder = [];
    this.trickHistory = [];
    this.lastPlay = null;
    this.lastPlayPlayer = -1;
    this.passCount = 0;
    this._bombSoundPlayed = false;
    this.lastFinisher = -1;
    this.borrowWind = false;
    this.declaredCards = {};

    // 重置玩家
    for (const p of this.players) {
      p.hand = [];
      p.finished = false;
      p.finishRank = 0;
    }

    // 发牌
    const deck = new Deck();
    deck.shuffle();
    const hands = deck.deal(4);
    for (let i = 0; i < 4; i++) {
      this.players[i].hand = CardUtils.sortCards(hands[i]);
    }

    // 标记级牌（逢人配）
    const levelRank = this.levelManager.currentLevel;
    for (const p of this.players) {
      for (const c of p.hand) {
        c.isWild = (c.suit === '♥' && c.rank === levelRank);
      }
    }

    this._msg(`━━━ 第 ${this.roundNum} 局 ━━━`);
    this._msg(`当前级牌: ${levelRank} (红心${levelRank}为逢人配)`);

    // 判断是否需要贡牌
    if (this.roundNum > 1 && this.tributeState && this.tributeState.tributeList.length > 0) {
      this._startTributePhase();
    } else {
      this._determineLeader();
    }
  }

  /** 开始贡牌阶段 */
  _startTributePhase() {
    this.phase = PHASE.TRIBUTE;
    const { tributeList, type } = this.tributeState;
    
    if (type === 'double') {
      this._msg('🔄 双下：双方进贡');
    } else {
      this._msg('🔄 进贡环节');
    }

    // 检查抗贡
    let anyAnti = false;
    for (const tribute of tributeList) {
      const fromHand = this.players[tribute.from].hand;
      if (TributeManager.canAntiTribute(fromHand)) {
        tribute.antiTribute = true;
        anyAnti = true;
        this._msg(`👑 ${this.players[tribute.from].name} 抗贡！（持有两个大王）`);
      } else {
        tribute.antiTribute = false;
      }
    }

    if (anyAnti) {
      // 有抗贡时，不进行贡牌，直接确定首出
      this._msg('👑 抗贡成功，无需进贡！');
      this._determineLeaderAfterTribute();
      return;
    }

    // 开始第一个贡牌交互
    this._processNextTribute();
  }

  /** 处理下一个贡牌 */
  _processNextTribute() {
    const { tributeList } = this.tributeState;
    const pending = tributeList.find(t => !t.done);
    
    if (!pending) {
      // 所有贡牌完成，进入还牌阶段或确定首出
      this._startReturnPhase();
      return;
    }

    this.tributeInfo = pending;
    
    if (pending.from === this.humanPlayerIdx) {
      // 人类需要选牌进贡
      this.tributeStep = 'choose_tribute';
      this._msg(`📤 请选择一张牌进贡给 ${this.players[pending.to].name}`);
      this._update();
    } else {
      // AI自动选牌进贡
      setTimeout(() => this._aiTribute(pending), 600);
    }
  }

  /** AI自动进贡 */
  _aiTribute(tribute) {
    const fromHand = this.players[tribute.from].hand;
    const card = TributeManager.findTributeCard(fromHand, this.levelManager.currentLevel);
    this._executeTribute(tribute.from, tribute.to, card);
  }

  /** 人类选牌进贡 */
  humanChooseTribute(card) {
    if (this.tributeStep !== 'choose_tribute' || !this.tributeInfo) return false;
    const { from, to } = this.tributeInfo;
    if (from !== this.humanPlayerIdx) return false;

    // 验证：不能进贡红心级牌
    const levelRank = this.levelManager.currentLevel;
    if (card.suit === '♥' && card.rank === levelRank) {
      this._msg('❌ 红心级牌（逢人配）不可进贡！');
      return false;
    }

    this._executeTribute(from, to, card);
    return true;
  }

  /** 执行进贡 */
  _executeTribute(from, to, card) {
    const fromPlayer = this.players[from];
    const toPlayer = this.players[to];

    // 从进贡者手牌移除
    const idx = fromPlayer.hand.findIndex(c => c.id === card.id);
    if (idx === -1) return;
    fromPlayer.hand.splice(idx, 1);

    // 添加到收贡者手牌
    toPlayer.hand.push(card);
    CardUtils.sortCards(toPlayer.hand);

    this._msg(`📤 ${fromPlayer.name} 进贡 ${card.display} 给 ${toPlayer.name}`);

    // 标记完成
    const tribute = this.tributeState.tributeList.find(t => t.from === from);
    if (tribute) tribute.done = true;

    this.tributeStep = null;
    this.tributeInfo = null;
    this._update();

    // 继续下一个贡牌
    this._processNextTribute();
  }

  /** 开始还牌阶段 */
  _startReturnPhase() {
    this.phase = PHASE.RETURN;
    const { tributeList } = this.tributeState;
    
    // 每个收贡者需要还牌
    this._processNextReturn();
  }

  /** 处理下一个还牌 */
  _processNextReturn() {
    const { tributeList } = this.tributeState;
    const pendingReturn = tributeList.find(t => !t.returnDone);
    
    if (!pendingReturn) {
      this._determineLeaderAfterTribute();
      return;
    }

    this.tributeInfo = pendingReturn;
    
    if (pendingReturn.to === this.humanPlayerIdx) {
      // 人类需要选牌还回去
      this.tributeStep = 'choose_return';
      this._msg(`📥 请选择一张10及以下的牌还给 ${this.players[pendingReturn.from].name}`);
      this._update();
    } else {
      // AI自动还牌
      setTimeout(() => this._aiReturn(pendingReturn), 600);
    }
  }

  /** AI自动还牌 */
  _aiReturn(tribute) {
    const toHand = this.players[tribute.to].hand;
    const card = TributeManager.findReturnCard(toHand);
    this._executeReturn(tribute.to, tribute.from, card);
  }

  /** 人类选牌还回 */
  humanChooseReturn(card) {
    if (this.tributeStep !== 'choose_return' || !this.tributeInfo) return false;
    const { to, from } = this.tributeInfo;
    if (to !== this.humanPlayerIdx) return false;

    this._executeReturn(to, from, card);
    return true;
  }

  /** 执行还牌 */
  _executeReturn(from, to, card) {
    const fromPlayer = this.players[from];
    const toPlayer = this.players[to];

    // 从还牌者手牌移除
    const idx = fromPlayer.hand.findIndex(c => c.id === card.id);
    if (idx === -1) return;
    fromPlayer.hand.splice(idx, 1);

    // 添加给收牌者
    toPlayer.hand.push(card);
    CardUtils.sortCards(toPlayer.hand);

    this._msg(`📥 ${fromPlayer.name} 还 ${card.display} 给 ${toPlayer.name}`);

    const tribute = this.tributeState.tributeList.find(t => t.to === from);
    if (tribute) tribute.returnDone = true;

    this.tributeStep = null;
    this.tributeInfo = null;
    this._update();

    this._processNextReturn();
  }

  /** 贡牌/还牌完成后确定首出者 */
  _determineLeaderAfterTribute() {
    const { leaderIdx, type } = this.tributeState;
    let leader = leaderIdx;

    // 如果有抗贡，首局规则：抗贡者先出（简化：进贡目标先出）
    // 实际竞赛规则：非双下-进贡者先出；双下-进贡大者先出

    this._startPlaying(leader);
  }

  /** 确定首出玩家（首局/无贡牌时） */
  _determineLeader() {
    let leader;
    
    if (this.roundNum === 1) {
      // 首局：持有♠2的玩家先出
      leader = this._findSpade2Leader();
      if (leader === -1) leader = 0;
    } else if (this.tributeState) {
      // 非首局：按贡牌规则确定的先出者
      leader = this.tributeState.leaderIdx;
    } else {
      leader = 0;
    }

    this._startPlaying(leader);
  }

  /** 开始出牌阶段 */
  _startPlaying(leader) {
    this.currentPlayer = leader;
    
    if (leader === this.humanPlayerIdx) {
      this.phase = PHASE.LEADING;
      this._msg('🎯 请你先出牌！');
    } else {
      this.phase = PHASE.PLAYING;
      this._msg(`${this.players[leader].name} 先出牌`);
    }

    this._update();

    // 如果首出是AI，AI自动出牌
    if (this.currentPlayer !== this.humanPlayerIdx) {
      setTimeout(() => this._aiPlay(), 500);
    }
  }

  /** 寻找持有♠2的玩家 */
  _findSpade2Leader() {
    for (let i = 0; i < 4; i++) {
      for (const c of this.players[i].hand) {
        if (c.suit === '♠' && c.rank === '2') return i;
      }
    }
    for (let i = 0; i < 4; i++) {
      for (const c of this.players[i].hand) {
        if (c.rank === '2') return i;
      }
    }
    return -1;
  }

  /** 当前出牌者是否是首出（自由出牌） */
  _isLeading() {
    return this.lastPlay === null || this.passCount >= 3 || this.borrowWind;
  }

  /** 人类玩家出牌 */
  humanPlay(cards) {
    if (this.currentPlayer !== this.humanPlayerIdx) return false;
    if (cards.length === 0) return false;

    // 验证出牌合法
    const hand = HandDetector.detect(cards, this.levelManager.currentLevel);
    if (hand.type === HAND_TYPES.INVALID) {
      this._msg('❌ 无效的牌型！');
      return false;
    }

    // 如果不是首出，必须能压过上一手
    if (!this._isLeading()) {
      if (!HandDetector.canBeat(hand, this.lastPlay.hand)) {
        this._msg('❌ 打不过，请选择更大的牌或跳过');
        return false;
      }
    }

    // 执行出牌
    this._executePlay(this.humanPlayerIdx, cards, hand);
    return true;
  }

  /** 人类玩家过牌 */
  humanPass() {
    if (this.currentPlayer !== this.humanPlayerIdx) return false;
    if (this._isLeading()) return false; // 首出不能过
    this._executePass(this.humanPlayerIdx);
    return true;
  }

  /** 执行出牌 */
  _executePlay(playerIdx, cards, hand) {
    const player = this.players[playerIdx];
    const isBomb = hand.type.startsWith('bomb') || hand.type === HAND_TYPES.STRAIGHT_FLUSH ||
                   hand.type === HAND_TYPES.BOMB_JOKER || hand.type === HAND_TYPES.BOMB_JOKER_FOUR;

    // 从手牌移除出的牌
    for (const c of cards) {
      const idx = player.hand.findIndex(hc => hc.id === c.id);
      if (idx !== -1) player.hand.splice(idx, 1);
    }

    // 记录出牌
    this.lastPlay = { playerIdx, cards: cards.map(c => c.clone()), hand };
    this.lastPlayPlayer = playerIdx;
    this.passCount = 0;
    this.borrowWind = false; // 出牌后取消借风状态

    // 记牌器记录
    this.memory.recordPlay(playerIdx, cards, hand.type, this.roundNum);

    // 炸弹音效
    if (isBomb) {
      this.sound.bomb();
      this.stats.recordBomb();
      this._bombSoundPlayed = true;
    } else {
      this.sound.cardPlay();
    }

    const displayName = handTypeDisplayName(hand.type);
    this._msg(`${player.name} 出 ${displayName}: ${CardUtils.cardsToString(cards)}`);

    console.log(`[掼蛋] 出牌 player=${playerIdx} hand=${player.hand.length} finishOrder=${this.finishOrder.length} phase=${this.phase}`);

    // 报牌检查：出牌后剩余≤10张
    this._checkDeclaration(playerIdx);

    // 检查是否出完
    if (player.hand.length === 0) {
      this._finishPlayer(playerIdx);
      return;
    }

    this._nextPlayer();
    this._update();
    if (this.currentPlayer !== this.humanPlayerIdx && this.phase === PHASE.PLAYING) {
      setTimeout(() => this._aiPlay(), 600);
    }
  }

  /** 报牌：剩余≤10张时自动播报 */
  _checkDeclaration(playerIdx) {
    const remaining = this.players[playerIdx].hand.length;
    if (remaining <= 10 && this.declaredCards[playerIdx] !== remaining) {
      this.declaredCards[playerIdx] = remaining;
      if (playerIdx === this.humanPlayerIdx) {
        this._msg(`📢 你还有 ${remaining} 张`);
      } else {
        this._msg(`📢 ${this.players[playerIdx].name} 报牌：${remaining} 张`);
      }
    }
  }

  /** 玩家出完牌 */
  _finishPlayer(playerIdx) {
    const player = this.players[playerIdx];
    player.finished = true;
    const rank = this.finishOrder.length + 1;
    player.finishRank = rank;
    this.finishOrder.push(playerIdx);
    this.lastFinisher = playerIdx;

    const rankNames = ['', '头游🏆', '二游🥈', '三游🥉', '末游'];
    this._msg(`🎯 ${player.name} 出完！${rankNames[rank] || ''}`);

    console.log(`[掼蛋] 出完 player=${playerIdx} rank=${rank} finishOrder=${JSON.stringify(this.finishOrder)} total=${this.finishOrder.length}`);

    this.sound.winTrick();

    // 检查是否全部出完
    if (this.finishOrder.length >= 4) {
      this._endRound();
      return;
    }

    // 出完牌后：借风（接风）—— 搭档获得出牌权
    // 竞赛规则：上游或二游出完牌后，无人压牌时其搭档接风
    // 实现：当前出完者的搭档获得出牌权
    const teammate = playerIdx === this.humanPlayerIdx ? this.teammateIdx :
                     playerIdx === this.teammateIdx ? this.humanPlayerIdx :
                     playerIdx === 1 ? 3 : 1; // AI队友

    if (!this.players[teammate].finished) {
      this.borrowWind = true;
      this.lastPlay = null;
      this.passCount = 0;
      this.currentPlayer = teammate;
      this.phase = PHASE.PLAYING;

      this._msg(`🌬️ 接风！${this.players[teammate].name} 获得出牌权`);
      this._update();

      if (this.currentPlayer !== this.humanPlayerIdx) {
        setTimeout(() => this._aiPlay(), 600);
      }
    } else {
      // 搭档也出完了，找下一个未出完的玩家
      this._nextPlayer();
      this._update();
      if (this.currentPlayer !== this.humanPlayerIdx && this.phase === PHASE.PLAYING) {
        setTimeout(() => this._aiPlay(), 600);
      }
    }
  }

  /** 执行过牌 */
  _executePass(playerIdx) {
    const player = this.players[playerIdx];
    this.passCount++;
    this.sound.pass();
    console.log(`[掼蛋] 过牌 player=${playerIdx} passCount=${this.passCount} finishOrder=${JSON.stringify(this.finishOrder)}`);
    this._msg(`${player.name} 过`);

    if (this.passCount >= 3) {
      // 其他人都过了，上一手出牌的人赢得这一轮
      const winner = this.lastPlayPlayer;
      this.phase = PHASE.TRICK_END;
      this._msg(`${this.players[winner].name} 赢得这一轮！`);
      this.lastPlay = null;
      this.passCount = 0;
      this.borrowWind = false;

      // 重要：如果赢家已出完，找下一个未出完的玩家（防止死锁）
      if (this.players[winner].finished) {
        this._nextPlayer();
      } else {
        this.currentPlayer = winner;
      }
      this.phase = PHASE.PLAYING;

      this._update();
      if (this.currentPlayer !== this.humanPlayerIdx) {
        setTimeout(() => this._aiPlay(), 600);
      }
    } else {
      this._nextPlayer();
      this._update();
      if (this.currentPlayer !== this.humanPlayerIdx && this.phase === PHASE.PLAYING) {
        setTimeout(() => this._aiPlay(), 600);
      }
    }
  }
  _nextPlayer() {
    let next = (this.currentPlayer + 1) % 4;
    let safety = 0;
    while (this.players[next].finished) {
      next = (next + 1) % 4;
      safety++;
      if (safety > 10) {
        console.error('[掼蛋BUG] _nextPlayer 死循环!', JSON.stringify(this.players.map(p => ({id:p.id,finished:p.finished}))));
        break;
      }
    }
    this.currentPlayer = next;
  }

  /** AI出牌 */
  _aiPlay() {
    if (this.phase !== PHASE.PLAYING && this.phase !== PHASE.LEADING) return;
    if (this.currentPlayer === this.humanPlayerIdx) return;
    if (this.players[this.currentPlayer].finished) return;

    const ai = new AIPlayer(this.currentPlayer, this);
    const decision = ai.decide();

    if (decision.action === 'play') {
      const hand = HandDetector.detect(decision.cards, this.levelManager.currentLevel);
      if (hand.type === HAND_TYPES.INVALID) {
        // 兜底出最小单张
        const sorted = CardUtils.sortCards(this.players[this.currentPlayer].hand);
        const minCard = sorted[sorted.length - 1];
        const safeHand = HandDetector.detect([minCard], this.levelManager.currentLevel);
        this._executePlay(this.currentPlayer, [minCard], safeHand);
      } else {
        this._executePlay(this.currentPlayer, decision.cards, hand);
      }
    } else {
      this._executePass(this.currentPlayer);
    }
  }

  /** 结束一局（竞赛规则版） */
  _endRound() {
    this.phase = PHASE.ROUND_END;
    console.log(`[掼蛋] _endRound 被调用 finishOrder=${JSON.stringify(this.finishOrder)} 当前级别=${this.levelManager.currentLevel}`);

    // 结算
    const result = GameScorer.score(this.finishOrder, this.humanPlayerIdx, this.teammateIdx);
    const humanTeam = (this.humanPlayerIdx === 0 || this.humanPlayerIdx === 2) ? '你方' : '对方';
    const currentLevel = this.levelManager.currentLevel;
    const isLevelA = currentLevel === 'A';

    // 记录到统计
    if (this.settings.autoSaveStats) {
      this.stats.recordRound(this.roundNum, currentLevel, this.finishOrder, this.humanPlayerIdx, this.teammateIdx, result);
    }

    if (result.levelAdvance > 0) {
      this.humanWonRounds++;
      // 竞赛规则：A必打 — 打A成功才算赢
      if (isLevelA) {
        this._msg(`🏆 成功打过A！🎉🎉🎉`);
        this.sound.winRound();
        this.phase = PHASE.GAME_OVER;
        this._showGameOver(true);
        this._update();
        return;
      }
      this.levelManager.advance(result.levelAdvance);
      this._msg(`🏆 ${humanTeam} ${result.desc} (当前级牌: ${this.levelManager.currentLevel})`);
      this.sound.winRound();
    } else if (result.levelAdvance < 0) {
      this.aiWonRounds++;
      // 竞赛规则：A必打 — 打A失败计数
      if (isLevelA) {
        this.aFailCount++;
        const wentBack = this.levelManager.recordAFail();
        if (wentBack) {
          this._msg(`💔 三次打A失败，退回2级！`);
        } else {
          this._msg(`💔 打A失败 (第${this.aFailCount}次)，留在A级`);
        }
      } else {
        this.levelManager.retreat(Math.abs(result.levelAdvance));
      }
      this._msg(`💔 ${humanTeam} ${result.desc} (当前级牌: ${this.levelManager.currentLevel})`);
      this.sound.loseRound();
    } else {
      this._msg(`${humanTeam} ${result.desc} (级牌不变: ${this.levelManager.currentLevel})`);
    }

    // 显示排名
    for (let i = 0; i < this.finishOrder.length; i++) {
      const pIdx = this.finishOrder[i];
      const rankNames = ['头游🏆', '二游🥈', '三游🥉', '末游'];
      this._msg(`  ${i + 1}. ${this.players[pIdx].name} - ${rankNames[i] || ''}`);
    }

    // 计算下一局的贡牌状态
    this.tributeState = TributeManager.calculate(
      this.finishOrder, this.humanPlayerIdx, this.teammateIdx
    );

    this.roundNum++;
    this._update();

    // 自动继续
    if (this.settings.autoNextRound && this.phase !== PHASE.GAME_OVER) {
      this._msg('⏳ 3秒后自动开始下一局...');
      setTimeout(() => {
        if (this.phase === PHASE.ROUND_END) {
          this._startNewRound();
        }
      }, 3000);
    } else if (this.phase !== PHASE.GAME_OVER) {
      this._msg('点击 "再来一局" 开始下一局');
    }
  }

  /** 显示游戏结束 */
  _showGameOver(won) {
    this.phase = PHASE.GAME_OVER;
    if (won) {
      this._msg('🎉🎉🎉 恭喜通关！成功打过A！');
    } else {
      this._msg('💔 游戏结束');
    }
    this.sound.gameOver(won);
    this._update();
  }

  /** 供AI查询当前状态 */
  getGameState() {
    return {
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        finished: p.finished,
        finishRank: p.finishRank,
        isHuman: p.isHuman
      })),
      currentPlayer: this.currentPlayer,
      lastPlay: this.lastPlay,
      isLeading: this._isLeading(),
      phase: this.phase,
      level: this.levelManager.currentLevel,
      borrowWind: this.borrowWind,
      finishOrder: [...this.finishOrder]
    };
  }

  /** 获取某位玩家的手牌（用于AI决策） */
  getHand(playerIdx) {
    return [...this.players[playerIdx].hand];
  }
}
