const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const jobs = new Map();

function ffmpegPath() {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try {
      require('child_process').execFileSync(p, ['-version'], { stdio: 'ignore' });
      return p;
    } catch {}
  }
  return null;
}

// Start an export job — client streams the blob, server responds with { jobId }
app.post('/export', (req, res) => {
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) {
    return res.status(501).json({ error: 'ffmpeg not found. Run: brew install ffmpeg' });
  }

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const tmp = path.join(os.tmpdir(), `remotecam-${jobId}`);
  const inFile = `${tmp}.in`;
  const outFile = `${tmp}.mov`;

  jobs.set(jobId, { progress: 0, done: false, error: null, outFile, inFile });

  const ws = fs.createWriteStream(inFile);
  ws.on('error', err => res.status(500).json({ error: err.message }));
  req.pipe(ws).on('finish', () => {
    res.json({ jobId });
    runExport(ffmpeg, jobId, inFile, outFile);
  });
});

function runExport(ffmpeg, jobId, inFile, outFile) {
  const job = jobs.get(jobId);
  if (!job) return;
  let totalSecs = 0;

  const proc = spawn(ffmpeg, [
    '-i', inFile,
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1',
    '-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    '-y', outFile,
  ]);

  let stderrBuf = '';
  proc.stderr.on('data', d => {
    stderrBuf += d.toString();
    if (!totalSecs) {
      const m = stderrBuf.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (m) totalSecs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
    }
  });

  let stdoutBuf = '';
  proc.stdout.on('data', d => {
    stdoutBuf += d.toString();
    const lines = stdoutBuf.split('\n');
    stdoutBuf = lines.pop();
    for (const line of lines) {
      if (line.startsWith('out_time=') && totalSecs > 0) {
        const t = line.slice(9).trim().split(':');
        if (t.length === 3) {
          const secs = parseInt(t[0]) * 3600 + parseInt(t[1]) * 60 + parseFloat(t[2]);
          job.progress = Math.min(99, Math.round((secs / totalSecs) * 100));
        }
      }
    }
  });

  proc.on('close', code => {
    fs.unlink(inFile, () => {});
    job.done = true;
    if (code !== 0) {
      job.error = 'ffmpeg exited with an error';
      if (fs.existsSync(outFile)) fs.unlink(outFile, () => {});
    } else {
      job.progress = 100;
    }
  });
}

// SSE progress stream — polls every 250ms until done
app.get('/export/progress/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const tick = () => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
      clearInterval(iv);
      return res.end();
    }
    res.write(`data: ${JSON.stringify({ progress: job.progress, done: job.done, error: job.error })}\n\n`);
    if (job.done) { clearInterval(iv); res.end(); }
  };

  const iv = setInterval(tick, 250);
  tick();
  req.on('close', () => clearInterval(iv));
});

// Download the finished file
app.get('/export/file/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || !job.done || job.error) return res.status(404).json({ error: 'File not ready' });

  res.setHeader('Content-Type', 'video/quicktime');
  res.setHeader('Content-Disposition', 'attachment; filename="export.mov"');
  const rs = fs.createReadStream(job.outFile);
  rs.on('error', () => res.status(500).end());
  rs.pipe(res).on('finish', () => {
    fs.unlink(job.outFile, () => {});
    jobs.delete(req.params.jobId);
  });
});

app.listen(PORT, () => {
  console.log(`remotecam running at http://localhost:${PORT}`);
});
