/**
 * cards.js - 掼蛋牌系统
 * 包含牌的定义、牌型检测、牌型比较
 */

// ─── 常量 ───
const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_NAMES = { '♠': '黑桃', '♥': '红心', '♣': '梅花', '♦': '方块' };
const RANK_NAMES = {
  '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8',
  '9': '9', '10': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A', '2': '2'
};
const RANK_ORDER = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const JOKERS = ['🃏', '🃏']; // 小王, 大王 (显示不同色)
const JOKER_TYPES = { 'small': '🃏', 'big': '🃏' };

// 牌力指数（用于AI评估），数字越小越弱
const RANK_POWER = {
  '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6, '9': 7,
  '10': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12, '2': 13,
  'small': 14, 'small_joker': 14,
  'big': 15, 'big_joker': 15
};

// ─── 牌对象 ───
class Card {
  constructor(suit, rank, id) {
    this.suit = suit;       // '♠'|'♥'|'♣'|'♦'|'joker'
    this.rank = rank;       // '3'-'2','A','K','Q','J','10','9','8','7','6','5','4' 或 'small'|'big'
    this.id = id;           // 唯一标识
    this.isJoker = suit === 'joker';
    this.isWild = false;    // 是否为逢人配(级牌)，由外部设置
  }

  get display() {
    if (this.isJoker) {
      return this.rank === 'big' ? '大王' : '小王';
    }
    return this.suit + this.rank;
  }

  get power() {
    if (this.isJoker) {
      return this.rank === 'big' ? RANK_POWER['big_joker'] : RANK_POWER['small_joker'];
    }
    return RANK_POWER[this.rank] || 0;
  }

  get sortKey() {
    // 用于排序：先按点数，再按花色
    if (this.isJoker) {
      return this.rank === 'big' ? 100 : 99;
    }
    return RANK_POWER[this.rank] * 4 + SUITS.indexOf(this.suit);
  }

  equals(other) {
    return this.id === other.id;
  }

  clone() {
    const c = new Card(this.suit, this.rank, this.id);
    c.isWild = this.isWild;
    return c;
  }
}

// ─── 牌堆 ───
class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    let id = 0;
    // 两副标准扑克
    for (let deck = 0; deck < 2; deck++) {
      for (const suit of SUITS) {
        for (const rank of RANK_ORDER) {
          this.cards.push(new Card(suit, rank, id++));
        }
      }
      // 大小王
      this.cards.push(new Card('joker', 'small', id++));
      this.cards.push(new Card('joker', 'big', id++));
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(numPlayers = 4) {
    const hands = [];
    const cardsPerPlayer = Math.floor(this.cards.length / numPlayers);
    for (let i = 0; i < numPlayers; i++) {
      hands.push(this.cards.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer));
    }
    return hands;
  }
}

// ─── 牌型枚举 ───
const HAND_TYPES = {
  SINGLE: 'single',           // 单张
  PAIR: 'pair',               // 对子
  TRIPLE: 'triple',           // 三同张
  TRIPLE_PLUS_ONE: 'triple_plus_one',     // 三带一
  TRIPLE_PLUS_PAIR: 'triple_plus_pair',   // 三带对
  STRAIGHT: 'straight',       // 顺子(5张)
  FLUSH: 'flush',             // 同花(5张)
  STRAIGHT_FLUSH: 'straight_flush',       // 同花顺(5张)
  BOMB_4: 'bomb_4',           // 四炸(4同张)
  BOMB_5: 'bomb_5',           // 五炸(5同张)
  BOMB_6: 'bomb_6',           // 六炸(6同张)
  BOMB_7: 'bomb_7',           // 七炸(7同张)
  BOMB_8: 'bomb_8',           // 八炸(8同张)
  BOMB_JOKER: 'bomb_joker',   // 王炸(4张王，但非四大天王)
  BOMB_JOKER_FOUR: 'bomb_joker_four', // 四大天王(4张王，竞赛规则特指)
  INVALID: 'invalid'
};

// 牌型优先级（数字越大越强）
// 竞赛规则牌型大小：四大天王 > 六炸+ > 同花顺 > 五炸 > 四炸 > 其他
const HAND_TYPE_POWER = {
  [HAND_TYPES.SINGLE]: 1,
  [HAND_TYPES.PAIR]: 2,
  [HAND_TYPES.TRIPLE]: 3,
  [HAND_TYPES.TRIPLE_PLUS_ONE]: 4,
  [HAND_TYPES.TRIPLE_PLUS_PAIR]: 5,
  [HAND_TYPES.STRAIGHT]: 6,
  [HAND_TYPES.FLUSH]: 7,
  [HAND_TYPES.STRAIGHT_FLUSH]: 8,
  [HAND_TYPES.BOMB_4]: 9,
  [HAND_TYPES.BOMB_5]: 10,
  [HAND_TYPES.BOMB_6]: 11,
  [HAND_TYPES.BOMB_7]: 12,
  [HAND_TYPES.BOMB_8]: 13,
  [HAND_TYPES.BOMB_JOKER]: 14,   // 4张王(非标准四大天王)
  [HAND_TYPES.BOMB_JOKER_FOUR]: 15, // 四大天王(最大)
};

// ─── 牌型检测 ───
class HandDetector {

  /**
   * 检测一组牌是什么牌型（支持逢人配万能牌）
   * @param {Card[]} cards
   * @param {string} levelCardRank - 当前级牌点数
   */
  static detect(cards, levelCardRank = '2') {
    if (!cards || cards.length === 0) return { type: HAND_TYPES.INVALID };

    const n = cards.length;
    const sorted = [...cards].sort((a, b) => a.sortKey - b.sortKey);
    
    // 分离逢人配（万能牌）和普通牌
    const wildCards = sorted.filter(c => c.isWild || c.rank === levelCardRank);
    const normals = sorted.filter(c => !(c.isWild || c.rank === levelCardRank));
    const wc = wildCards.length;
    const nc = normals.length;

    // rank出现次数（只统计普通牌）
    const rankCount = {};
    for (const c of normals) {
      rankCount[c.rank] = (rankCount[c.rank] || 0) + 1;
    }
    // 找到普通牌中出现最多的rank及其数量
    let bestRank = '', bestCount = 0;
    for (const [r, cnt] of Object.entries(rankCount)) {
      if (cnt > bestCount) { bestCount = cnt; bestRank = r; }
    }

    const ranks = Object.keys(rankCount).sort((a, b) => RANK_POWER[a] - RANK_POWER[b]);

    // ===== 单张 =====
    if (n === 1) {
      return { type: HAND_TYPES.SINGLE, rank: cards[0].rank, mainRank: cards[0].rank, length: 1, cards: sorted };
    }

    // ===== 王炸 / 四大天王 =====
    if (n >= 4 && sorted.every(c => c.isJoker)) {
      // 四大天王：恰好两副牌的四张王（2小王+2大王）
      const bigs = sorted.filter(c => c.rank === 'big').length;
      const smalls = sorted.filter(c => c.rank === 'small').length;
      const isFourKings = n === 4 && bigs === 2 && smalls === 2;
      return {
        type: isFourKings ? HAND_TYPES.BOMB_JOKER_FOUR : HAND_TYPES.BOMB_JOKER,
        rank: 'joker', mainRank: 'joker', length: n, cards: sorted
      };
    }

    // ===== 炸弹(4~8同张) =====
    // 条件：普通牌全部同rank + 万能牌 = N
    if (n >= 4 && n <= 8 && nc + wc === n && ranks.length <= 1) {
      const bombRank = ranks.length === 1 ? ranks[0] : 'wild';
      return { type: HandDetector._bombType(n), rank: bombRank, mainRank: bombRank, length: n, cards: sorted };
    }

    // ===== 对子 =====
    if (n === 2) {
      // 两张同rank 或 一张+一张万能
      if (ranks.length <= 1 || (ranks.length === 2 && wc === 1)) {
        const pairRank = ranks.length >= 1 ? ranks[0] : 'wild';
        return { type: HAND_TYPES.PAIR, rank: pairRank, mainRank: pairRank, length: 2, cards: sorted };
      }
    }

    // ===== 三同张 =====
    if (n === 3) {
      // 3同rank | 2同+1万能 | 1同+2万能 | 3万能
      if (bestCount + wc >= 3) {
        return { type: HAND_TYPES.TRIPLE, rank: bestRank || levelCardRank, mainRank: bestRank || levelCardRank, length: 3, cards: sorted };
      }
    }

    // ===== 三带一 (4张：三同+一单) =====
    if (n === 4) {
      // 正常: 3+1 = rankCount有2种，最多一种有3张
      // 万能帮助: 2同+1万能+1单 → 用万能补成3同
      const entries = Object.entries(rankCount).sort((a, b) => b[1] - a[1]);
      if (entries.length >= 1 && entries.length <= 2) {
        const mainCnt = entries[0] ? entries[0][1] : 0;
        if (mainCnt + wc >= 3) {
          return { type: HAND_TYPES.TRIPLE_PLUS_ONE, rank: entries[0][0] || levelCardRank, mainRank: entries[0][0] || levelCardRank, length: 4, cards: sorted };
        }
        // 特殊情况: 3同+1万能（此时万能是带的那张）
        if (entries.length === 1 && entries[0][1] === 3 && wc === 1) {
          return { type: HAND_TYPES.TRIPLE_PLUS_ONE, rank: entries[0][0], mainRank: entries[0][0], length: 4, cards: sorted };
        }
      }
    }

    // ===== 三带对 (5张：三同+一对) =====
    if (n === 5) {
      const entries = Object.entries(rankCount).sort((a, b) => b[1] - a[1]);
      // 尝试找三同部分
      if (entries.length >= 1) {
        const mainCnt = entries[0][1];
        // 剩余张数中是否能凑成对子(用万能补)
        const remaining = n - (mainCnt + wc);
        // 思路：三同部分 = mainCnt + 部分wc, 对子部分 = 剩余
        for (let wcForTriple = 0; wcForTriple <= wc; wcForTriple++) {
          if (mainCnt + wcForTriple === 3) {
            const remainWc = wc - wcForTriple;
            const otherRanks = entries.slice(1);
            let pairCnt = 0;
            for (const [, cnt] of otherRanks) pairCnt += cnt;
            if (pairCnt + remainWc >= 2) {
              return { type: HAND_TYPES.TRIPLE_PLUS_PAIR, rank: entries[0][0] || levelCardRank, mainRank: entries[0][0] || levelCardRank, length: 5, cards: sorted };
            }
          }
        }
      }
      // 3同+2同（无万能）
      if (entries.length === 2 && entries[0][1] === 3 && entries[1][1] === 2) {
        return { type: HAND_TYPES.TRIPLE_PLUS_PAIR, rank: entries[0][0], mainRank: entries[0][0], length: 5, cards: sorted };
      }
    }

    // ===== 5张：顺子 / 同花 / 同花顺 =====
    if (n === 5) {
      // 检查同花色（万能牌忽略花色）
      const normalSuits = normals.map(c => c.suit);
      const isFlush = normalSuits.length === 0 || normalSuits.every(s => s === normalSuits[0]);
      
      // 检查顺子：用万能牌填充缺的rank
      const isStraight = HandDetector._isConsecutiveWithWild(normals, wc);
      
      if (isFlush && isStraight) {
        return { type: HAND_TYPES.STRAIGHT_FLUSH, rank: sorted[sorted.length - 1].rank, mainRank: sorted[sorted.length - 1].rank, length: 5, cards: sorted };
      }
      if (isFlush) {
        return { type: HAND_TYPES.FLUSH, rank: sorted[sorted.length - 1].rank, mainRank: sorted[sorted.length - 1].rank, length: 5, cards: sorted };
      }
      if (isStraight) {
        return { type: HAND_TYPES.STRAIGHT, rank: sorted[sorted.length - 1].rank, mainRank: sorted[sorted.length - 1].rank, length: 5, cards: sorted };
      }
    }

    return { type: HAND_TYPES.INVALID };
  }

  /** 判断普通牌是否构成顺子（允许万能牌填充缺位） */
  static _isConsecutiveWithWild(normals, wildCount) {
    const ranks = [...new Set(normals.map(c => c.rank))];
    const rankNums = ranks.map(r => RANK_POWER[r]).sort((a, b) => a - b);
    
    // 全是万能牌 = 可以构成任何顺子
    if (rankNums.length === 0) return true;

    // 检查10-J-Q-K-A
    const is10toA = [8, 9, 10, 11, 12].every(n => rankNums.includes(n));
    if (is10toA) return true;
    // 接近10-A: 缺的可以用万能补
    const needed10toA = [8, 9, 10, 11, 12].filter(n => !rankNums.includes(n));
    if (needed10toA.length <= wildCount && rankNums.every(n => n >= 8 && n <= 12)) {
      return true;
    }

    // 普通顺子：检查最小的可能的起始点
    const minRank = Math.min(...rankNums);
    const maxRank = Math.max(...rankNums);
    
    // 如果跨度超过4，不可能构成顺子（5连张最多跨度4）
    // 但用万能可以填充中间缺位，所以只需要 max - min <= 4
    const span = maxRank - minRank;
    if (span > 4) return false;

    // 检查从minRank到minRank+4之间缺几个数
    let missing = 0;
    for (let r = minRank; r <= minRank + 4; r++) {
      if (!rankNums.includes(r)) missing++;
    }
    return missing <= wildCount;
  }

  static _bombType(n) {
    const map = { 4: HAND_TYPES.BOMB_4, 5: HAND_TYPES.BOMB_5, 6: HAND_TYPES.BOMB_6, 7: HAND_TYPES.BOMB_7, 8: HAND_TYPES.BOMB_8 };
    return map[n] || HAND_TYPES.INVALID;
  }

  static _isConsecutiveRanks(cards) {
    const nums = cards
      .filter(c => !c.isJoker)
      .map(c => RANK_POWER[c.rank])
      .sort((a, b) => a - b);
    if (nums.length < 5) return false;
    // 10-J-Q-K-A 特殊情况
    const is10toA = nums[0] === 8 && nums[1] === 9 && nums[2] === 10 && nums[3] === 11 && nums[4] === 12;
    if (is10toA) return true;
    // 普通顺子
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] !== 1) return false;
    }
    return true;
  }

  /**
   * 比较两手牌的大小
   * @param {{ type: string, rank: string, mainRank: string, length: number }} hand1
   * @param {{ type: string, rank: string, mainRank: string, length: number }} hand2
   * @returns {number} 1=hand2大, -1=hand1大, 0=不可比
   */
  static compare(hand1, hand2) {
    if (!hand1 || hand1.type === HAND_TYPES.INVALID) return 1;
    if (!hand2 || hand2.type === HAND_TYPES.INVALID) return -1;

    const p1 = HAND_TYPE_POWER[hand1.type] || 0;
    const p2 = HAND_TYPE_POWER[hand2.type] || 0;

    // 炸弹可以压非炸弹
    if (p1 < 9 && p2 >= 9) return 1;  // hand2是炸弹，压hand1
    if (p1 >= 9 && p2 < 9) return -1; // hand1是炸弹，压hand2
    if (p1 < 9 && p2 < 9) {
      // 同牌型才能比
      if (hand1.type !== hand2.type) return 0;
      if (hand1.length !== hand2.length) return 0;
      // 同花顺比顺子强
      if (hand1.type === HAND_TYPES.STRAIGHT && hand2.type === HAND_TYPES.STRAIGHT_FLUSH) return 1;
      if (hand1.type === HAND_TYPES.STRAIGHT_FLUSH && hand2.type === HAND_TYPES.STRAIGHT) return -1;
      // 比主牌大小
      return RANK_POWER[hand1.mainRank] < RANK_POWER[hand2.mainRank] ? 1 : -1;
    }
    // 炸弹之间比较
    if (p1 >= 9 && p2 >= 9) {
      if (p1 !== p2) return p1 < p2 ? 1 : -1;
      // 同类型炸弹，比主牌
      return RANK_POWER[hand1.mainRank] < RANK_POWER[hand2.mainRank] ? 1 : -1;
    }
    return 0;
  }

  /**
   * 能否压过上一手牌
   */
  static canBeat(current, previous) {
    return HandDetector.compare(previous, current) === 1;
  }
}

// ─── 牌工具函数 ───
class CardUtils {
  static sortCards(cards) {
    return [...cards].sort((a, b) => b.sortKey - a.sortKey);
  }

  static groupByRank(cards) {
    const groups = {};
    for (const c of cards) {
      if (!c.isJoker) {
        if (!groups[c.rank]) groups[c.rank] = [];
        groups[c.rank].push(c);
      }
    }
    return groups;
  }

  static cardsToString(cards) {
    return cards.map(c => c.display).join(' ');
  }

  // 寻找手中所有可能的出牌组合（支持逢人配）
  static findPlays(cards, levelCardRank = '2') {
    const results = [];
    const n = cards.length;
    if (n === 0) return results;

    const sorted = CardUtils.sortCards(cards);
    const wilds = sorted.filter(c => c.isWild || c.rank === levelCardRank);
    const normals = sorted.filter(c => !(c.isWild || c.rank === levelCardRank));
    const groups = CardUtils.groupByRank(normals);
    const wc = wilds.length;

    // ─── 单张 ───
    for (const c of sorted) {
      results.push({ type: HAND_TYPES.SINGLE, rank: c.rank, mainRank: c.rank, length: 1, cards: [c] });
    }

    // ─── 对子（含逢人配） ───
    for (const [r, cs] of Object.entries(groups)) {
      if (cs.length >= 2) {
        results.push({ type: HAND_TYPES.PAIR, rank: r, mainRank: r, length: 2, cards: cs.slice(0, 2) });
      }
      if (cs.length >= 1 && wc >= 1) {
        results.push({ type: HAND_TYPES.PAIR, rank: r, mainRank: r, length: 2, cards: [cs[0], wilds[0]] });
      }
    }

    // ─── 三同张（含逢人配） ───
    for (const [r, cs] of Object.entries(groups)) {
      if (cs.length >= 3) {
        results.push({ type: HAND_TYPES.TRIPLE, rank: r, mainRank: r, length: 3, cards: cs.slice(0, 3) });
      }
      if (cs.length >= 2 && wc >= 1) {
        results.push({ type: HAND_TYPES.TRIPLE, rank: r, mainRank: r, length: 3, cards: [...cs.slice(0, 2), wilds[0]] });
      }
      if (cs.length >= 1 && wc >= 2) {
        results.push({ type: HAND_TYPES.TRIPLE, rank: r, mainRank: r, length: 3, cards: [cs[0], wilds[0], wilds[1]] });
      }
    }

    // ─── 三带一（含逢人配） ───
    for (const [r, cs] of Object.entries(groups)) {
      const tripleCards = cs.length >= 3 ? cs.slice(0, 3) :
                          cs.length === 2 && wc >= 1 ? [...cs.slice(0, 2), wilds[0]] :
                          cs.length === 1 && wc >= 2 ? [cs[0], wilds[0], wilds[1]] : null;
      if (!tripleCards) continue;
      const kickers = sorted.filter(c => !tripleCards.some(tc => tc.id === c.id));
      for (const k of kickers.slice(0, 2)) {
        if (k.isWild || k.rank === levelCardRank) continue;
        results.push({ type: HAND_TYPES.TRIPLE_PLUS_ONE, rank: r, mainRank: r, length: 4, cards: [...tripleCards, k] });
      }
    }

    // ─── 三带对（含逢人配） ───
    for (const [r, cs] of Object.entries(groups)) {
      const tripleCards = cs.length >= 3 ? cs.slice(0, 3) :
                          cs.length === 2 && wc >= 1 ? [...cs.slice(0, 2), wilds[0]] :
                          cs.length === 1 && wc >= 2 ? [cs[0], wilds[0], wilds[1]] : null;
      if (!tripleCards) continue;
      const usedInTriple = tripleCards.filter(c => c.isWild || c.rank === levelCardRank).length;
      const remainWild = wc - usedInTriple;
      for (const [r2, cs2] of Object.entries(groups)) {
        if (r2 === r) continue;
        if (cs2.length >= 2) {
          results.push({ type: HAND_TYPES.TRIPLE_PLUS_PAIR, rank: r, mainRank: r, length: 5, cards: [...tripleCards, ...cs2.slice(0, 2)] });
        }
        if (cs2.length >= 1 && remainWild >= 1) {
          results.push({ type: HAND_TYPES.TRIPLE_PLUS_PAIR, rank: r, mainRank: r, length: 5, cards: [...tripleCards, cs2[0], wilds[wc - 1]] });
        }
      }
    }

    // ─── 炸弹(4~8同张, 含逢人配) ───
    for (let nCards = 4; nCards <= 8; nCards++) {
      for (const [r, cs] of Object.entries(groups)) {
        if (cs.length >= nCards) {
          results.push({ type: HandDetector._bombType(nCards), rank: r, mainRank: r, length: nCards, cards: cs.slice(0, nCards) });
        }
        for (let usedW = 1; usedW <= Math.min(wc, nCards - 1); usedW++) {
          const need = nCards - usedW;
          if (cs.length >= need) {
            results.push({
              type: HandDetector._bombType(nCards), rank: r, mainRank: r, length: nCards,
              cards: [...cs.slice(0, need), ...wilds.slice(0, usedW)]
            });
          }
        }
      }
    }

    // ─── 王炸 / 四大天王 ───
    const jokers = sorted.filter(c => c.isJoker);
    if (jokers.length >= 4) {
      const bigs = jokers.filter(c => c.rank === 'big').length;
      const smalls = jokers.filter(c => c.rank === 'small').length;
      const isFourKings = jokers.length === 4 && bigs === 2 && smalls === 2;
      results.push({
        type: isFourKings ? HAND_TYPES.BOMB_JOKER_FOUR : HAND_TYPES.BOMB_JOKER,
        rank: 'joker', mainRank: 'joker', length: jokers.length, cards: jokers
      });
    }

    // ─── 顺子(5张) + 同花顺（含逢人配填补缺位） ───
    for (let startRankIdx = 0; startRankIdx <= 8; startRankIdx++) {
      const needed = [];
      let missing = 0;
      for (let i = 0; i < 5; i++) {
        const rank = RANK_ORDER[startRankIdx + i];
        if (groups[rank] && groups[rank].length > 0) {
          needed.push(groups[rank][0]);
        } else {
          missing++;
        }
      }
      if (missing > wc) continue;

      let usedW = 0;
      const straightCards = [];
      for (let i = 0; i < 5; i++) {
        const rank = RANK_ORDER[startRankIdx + i];
        if (groups[rank] && groups[rank].length > 0) {
          straightCards.push(groups[rank][0]);
        } else {
          straightCards.push(wilds[usedW++]);
        }
      }
      const main = RANK_ORDER[startRankIdx + 4];
      const normalCardsInStraight = straightCards.filter(c => !(c.isWild || c.rank === levelCardRank));
      const isSameSuit = normalCardsInStraight.length === 0 ||
        normalCardsInStraight.every(c => c.suit === normalCardsInStraight[0].suit);

      if (isSameSuit) {
        results.push({ type: HAND_TYPES.STRAIGHT_FLUSH, rank: main, mainRank: main, length: 5, cards: straightCards });
      } else {
        results.push({ type: HAND_TYPES.STRAIGHT, rank: main, mainRank: main, length: 5, cards: straightCards });
      }
    }

    // ─── 同花(5张同花色) ───
    const bySuit = {};
    for (const c of normals) {
      if (!bySuit[c.suit]) bySuit[c.suit] = [];
      bySuit[c.suit].push(c);
    }

    for (const [suit, suitCards] of Object.entries(bySuit)) {
      const total = suitCards.length + wc;
      if (total < 5) continue;
      suitCards.sort((a, b) => b.sortKey - a.sortKey);
      const rankSet = [...new Set(suitCards.map(c => c.rank))];

      if (suitCards.length >= 5) {
        if (rankSet.length >= 5) {
          const top5 = rankSet.slice(0, 5).map(r => suitCards.find(c => c.rank === r));
          if (!HandDetector._isConsecutiveRanks(top5)) {
            results.push({ type: HAND_TYPES.FLUSH, rank: top5[0].rank, mainRank: top5[0].rank, length: 5, cards: top5 });
          }
          if (rankSet.length >= 6) {
            const next5 = [suitCards[0], ...rankSet.slice(1, 5).map(r => suitCards.find(c => c.rank === r))];
            if (!HandDetector._isConsecutiveRanks(next5)) {
              results.push({ type: HAND_TYPES.FLUSH, rank: next5[0].rank, mainRank: next5[0].rank, length: 5, cards: next5 });
            }
          }
        }
        const topByPower = [...suitCards].sort((a, b) => b.power - a.power).slice(0, 5);
        if (!HandDetector._isConsecutiveRanks(topByPower)) {
          const key = topByPower.map(c => c.id).sort().join(',');
          if (!results.some(r => r.type === HAND_TYPES.FLUSH && r.cards.map(c => c.id).sort().join(',') === key)) {
            results.push({ type: HAND_TYPES.FLUSH, rank: topByPower[0].rank, mainRank: topByPower[0].rank, length: 5, cards: topByPower });
          }
        }
      }

      if (suitCards.length >= 4 && wc >= 1) {
        const top4 = suitCards.slice(0, 4);
        if (!HandDetector._isConsecutiveRanks(top4)) {
          results.push({ type: HAND_TYPES.FLUSH, rank: top4[0].rank, mainRank: top4[0].rank, length: 5, cards: [...top4, wilds[0]] });
        }
      }
    }

    return results;
  }
}

// 导出
if (typeof module !== 'undefined') module.exports = { Card, Deck, HandDetector, CardUtils, HAND_TYPES, RANK_ORDER, RANK_POWER, SUITS };
