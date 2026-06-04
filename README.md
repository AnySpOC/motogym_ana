# Moto Gym Ana

Moto Gym Ana is a browser-based moto gymkhana timing prototype for iPhone.
It uses only built-in iPhone motion/orientation sensors to detect start,
stop, acceleration, braking, banking, and turning events.

## Files

- `index.html` - app screen
- `styles.css` - layout and visual design
- `app.js` - sensor filtering, event detection, timer, CSV export
- `manifest.webmanifest` - install metadata for iPhone home screen
- `sw.js` - offline cache for installed / revisited use
- `server.mjs` - local static server

## Local check on PC

```powershell
cd C:\app\gym_ana\repo
node server.mjs
```

Open:

```text
http://127.0.0.1:4173
```

Use the demo button first. It replays synthetic riding data and should create
START, ACCEL, TURN, BANK, BRAKE, and STOP events.

## iPhone check

1. Put the PC and iPhone on the same Wi-Fi.
2. Start the server on the PC.
3. Find the PC Wi-Fi IPv4 address with `ipconfig`.
4. Open this URL in iPhone Safari:

```text
http://PC_IPV4_ADDRESS:4173
```

Example:

```text
http://192.168.1.23:4173
```

If the page opens but sensor permission does not appear, use HTTPS. iOS Safari
often blocks DeviceMotion / DeviceOrientation on plain HTTP LAN addresses.

## Install on iPhone

The easiest field-test setup is to publish with GitHub Pages, open the HTTPS
URL once, and install it to the iPhone home screen.

1. Open `https://anyspoc.github.io/motogym_ana/` in iPhone Safari.
2. Tap the Safari share button.
3. Tap "Add to Home Screen".
4. Launch "Gym Ana" from the home screen once while online.
5. Tap the demo button and sensor permission button to confirm the app is ready.

After that first online launch, the service worker caches the app shell. The app
can then open again from the home screen even with weak or no network. Sensor
permission may still need to be granted from the installed app screen.

This is not an App Store install. It is a PWA-style home-screen install, which is
the fastest way to test this prototype on your own iPhone.

## HTTPS option for iPhone sensors

One quick option is ngrok:

```powershell
cd C:\app\gym_ana\repo
node server.mjs
ngrok http 4173
```

Open the generated `https://...ngrok-free.app` URL on iPhone Safari, then tap:

1. Sensor permission
2. Arm timer
3. Move the iPhone forward to trigger START
4. Keep it still to trigger STOP
5. Export CSV after the run

## Safety

For real riding tests, mount the iPhone firmly and test in a safe closed area.
Do not operate the phone while riding.
