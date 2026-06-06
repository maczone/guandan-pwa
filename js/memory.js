/**
 * memory.js - 掼蛋记牌器
 * 跟踪已出的牌，统计剩余牌，供AI决策和UI展示
 */

class CardMemory {
  constructor() {
    this.reset();
  }

  reset() {
    // 总牌数统计：108张 = 2副牌
    // 每副：♠♥♣♦ × (3-10,J,Q,K,A,2) × 1 + 小王×1 + 大王×1
    this.remaining = {};  // { rank: { suit: count } }
    this.totalByRank = {}; // { rank: totalCount }
    this.totalBySuit = {}; // { suit: totalCount }
    this.playedCards = []; // 已出的牌记录
    this.playedLog = [];   // 带玩家信息的出牌记录 [{player, cards, type, round}]
    
    this._initCounts();
  }

  _initCounts() {
    // 两副牌
    for (const suit of SUITS) {
      this.totalBySuit[suit] = 26; // 13 rank × 2
    }
    this.totalBySuit['joker'] = 4; // 2小王+2大王

    for (const rank of RANK_ORDER) {
      this.totalByRank[rank] = 8; // 4花色×2副
    }
    this.totalByRank['small_joker'] = 2;
    this.totalByRank['big_joker'] = 2;

    // 初始化剩余
    for (const suit of SUITS) {
      for (const rank of RANK_ORDER) {
        if (!this.remaining[rank]) this.remaining[rank] = {};
        this.remaining[rank][suit] = 2; // 每花色2张
      }
    }
    this.remaining['small_joker'] = { 'joker': 2 };
    this.remaining['big_joker'] = { 'joker': 2 };
  }

  /** 记录一手出牌 */
  recordPlay(playerIdx, cards, handType, roundNum) {
    for (const c of cards) {
      this._removeCard(c);
    }
    this.playedLog.push({
      player: playerIdx,
      cards: cards.map(c => ({ suit: c.suit, rank: c.rank, id: c.id })),
      type: handType,
      round: roundNum,
      time: Date.now()
    });
  }

  _removeCard(card) {
    const rank = card.isJoker ? (card.rank === 'big' ? 'big_joker' : 'small_joker') : card.rank;
    const suit = card.suit || 'joker';
    
    if (this.remaining[rank] && this.remaining[rank][suit] > 0) {
      this.remaining[rank][suit]--;
    }
    this.playedCards.push(card);
  }

  /** 某rank还剩多少张 */
  rankRemaining(rank) {
    let total = 0;
    const r = this.remaining[rank];
    if (r) {
      for (const count of Object.values(r)) total += count;
    }
    return total;
  }

  /** 某suit还剩多少张 */
  suitRemaining(suit) {
    let total = 0;
    for (const rank of RANK_ORDER) {
      if (this.remaining[rank] && this.remaining[rank][suit]) {
        total += this.remaining[rank][suit];
      }
    }
    return total;
  }

  /** 某rank是否已经出完 */
  isRankExhausted(rank) {
    return this.rankRemaining(rank) === 0;
  }

  /** 获取剩余牌数最多的rank（AI用于推测对手手牌） */
  getMostCommonRanks(topN = 3) {
    const ranks = [];
    for (const rank of RANK_ORDER) {
      const count = this.rankRemaining(rank);
      if (count > 0) ranks.push({ rank, count });
    }
    // 加joker
    const sj = this.rankRemaining('small_joker');
    const bj = this.rankRemaining('big_joker');
    if (sj > 0) ranks.push({ rank: 'small_joker', count: sj });
    if (bj > 0) ranks.push({ rank: 'big_joker', count: bj });
    
    return ranks.sort((a, b) => b.count - a.count).slice(0, topN);
  }

  /** 炸弹风险：某rank对手可能持有的炸弹（>=4张） */
  getBombRisks() {
    const risks = [];
    for (const rank of RANK_ORDER) {
      const remain = this.rankRemaining(rank);
      if (remain >= 4) {
        risks.push({ rank, count: remain, bombLikely: remain >= 6 ? 'high' : remain >= 4 ? 'medium' : 'low' });
      }
    }
    return risks;
  }

  /** 获取格式化统计信息（用于UI展示） */
  getStats() {
    // 各rank剩余
    const rankStats = [];
    for (const rank of [...RANK_ORDER, 'small_joker', 'big_joker']) {
      const remain = this.rankRemaining(rank);
      const total = this.totalByRank[rank] || 0;
      if (total > 0) {
        rankStats.push({ rank, remain, total, label: rank === 'small_joker' ? '小王' : rank === 'big_joker' ? '大王' : rank });
      }
    }
    
    // 炸弹风险
    const bombRisks = this.getBombRisks();
    
    return { rankStats, bombRisks, totalPlayed: this.playedCards.length, totalCards: 108 };
  }
}

if (typeof module !== 'undefined') module.exports = { CardMemory };
