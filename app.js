(function () {
  var COLS = 10;
  var ROWS = 18;
  var BLOCK = 30;
  var DROP_INTERVAL = 1300;
  var SETTINGS_KEY = 'kid_tetris_settings_v1';

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
  var guideEl = document.getElementById('guide');
  var btnGuideStart = document.getElementById('btnGuideStart');
  var ctx = canvas.getContext('2d');
  var nextCtx = nextCanvas.getContext('2d');

  var scoreEl = document.getElementById('score');
  var linesEl = document.getElementById('lines');
  var hintEl = document.getElementById('hint');

  canvas.width = COLS * BLOCK;
  canvas.height = ROWS * BLOCK;

  var board = createBoard();
  var score = 0;
  var lines = 0;
  var paused = true;
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

  function setHint(text, withVoice) {
    hintEl.textContent = text;
    if (withVoice) {
      speak(text);
    }
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
        setHint('太棒了！你已经消除了 ' + lines + ' 行！', true);
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
    setHint('启动自动救援，危险区域已清理，可以继续玩。', true);
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var y = 0; y < ROWS; y += 1) {
      for (var x = 0; x < COLS; x += 1) {
        if (board[y][x]) {
          drawCell(ctx, x, y, COLORS[board[y][x]], BLOCK);
        } else {
          ctx.fillStyle = '#eef5fb';
          ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK - 1, BLOCK - 1);
        }
      }
    }

    for (var py = 0; py < current.shape.length; py += 1) {
      for (var px = 0; px < current.shape[py].length; px += 1) {
        if (current.shape[py][px]) {
          drawCell(ctx, current.x + px, current.y + py, COLORS[current.type], BLOCK);
        }
      }
    }
  }

  function drawNext() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    var size = 24;
    var offsetX = Math.floor((nextCanvas.width / size - nextPiece.shape[0].length) / 2);
    var offsetY = Math.floor((nextCanvas.height / size - nextPiece.shape.length) / 2);

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

  function bindButton(id, handler, hold) {
    var el = document.getElementById(id);
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

  function hasTargetInInteractiveArea(target) {
    var node = target;
    while (node) {
      if (node.id === 'game') {
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
    bindButton('btnLeft', function () { move(-1); }, true);
    bindButton('btnRight', function () { move(1); }, true);
    bindButton('btnRotate', rotate, false);
    bindButton('btnDown', softDrop, true);
    bindButton('btnDrop', hardDrop, false);

    var btnTouchLock = document.getElementById('btnTouchLock');
    var btnVoice = document.getElementById('btnVoice');
    var btnKid = document.getElementById('btnKid');
    var btnGuide = document.getElementById('btnGuide');

    function refreshSwitchText() {
      btnTouchLock.textContent = '防误触：' + (touchLockEnabled ? '开' : '关');
      btnVoice.textContent = '语音提示：' + (voiceEnabled ? '开' : '关');
      btnKid.textContent = '幼儿大字：' + (kidModeEnabled ? '开' : '关');
      document.body.classList.toggle('kid-mode', kidModeEnabled);
    }

    document.getElementById('btnPause').addEventListener('click', function () {
      paused = !paused;
      if (paused) {
        setHint('已暂停，点击暂停继续玩。', true);
      } else {
        setHint('继续游戏，慢慢玩就好。', true);
        lastTime = performance.now();
      }
    });

    document.getElementById('btnRestart').addEventListener('click', function () {
      board = createBoard();
      score = 0;
      lines = 0;
      paused = false;
      setHint('新一局开始啦，玩得开心！', true);
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
      setHint(touchLockEnabled ? '已开启防误触手势锁定。' : '已关闭防误触手势锁定。', true);
    });

    btnVoice.addEventListener('click', function () {
      voiceEnabled = !voiceEnabled;
      refreshSwitchText();
      saveSettings();
      setHint(voiceEnabled ? '语音提示已开启。' : '语音提示已关闭。', false);
      if (voiceEnabled) {
        speak('语音提示已开启。');
      }
    });

    btnKid.addEventListener('click', function () {
      kidModeEnabled = !kidModeEnabled;
      refreshSwitchText();
      saveSettings();
      setHint(kidModeEnabled ? '幼儿大字模式已开启。' : '幼儿大字模式已关闭。', true);
    });

    btnGuide.addEventListener('click', function () {
      paused = true;
      guideEl.classList.remove('hidden');
      setHint('阅读提示后点击开始继续。', false);
    });

    if (isWeChat) {
      touchLockEnabled = true;
      setHint('检测到微信浏览器，已自动开启防误触。', true);
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

  function setupGuide() {
    btnGuideStart.addEventListener('click', function () {
      guideEl.classList.add('hidden');
      paused = false;
      lastTime = performance.now();
      vibrate(25);
      setHint('开始啦，慢慢玩就可以。', true);
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

  function init() {
    loadSettings();
    nextPiece = createPiece(randomType());
    spawn();
    drawNext();
    updateStats();
    setupControls();
    setupGuide();
    setupGestureGuard();
    lastTime = performance.now();
    requestAnimationFrame(update);
  }

  init();
})();
