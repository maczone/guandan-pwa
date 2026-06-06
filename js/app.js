/**
 * app.js - 掼蛋PWA主入口
 * 初始化游戏引擎和UI，启动游戏
 */

(function () {
  'use strict';

  let game = null;
  let ui = null;

  function init() {
    game = new Game();
    ui = new GameUI(game);

    // 应用保存的主题
    game.settings.applyTheme();

    // 游戏状态更新回调
    game.onUpdate(() => {
      ui.render();
    });

    // 消息回调
    game.onMessage((msg) => {
      console.log('[掼蛋]', msg);
    });

    // 自动开始新游戏
    game.startNewGame();
  }

  // 等待DOM加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
