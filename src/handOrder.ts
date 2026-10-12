// Where the order of the hand is kept between visits: in this browser only, per game and per player.

export class HandOrders {
    /** `prefix`: the game's own, so that two games served from one origin keep apart. */
    constructor(private readonly prefix: string) {}

    read(key: string): string[] | null {
        try {
            const raw = localStorage.getItem(this.prefix + key);
            const parsed: unknown = null === raw ? null : JSON.parse(raw);

            return Array.isArray(parsed) && parsed.every((code) => "string" === typeof code) ? (parsed as string[]) : null;
        } catch {
            // storage refused, or not what we wrote: as if nothing was kept
            return null;
        }
    }

    save(key: string, order: string[]): void {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(order));
        } catch {
            // storage full or refused: the order is not remembered, the game goes on
        }
    }

    forget(key: string): void {
        try {
            localStorage.removeItem(this.prefix + key);
        } catch {
            // nothing to forget then
        }
    }
}
