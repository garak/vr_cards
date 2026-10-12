// Putting a hand in order, by runs or by sets, and which neighbours could be a meld together, for the fan to draw
// them close. Card codes: rank, suit, back ("Khr"); "w" for a joker ("wbr"). What a meld is, and where the ace
// goes, is each game's own: it hands its rank order to `cardOrder` and its meld test to `linked`.

// Two decks are in play, so the same card may be in the hand twice (with another back): copy is 0 for the first
// one met, 1 for the second.
export interface SortKey {
    code: string;
    copy: number;
}

export type Compare = (a: SortKey, b: SortKey) => number;

export function sorted(codes: string[], compare: Compare): string[] {
    const seen = new Map<string, number>();

    return codes
        .map((code): SortKey => {
            const copy = seen.get(code.slice(0, 2)) ?? 0;
            seen.set(code.slice(0, 2), copy + 1);

            return { code, copy };
        })
        .sort(compare)
        .map(({ code }) => code);
}

export const SUITS = "cdhs";

export function isJoker(code: string): boolean {
    return code.startsWith("w");
}

/** The two usual orders, by runs and by sets, for a game's rank order ("A23456789TJQK" with the ace low). */
export function cardOrder(ranks: string): { byRun: Compare; bySet: Compare } {
    const byRank = (a: string, b: string): number | null => {
        const rank = ranks.indexOf(a.charAt(0)) - ranks.indexOf(b.charAt(0));

        return 0 !== rank ? rank : null;
    };

    return {
        // By suit, then by rank: the cards of a run come together. A second copy cannot go in the same run, so second
        // copies come after the first ones, making another run of the suit: 4♦ 5♦ 6♦ 7♦ 5♦, not 4♦ 5♦ 5♦ 6♦ 7♦.
        byRun: (a, b) => jokersLast(a.code, b.code) ?? bySuit(a.code, b.code) ?? byCopy(a, b) ?? byRank(a.code, b.code) ?? 0,
        // By rank, then by suit: the cards of a set come together. Second copies after the first ones.
        bySet: (a, b) => jokersLast(a.code, b.code) ?? byRank(a.code, b.code) ?? byCopy(a, b) ?? bySuit(a.code, b.code) ?? 0,
    };
}

// Each step of a comparison: null when it cannot tell the two apart, so that the next one is asked.
function byCopy(a: SortKey, b: SortKey): number | null {
    return a.copy !== b.copy ? a.copy - b.copy : null;
}

function jokersLast(a: string, b: string): number | null {
    const jokerA = isJoker(a);
    const jokerB = isJoker(b);

    return jokerA || jokerB ? Number(jokerA) - Number(jokerB) : null;
}

function bySuit(a: string, b: string): number | null {
    const suit = SUITS.indexOf(a.charAt(1)) - SUITS.indexOf(b.charAt(1));

    return 0 !== suit ? suit : null;
}

export interface MeldRules {
    /** Whether these cards, in this order, could still become a meld. */
    couldMeld(codes: string[]): boolean;
    /** A card that makes a group: wildcards join one, never make it. */
    isRegular(code: string): boolean;
}

/**
 * For each card of the hand, whether it is linked to the one before: neighbours that could be a meld together,
 * with at least two regular cards. The fan draws linked cards close.
 */
export function linked(codes: string[], rules: MeldRules, minGroup = 2): boolean[] {
    const links = codes.map(() => false);
    let start = 0;
    while (start < codes.length) {
        let end = start + 1;
        while (end < codes.length && rules.couldMeld(codes.slice(start, end + 1))) {
            end++;
        }
        if (codes.slice(start, end).filter(rules.isRegular).length >= minGroup) {
            for (let i = start + 1; i < end; i++) {
                links[i] = true;
            }
        }
        start = end;
    }

    return links;
}
