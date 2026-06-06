/**
 * rules.js - 掼蛋规则引擎
 * 包含：级牌管理、逢人配规则、出牌合法性、结算规则
 */

// 级牌等级列表（从2到A）
const LEVELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class LevelManager {
  constructor() {
    this.currentLevelIdx = 0; // 从2开始
  }

  get currentLevel() {
    return LEVELS[this.currentLevelIdx];
  }

  get currentLevelName() {
    return this.currentLevel;
  }

  /** 升级：加n级 */
  advance(n) {
    this.currentLevelIdx = Math.min(this.currentLevelIdx + n, LEVELS.length - 1);
  }

  /** 降级：减n级 */
  retreat(n) {
    this.currentLevelIdx = Math.max(this.currentLevelIdx - n, 0);
  }

  get isMaxLevel() {
    return this.currentLevelIdx >= LEVELS.length - 1;
  }

  reset() {
    this.currentLevelIdx = 0;
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
  };
  return names[type] || '未知';
}

if (typeof module !== 'undefined') module.exports = { LevelManager, GameScorer, handTypeDisplayName, LEVELS };
