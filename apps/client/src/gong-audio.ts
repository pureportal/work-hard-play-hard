let audioContext: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
  if (audioContext?.state === "closed") {
    audioContext = undefined;
  }
  if (audioContext) {
    return audioContext;
  }
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return undefined;
  }
  audioContext = new AudioContextConstructor();
  return audioContext;
}

export async function prepareGongChime(): Promise<void> {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    await context.resume();
  }
}

export function playGongChime(): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") {
    return;
  }
  const startedAt = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.08, startedAt);
  master.gain.exponentialRampToValueAtTime(0.0001, startedAt + 1.45);
  master.connect(context.destination);

  const tones = [
    { frequency: 196, gain: 0.85, type: "sine" as OscillatorType },
    { frequency: 293.66, gain: 0.42, type: "triangle" as OscillatorType },
    { frequency: 392, gain: 0.24, type: "sine" as OscillatorType },
    { frequency: 587.33, gain: 0.12, type: "sine" as OscillatorType },
  ];
  for (const tone of tones) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, startedAt);
    oscillator.detune.setValueAtTime((Math.random() - 0.5) * 7, startedAt);
    gain.gain.setValueAtTime(tone.gain, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 1.25);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startedAt);
    oscillator.stop(startedAt + 1.5);
  }
}
