/**
 * stats.js - 掼蛋游戏统计
 * 记录每局/每场数据，持续跟踪游戏表现
 */

class GameStats {
  constructor() {
    this.reset();
    this._load();
  }

  reset() {
    this.rounds = [];           // 每局详情
    this.totalRounds = 0;
    this.humanWins = 0;         // 人类方赢的局数
    this.humanBest = null;      // 最佳状态（最高级牌）
    this.humanAvgRank = 0;      // 平均排名
    this.bombsPlayed = 0;       // 炸弹出计数
    this.currentStreak = 0;     // 连胜/连败
  }

  /** 记录一局结束 */
  recordRound(roundNum, level, finishOrder, humanPlayerIdx, teammateIdx, result) {
    const entry = {
      round: roundNum,
      level: level,
      finishOrder: [...finishOrder],
      humanRank: result.humanRank,
      humanPos: result.humanPos,
      levelAdvance: result.levelAdvance,
      desc: result.desc,
      won: result.levelAdvance > 0,
      time: Date.now()
    };
    this.rounds.push(entry);
    this.totalRounds++;
    
    if (result.levelAdvance > 0) {
      this.humanWins++;
      this.currentStreak = Math.max(this.currentStreak, 1);
    } else {
      this.currentStreak = Math.min(this.currentStreak, -1);
    }

    // 更新最佳表现
    if (!this.humanBest || level > this.humanBest.level) {
      this.humanBest = { round: roundNum, level };
    }

    // 更新平均排名
    const totalRank = this.rounds.reduce((s, r) => s + r.humanRank, 0);
    this.humanAvgRank = (totalRank / this.totalRounds).toFixed(1);

    this._save();
    return entry;
  }

  /** 记录炸弹 */
  recordBomb() {
    this.bombsPlayed++;
  }

  /** 获取摘要 */
  getSummary() {
    const wins = this.humanWins;
    const total = this.totalRounds;
    const winRate = total > 0 ? (wins / total * 100).toFixed(0) : '0';
    const last5 = this.rounds.slice(-5);
    const recentForm = last5.map(r => r.won ? 'W' : 'L').join('');

    return {
      totalRounds: total,
      humanWins: wins,
      winRate: winRate + '%',
      avgRank: this.humanAvgRank || '-',
      bestLevel: this.humanBest ? this.humanBest.level : '-',
      bombsPlayed: this.bombsPlayed,
      recentForm: recentForm || '-',
      streak: this.currentStreak
    };
  }

  /** 获取最近N局记录 */
  getRecentRounds(n = 10) {
    return this.rounds.slice(-n).reverse();
  }

  _save() {
    try {
      localStorage.setItem('guandan_stats', JSON.stringify({
        rounds: this.rounds.slice(-100), // 只存最近100局
        totalRounds: this.totalRounds,
        humanWins: this.humanWins,
        humanBest: this.humanBest,
        humanAvgRank: this.humanAvgRank,
        bombsPlayed: this.bombsPlayed
      }));
    } catch (e) { /* ignore */ }
  }

  _load() {
    try {
      const data = JSON.parse(localStorage.getItem('guandan_stats'));
      if (data) {
        this.rounds = data.rounds || [];
        this.totalRounds = data.totalRounds || 0;
        this.humanWins = data.humanWins || 0;
        this.humanBest = data.humanBest || null;
        this.humanAvgRank = data.humanAvgRank || 0;
        this.bombsPlayed = data.bombsPlayed || 0;
      }
    } catch (e) { /* ignore */ }
  }
}

if (typeof module !== 'undefined') module.exports = { GameStats };
