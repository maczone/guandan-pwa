/**
 * ai.js v3 - 掼蛋AI（增强版）
 * 使用记牌器、阶段感知、炸弹管理、团队协作
 */

class AIPlayer {
  constructor(playerIdx, game) {
    this.playerIdx = playerIdx;
    this.game = game;
    this.hand = game.getHand(playerIdx);
    this.levelRank = game.levelManager.currentLevel;
    this.isTeammate = (playerIdx === game.teammateIdx);
    this.wildCards = this.hand.filter(c => c.isWild);
    this.normalCards = this.hand.filter(c => !c.isWild);
    this.memory = game.memory; // 记牌器
    this.stats = game.stats;   // 统计
  }

  decide() {
    const state = this.game.getGameState();
    this.hand = this.game.getHand(this.playerIdx);
    this.wildCards = this.hand.filter(c => c.isWild);
    this.normalCards = this.hand.filter(c => !c.isWild);

    if (state.isLeading) return this._decideLeading();
    return this._decideRespond(state.lastPlay);
  }

  /** 牌局阶段判断 */
  _gamePhase() {
    const total = 108;
    const played = this.memory.playedCards.length;
    const ratio = played / total;
    if (ratio < 0.3) return 'early';    // 前期
    if (ratio < 0.6) return 'mid';      // 中期
    return 'late';                       // 后期
  }

  /** 自己剩余手牌阶段 */
  _handPhase() {
    const n = this.hand.length;
    if (n > 20) return 'fat';
    if (n > 12) return 'normal';
    if (n > 6) return 'thin';
    return 'critical';
  }

  /** ─── 首出策略 ─── */
  _decideLeading() {
    const allPlays = CardUtils.findPlays(this.hand, this.levelRank);
    const phase = this._gamePhase();
    const hPhase = this._handPhase();

    // 残局：牌少时出大牌争头游
    if (hPhase === 'critical' || hPhase === 'thin') {
      const bombs = allPlays.filter(p => p.type.startsWith('bomb'));
      if (bombs.length > 0 && this.hand.length <= 4) {
        // 快出完了，直接出炸弹收尾
        return { action: 'play', cards: [...new Set(bombs.map(b => b.cards).flat())].slice(0, this.hand.length) };
      }
      // 出最大的单张或对子
      const singles = allPlays.filter(p => p.type === HAND_TYPES.SINGLE && !p.cards[0].isWild);
      if (singles.length > 0) {
        singles.sort((a, b) => RANK_POWER[b.mainRank] - RANK_POWER[a.mainRank]);
        return { action: 'play', cards: singles[0].cards };
      }
    }

    // 前期/中期：出组合牌
    if (hPhase === 'fat' || phase === 'early') {
      // 三带一/三带对优先
      const triples = allPlays.filter(p =>
        p.type === HAND_TYPES.TRIPLE_PLUS_ONE || p.type === HAND_TYPES.TRIPLE_PLUS_PAIR
      );
      if (triples.length > 0) {
        triples.sort((a, b) => RANK_POWER[a.mainRank] - RANK_POWER[b.mainRank]);
        // 选不带逢人配的优先
        triples.sort((a, b) => a.cards.filter(c => c.isWild).length - b.cards.filter(c => c.isWild).length);
        return { action: 'play', cards: triples[0].cards };
      }
    }

    // 顺子
    const straights = allPlays.filter(p =>
      p.type === HAND_TYPES.STRAIGHT || p.type === HAND_TYPES.STRAIGHT_FLUSH
    );
    if (straights.length > 0 && this.hand.length > 8) {
      straights.sort((a, b) => RANK_POWER[a.mainRank] - RANK_POWER[b.mainRank]);
      return { action: 'play', cards: straights[0].cards };
    }

    // 同花
    const flushes = allPlays.filter(p => p.type === HAND_TYPES.FLUSH);
    if (flushes.length > 0 && this.hand.length > 12) {
      return { action: 'play', cards: flushes[0].cards };
    }

    // 对子
    const pairs = allPlays.filter(p => p.type === HAND_TYPES.PAIR);
    if (pairs.length > 0) {
      pairs.sort((a, b) => {
        const aW = a.cards.filter(c => c.isWild).length;
        const bW = b.cards.filter(c => c.isWild).length;
        if (aW !== bW) return aW - bW;
        return RANK_POWER[a.mainRank] - RANK_POWER[b.mainRank];
      });
      return { action: 'play', cards: pairs[0].cards };
    }

    // 单张（最小非万能）
    const nonWildSingles = allPlays
      .filter(p => p.type === HAND_TYPES.SINGLE && !p.cards[0].isWild)
      .sort((a, b) => RANK_POWER[a.mainRank] - RANK_POWER[b.mainRank]);
    if (nonWildSingles.length > 0) {
      return { action: 'play', cards: nonWildSingles[0].cards };
    }

    // 最后手段
    const sorted = CardUtils.sortCards(this.hand);
    return { action: 'play', cards: [sorted[sorted.length - 1]] };
  }

  /** ─── 回应策略 ─── */
  _decideRespond(lastPlay) {
    if (!lastPlay) return this._decideLeading();

    const allPlays = CardUtils.findPlays(this.hand, this.levelRank);
    const lastHand = lastPlay.hand;
    const hPhase = this._handPhase();

    // 队友出的 → 不压
    if (lastPlay.playerIdx === this.game.teammateIdx) {
      // 除非队友只剩1张而且自己牌多要救，否则过
      const tmHand = this.game.getHand(this.game.teammateIdx);
      if (tmHand && tmHand.length > 2) {
        return { action: 'pass' };
      }
    }

    // 找能打过的
    const beatingPlays = allPlays.filter(p => HandDetector.canBeat(p, lastHand));

    // 打不过 → 考虑炸弹
    if (beatingPlays.length === 0) {
      return this._considerBomb(lastPlay);
    }

    // 选最优应牌
    return this._selectBestBeat(beatingPlays, lastPlay, hPhase);
  }

  /** ─── 选最优应牌 ─── */
  _selectBestBeat(plays, lastPlay, hPhase) {
    const isOppLast = lastPlay.playerIdx !== this.game.teammateIdx;
    const lastPlayerCards = this.game.getHand(lastPlay.playerIdx)?.length || 27;

    const scored = plays.map(p => {
      let cost = RANK_POWER[p.mainRank] || 0;
      const wildUsed = p.cards.filter(c => c.isWild).length;
      cost += wildUsed * 10;

      // 炸弹是战略资源
      if (p.type.startsWith('bomb')) {
        cost += 25;
        // 但对方快赢时炸弹价值更高
        if (lastPlayerCards <= 3) cost -= 30;
      }
      if (p.type === HAND_TYPES.STRAIGHT_FLUSH) cost += 15;

      // 手牌紧张时，大牌权重降低（要用出去）
      if (hPhase === 'critical') cost *= 0.5;

      return { play: p, cost };
    });

    // 对手快出完 → 下狠手
    if (lastPlayerCards <= 3 && isOppLast) {
      scored.sort((a, b) => b.cost - a.cost);
    } else {
      scored.sort((a, b) => a.cost - b.cost);
    }

    return { action: 'play', cards: scored[0].play.cards };
  }

  /** ─── 炸弹决策 ─── */
  _considerBomb(lastPlay) {
    const allPlays = CardUtils.findPlays(this.hand, this.levelRank);
    const bombs = allPlays.filter(p =>
      p.type === HAND_TYPES.BOMB_4 || p.type === HAND_TYPES.BOMB_5 ||
      p.type === HAND_TYPES.BOMB_6 || p.type === HAND_TYPES.BOMB_7 ||
      p.type === HAND_TYPES.BOMB_8 || p.type === HAND_TYPES.BOMB_JOKER
    );

    if (bombs.length === 0) return { action: 'pass' };

    // 获取关键信息
    const lastPlayerCards = this.game.getHand(lastPlay.playerIdx)?.length || 27;
    const myCards = this.hand.length;
    const tmCards = this.game.getHand(this.game.teammateIdx)?.length || 27;
    const myRank = this.game.finishOrder.indexOf(this.playerIdx) + 1 || 99;

    // 必须炸的情形
    const mustBomb =
      (lastPlayerCards <= 2) ||           // 对手只剩2张
      (myCards <= 4 && lastPlayerCards > myCards) || // 自己快出完
      (tmCards <= 2 && isOppLast) ||       // 队友要出完了
      (bombs.length >= 2 && myCards <= 6); // 炸弹多牌少

    if (mustBomb) {
      bombs.sort((a, b) => HAND_TYPE_POWER[a.type] - HAND_TYPE_POWER[b.type]);
      const best = bombs[0];
      // 记录炸弹
      if (this.stats) this.stats.recordBomb();
      return { action: 'play', cards: best.cards };
    }

    // 一般情形：对手出大牌时考虑小炸
    const lastPower = RANK_POWER[lastPlay.hand.mainRank] || 0;
    if (lastPower >= 12 && bombs.length > 0 && this.hand.length <= 15) {
      bombs.sort((a, b) => HAND_TYPE_POWER[a.type] - HAND_TYPE_POWER[b.type]);
      return { action: 'play', cards: bombs[0].cards };
    }

    return { action: 'pass' };
  }
}
