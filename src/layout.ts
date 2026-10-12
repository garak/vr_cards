// The table as the player is rearranging it, before it is sent: the melds and what is left of the hand.
// Every grab and drop is a move here, and the scene is drawn again from it. No rules: the server judges the play.
// Card codes are unique: two decks have two backs.
// The order of the hand is the player's own business: rearranged at will, sorted by runs or
// sets, never sent. It survives a reset of the table, and is kept between visits (see HandOrders).
// A game where what is on the table stays there passes `fixed`: only the cards of the hand move.

import { type Compare, sorted } from "./sorting";

export type Target =
    | { kind: "meld"; meld: number; index: number } // before the card at `index` of that meld, in its current order
    | { kind: "new" }
    | { kind: "hand"; index: number }; // before the card at `index` of the hand, in its current order

export interface LayoutOptions {
    /** An order kept from before. Cards it does not know (a fresh draw) go at the end, in the server's order. */
    stored?: string[] | null;
    /** The cards already on the table stay where they are. */
    fixed?: boolean;
}

export class Layout {
    table: string[][] = [];
    // every card the player was dealt into this turn, in their order, laid ones included (see hand)
    private order: string[];
    private readonly fixed: boolean;

    constructor(
        private readonly originalTable: string[][],
        private readonly originalHand: string[],
        options: LayoutOptions = {},
    ) {
        const remaining = [...originalHand];
        const known = (options.stored ?? []).filter((code) => {
            const index = remaining.indexOf(code);
            if (index < 0) {
                return false;
            }
            remaining.splice(index, 1);

            return true;
        });
        this.order = [...known, ...remaining];
        this.fixed = options.fixed ?? false;
        this.reset();
    }

    /** The table as dealt; the hand keeps the order the player gave it. */
    reset(): void {
        this.table = this.originalTable.map((meld) => [...meld]);
    }

    /** The cards in the hand, in the player's order: what they hold less what they have laid down. */
    get hand(): string[] {
        const laid = new Set(this.table.flat());

        return this.order.filter((card) => !laid.has(card));
    }

    /** The order to keep for next time. */
    get arrangement(): string[] {
        return [...this.order];
    }

    /** Whether the table differs from the one dealt by the server: a play needs at least that. */
    changed(): boolean {
        return JSON.stringify(this.table) !== JSON.stringify(this.originalTable);
    }

    /** A card of the player's own hand: it can go back there, which a card that was on the table cannot. */
    mine(code: string): boolean {
        return this.originalHand.includes(code);
    }

    /** Whether the card may be moved at all: always, unless the table is fixed and it was already on it. */
    movable(code: string): boolean {
        const from = this.find(code);

        return null !== from && (!this.fixed || "hand" === from.where || !this.originalTable.flat().includes(code));
    }

    sort(compare: Compare): void {
        this.order = sorted(this.order, compare);
    }

    /** Moves a card; false when it cannot go there (or is nowhere), and then nothing changes. */
    move(code: string, target: Target): boolean {
        const from = this.find(code);
        if (null === from || !this.movable(code) || ("hand" === target.kind && !this.mine(code))) {
            return false;
        }
        if ("meld" === target.kind && undefined === this.table[target.meld]) {
            return false;
        }
        if ("hand" === target.kind) {
            this.toHand(code, target.index, from);

            return true;
        }
        // the target meld by reference: taking the card out may empty (and drop) a meld before it
        const into = "meld" === target.kind ? this.table[target.meld]! : null;
        let index = "meld" === target.kind ? target.index : 0;
        if ("table" === from.where) {
            const meld = this.table[from.meld]!;
            meld.splice(from.index, 1);
            if (meld === into && from.index < index) {
                index -= 1;
            }
            this.table = this.table.filter((m) => m.length > 0 || m === into);
        }
        if (null !== into) {
            into.splice(Math.max(0, Math.min(index, into.length)), 0, code);
        } else {
            this.table.push([code]);
        }

        return true;
    }

    // Into the hand, before the card that is at `index` now (a card moved along the hand counts its old place).
    private toHand(code: string, index: number, from: { where: "hand" } | { where: "table"; meld: number; index: number }): void {
        const visible = this.hand;
        const at = visible.indexOf(code);
        const before = visible.filter((card) => card !== code)[at >= 0 && at < index ? index - 1 : index] ?? null;
        if ("table" === from.where) {
            this.table[from.meld]!.splice(from.index, 1);
            this.table = this.table.filter((m) => m.length > 0);
        }
        this.order = this.order.filter((card) => card !== code);
        this.order.splice(null === before ? this.order.length : this.order.indexOf(before), 0, code);
    }

    private find(code: string): { where: "hand" } | { where: "table"; meld: number; index: number } | null {
        if (this.hand.includes(code)) {
            return { where: "hand" };
        }
        for (const [meld, cards] of this.table.entries()) {
            const index = cards.indexOf(code);
            if (index >= 0) {
                return { where: "table", meld, index };
            }
        }

        return null;
    }
}
