// SOUNDS THE DAEMON PERCEIVES — simulated, for when there is no microphone.
// Each button produces exactly the same kind of perception the microphone would.

export const SIMULATED_INPUTS = [
  { kind: 'tap', label: 'Tap', hint: 'a short knock on the table' },
  { kind: 'hum', label: 'Hum', hint: 'a low, steady tone' },
  { kind: 'clap', label: 'Clap', hint: 'a sharp, loud transient' },
  { kind: 'whisper', label: 'Whisper', hint: 'quiet, breathy sound' },
  { kind: 'rhythm', label: 'Rhythm', hint: 'four steady taps' },
  { kind: 'silence', label: 'Silence', hint: 'hold still: lets the house fall quiet' },
]

export function simulatedPerception(kind) {
  const intensity = { tap: 0.4, hum: 0.5, clap: 0.9, whisper: 0.2, rhythm: 0.6, voice: 0.5, silence: 0 }[kind] ?? 0.5
  return { kind, intensity, source: 'simulated' }
}

// A synthetic waveform for the visualiser, shaped like each kind of sound.
export function simulatedWave(kind, age, n = 256) {
  const out = new Float32Array(n)
  if (age > 1.6 || kind === 'silence') return out
  const env = Math.max(0, 1 - age / 1.6)
  for (let i = 0; i < n; i++) {
    const x = i / n
    let v = 0
    switch (kind) {
      case 'tap':
        v = Math.exp(-((x - 0.3) ** 2) * 900) * Math.sin(x * 220) * 0.9
        break
      case 'clap':
        v = (Math.random() * 2 - 1) * Math.exp(-((x - 0.25) ** 2) * 200)
        break
      case 'hum':
        v = Math.sin(x * 40) * 0.5
        break
      case 'whisper':
        v = (Math.random() * 2 - 1) * 0.18
        break
      case 'rhythm':
        v = [0.15, 0.4, 0.65, 0.9].reduce((s, c) => s + Math.exp(-((x - c) ** 2) * 1500), 0) * Math.sin(x * 260) * 0.8
        break
      default:
        v = Math.sin(x * 30) * Math.sin(x * 7) * 0.4
    }
    out[i] = v * env
  }
  return out
}
