import { describe, expect, it } from "vitest";
import { arrangeBacks } from "./backs";

describe("arrangeBacks", () => {
    it("shows as many backs of each deck as the hand holds", () => {
        const backs = arrangeBacks("game.player", 8, 6);
        expect(backs).toHaveLength(14);
        expect(backs.filter((back) => "r" === back)).toHaveLength(8);
        expect(backs.filter((back) => "b" === back)).toHaveLength(6);
    });

    it("mixes them the same way every time for the same hand, another way for another one", () => {
        expect(arrangeBacks("game.player", 8, 6)).toEqual(arrangeBacks("game.player", 8, 6));
        const others = [arrangeBacks("game.other", 8, 6), arrangeBacks("game.player", 9, 6)].map((b) => b.join(""));
        expect(others).not.toContain(arrangeBacks("game.player", 8, 6).join(""));
    });

    it("mixes them, rather than putting each deck together", () => {
        const backs = arrangeBacks("game.player", 7, 7).join("");
        expect(backs).not.toBe("rrrrrrrbbbbbbb");
        expect(backs).not.toBe("bbbbbbbrrrrrrr");
    });

    it("shows nothing for an empty hand", () => {
        expect(arrangeBacks("game.player", 0, 0)).toEqual([]);
    });
});
