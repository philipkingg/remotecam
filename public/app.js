const videoEl = document.getElementById('video');
const emptyState = document.getElementById('emptyState');
const cameraSelect = document.getElementById('cameraSelect');
const recordBtn = document.getElementById('recordBtn');
const statusPill = document.getElementById('statusPill');
const statusText = statusPill.querySelector('.status-text');
const timer = document.getElementById('timer');
const recordingsSection = document.getElementById('recordings');
const recordingsList = document.getElementById('recordingsList');
const camControls = document.getElementById('camControls');
const resolutionSelect = document.getElementById('resolutionSelect');
const fpsSelect = document.getElementById('fpsSelect');
const zoomWrap = document.getElementById('zoomWrap');
const zoomRange = document.getElementById('zoomRange');
const zoomVal = document.getElementById('zoomVal');
const audioToggle = document.getElementById('audioToggle');
const orientLandscape = document.getElementById('orientLandscape');
const orientPortrait = document.getElementById('orientPortrait');
const monitorBtn = document.getElementById('monitorBtn');
const monitorOverlay = document.getElementById('monitorOverlay');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const exitMonitorBtn = document.getElementById('exitMonitorBtn');

let stream = null;
let recorder = null;
let chunks = [];
let recordingMimeType = '';
let timerInterval = null;
let elapsedSeconds = 0;
let recordings = [];
let audioEnabled = false;
let orientation = 'landscape'; // 'landscape' | 'portrait'
let monitorMode = false;
let overlayHideTimer = null;

// ── Device list ────────────────────────────────────────────────────────────

async function loadDevices() {
  try {
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
    tmp.getTracks().forEach(t => t.stop());
  } catch {}

  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter(d => d.kind === 'videoinput');

  cameraSelect.innerHTML = '<option value="">Select camera...</option>';
  videoInputs.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${cameraSelect.options.length}`;
    cameraSelect.appendChild(opt);
  });

  const iphone = videoInputs.find(d => /iphone|continuity/i.test(d.label));
  if (iphone) {
    cameraSelect.value = iphone.deviceId;
    await startStream(iphone.deviceId);
  }
}

// ── Stream ─────────────────────────────────────────────────────────────────

function buildVideoConstraints(deviceId) {
  const [w, h] = resolutionSelect.value.split('x').map(Number);
  const [width, height] = orientation === 'portrait' ? [h, w] : [w, h];
  const frameRate = Number(fpsSelect.value);
  return {
    deviceId: { exact: deviceId },
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: frameRate },
  };
}

async function startStream(deviceId) {
  if (stream) stream.getTracks().forEach(t => t.stop());

  if (!deviceId) {
    videoEl.classList.remove('active');
    emptyState.style.display = 'flex';
    camControls.classList.add('hidden');
    setStatus('idle');
    recordBtn.disabled = true;
    monitorBtn.disabled = true;
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: buildVideoConstraints(deviceId),
      audio: audioEnabled,
    });
    videoEl.srcObject = stream;
    videoEl.classList.add('active');
    emptyState.style.display = 'none';
    camControls.classList.remove('hidden');
    videoEl.style.transform = '';
    setPreviewOrientation();
    setStatus('live');
    recordBtn.disabled = false;
    monitorBtn.disabled = false;
    updateZoomCapabilities();
  } catch (err) {
    console.error('Camera error:', err);
    setStatus('idle');
    recordBtn.disabled = true;
    monitorBtn.disabled = true;
    camControls.classList.add('hidden');
  }
}

async function restartStream() {
  const deviceId = cameraSelect.value;
  if (deviceId) await startStream(deviceId);
}

function setPreviewOrientation() {
  const previewWrap = document.querySelector('.preview-wrap');
  previewWrap.classList.toggle('portrait', orientation === 'portrait');
}

// ── Zoom ───────────────────────────────────────────────────────────────────

let hardwareZoom = false;

function updateZoomCapabilities() {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities?.() ?? {};

  // Always show zoom — use hardware zoom if supported, CSS scale otherwise
  zoomWrap.style.display = '';
  zoomRange.value = 1;
  zoomVal.textContent = '1.0×';

  if (caps.zoom) {
    hardwareZoom = true;
    zoomRange.min = caps.zoom.min;
    zoomRange.max = caps.zoom.max;
    zoomRange.step = caps.zoom.step ?? 0.1;
    zoomRange.value = caps.zoom.min;
    zoomVal.textContent = `${Number(caps.zoom.min).toFixed(1)}×`;
  } else {
    hardwareZoom = false;
    zoomRange.min = 1;
    zoomRange.max = 5;
    zoomRange.step = 0.1;
  }
}

async function applyZoom(value) {
  const v = Number(value);
  if (hardwareZoom && stream) {
    const track = stream.getVideoTracks()[0];
    if (track) {
      try { await track.applyConstraints({ advanced: [{ zoom: v }] }); } catch {}
    }
  } else {
    // Digital zoom via CSS scale — preview-wrap clips the overflow
    videoEl.style.transform = v === 1 ? '' : `scale(${v})`;
  }
}

// ── Status ─────────────────────────────────────────────────────────────────

function setStatus(state) {
  statusPill.className = 'status-pill';
  if (state === 'live') {
    statusPill.classList.add('live');
    statusText.textContent = 'Live';
  } else if (state === 'recording') {
    statusPill.classList.add('recording');
    statusText.textContent = 'Recording';
  } else {
    statusText.textContent = 'No camera';
  }
}

// ── Timer ──────────────────────────────────────────────────────────────────

function formatTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── Recording ──────────────────────────────────────────────────────────────

function startRecording() {
  if (!stream) return;

  chunks = [];
  const mimeType = [
    audioEnabled ? 'video/mp4;codecs=avc1,mp4a.40.2' : 'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ].find(t => MediaRecorder.isTypeSupported(t)) ?? '';

  const bitrateMap = { '3840x2160': 50_000_000, '1920x1080': 20_000_000, '1280x720': 10_000_000 };
  const videoBitsPerSecond = bitrateMap[resolutionSelect.value] ?? 20_000_000;

  recordingMimeType = mimeType;
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = saveRecording;
  recorder.start(1000);

  elapsedSeconds = 0;
  timer.textContent = formatTime(0);
  timer.classList.add('visible');
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    timer.textContent = formatTime(elapsedSeconds);
  }, 1000);

  setStatus('recording');
  recordBtn.textContent = 'Stop';
  recordBtn.classList.add('recording');
  cameraSelect.disabled = true;
  resolutionSelect.disabled = true;
  fpsSelect.disabled = true;
  audioToggle.disabled = true;
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  clearInterval(timerInterval);
  timer.classList.remove('visible');
  setStatus('live');
  recordBtn.textContent = 'Record';
  recordBtn.classList.remove('recording');
  cameraSelect.disabled = false;
  resolutionSelect.disabled = false;
  fpsSelect.disabled = false;
  audioToggle.disabled = false;
}

function saveRecording() {
  const ismp4 = recordingMimeType.startsWith('video/mp4');
  const ext = ismp4 ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: recordingMimeType });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `remotecam-${timestamp}.${ext}`;
  const duration = elapsedSeconds;

  recordings.unshift({ url, filename, duration, blob, ismp4 });
  renderRecordings();

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

function renderRecordings() {
  if (recordings.length === 0) { recordingsSection.classList.add('hidden'); return; }
  recordingsSection.classList.remove('hidden');
  recordingsList.innerHTML = '';
  recordings.forEach((rec, i) => {
    const item = document.createElement('div');
    item.className = 'recording-item';
    item.innerHTML = `
      <div>
        <div class="name">${rec.filename}</div>
        <div class="meta">${formatTime(rec.duration)} · ${rec.ismp4 ? 'MP4' : 'WebM'}</div>
      </div>
      <div class="actions">
        <button data-action="download" data-i="${i}">Download</button>
        ${!rec.ismp4 ? `<button data-action="convert" data-i="${i}" class="convert">→ MP4</button>` : ''}
        <button data-action="delete" data-i="${i}" class="delete">Delete</button>
      </div>`;
    recordingsList.appendChild(item);
  });
}

function deleteRecording(i) {
  URL.revokeObjectURL(recordings[i].url);
  recordings.splice(i, 1);
  renderRecordings();
}

// ── Monitor mode ───────────────────────────────────────────────────────────

function showOverlay() {
  monitorOverlay.classList.remove('hidden');
  clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(() => monitorOverlay.classList.add('hidden'), 3000);
}

function enterMonitorMode() {
  // Release the stream so the iPhone camera is free for native recording
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
    videoEl.srcObject = null;
    videoEl.classList.remove('active');
  }
  monitorMode = true;
  document.body.classList.add('monitor');
  monitorBtn.classList.add('active');
  showOverlay();
  document.addEventListener('mousemove', showOverlay);
}

async function exitMonitorMode() {
  monitorMode = false;
  document.body.classList.remove('monitor');
  monitorBtn.classList.remove('active');
  monitorOverlay.classList.add('hidden');
  clearTimeout(overlayHideTimer);
  document.removeEventListener('mousemove', showOverlay);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  fullscreenBtn.textContent = 'Fullscreen';
  // Reacquire the stream
  await restartStream();
}

// ── Event listeners ────────────────────────────────────────────────────────

cameraSelect.addEventListener('change', () => startStream(cameraSelect.value));

resolutionSelect.addEventListener('change', restartStream);
fpsSelect.addEventListener('change', restartStream);

[orientLandscape, orientPortrait].forEach(btn => {
  btn.addEventListener('click', async () => {
    orientation = btn.dataset.orient;
    orientLandscape.classList.toggle('active', orientation === 'landscape');
    orientPortrait.classList.toggle('active', orientation === 'portrait');
    setPreviewOrientation();
    await restartStream();
  });
});

zoomRange.addEventListener('input', () => {
  const v = Number(zoomRange.value);
  zoomVal.textContent = `${v.toFixed(1)}×`;
  applyZoom(v);
});

audioToggle.addEventListener('click', async () => {
  audioEnabled = !audioEnabled;
  audioToggle.textContent = audioEnabled ? 'On' : 'Off';
  audioToggle.setAttribute('aria-pressed', audioEnabled);
  audioToggle.classList.toggle('on', audioEnabled);
  // Restart stream to acquire/release microphone
  await restartStream();
  // Mute the preview speaker to avoid feedback; audio still captured in recorder
  videoEl.muted = true;
});

recordBtn.addEventListener('click', () => {
  if (recorder && recorder.state === 'recording') stopRecording();
  else startRecording();
});

recordingsList.addEventListener('click', async e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const i = parseInt(btn.dataset.i);
  const rec = recordings[i];

  if (btn.dataset.action === 'download') {
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = rec.filename;
    a.click();
  } else if (btn.dataset.action === 'convert') {
    btn.textContent = 'Converting…';
    btn.disabled = true;
    try {
      const res = await fetch('/convert', { method: 'POST', body: rec.blob, headers: { 'Content-Type': 'video/webm' } });
      if (!res.ok) {
        const { error } = await res.json();
        alert(`Conversion failed: ${error}`);
        btn.textContent = '→ MP4';
        btn.disabled = false;
        return;
      }
      const mp4Blob = await res.blob();
      const mp4Url = URL.createObjectURL(mp4Blob);
      const mp4Name = rec.filename.replace('.webm', '.mp4');
      const a = document.createElement('a');
      a.href = mp4Url;
      a.download = mp4Name;
      a.click();
      URL.revokeObjectURL(mp4Url);
      btn.textContent = '✓ Done';
    } catch {
      btn.textContent = '→ MP4';
      btn.disabled = false;
    }
  } else if (btn.dataset.action === 'delete') {
    deleteRecording(i);
  }
});

document.getElementById('clearAllBtn').addEventListener('click', () => {
  recordings.forEach(r => URL.revokeObjectURL(r.url));
  recordings = [];
  renderRecordings();
});

monitorBtn.addEventListener('click', enterMonitorMode);
exitMonitorBtn.addEventListener('click', exitMonitorMode);

monitorOverlay.addEventListener('mouseenter', () => clearTimeout(overlayHideTimer));
monitorOverlay.addEventListener('mouseleave', () => {
  overlayHideTimer = setTimeout(() => monitorOverlay.classList.add('hidden'), 3000);
});

fullscreenBtn.addEventListener('click', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    fullscreenBtn.textContent = 'Fullscreen';
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
    fullscreenBtn.textContent = 'Exit Fullscreen';
  }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) fullscreenBtn.textContent = 'Fullscreen';
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && monitorMode) exitMonitorMode();
});

navigator.mediaDevices.addEventListener('devicechange', loadDevices);

loadDevices();
