type BrowserAudioContext = typeof AudioContext;

function getAudioContextConstructor(): BrowserAudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext;
}

export async function playNotificationSound(): Promise<boolean> {
  const AudioContextConstructor = getAudioContextConstructor();
  if (!AudioContextConstructor) return false;

  try {
    const context = new AudioContextConstructor();
    if (context.state === 'suspended') await context.resume();

    const startAt = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(880, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.16);
    return true;
  } catch {
    return false;
  }
}
