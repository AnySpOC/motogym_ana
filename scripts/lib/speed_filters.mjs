const GRAVITY = 9.80665;

function gpsSigma(sample, scale = 1) {
  const accuracy = Number.isFinite(sample.gpsAccuracyM) ? sample.gpsAccuracyM : 50;
  const base = sample.gpsSource === "position"
    ? Math.min(5, Math.max(1.2, accuracy * 0.25))
    : Math.min(3, Math.max(0.4, accuracy * 0.06));
  return Math.max(0.15, base * scale);
}

function replayBiasEkf(samples, config = {}) {
  const qSpeed = config.qSpeed ?? 0.6;
  const qBias = config.qBias ?? 0.00002;
  const gpsSigmaScale = config.gpsSigmaScale ?? 0.7;
  let speed = Math.max(0, (samples[0]?.appSpeedKmh || 0) / 3.6);
  let biasG = 0;
  let p00 = 0.25;
  let p01 = 0;
  let p11 = 0.0025;
  let previousTime = samples[0]?.t || 0;
  let previousGpsTimestamp = null;

  return samples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.t - previousTime) / 1000));
    previousTime = sample.t;
    const unconstrainedSpeed = speed + (sample.longG - biasG) * GRAVITY * dt;
    const active = unconstrainedSpeed > 0 ? 1 : 0;
    speed = Math.max(0, unconstrainedSpeed);
    const f01 = -GRAVITY * dt * active;
    const nextP00 = active * p00 * active + 2 * active * p01 * f01 + f01 * p11 * f01 + qSpeed * dt;
    const nextP01 = active * p01 + f01 * p11;
    p00 = nextP00;
    p01 = nextP01;
    p11 += qBias * dt;

    if (Number.isFinite(sample.gpsSpeedKmh) && sample.gpsTimestamp !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestamp;
      const variance = gpsSigma(sample, gpsSigmaScale) ** 2;
      const innovationVariance = Math.max(1e-9, p00 + variance);
      const speedGain = p00 / innovationVariance;
      const biasGain = p01 / innovationVariance;
      const residual = Math.max(0, sample.gpsSpeedKmh / 3.6) - speed;
      speed = Math.max(0, speed + speedGain * residual);
      biasG = Math.max(-0.08, Math.min(0.08, biasG + biasGain * residual));
      const oldP00 = p00;
      const oldP01 = p01;
      p00 -= speedGain * oldP00;
      p01 -= speedGain * oldP01;
      p11 -= biasGain * oldP01;
    }
    return { ...sample, replaySpeedKmh: speed * 3.6, estimatedBiasG: biasG };
  });
}

function cholesky2(p00, p01, p11) {
  const l00 = Math.sqrt(Math.max(1e-12, p00));
  const l10 = p01 / l00;
  const l11 = Math.sqrt(Math.max(1e-12, p11 - l10 * l10));
  return [[l00, 0], [l10, l11]];
}

function replayUkf(samples, config = {}) {
  const qSpeed = config.qSpeed ?? 0.6;
  const qBias = config.qBias ?? 0.00002;
  const gpsSigmaScale = config.gpsSigmaScale ?? 0.7;
  const alpha = config.alpha ?? 0.45;
  const beta = 2;
  const n = 2;
  const lambda = alpha * alpha * n - n;
  const scale = n + lambda;
  const wm = [lambda / scale, ...Array(2 * n).fill(1 / (2 * scale))];
  const wc = [...wm];
  wc[0] += 1 - alpha * alpha + beta;
  let x = [Math.max(0, (samples[0]?.appSpeedKmh || 0) / 3.6), 0];
  let p00 = 0.25;
  let p01 = 0;
  let p11 = 0.0025;
  let previousTime = samples[0]?.t || 0;
  let previousGpsTimestamp = null;

  return samples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.t - previousTime) / 1000));
    previousTime = sample.t;
    const l = cholesky2(p00 * scale, p01 * scale, p11 * scale);
    const sigma = [x];
    for (let column = 0; column < n; column += 1) {
      const delta = [l[0][column], l[1][column]];
      sigma.push([x[0] + delta[0], x[1] + delta[1]]);
      sigma.push([x[0] - delta[0], x[1] - delta[1]]);
    }
    const predicted = sigma.map(([speed, bias]) => [
      Math.max(0, speed + (sample.longG - bias) * GRAVITY * dt),
      Math.max(-0.08, Math.min(0.08, bias)),
    ]);
    x = [0, 0];
    for (let i = 0; i < predicted.length; i += 1) {
      x[0] += wm[i] * predicted[i][0];
      x[1] += wm[i] * predicted[i][1];
    }
    p00 = qSpeed * dt;
    p01 = 0;
    p11 = qBias * dt;
    for (let i = 0; i < predicted.length; i += 1) {
      const d0 = predicted[i][0] - x[0];
      const d1 = predicted[i][1] - x[1];
      p00 += wc[i] * d0 * d0;
      p01 += wc[i] * d0 * d1;
      p11 += wc[i] * d1 * d1;
    }

    if (Number.isFinite(sample.gpsSpeedKmh) && sample.gpsTimestamp !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestamp;
      const observation = Math.max(0, sample.gpsSpeedKmh / 3.6);
      const variance = gpsSigma(sample, gpsSigmaScale) ** 2;
      const innovationVariance = Math.max(1e-9, p00 + variance);
      const speedGain = p00 / innovationVariance;
      const biasGain = p01 / innovationVariance;
      const residual = observation - x[0];
      x[0] = Math.max(0, x[0] + speedGain * residual);
      x[1] = Math.max(-0.08, Math.min(0.08, x[1] + biasGain * residual));
      const oldP00 = p00;
      const oldP01 = p01;
      p00 -= speedGain * oldP00;
      p01 -= speedGain * oldP01;
      p11 -= biasGain * oldP01;
    }
    return { ...sample, replaySpeedKmh: x[0] * 3.6, estimatedBiasG: x[1] };
  });
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function normal(random) {
  const a = Math.max(1e-12, random());
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * random());
}

function replayParticleFilter(samples, config = {}) {
  const count = config.particles ?? 160;
  const qSpeed = config.qSpeed ?? 0.25;
  const qBias = config.qBias ?? 0.00002;
  const gpsSigmaScale = config.gpsSigmaScale ?? 0.7;
  const random = seededRandom(config.seed ?? 20261019);
  const initialSpeed = Math.max(0, (samples[0]?.appSpeedKmh || 0) / 3.6);
  let particles = Array.from({ length: count }, () => ({ speed: initialSpeed, bias: normal(random) * 0.01, weight: 1 / count }));
  let previousTime = samples[0]?.t || 0;
  let previousGpsTimestamp = null;

  return samples.map((sample) => {
    const dt = Math.min(0.12, Math.max(0.005, (sample.t - previousTime) / 1000));
    previousTime = sample.t;
    const speedNoise = Math.sqrt(qSpeed * dt);
    const biasNoise = Math.sqrt(qBias * dt);
    for (const particle of particles) {
      particle.bias = Math.max(-0.08, Math.min(0.08, particle.bias + normal(random) * biasNoise));
      particle.speed = Math.max(0, particle.speed + (sample.longG - particle.bias) * GRAVITY * dt
        + normal(random) * speedNoise);
    }

    if (Number.isFinite(sample.gpsSpeedKmh) && sample.gpsTimestamp !== previousGpsTimestamp) {
      previousGpsTimestamp = sample.gpsTimestamp;
      const observation = Math.max(0, sample.gpsSpeedKmh / 3.6);
      const sigma = gpsSigma(sample, gpsSigmaScale);
      let total = 0;
      for (const particle of particles) {
        const residual = (observation - particle.speed) / sigma;
        particle.weight *= Math.exp(-0.5 * residual * residual);
        total += particle.weight;
      }
      if (!(total > 1e-30)) {
        for (const particle of particles) particle.weight = 1 / count;
      } else {
        for (const particle of particles) particle.weight /= total;
      }
      const ess = 1 / particles.reduce((sum, particle) => sum + particle.weight ** 2, 0);
      if (ess < count * 0.55) {
        const next = [];
        const step = 1 / count;
        let target = random() * step;
        let cumulative = particles[0].weight;
        let index = 0;
        for (let i = 0; i < count; i += 1, target += step) {
          while (target > cumulative && index < count - 1) cumulative += particles[++index].weight;
          next.push({ speed: particles[index].speed, bias: particles[index].bias, weight: step });
        }
        particles = next;
      }
    }
    const speed = particles.reduce((sum, particle) => sum + particle.speed * particle.weight, 0);
    const bias = particles.reduce((sum, particle) => sum + particle.bias * particle.weight, 0);
    return { ...sample, replaySpeedKmh: speed * 3.6, estimatedBiasG: bias };
  });
}

export { replayBiasEkf, replayParticleFilter, replayUkf };
