// The backs an opponent shows, as at a real table: how many of each deck, from the server; their order is the
// opponent's own business and never sent, so they are mixed here. The same seed gives the same mix, so that a fan
// stays as it is between updates and changes only with the hand behind it.

export type Back = "r" | "b";

export function arrangeBacks(seed: string, red: number, blue: number): Back[] {
    const backs: Back[] = [...Array<Back>(red).fill("r"), ...Array<Back>(blue).fill("b")];
    const random = mulberry32(hash(`${seed}:${red}:${blue}`));
    for (let i = backs.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [backs[i], backs[j]] = [backs[j]!, backs[i]!];
    }

    return backs;
}

// FNV-1a: a string into a 32-bit seed
function hash(text: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return h >>> 0;
}

// a small seeded generator: enough to shuffle a hand the same way twice
function mulberry32(seed: number): () => number {
    let a = seed;

    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
