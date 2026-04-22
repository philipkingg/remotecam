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

let stream = null;
let recorder = null;
let chunks = [];
let timerInterval = null;
let elapsedSeconds = 0;
let recordings = [];
let audioEnabled = false;

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
  const [width, height] = resolutionSelect.value.split('x').map(Number);
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
    setStatus('live');
    recordBtn.disabled = false;
    updateZoomCapabilities();
  } catch (err) {
    console.error('Camera error:', err);
    setStatus('idle');
    recordBtn.disabled = true;
    camControls.classList.add('hidden');
  }
}

async function restartStream() {
  const deviceId = cameraSelect.value;
  if (deviceId) await startStream(deviceId);
}

// ── Zoom ───────────────────────────────────────────────────────────────────

function updateZoomCapabilities() {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  const caps = track.getCapabilities?.() ?? {};

  if (caps.zoom) {
    zoomRange.min = caps.zoom.min;
    zoomRange.max = caps.zoom.max;
    zoomRange.step = caps.zoom.step ?? 0.1;
    zoomRange.value = caps.zoom.min;
    zoomVal.textContent = `${Number(caps.zoom.min).toFixed(1)}×`;
    zoomWrap.style.display = '';
  } else {
    zoomWrap.style.display = 'none';
  }
}

async function applyZoom(value) {
  if (!stream) return;
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints({ advanced: [{ zoom: Number(value) }] });
  } catch {}
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
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  recorder = new MediaRecorder(stream, { mimeType });
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
  const blob = new Blob(chunks, { type: 'video/webm' });
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `remotecam-${timestamp}.webm`;
  const duration = elapsedSeconds;

  recordings.unshift({ url, filename, duration, blob });
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
        <div class="meta">${formatTime(rec.duration)}</div>
      </div>
      <div class="actions">
        <button data-action="download" data-i="${i}">Download</button>
      </div>`;
    recordingsList.appendChild(item);
  });
}

// ── Event listeners ────────────────────────────────────────────────────────

cameraSelect.addEventListener('change', () => startStream(cameraSelect.value));

resolutionSelect.addEventListener('change', restartStream);
fpsSelect.addEventListener('change', restartStream);

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

recordingsList.addEventListener('click', e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const rec = recordings[parseInt(btn.dataset.i)];
  if (btn.dataset.action === 'download') {
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = rec.filename;
    a.click();
  }
});

navigator.mediaDevices.addEventListener('devicechange', loadDevices);

loadDevices();
