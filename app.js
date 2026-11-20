const DESIGN_WIDTH = 440;

function fitStageToScreen() {
  const scaler = document.getElementById('stageScaler');
  if (!scaler) return;

  const scale = Math.min(1, window.innerWidth / DESIGN_WIDTH);
  scaler.style.transform = `scale(${scale})`;
  scaler.style.height = `${window.innerHeight / scale}px`;
}

window.addEventListener('resize', fitStageToScreen);
window.addEventListener('orientationchange', fitStageToScreen);
fitStageToScreen();

document.addEventListener('pointerdown', () => {
  const sel = window.getSelection ? window.getSelection() : null;
  if (sel && sel.removeAllRanges) {
    sel.removeAllRanges();
  }
});

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bluetoothDevice = null;
let bluetoothCharacteristic = null;

let deviceOn = false;
let currentWorkMode = 'BOOT';
let interactionOn = false;
let emotionOn = false;
let batteryCharge = 0;
let brightness = 255;
let soundEnabled = true;
let resetTimer = null;

const interactionToggle = document.getElementById('interaction-toggle');
const emotionToggle = document.getElementById('emotion-toggle');
const interactionCard = document.getElementById('interaction-card');
const emotionCard = document.getElementById('emotion-card');
const interactionBtns = document.getElementById('interaction-btns');
const emotionBtns = document.getElementById('emotion-btns');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (!soundEnabled) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'turn') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.08);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } else if (type === 'hazard') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === 'click') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.04);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.04);
  }
}

function logToConsole(text, isError = false) {
  const box = document.getElementById('consoleBox');
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = isError ? 'console-err' : '';
  div.textContent = `[${time}] ${text}`;
  box.appendChild(div);
  if (box.children.length > 40) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
}

async function sendControl(command) {
  if (!bluetoothCharacteristic) {
    logToConsole("Не отправлено (нет BLE): " + command, true);
    return;
  }
  try {
    const encoder = new TextEncoder();
    await bluetoothCharacteristic.writeValue(encoder.encode(command));
    logToConsole("Отправлено: " + command);
  } catch (e) {
    logToConsole("Ошибка отправки: " + e, true);
  }
}

async function toggleConnect() {
  if (!navigator.bluetooth) {
    alert("Ваш браузер не поддерживает Web Bluetooth! Откройте сайт через Google Chrome.");
    return;
  }

  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const btBtn = document.getElementById('btBtn');

  try {
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
      statusText.textContent = 'Поиск...';
      logToConsole("Поиск устройства Dash-Round...");

      bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'Dash-Round' }],
        optionalServices: [SERVICE_UUID]
      });

      bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

      const server = await bluetoothDevice.gatt.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      bluetoothCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

      statusDot.classList.remove('error');
      statusDot.classList.add('connected');
      btBtn.classList.remove('error');
      btBtn.classList.add('connected');
      statusText.textContent = 'Подключено';
      logToConsole("Успешно подключено по BLE!");

      const savedBat = parseInt(localStorage.getItem('dashBattery') || '100', 10);
      updateBatteryVisuals(savedBat, true, false);
      sendControl('BAT:' + savedBat);
    } else {
      await bluetoothDevice.gatt.disconnect();
    }
  } catch (e) {
    logToConsole("Ошибка BLE: " + e, true);
    onDisconnected();
  }
}

function onDisconnected() {
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  const btBtn = document.getElementById('btBtn');

  statusDot.classList.remove('connected', 'error');
  btBtn.classList.remove('connected', 'error');
  statusText.textContent = 'Не подключено';

  document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
  bluetoothDevice = null;
  bluetoothCharacteristic = null;
  logToConsole("Устройство отключено", true);

  updateBatteryVisuals(0, false, false);
}

function updateCompanionCards() {
  if (interactionOn) {
    interactionToggle.classList.add('on');
    interactionToggle.classList.remove('off');
    interactionCard.classList.remove('inactive');
    interactionBtns.style.display = 'flex';
  } else {
    interactionToggle.classList.remove('on');
    interactionToggle.classList.add('off');
    interactionCard.classList.add('inactive');
    interactionBtns.style.display = 'none';
    interactionBtns.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));
  }

  if (emotionOn) {
    emotionToggle.classList.add('on');
    emotionToggle.classList.remove('off');
    emotionCard.classList.remove('inactive');
    emotionBtns.style.display = 'flex';
  } else {
    emotionToggle.classList.remove('on');
    emotionToggle.classList.add('off');
    emotionCard.classList.add('inactive');
    emotionBtns.style.display = 'none';
    emotionBtns.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));
  }
}

interactionToggle.addEventListener('click', () => {
  if (!deviceOn) return;
  interactionOn = !interactionOn;
  if (interactionOn) emotionOn = false;
  updateCompanionCards();
  playSound('click');
});

emotionToggle.addEventListener('click', () => {
  if (!deviceOn) return;
  emotionOn = !emotionOn;
  if (emotionOn) interactionOn = false;
  updateCompanionCards();
  playSound('click');
});

document.querySelectorAll('#interaction-btns .emotion-btn, #emotion-btns .emotion-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    if (!deviceOn) return;
    const wasActive = this.classList.contains('active');
    this.parentElement.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));
    if (!wasActive) {
      this.classList.add('active');
    }
    const cmd = this.getAttribute('data-cmd');
    if (cmd) {
      sendControl(cmd);
    }
    playSound('click');
  });
});

function triggerLegacyEmotion(cmd, el) {
  if (!deviceOn) return;
  el.style.opacity = '0.5';
  setTimeout(() => { el.style.opacity = '1'; }, 200);
  sendControl(cmd);
  playSound('click');
}

function toggleControlAction(command, btnId, soundType) {
  if (!deviceOn) return;
  const btn = document.getElementById(btnId);
  btn.classList.toggle('active');
  sendControl(command);
  playSound(soundType);
}

function toggleTurnAction(command, btnId) {
  if (!deviceOn) return;
  const btn = document.getElementById(btnId);
  const wasActive = btn.classList.contains('active');
  document.querySelectorAll('#btnLeft, #btnRight').forEach(b => b.classList.remove('active'));
  if (!wasActive) {
    btn.classList.add('active');
  }
  sendControl(command);
  playSound('turn');
}

function syncWorkModeHighlight() {
  document.querySelectorAll('.work-btn').forEach(b => {
    b.classList.toggle('active', deviceOn && b.getAttribute('data-mode') === currentWorkMode);
  });
}

function togglePower() {
  deviceOn = !deviceOn;
  const knob = document.getElementById('powerKnob');
  const mainContent = document.getElementById('mainContent');

  interactionOn = false;
  emotionOn = false;
  document.querySelectorAll('.emotion-btn').forEach(b => b.classList.remove('active'));

  if (deviceOn) {
    knob.classList.remove('off');
    mainContent.classList.remove('locked-section');
    syncWorkModeHighlight();
    updateCompanionCards();
    applyWorkModeView(currentWorkMode);
    sendControl('POWER:ON');
    const savedBat = parseInt(localStorage.getItem('dashBattery') || '100', 10);
    updateBatteryVisuals(savedBat, true, false);
    sendControl('BAT:' + savedBat);
  } else {
    knob.classList.add('off');
    mainContent.classList.add('locked-section');
    syncWorkModeHighlight();
    updateCompanionCards();
    document.querySelectorAll('.control-btn').forEach(b => b.classList.remove('active'));
    sendControl('POWER:OFF');
    updateBatteryVisuals(0, false, false);
  }
  playSound('click');
}

function applyWorkModeView(mode) {
  document.getElementById('viewCompanion').style.display = mode === 'BOOT' ? 'block' : 'none';
  document.getElementById('viewControl').style.display = mode === 'RUN' ? 'block' : 'none';
  document.getElementById('viewTest').style.display = mode === 'TEST' ? 'block' : 'none';

  const phoneScroll = document.getElementById('phoneScroll');
  if (phoneScroll) phoneScroll.scrollTop = 0;

  if (mode === 'TEST') {
    requestAnimationFrame(() => {
      updateBatterySliderUI(batteryCharge);
      updateBrightnessSliderUI(brightness);
    });
  }
}

function switchWorkMode(mode, el) {
  if (!deviceOn) return;
  currentWorkMode = mode;
  syncWorkModeHighlight();
  applyWorkModeView(mode);

  if (mode === 'BOOT') {
    sendControl('MODE:BOOT');
  } else if (mode === 'RUN') {
    sendControl('MODE:RUN');
  } else if (mode === 'TEST') {
    sendControl('MODE:TEST');
  }
  playSound('click');
}

// Battery slider & visuals
const batterySlider = document.getElementById('batterySlider');
const batteryFill = document.querySelector('.battery-slider-fill');
const batteryThumb = document.querySelector('.battery-slider-thumb');
const batteryValue = document.querySelector('.battery-charge-value');
const mainPercent = document.getElementById('mainPercent');
const mainBatteryFill = document.getElementById('mainBatteryFill');

function getBatteryColor(val) {
  if (val <= 20) return '#FF0040';
  if (val <= 50) return '#FF8C00';
  return '#00FF4C';
}

function updateBatterySliderUI(val) {
  if (!batterySlider) return;
  const width = batterySlider.offsetWidth;
  if (!width) return;
  const maxLeft = Math.max(0, width - 20);
  const ratio = Math.max(0, Math.min(1, val / 100));
  const left = ratio * maxLeft;
  batteryFill.style.width = (left + 10) + 'px';
  batteryThumb.style.left = left + 'px';
  batteryValue.textContent = String(Math.round(val));

  const color = getBatteryColor(val);
  batteryFill.style.background = color;
  batteryThumb.style.background = color;
}

function updateBatteryVisuals(val, save = true, fromPresetButton = false) {
  batteryCharge = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
  updateBatterySliderUI(batteryCharge);

  mainPercent.textContent = deviceOn ? String(batteryCharge) : '0';

  if (!deviceOn || batteryCharge === 0) {
    mainBatteryFill.style.background = '#D9D9D9';
    document.querySelectorAll('.battery-segments span').forEach((cell) => {
      cell.style.background = '#D9D9D9';
    });
  } else {
    const color = getBatteryColor(batteryCharge);
    mainBatteryFill.style.background = color;
    const litCells = Math.ceil(batteryCharge / 10);
    document.querySelectorAll('.battery-segments span').forEach((cell, idx) => {
      cell.style.background = idx < litCells ? color : '#D9D9D9';
    });
  }

  if (save && deviceOn) {
    localStorage.setItem('dashBattery', String(batteryCharge));
  }

  if (!fromPresetButton) {
    document.querySelectorAll('.indication-btn').forEach(b => b.classList.remove('active'));
    if (batteryCharge >= 80) document.querySelector('.indication-btn.high')?.classList.add('active');
    else if (batteryCharge >= 40) document.querySelector('.indication-btn.mid')?.classList.add('active');
    else document.querySelector('.indication-btn.low')?.classList.add('active');
  }
}

function setBootPreset(val, btnEl) {
  if (!deviceOn) return;
  document.querySelectorAll('.indication-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  sendControl('BOOT_BAT:' + val);
  updateBatteryVisuals(val, true, true);
  sendControl('BAT:' + val);
  logToConsole("Установлен пресет заряда: " + val);
  playSound('click');
}

let draggingBattery = false;

function handleBatteryPointer(clientX) {
  if (!deviceOn || !batterySlider) return;
  const rect = batterySlider.getBoundingClientRect();
  const scale = Math.min(1, window.innerWidth / DESIGN_WIDTH) || 1;
  const ratio = Math.max(0, Math.min(1, ((clientX - rect.left) / scale) / batterySlider.offsetWidth));
  const rounded = Math.round(ratio * 100);
  updateBatteryVisuals(rounded, true, false);
  sendControl('BAT:' + rounded);
}

batterySlider.addEventListener('pointerdown', (e) => {
  if (!deviceOn) return;
  draggingBattery = true;
  batterySlider.setPointerCapture(e.pointerId);
  handleBatteryPointer(e.clientX);
});

batterySlider.addEventListener('pointermove', (e) => {
  if (!draggingBattery) return;
  handleBatteryPointer(e.clientX);
});

batterySlider.addEventListener('pointerup', () => {
  draggingBattery = false;
});

// Brightness slider
const brightnessSlider = document.getElementById('brightnessSlider');
const brightnessFill = document.querySelector('.brightness-slider-fill');
const brightnessThumb = document.querySelector('.brightness-slider-thumb');
const brightnessValue = document.querySelector('.brightness-value');

function updateBrightnessSliderUI(val) {
  if (!brightnessSlider) return;
  const width = brightnessSlider.offsetWidth;
  if (!width) return;
  const pct = Math.max(0, Math.min(1, val / 255));
  const maxLeft = Math.max(0, width - 20);
  const left = pct * maxLeft;
  brightnessFill.style.width = (left + 10) + 'px';
  brightnessThumb.style.left = left + 'px';
  brightnessValue.textContent = String(Math.round(val));
}

let draggingBrightness = false;

function handleBrightnessPointer(clientX) {
  if (!deviceOn || !brightnessSlider) return;
  const rect = brightnessSlider.getBoundingClientRect();
  const scale = Math.min(1, window.innerWidth / DESIGN_WIDTH) || 1;
  const ratio = Math.max(0, Math.min(1, ((clientX - rect.left) / scale) / brightnessSlider.offsetWidth));
  brightness = Math.max(0, Math.min(255, Math.round(ratio * 255)));
  updateBrightnessSliderUI(brightness);
  sendControl('BRIGHT:' + brightness);
}

brightnessSlider.addEventListener('pointerdown', (e) => {
  if (!deviceOn) return;
  draggingBrightness = true;
  brightnessSlider.setPointerCapture(e.pointerId);
  handleBrightnessPointer(e.clientX);
});

brightnessSlider.addEventListener('pointermove', (e) => {
  if (!draggingBrightness) return;
  handleBrightnessPointer(e.clientX);
});

brightnessSlider.addEventListener('pointerup', () => {
  draggingBrightness = false;
});

// Errors
function toggleErrorCode(errCmd, btnEl) {
  if (!deviceOn) return;
  const resetBtn = document.querySelector('.error-reset');
  if (resetBtn) resetBtn.classList.remove('active');

  const wasActive = btnEl.classList.contains('active');
  document.querySelectorAll('.error-btn').forEach(b => b.classList.remove('active'));
  if (!wasActive) {
    btnEl.classList.add('active');
    sendControl(errCmd);
    playSound('hazard');
  } else {
    sendControl('ERR:CLEAR');
    playSound('click');
  }
}

function clearErrorsCode() {
  if (!deviceOn) return;
  document.querySelectorAll('.error-btn').forEach(b => b.classList.remove('active'));

  const resetBtn = document.querySelector('.error-reset');
  if (resetBtn) {
    resetBtn.classList.add('active');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetBtn.classList.remove('active');
    }, 180);
  }

  sendControl('ERR:CLEAR');
  logToConsole('Ошибки сброшены');
  playSound('click');
}

// Initial state
syncWorkModeHighlight();
updateCompanionCards();
updateBatteryVisuals(0, false, true);
updateBrightnessSliderUI(brightness);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}