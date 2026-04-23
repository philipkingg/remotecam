const express = require('express');
const path = require('path');
const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

function ffmpegPath() {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try {
      require('child_process').execFileSync(p, ['-version'], { stdio: 'ignore' });
      return p;
    } catch {}
  }
  return null;
}

// Accepts any browser-recorded video (fragmented MP4 or WebM) and remuxes
// to a properly structured QuickTime MOV compatible with DaVinci Resolve and other NLEs.
app.post('/export', (req, res) => {
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) {
    return res.status(501).json({ error: 'ffmpeg not found. Run: brew install ffmpeg' });
  }

  const tmp = path.join(os.tmpdir(), `remotecam-${Date.now()}`);
  const inFile = `${tmp}.in`;
  const outFile = `${tmp}.mov`;
  const ws = fs.createWriteStream(inFile);

  req.pipe(ws).on('finish', () => {
    execFile(ffmpeg, [
      '-i', inFile,
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-level:v', '4.1',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '18',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-movflags', '+faststart',
      '-y', outFile,
    ], (err) => {
      fs.unlinkSync(inFile);
      if (err) {
        if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
        return res.status(500).json({ error: err.message });
      }
      res.setHeader('Content-Type', 'video/quicktime');
      res.setHeader('Content-Disposition', 'attachment; filename="export.mov"');
      const rs = fs.createReadStream(outFile);
      rs.pipe(res).on('finish', () => fs.unlinkSync(outFile));
    });
  });
});

app.listen(PORT, () => {
  console.log(`remotecam running at http://localhost:${PORT}`);
});
