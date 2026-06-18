/**
 * rules.js v2 - 掼蛋竞赛规则引擎
 * 包含：级牌管理、逢人配规则、出牌合法性、结算规则、贡牌规则、A必打
 */

// 级牌等级列表（从2到A）
const LEVELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class LevelManager {
  constructor() {
    this.currentLevelIdx = 0; // 从2开始
    this.aFailCount = 0;      // 打A失败的次数（竞赛规则：三次不过A回2）
  }

  get currentLevel() {
    return LEVELS[this.currentLevelIdx];
  }

  get currentLevelName() {
    return this.currentLevel;
  }

  /** 升级：加n级 */
  advance(n) {
    const oldLevel = this.currentLevel;
    this.currentLevelIdx = Math.min(this.currentLevelIdx + n, LEVELS.length - 1);
    const newLevel = this.currentLevel;
    // 如果从A升级成功（打过A），重置A失败计数
    if (oldLevel === 'A' && newLevel === 'A') {
      this.aFailCount = 0;
    }
  }

  /** 降级：减n级 */
  retreat(n) {
    this.currentLevelIdx = Math.max(this.currentLevelIdx - n, 0);
  }

  get isMaxLevel() {
    return this.currentLevelIdx >= LEVELS.length - 1;
  }

  /** 竞赛规则：A必打。打A失败时计数，三次不过回2 */
  recordAFail() {
    this.aFailCount++;
    if (this.aFailCount >= 3) {
      this.currentLevelIdx = 0; // 回到2
      this.aFailCount = 0;
      return true; // 触发降回2
    }
    return false;
  }

  reset() {
    this.currentLevelIdx = 0;
    this.aFailCount = 0;
  }
}

/**
 * 掼蛋结算：根据4人出完顺序计算升级数
 * 头游(1) + 二游(2) → 升3级
 * 头游(1) + 三游(3) → 升2级
 * 头游(1) + 末游(4) → 升1级
 * 
 * @param {number[]} finishOrder - 玩家索引的出完顺序 [0,2,1,3] 表示0最先，3最后
 * @param {number} humanPlayerIdx - 人类玩家索引(0-3)
 * @param {number} teammateIdx - 人类队友索引
 * @returns {{ levelAdvance: number, humanPos: string, desc: string }}
 */
class GameScorer {
  static score(finishOrder, humanPlayerIdx, teammateIdx) {
    // 找出各玩家的名次
    const rankMap = {};
    finishOrder.forEach((player, rank) => {
      rankMap[player] = rank + 1; // 1-indexed rank
    });

    const humanRank = rankMap[humanPlayerIdx];
    const teammateRank = rankMap[teammateIdx];
    const bestRank = Math.min(humanRank, teammateRank);
    const worstRank = Math.max(humanRank, teammateRank);

    let levelAdvance = 0;
    let desc = '';
    let humanPos = '';

    // 确定人类位置描述
    if (humanRank === 1) humanPos = '头游';
    else if (humanRank === 2) humanPos = '二游';
    else if (humanRank === 3) humanPos = '三游';
    else humanPos = '末游';

    if (bestRank === 1 && worstRank === 2) {
      levelAdvance = 3;
      desc = '双上！升3级 🎉';
    } else if (bestRank === 1 && worstRank === 3) {
      levelAdvance = 2;
      desc = '一三游，升2级 👍';
    } else if (bestRank === 1 && worstRank === 4) {
      levelAdvance = 1;
      desc = '保头游，升1级 ✅';
    } else if (bestRank === 2 && worstRank === 3) {
      levelAdvance = 0;
      desc = '中游，平局 🤝';
    } else if (bestRank === 2 && worstRank === 4) {
      levelAdvance = -1;
      desc = '被双下，降1级 ⬇';
    } else if (bestRank === 3 && worstRank === 4) {
      levelAdvance = -2;
      desc = '双下，降2级 ⬇⬇';
    }

    return { levelAdvance, humanPos, desc, humanRank, teammateRank };
  }

  // 判断游戏是否结束（某方打到A且赢下一局）
  static isGameOver(levelManager, humanTeamUp) {
    return levelManager.currentLevel === 'A' && humanTeamUp;
  }
}

/**
 * 竞赛规则 - 贡牌管理
 * 根据上局结束排名决定进贡关系
 */
class TributeManager {
  /**
   * 计算进贡关系
   * @param {number[]} finishOrder - 出完顺序 [头游索引, 二游索引, 三游索引, 末游索引]
   * @param {number} humanPlayerIdx
   * @param {number} teammateIdx
   * @returns {{
   *   type: 'single'|'double'|'none',
   *   tributeList: Array<{from: number, to: number}>,
   *   antiTribute: boolean,
   *   leaderIdx: number
   * }}
   */
  static calculate(finishOrder, humanPlayerIdx, teammateIdx) {
    const winner = finishOrder[0];  // 头游
    const runnerUp = finishOrder[1]; // 二游
    const third = finishOrder[2];    // 三游
    const loser = finishOrder[3];    // 末游

    // 判断是否双下：头游和二游是同一队
    const winnerTeam = (winner === humanPlayerIdx || winner === teammateIdx);
    const runnerUpTeam = (runnerUp === humanPlayerIdx || runnerUp === teammateIdx);
    const thirdTeam = (third === humanPlayerIdx || third === teammateIdx);
    const loserTeam = (loser === humanPlayerIdx || loser === teammateIdx);

    let type = 'none';
    let tributeList = [];
    let leaderIdx = winner; // 默认头游先出

    if (winnerTeam && loserTeam && !runnerUpTeam && !thirdTeam) {
      // 双下：头游和二游是同一队，三游和末游是另一队
      type = 'double';
      tributeList = [
        { from: third, to: winner },
        { from: loser, to: runnerUp }
      ];
      // 双下时：进贡较大者先出；若一样大则头游拿到谁家贡牌谁先出
      leaderIdx = winner; // 简化：头游先出（正常需要比较贡牌大小）
    } else if (winnerTeam && !loserTeam) {
      // 单向进贡：末游进贡给头游
      type = 'single';
      tributeList = [
        { from: loser, to: winner }
      ];
      // 非双下：进贡玩家先出
      leaderIdx = loser;
    } else if (!winnerTeam && loserTeam) {
      // 对手方头游，己方末游：己方向对手进贡
      type = 'single';
      tributeList = [
        { from: loser, to: winner }
      ];
      leaderIdx = loser;
    }

    return { type, tributeList, leaderIdx };
  }

  /**
   * 找出玩家手中可进贡的牌（最大牌，红心级牌除外）
   * @param {Card[]} hand 
   * @param {string} levelRank 当前级牌
   * @returns {Card} 要进贡的牌
   */
  static findTributeCard(hand, levelRank) {
    // 找最大的非红心级牌
    let candidates = hand.filter(c => !(c.suit === '♥' && c.rank === levelRank));
    if (candidates.length === 0) {
      // 如果全是红心级牌，随便给一张
      candidates = hand;
    }
    // 按牌力排序，取最大
    candidates.sort((a, b) => b.power - a.power);
    return candidates[0];
  }

  /**
   * 还牌：上游选一张10及以下（含10）的牌还给下游
   * @param {Card[]} hand 
   * @returns {Card} 要还的牌
   */
  static findReturnCard(hand) {
    // 找10及以下的牌，越小越好
    const lowCards = hand.filter(c => {
      if (c.isJoker) return false;
      const power = RANK_POWER[c.rank] || 0;
      return power <= 8; // <= 10
    });
    if (lowCards.length === 0) {
      // 没有小牌，给最小的
      const sorted = [...hand].sort((a, b) => a.power - b.power);
      return sorted[0];
    }
    lowCards.sort((a, b) => a.power - b.power);
    return lowCards[0];
  }

  /**
   * 判断是否抗贡（被抓来进贡的玩家手中有两个大王）
   * @param {Card[]} hand 
   * @returns {boolean}
   */
  static canAntiTribute(hand) {
    const bigJokers = hand.filter(c => c.isJoker && c.rank === 'big');
    return bigJokers.length >= 2;
  }
}

/**
 * 牌型显示名称
 */
function handTypeDisplayName(type) {
  const names = {
    [HAND_TYPES.SINGLE]: '单张',
    [HAND_TYPES.PAIR]: '对子',
    [HAND_TYPES.TRIPLE]: '三同张',
    [HAND_TYPES.TRIPLE_PLUS_ONE]: '三带一',
    [HAND_TYPES.TRIPLE_PLUS_PAIR]: '三带对',
    [HAND_TYPES.STRAIGHT]: '顺子',
    [HAND_TYPES.FLUSH]: '同花',
    [HAND_TYPES.STRAIGHT_FLUSH]: '同花顺✨',
    [HAND_TYPES.BOMB_4]: '四炸💥',
    [HAND_TYPES.BOMB_5]: '五炸💥',
    [HAND_TYPES.BOMB_6]: '六炸💥',
    [HAND_TYPES.BOMB_7]: '七炸💥',
    [HAND_TYPES.BOMB_8]: '八炸💥',
    [HAND_TYPES.BOMB_JOKER]: '王炸💥💥',
    [HAND_TYPES.BOMB_JOKER_FOUR]: '四大天王👑👑👑👑',
  };
  return names[type] || '未知';
}

if (typeof module !== 'undefined') module.exports = { LevelManager, GameScorer, TributeManager, handTypeDisplayName, LEVELS };
