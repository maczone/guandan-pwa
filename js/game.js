/**
 * game.js - 掼蛋游戏状态机
 * 管理游戏流程：发牌→出牌→结算→下一局
 */

// ─── 游戏阶段 ───
const PHASE = {
  WAITING: 'waiting',           // 等待开始
  DEALING: 'dealing',           // 发牌中
  LEADING: 'leading',           // 等待首攻
  PLAYING: 'playing',           // 出牌阶段
  TRICK_END: 'trick_end',       // 一轮结束
  ROUND_END: 'round_end',       // 一局结束
  GAME_OVER: 'game_over'        // 游戏结束
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
    this.messages = [];           // 系统消息（显示在UI）
    this.roundNum = 1;
    this.humanWonRounds = 0;
    this.aiWonRounds = 0;
    this.callbacks = { onUpdate: null, onMessage: null };
    this._bombSoundPlayed = false;
  }

  onUpdate(cb) { this.callbacks.onUpdate = cb; }
  onMessage(cb) { this.callbacks.onMessage = cb; }

  _msg(text) {
    this.messages.push(text);
    if (this.messages.length > 20) this.messages.shift();
    if (this.callbacks.onMessage) this.callbacks.onMessage(text);
  }

  _update() {
    if (this.callbacks.onUpdate) this.callbacks.onUpdate();
  }

  // ─── 开始新游戏 ───
  startNewGame() {
    this.levelManager.reset();
    this.roundNum = 1;
    this.humanWonRounds = 0;
    this.aiWonRounds = 0;
    this._startNewRound();
  }

  /** 继续下一局（保留级牌和战绩） */
  continueGame() {
    if (this.phase === PHASE.ROUND_END || this.phase === PHASE.GAME_OVER) {
      this._startNewRound();
    }
  }

  // ─── 开始新一局 ───
  _startNewRound() {
    this.phase = PHASE.DEALING;
    this.memory.reset();
    this.finishOrder = [];
    this.trickHistory = [];
    this.messages = [];
    this.lastPlay = null;
    this.lastPlayPlayer = -1;
    this.passCount = 0;
    this._bombSoundPlayed = false;

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
        c.isWild = (c.rank === levelRank);
      }
    }

    this._msg(`━━━ 第 ${this.roundNum} 局 ━━━`);
    this._msg(`当前级牌: ${levelRank}  (逢人配)`);

    // 确定首出玩家（持有♠2的玩家）
    let leader = this._findSpade2Leader();
    if (leader === -1) leader = 0;
    this.currentPlayer = leader;
    
    if (leader === this.humanPlayerIdx) {
      this.phase = PHASE.LEADING;
      this._msg('你持有 ♠2，请先出牌！');
    } else {
      this.phase = PHASE.PLAYING;
      this._msg(`${this.players[leader].name} 持有 ♠2，开始出牌`);
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
    // 如果找不到（理论上不会），找持有2的玩家
    for (let i = 0; i < 4; i++) {
      for (const c of this.players[i].hand) {
        if (c.rank === '2') return i;
      }
    }
    return -1;
  }

  /** 当前出牌者是否是首出（自由出牌，不受上一手约束） */
  _isLeading() {
    return this.lastPlay === null || this.passCount >= 3;
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
    if (this._isLeading()) {
      this._msg('你是首出，必须出牌！');
      return false;
    }
    this._executePass(this.humanPlayerIdx);
    return true;
  }

  /** 执行出牌 */
  _executePlay(playerIdx, cards, hand) {
    const player = this.players[playerIdx];
    const typeName = handTypeDisplayName(hand.type);

    // 从手牌中移除出的牌
    const cardIds = new Set(cards.map(c => c.id));
    player.hand = player.hand.filter(c => !cardIds.has(c.id));

    // 记录到记牌器
    this.memory.recordPlay(playerIdx, cards, typeName, this.roundNum);

    // 记录
    this.lastPlay = { playerIdx, hand, cards, typeName };
    this.lastPlayPlayer = playerIdx;
    this.passCount = 0;
    this.trickHistory.push({
      player: player.name,
      cards: CardUtils.cardsToString(cards),
      type: typeName
    });

    this._msg(`${player.name} 出了 ${typeName}: ${CardUtils.cardsToString(cards)}`);

    // 音效
    if (playerIdx !== this.humanPlayerIdx) {
      if (hand.type.startsWith('bomb')) {
        this.sound.bomb();
        this.stats.recordBomb();
      } else {
        this.sound.cardPlay();
      }
    }

    // 检查是否出完
    if (player.hand.length === 0) {
      player.finished = true;
      player.finishRank = this.finishOrder.length + 1;
      this.finishOrder.push(playerIdx);
      this._msg(`🎯 ${player.name} 出完了！排名第 ${player.finishRank}！`);

      if (playerIdx === this.humanPlayerIdx) {
        this.sound.winRound();
      }

      if (this.finishOrder.length >= 3) {
        for (let i = 0; i < 4; i++) {
          if (!this.players[i].finished) {
            this.players[i].finished = true;
            this.players[i].finishRank = this.finishOrder.length + 1;
            this.finishOrder.push(i);
            break;
          }
        }
        this._endRound();
        return;
      }

      this._nextPlayer();
      this.lastPlay = null;
      this.passCount = 0;
    } else {
      this._nextPlayer();
    }

    this._update();

    // 轮到人类时播放提示音
    if (this.currentPlayer === this.humanPlayerIdx && !this.players[this.humanPlayerIdx].finished) {
      this.sound.yourTurn();
    }

    if (this.currentPlayer !== this.humanPlayerIdx && this.phase === PHASE.PLAYING) {
      setTimeout(() => this._aiPlay(), 600);
    }
  }

  /** 执行过牌 */
  _executePass(playerIdx) {
    const player = this.players[playerIdx];
    this.passCount++;
    this._msg(`${player.name} 过牌 (${this.passCount}/3)`);

    // 音效
    if (playerIdx !== this.humanPlayerIdx) {
      this.sound.pass();
    }

    if (this.passCount >= 3) {
      // 其他人都过了，上一手出牌的人赢得这一轮
      const winner = this.lastPlayPlayer;
      this.phase = PHASE.TRICK_END;
      this._msg(`${this.players[winner].name} 赢得这一轮！`);
      this.lastPlay = null;
      this.passCount = 0;
      this.currentPlayer = winner;
      this.phase = PHASE.PLAYING; // 恢复出牌阶段

      this._update();
      // AI自动出牌
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

  /** 下一位玩家 */
  _nextPlayer() {
    const next = (this.currentPlayer + 1) % 4;
    // 跳过已出完的玩家
    this.currentPlayer = next;
    let safety = 0;
    while (this.players[this.currentPlayer].finished && safety < 4) {
      this.currentPlayer = (this.currentPlayer + 1) % 4;
      safety++;
    }
    // 设置阶段
    if (this.phase !== PHASE.ROUND_END && this.phase !== PHASE.GAME_OVER) {
      this.phase = PHASE.PLAYING;
    }
  }

  /** AI出牌 */
  _aiPlay() {
    if (this.phase === PHASE.ROUND_END || this.phase === PHASE.GAME_OVER) return;
    if (this.currentPlayer === this.humanPlayerIdx) return;

    const player = this.players[this.currentPlayer];
    if (player.finished) return;

    const ai = new AIPlayer(this.currentPlayer, this);
    const result = ai.decide();

    if (result.action === 'play') {
      const hand = HandDetector.detect(result.cards, this.levelManager.currentLevel);
      this._executePlay(this.currentPlayer, result.cards, hand);
    } else {
      if (!this._isLeading()) {
        this._executePass(this.currentPlayer);
      } else {
        // 首出不能过，出最小牌
        const minCard = CardUtils.sortCards(player.hand).pop();
        const hand = HandDetector.detect([minCard], this.levelManager.currentLevel);
        this._executePlay(this.currentPlayer, [minCard], hand);
      }
    }
  }

  /** 结束一局 */
  _endRound() {
    this.phase = PHASE.ROUND_END;
    
    // 结算
    const result = GameScorer.score(this.finishOrder, this.humanPlayerIdx, this.teammateIdx);
    const humanTeam = (this.humanPlayerIdx === 0 || this.humanPlayerIdx === 2) ? '你方' : '对方';

    // 记录到统计（根据设置）
    if (this.settings.autoSaveStats) {
      this.stats.recordRound(this.roundNum, this.levelManager.currentLevel, this.finishOrder, this.humanPlayerIdx, this.teammateIdx, result);
    }

    if (result.levelAdvance > 0) {
      this.humanWonRounds++;
      this.levelManager.advance(result.levelAdvance);
      this._msg(`🏆 ${humanTeam} ${result.desc} (当前级牌: ${this.levelManager.currentLevel})`);
      this.sound.winRound();
    } else if (result.levelAdvance < 0) {
      this.aiWonRounds++;
      this.levelManager.retreat(Math.abs(result.levelAdvance));
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

    // 检查是否达到A且获胜→游戏结束
    if (this.levelManager.currentLevel === 'A' && result.levelAdvance > 0) {
      this.phase = PHASE.GAME_OVER;
      this._msg('🎉🎉🎉 恭喜通关！你方成功打到A并获胜！');
    }

    this.roundNum++;
    this._update();

    // 根据设置决定是否自动继续
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
      level: this.levelManager.currentLevel
    };
  }

  /** 获取某位玩家的手牌（用于AI决策） */
  getHand(playerIdx) {
    return [...this.players[playerIdx].hand];
  }
}
