# remotecam

View and record your iPhone's rear camera from your Mac — no extra app required.

Uses Apple's built-in **Continuity Camera** so your iPhone appears as a webcam automatically, over USB or WiFi. The web app lets you monitor the feed on your Mac and record with one click.

---

## Requirements

- iPhone with iOS 16 or later
- Mac with macOS Ventura (13) or later
- Both devices signed into the **same Apple ID**
- Node.js 18 or later

---

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/philipkingg/remotecam.git
   cd remotecam
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and go to:
   ```
   http://localhost:3000
   ```

---

## Connecting your iPhone

**Via USB (most reliable)**
1. Plug your iPhone into your Mac with a cable
2. If prompted on the iPhone, tap **Trust This Computer**
3. Your iPhone will appear in the camera dropdown automatically

**Via WiFi (wireless)**
1. Make sure your iPhone and Mac are on the **same WiFi network**
2. Enable **Bluetooth** on both devices
3. Continuity Camera activates automatically — no pairing needed beyond the first time

In both cases, your iPhone will show up as a camera option in the app.

---

## Using the app

1. Select your **iPhone** from the **camera dropdown** — the live rear camera feed appears immediately
2. Prop your iPhone at the angle you want, then switch focus to your Mac
3. Press **Record** when you're ready — the button turns red and a timer starts
4. Press **Stop** when you're done — the video downloads automatically as a `.webm` file
5. Previous recordings in the session appear in the list below the controls for re-download

---

## Tips

- **Lock screen rotation** on your iPhone before propping it, so the orientation stays fixed
- For the best quality, keep the iPhone plugged in via USB — it also keeps it charged during long sessions
- `.webm` files play in Chrome, Firefox, and VLC; to convert to `.mp4` use [HandBrake](https://handbrake.fr) or `ffmpeg -i input.webm output.mp4`
