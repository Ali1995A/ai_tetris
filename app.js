(function () {
  var COLS = 10;
  var ROWS = 18;
  var DROP_INTERVAL = 1300;
  var SETTINGS_KEY = 'kid_tetris_settings_v1';
  var blockSize = 30;
  var canvasCssWidth = COLS * blockSize;
  var canvasCssHeight = ROWS * blockSize;
  var nextCanvasCssSize = 96;

  var COLORS = {
    I: '#62dafb',
    O: '#ffcb4d',
    T: '#d49cff',
    L: '#ff9d68',
    J: '#7ea6ff',
    S: '#86e39f',
    Z: '#ff8b92'
  };

  var SHAPES = {
    I: [[1, 1, 1, 1]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1]],
    L: [[1, 0], [1, 0], [1, 1]],
    J: [[0, 1], [0, 1], [1, 1]],
    S: [[0, 1, 1], [1, 1, 0]],
    Z: [[1, 1, 0], [0, 1, 1]]
  };

  var KID_FRIENDLY_BAG = ['O', 'I', 'T', 'O', 'I', 'L', 'J'];

  var canvas = document.getElementById('game');
  var nextCanvas = document.getElementById('next');
  var ctx = canvas.getContext('2d');
  var nextCtx = nextCanvas.getContext('2d');

  var scoreEl = document.getElementById('score');
  var linesEl = document.getElementById('lines');
  var hintEl = document.getElementById('hint');

  var board = createBoard();
  var score = 0;
  var lines = 0;
  var paused = false;
  var touchLockEnabled = true;
  var voiceEnabled = true;
  var kidModeEnabled = true;
  var lastTime = 0;
  var dropCounter = 0;
  var current = null;
  var nextPiece = null;
  var isWeChat = /micromessenger/i.test(navigator.userAgent);

  function createBoard() {
    var data = [];
    for (var y = 0; y < ROWS; y += 1) {
      data.push(new Array(COLS).fill(''));
    }
    return data;
  }

  function vibrate(ms) {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return;
      }
      var data = JSON.parse(raw);
      if (typeof data.touchLockEnabled === 'boolean') {
        touchLockEnabled = data.touchLockEnabled;
      }
      if (typeof data.voiceEnabled === 'boolean') {
        voiceEnabled = data.voiceEnabled;
      }
      if (typeof data.kidModeEnabled === 'boolean') {
        kidModeEnabled = data.kidModeEnabled;
      }
    } catch (err) {
      // Ignore invalid cache.
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        touchLockEnabled: touchLockEnabled,
        voiceEnabled: voiceEnabled,
        kidModeEnabled: kidModeEnabled
      }));
    } catch (err) {
      // Ignore storage errors.
    }
  }

  function randomType() {
    return KID_FRIENDLY_BAG[Math.floor(Math.random() * KID_FRIENDLY_BAG.length)];
  }

  function cloneMatrix(matrix) {
    return matrix.map(function (row) {
      return row.slice();
    });
  }

  function createPiece(type) {
    var shape = cloneMatrix(SHAPES[type]);
    return {
      type: type,
      shape: shape,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: 0
    };
  }

  function rotateMatrix(matrix) {
    var h = matrix.length;
    var w = matrix[0].length;
    var result = [];
    for (var x = 0; x < w; x += 1) {
      var row = [];
      for (var y = h - 1; y >= 0; y -= 1) {
        row.push(matrix[y][x]);
      }
      result.push(row);
    }
    return result;
  }

  function collide(piece) {
    for (var y = 0; y < piece.shape.length; y += 1) {
      for (var x = 0; x < piece.shape[y].length; x += 1) {
        if (!piece.shape[y][x]) {
          continue;
        }
        var px = piece.x + x;
        var py = piece.y + y;
        if (px < 0 || px >= COLS || py >= ROWS) {
          return true;
        }
        if (py >= 0 && board[py][px]) {
          return true;
        }
      }
    }
    return false;
  }

  function merge(piece) {
    for (var y = 0; y < piece.shape.length; y += 1) {
      for (var x = 0; x < piece.shape[y].length; x += 1) {
        if (!piece.shape[y][x]) {
          continue;
        }
        var by = piece.y + y;
        if (by >= 0) {
          board[by][piece.x + x] = piece.type;
        }
      }
    }
  }

  function speak(text) {
    if (!voiceEnabled || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      return;
    }
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.92;
    utter.pitch = 1.15;
    utter.volume = 0.9;
    window.speechSynthesis.speak(utter);
  }

  function normalizePinyinText(text) {
    return text
      .replace(/ā/g, 'ɑ\u0304')
      .replace(/á/g, 'ɑ\u0301')
      .replace(/ǎ/g, 'ɑ\u030C')
      .replace(/à/g, 'ɑ\u0300')
      .replace(/a/g, 'ɑ');
  }

  function triMarkup(pinyin, hanzi, english) {
    return '<span class="pinyin-text">' + normalizePinyinText(pinyin) + '</span>' +
      '<span class="hanzi-text">' + hanzi + '</span>' +
      '<span class="en-text">' + english + '</span>';
  }

  function setTriText(el, pinyin, hanzi, english) {
    el.innerHTML = triMarkup(pinyin, hanzi, english);
  }

  function setHint(pinyin, hanzi, english, withVoice) {
    if (hintEl) {
      setTriText(hintEl, pinyin, hanzi, english);
    }
    if (withVoice) {
      speak(hanzi);
    }
  }

  function normalizeAllPinyinNodes() {
    var nodes = document.querySelectorAll('.pinyin-text');
    nodes.forEach(function (el) {
      el.textContent = normalizePinyinText(el.textContent || '');
    });
  }

  function clearLines() {
    var cleared = 0;
    for (var y = ROWS - 1; y >= 0; y -= 1) {
      var full = true;
      for (var x = 0; x < COLS; x += 1) {
        if (!board[y][x]) {
          full = false;
          break;
        }
      }
      if (full) {
        board.splice(y, 1);
        board.unshift(new Array(COLS).fill(''));
        cleared += 1;
        y += 1;
      }
    }

    if (cleared > 0) {
      lines += cleared;
      score += cleared * 100;
      vibrate(18);
      if (lines % 5 === 0) {
        setHint('tài bàng le! nǐ yǐ jīng xiāo chú le ' + lines + ' hɑ́ng!', '太棒了！你已经消除了 ' + lines + ' 行！', 'Great! You cleared ' + lines + ' lines!', true);
      }
      updateStats();
    }
  }

  function softenTopRows() {
    var rescueRows = Math.floor(ROWS / 2);
    for (var y = 0; y < rescueRows; y += 1) {
      board[y] = new Array(COLS).fill('');
    }
  }

  function emergencyRescue() {
    softenTopRows();
    score += 30;
    vibrate([20, 40, 20]);
    setHint('zì dòng jiù yuán yǐ qǐ dòng, kě yǐ jì xù wán.', '启动自动救援，危险区域已清理，可以继续玩。', 'Auto rescue activated. Keep playing.', true);
    updateStats();
  }

  function spawn() {
    current = nextPiece || createPiece(randomType());
    nextPiece = createPiece(randomType());
    current.x = Math.floor((COLS - current.shape[0].length) / 2);
    current.y = 0;

    if (collide(current)) {
      emergencyRescue();
    }
  }

  function hardDrop() {
    if (paused) {
      return;
    }
    while (!collide(current)) {
      current.y += 1;
    }
    current.y -= 1;
    lockPiece();
  }

  function lockPiece() {
    merge(current);
    clearLines();
    spawn();
    drawNext();
  }

  function move(dx) {
    if (paused) {
      return;
    }
    current.x += dx;
    if (collide(current)) {
      current.x -= dx;
      return;
    }
    vibrate(10);
  }

  function softDrop() {
    if (paused) {
      return;
    }
    current.y += 1;
    if (collide(current)) {
      current.y -= 1;
      lockPiece();
    }
    dropCounter = 0;
  }

  function rotate() {
    if (paused) {
      return;
    }
    var old = current.shape;
    current.shape = rotateMatrix(current.shape);

    if (collide(current)) {
      current.x += 1;
      if (collide(current)) {
        current.x -= 2;
        if (collide(current)) {
          current.x += 1;
          current.shape = old;
        }
      }
    }
    vibrate(12);
  }

  function drawCell(context, x, y, color, size) {
    context.fillStyle = color;
    context.fillRect(x * size, y * size, size - 1, size - 1);
  }

  function drawBoard() {
    ctx.clearRect(0, 0, canvasCssWidth, canvasCssHeight);

    for (var y = 0; y < ROWS; y += 1) {
      for (var x = 0; x < COLS; x += 1) {
        if (board[y][x]) {
          drawCell(ctx, x, y, COLORS[board[y][x]], blockSize);
        } else {
          ctx.fillStyle = '#eef5fb';
          ctx.fillRect(x * blockSize, y * blockSize, blockSize - 1, blockSize - 1);
        }
      }
    }

    for (var py = 0; py < current.shape.length; py += 1) {
      for (var px = 0; px < current.shape[py].length; px += 1) {
        if (current.shape[py][px]) {
          drawCell(ctx, current.x + px, current.y + py, COLORS[current.type], blockSize);
        }
      }
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvasCssSize, nextCanvasCssSize);
    var size = Math.max(10, Math.floor(nextCanvasCssSize / 5));
    var offsetX = Math.floor((nextCanvasCssSize / size - nextPiece.shape[0].length) / 2);
    var offsetY = Math.floor((nextCanvasCssSize / size - nextPiece.shape.length) / 2);

    for (var y = 0; y < nextPiece.shape.length; y += 1) {
      for (var x = 0; x < nextPiece.shape[y].length; x += 1) {
        if (nextPiece.shape[y][x]) {
          drawCell(nextCtx, offsetX + x, offsetY + y, COLORS[nextPiece.type], size);
        }
      }
    }
  }

  function updateStats() {
    scoreEl.textContent = String(score);
    linesEl.textContent = String(lines);
  }

  function update(time) {
    if (paused) {
      requestAnimationFrame(update);
      return;
    }

    var delta = time - lastTime;
    lastTime = time;
    dropCounter += delta;

    if (dropCounter > DROP_INTERVAL) {
      softDrop();
    }

    drawBoard();
    requestAnimationFrame(update);
  }

  function bindButtonElement(el, handler, hold) {
    if (!el) {
      return;
    }
    var timer = null;

    function run() {
      handler();
      if (hold) {
        timer = setInterval(handler, 130);
      }
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      run();
    }, { passive: false });

    el.addEventListener('touchend', stop);
    el.addEventListener('touchcancel', stop);

    el.addEventListener('mousedown', run);
    el.addEventListener('mouseup', stop);
    el.addEventListener('mouseleave', stop);
  }

  function bindActionButtons(action, handler, hold) {
    var list = document.querySelectorAll('[data-action="' + action + '"]');
    list.forEach(function (el) {
      bindButtonElement(el, handler, hold);
    });
  }

  function hasTargetInInteractiveArea(target) {
    var node = target;
    while (node) {
      if (node.id === 'game') {
        return true;
      }
      if (node.classList && (
        node.classList.contains('controls') ||
        node.classList.contains('fn-controls') ||
        node.classList.contains('thumb-zone') ||
        node.classList.contains('op-btn')
      )) {
        return true;
      }
      if (node.className && typeof node.className === 'string' && node.className.indexOf('controls') >= 0) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }

  function setupControls() {
    bindActionButtons('left', function () { move(-1); }, true);
    bindActionButtons('right', function () { move(1); }, true);
    bindActionButtons('rotate', rotate, false);
    bindActionButtons('down', softDrop, true);

    var btnTouchLock = document.getElementById('btnTouchLock');
    var btnVoice = document.getElementById('btnVoice');
    var btnKid = document.getElementById('btnKid');
    var btnGuide = document.getElementById('btnGuide');

    function refreshSwitchText() {
      setTriText(
        btnTouchLock,
        'fáng wù chù: ' + (touchLockEnabled ? 'kāi' : 'guān'),
        '防误触：' + (touchLockEnabled ? '开' : '关'),
        'TOUCH LOCK: ' + (touchLockEnabled ? 'ON' : 'OFF')
      );
      setTriText(
        btnVoice,
        'yǔ yīn tí shì: ' + (voiceEnabled ? 'kāi' : 'guān'),
        '语音提示：' + (voiceEnabled ? '开' : '关'),
        'VOICE: ' + (voiceEnabled ? 'ON' : 'OFF')
      );
      setTriText(
        btnKid,
        'yòu ér dà zì: ' + (kidModeEnabled ? 'kāi' : 'guān'),
        '幼儿大字：' + (kidModeEnabled ? '开' : '关'),
        'KID FONT: ' + (kidModeEnabled ? 'ON' : 'OFF')
      );
      document.body.classList.toggle('kid-mode', kidModeEnabled);
    }

    document.getElementById('btnPause').addEventListener('click', function () {
      paused = !paused;
      if (paused) {
        setHint('yǐ zàn tíng, diǎn àn jì xù.', '已暂停，点击暂停继续玩。', 'Paused. Tap to continue.', true);
      } else {
        setHint('jì xù yóu xì, màn màn wán.', '继续游戏，慢慢玩就好。', 'Resume and take it easy.', true);
        lastTime = performance.now();
      }
    });

    document.getElementById('btnRestart').addEventListener('click', function () {
      board = createBoard();
      score = 0;
      lines = 0;
      paused = false;
      setHint('xīn yì jú kāi shǐ lɑ, wán de kāi xīn!', '新一局开始啦，玩得开心！', 'New round started. Have fun!', true);
      updateStats();
      spawn();
      drawNext();
      lastTime = performance.now();
      saveSettings();
    });

    btnTouchLock.addEventListener('click', function () {
      touchLockEnabled = !touchLockEnabled;
      refreshSwitchText();
      saveSettings();
      setHint(
        touchLockEnabled ? 'fáng wù chù yǐ kāi qǐ.' : 'fáng wù chù yǐ guān bì.',
        touchLockEnabled ? '已开启防误触手势锁定。' : '已关闭防误触手势锁定。',
        touchLockEnabled ? 'Touch lock enabled.' : 'Touch lock disabled.',
        true
      );
    });

    btnVoice.addEventListener('click', function () {
      voiceEnabled = !voiceEnabled;
      refreshSwitchText();
      saveSettings();
      setHint(
        voiceEnabled ? 'yǔ yīn tí shì yǐ kāi qǐ.' : 'yǔ yīn tí shì yǐ guān bì.',
        voiceEnabled ? '语音提示已开启。' : '语音提示已关闭。',
        voiceEnabled ? 'Voice enabled.' : 'Voice disabled.',
        false
      );
      if (voiceEnabled) {
        speak('语音提示已开启。');
      }
    });

    btnKid.addEventListener('click', function () {
      kidModeEnabled = !kidModeEnabled;
      refreshSwitchText();
      saveSettings();
      setHint(
        kidModeEnabled ? 'yòu ér dà zì mó shì yǐ kāi qǐ.' : 'yòu ér dà zì mó shì yǐ guān bì.',
        kidModeEnabled ? '幼儿大字模式已开启。' : '幼儿大字模式已关闭。',
        kidModeEnabled ? 'Kid font mode enabled.' : 'Kid font mode disabled.',
        true
      );
    });

    btnGuide.addEventListener('click', function () {
      // No welcome modal; keep this button as a lightweight reminder via voice only.
      speak('左移 右移 旋转 下落。玩得开心。');
    });

    if (isWeChat) {
      touchLockEnabled = true;
      setHint('wēi xìn liú lǎn qì yǐ jiǎn cè, zì dòng kāi qǐ fáng wù chù.', '检测到微信浏览器，已自动开启防误触。', 'WeChat browser detected. Touch lock enabled.', true);
    }

    refreshSwitchText();

    window.addEventListener('keydown', function (e) {
      var key = e.key;
      if (key === 'ArrowLeft') {
        move(-1);
      } else if (key === 'ArrowRight') {
        move(1);
      } else if (key === 'ArrowUp') {
        rotate();
      } else if (key === 'ArrowDown') {
        softDrop();
      } else if (key === ' ') {
        e.preventDefault();
        hardDrop();
      }
    });
  }

  function setupGestureGuard() {
    function preventIfNeeded(e) {
      if (!touchLockEnabled) {
        return;
      }
      if (!hasTargetInInteractiveArea(e.target)) {
        e.preventDefault();
      }
    }

    document.addEventListener('touchmove', preventIfNeeded, { passive: false });
    document.addEventListener('gesturestart', function (e) {
      if (touchLockEnabled) {
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener('gesturechange', function (e) {
      if (touchLockEnabled) {
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener('gestureend', function (e) {
      if (touchLockEnabled) {
        e.preventDefault();
      }
    }, { passive: false });
    document.addEventListener('dblclick', function (e) {
      if (touchLockEnabled) {
        e.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('wheel', function (e) {
      if (touchLockEnabled) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  function resizeCanvases() {
    var gameWrap = document.querySelector('.game-wrap');
    var nextWrap = document.querySelector('.next-wrap');
    var wrapRect = gameWrap ? gameWrap.getBoundingClientRect() : null;
    if (!wrapRect) {
      return;
    }

    var nextRect = nextWrap ? nextWrap.getBoundingClientRect() : null;
    var nextVisible = nextWrap && nextWrap.offsetParent !== null && nextRect && nextRect.width > 0;
    var isPortrait = window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    var nextIsOverlay = false;
    if (nextVisible && window.getComputedStyle) {
      nextIsOverlay = window.getComputedStyle(nextWrap).position === 'absolute';
    }
    var gap = 10;
    var pad = 12;

    // In portrait, the next preview is an overlay; don't let it steal width from the playfield.
    var nextOnSide = nextVisible && !isPortrait && !nextIsOverlay;
    var availableWidth = wrapRect.width - pad - (nextOnSide ? (nextRect.width + gap) : 0);
    var availableHeight = wrapRect.height - pad;

    if (isPortrait) {
      // Keep the board above the thumb pads (which are fixed-position overlays in portrait).
      var leftPad = document.querySelector('.left-zone');
      if (leftPad && leftPad.offsetParent !== null) {
        var padRect = leftPad.getBoundingClientRect();
        var safeHeight = padRect.top - wrapRect.top - 10;
        if (safeHeight > 140) {
          availableHeight = Math.min(availableHeight, safeHeight);
        }
      }
    }

    var newBlock = Math.floor(Math.min(availableWidth / COLS, availableHeight / ROWS));
    newBlock = Math.max(12, Math.min(newBlock, 60));
    blockSize = newBlock;
    canvasCssWidth = COLS * blockSize;
    canvasCssHeight = ROWS * blockSize;

    canvas.style.width = canvasCssWidth + 'px';
    canvas.style.height = canvasCssHeight + 'px';

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvasCssWidth * dpr);
    canvas.height = Math.floor(canvasCssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    if (nextVisible) {
      nextCanvasCssSize = Math.floor(Math.min(nextRect.width, isPortrait ? 96 : 104));
      nextCanvasCssSize = Math.max(64, nextCanvasCssSize);
      nextCanvas.style.width = nextCanvasCssSize + 'px';
      nextCanvas.style.height = nextCanvasCssSize + 'px';
      nextCanvas.width = Math.floor(nextCanvasCssSize * dpr);
      nextCanvas.height = Math.floor(nextCanvasCssSize * dpr);
      nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nextCtx.imageSmoothingEnabled = false;
    }
  }

  function setupPortraitCanvasGestures() {
    var startX = 0;
    var startY = 0;
    var startTime = 0;
    var active = false;

    function isPortrait() {
      return window.matchMedia && window.matchMedia('(orientation: portrait)').matches;
    }

    canvas.addEventListener('touchstart', function (e) {
      if (!isPortrait()) {
        return;
      }
      if (!e.touches || e.touches.length === 0) {
        return;
      }
      var t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      active = true;
    }, { passive: true });

    canvas.addEventListener('touchend', function (e) {
      if (!isPortrait() || !active || paused) {
        active = false;
        return;
      }
      var changed = e.changedTouches && e.changedTouches[0];
      if (!changed) {
        active = false;
        return;
      }

      var dx = changed.clientX - startX;
      var dy = changed.clientY - startY;
      var adx = Math.abs(dx);
      var ady = Math.abs(dy);
      var dt = Date.now() - startTime;

      if (adx < 16 && ady < 16 && dt < 280) {
        rotate();
      } else if (adx > ady && adx > 18) {
        if (dx > 0) {
          move(1);
        } else {
          move(-1);
        }
      } else if (dy > 26) {
        if (dy > 90) {
          hardDrop();
        } else {
          softDrop();
        }
      }
      active = false;
    }, { passive: true });
  }

  function init() {
    loadSettings();
    normalizeAllPinyinNodes();
    resizeCanvases();
    window.addEventListener('resize', function () {
      // Keep the board as large as possible when orientation/layout changes.
      window.setTimeout(function () {
        resizeCanvases();
      }, 50);
    });
    nextPiece = createPiece(randomType());
    spawn();
    drawNext();
    updateStats();
    setupControls();
    setupGestureGuard();
    setupPortraitCanvasGestures();
    lastTime = performance.now();
    requestAnimationFrame(update);
  }

  init();
})();
