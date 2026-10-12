// Table sounds, made on the spot with WebAudio: no files to load, and they follow the headset's audio.
// The context starts on the first gesture (browsers keep audio closed until then).

let context: AudioContext | null = null;

function audio(): AudioContext | null {
    if (null === context) {
        try {
            context = new AudioContext();
        } catch {
            return null;
        }
    }
    if ("suspended" === context.state) {
        void context.resume();
    }

    return context;
}

// A short burst of filtered noise: the sound of card on card, or card on felt.
function noise(duration: number, frequency: number, gain: number): void {
    const ctx = audio();
    if (null === ctx) {
        return;
    }
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    const volume = ctx.createGain();
    volume.gain.value = gain;
    source.connect(filter).connect(volume).connect(ctx.destination);
    source.start();
}

function tone(frequencies: number[], step: number, type: OscillatorType, gain: number): void {
    const ctx = audio();
    if (null === ctx) {
        return;
    }
    frequencies.forEach((frequency, i) => {
        const start = ctx.currentTime + i * step;
        const oscillator = ctx.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        const volume = ctx.createGain();
        volume.gain.setValueAtTime(0, start);
        volume.gain.linearRampToValueAtTime(gain, start + 0.01);
        volume.gain.exponentialRampToValueAtTime(0.0001, start + step * 2.5);
        oscillator.connect(volume).connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + step * 3);
    });
}

export const sounds = {
    pick: () => noise(0.06, 2400, 0.5),
    drop: () => noise(0.09, 900, 0.7),
    draw: () => noise(0.14, 1600, 0.6),
    play: () => tone([523, 659, 784], 0.07, "triangle", 0.18),
    turn: () => tone([659, 988], 0.12, "sine", 0.2),
    error: () => tone([220, 175], 0.1, "square", 0.06),
    over: () => tone([523, 659, 784, 1047], 0.12, "triangle", 0.18),
    /** Opens the audio on a user gesture, so that the first sound is not lost. */
    unlock: () => void audio(),
};
