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
- `docs/SYSTEM_DESIGN.md` - current system and filter design
- `docs/DATA_ANALYSIS_2026-09-13.md` - analysis of the supplied ride log
- `docs/generated/Gym_Ana_System_Design.docx` - illustrated Japanese system design document
- `docs/generated/Gym_Ana_Data_Analysis_Report.docx` - illustrated Japanese ride-data analysis report
- `docs/assets/` - use-case, architecture, activity, class, state, and analysis charts
- `scripts/build_design_documents.py` - reproducible document and chart generator

## Local check on PC

```powershell
cd C:\app\gym_ana\repo
node server.mjs
```

Open:

```text
http://127.0.0.1:4173
```

Use this only for desktop layout checks. iPhone sensor checks need Safari on
iPhone.

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
5. Tap `Sensor ON` and confirm that G values react to iPhone movement.

After that first online launch, the service worker caches the app shell. The app
can then open again from the home screen even with weak or no network. Sensor
permission may still need to be granted from the installed app screen.

This is not an App Store install. It is a PWA-style home-screen install, which is
the fastest way to test this prototype on your own iPhone.

## Data storage

Runs are saved automatically on the iPhone with IndexedDB when STOP is detected.
The app stores both event data and raw sensor time series for each run.

Saved per run:

- summary: duration, max speed, max / min G, max bank, max yaw, sample count
- events: START, STOP, ACCEL, BRAKE, TURN, BANK, SENSOR, ERROR, SAVE
- samples: time, longitudinal G, lateral G, estimated speed, bank, yaw rate, confidence

The in-memory trace graph still keeps only the latest visible samples, but saved
runs keep up to 20,000 raw samples per run. At around 30 Hz this is roughly 11
minutes, which is much longer than a normal moto gymkhana run.

Use:

1. Tap `Sensor ON`.
2. Start the engine, tap `Calibration`, and keep the motorcycle still for four seconds.
3. Tap `Auto待機` for automatic timing or `手動開始` for manual timing.
4. Use `計測停止` when an automatic stop is not appropriate.
5. Use the saved run cards to export CSV or JSON.
6. Use `All JSON` to back up every saved run.

IndexedDB is practical for field testing, but iOS can remove browser storage
when storage pressure is high. Export important data after practice.

## Sensor controls and graph

- `Sensor ON` requests permission and starts reading iPhone motion sensors.
- `Sensor OFF` removes sensor listeners and resets live G / speed / variance values to zero.
- `Calibration` explicitly starts a four-second stationary calibration. Automatic
  and manual timing remain disabled until calibration completes successfully.
- Completion requires at least 15 Hz input, a valid gravity magnitude, less than
  7 degrees of gravity-direction drift, low mean acceleration, and vibration below
  the abnormal-mount threshold. Failure remains visible with its reason.
- The three-axis acceleration passes through a low-pass filter before axis detection,
  event detection, and speed integration. Fast engine vibration is rejected, while
  automatic START requires sustained forward acceleration for about 0.14 seconds.
  Acceleration accumulated during that confirmation window is carried into the
  current speed, while the START event itself remains zero speed at time zero.
- For the best vibration baseline, perform the four-second calibration with the
  engine idling in the same state used while waiting for START.
- `Auto待機` waits for sustained forward acceleration and then starts timing.
- `Auto解除` cancels only the automatic launch wait.
- `手動開始` starts timing immediately.
- `計測停止` stops and saves either an automatic or manual run.
- Sensitivity changes detection thresholds and a small G deadband.
  - Low: fewer false detections, better for vibration tests.
  - Normal: default.
  - High: reacts earlier, but can false-trigger more easily.

The trace graph shows:

- green: longitudinal G
- cyan: lateral G
- amber: rolling G variance

`Vibration` shows the RMS magnitude of the high-frequency acceleration removed
by the engine-vibration filter. It is also written to CSV as `vibration_g`.

`G Var` is rolling variance for longitudinal / lateral G. If this value rises
while the bike is stopped, the mount or sensor noise is influencing the reading.
`Kalman P` is the current internal covariance estimate of the G filters.

The app also auto-detects the three-dimensional forward axis. The first clear
acceleration after `Auto待機` or `手動開始` is projected onto the horizontal
plane measured during calibration. This supports portrait, landscape, reversed,
and tilted mounts. Keep the mount rigid after calibration.

Speed is estimated from acceleration and corrected with iPhone GPS when a
usable high-accuracy position is available. GPS continues to work outdoors
without Wi-Fi, although the first fix may take longer. The GPS card shows the
reported speed and horizontal accuracy. The app rejects fixes worse than 50 m
and clamps speed back to zero only when fresh GPS reports a stop, or when an
IMU-only run is already very slow immediately after braking. Low acceleration
alone is not treated as stationary because it can also mean constant-speed travel.

## Motion model

The app uses a lightweight extended Kalman filter rather than independent
one-dimensional filters. The state vector is:

```text
[speed, longitudinal_g, lateral_g, yaw_rate, bank_deg]
```

Prediction model:

```text
drive_g = 0.75 * measured_longitudinal_g + 0.25 * filtered_longitudinal_g
speed_k = speed_{k-1} + (drive_g * g - drag * speed) * dt
longitudinal_g, lateral_g, yaw_rate = decayed random walk
bank_deg = blended toward atan(lateral_g)
GPS speed = periodic scalar observation when accuracy is usable
fresh zero-speed GPS, or very-low-speed post-braking IMU evidence, clamps speed to zero
```

Observation model:

```text
z = [
  measured_longitudinal_g,
  measured_lateral_g,
  measured_yaw_rate,
  measured_bank_deg
]

The GPS observation is applied separately because it arrives much more slowly
than DeviceMotion samples.
```

The model is intentionally small enough to run in iPhone Safari. It is not a
full motorcycle multibody model; it is a sensor-fusion model for stable event
detection and field calibration.

## HTTPS option for iPhone sensors

One quick option is ngrok:

```powershell
cd C:\app\gym_ana\repo
node server.mjs
ngrok http 4173
```

Open the generated `https://...ngrok-free.app` URL on iPhone Safari, then tap:

1. `Sensor ON`
2. Start the engine, tap `Calibration`, and keep the motorcycle still for four seconds
3. Tap `Auto待機`
4. Move the iPhone forward to trigger START
5. Provide a fresh zero-speed GPS observation, or tap `計測停止`
6. Export CSV or JSON after the run

## Safety

For real riding tests, mount the iPhone firmly and test in a safe closed area.
Do not operate the phone while riding.
