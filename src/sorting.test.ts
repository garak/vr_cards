import { describe, expect, it } from "vitest";
import { type MeldRules, cardOrder, linked, sorted } from "./sorting";

describe("sorting", () => {
    const aceLow = cardOrder("A23456789TJQK");
    const aceHigh = cardOrder("23456789TJQKA");

    it("sorts by runs: suit, then rank, second copies after the first ones, jokers last", () => {
        expect(sorted(["wbr", "7dr", "5db", "4dr", "5dr", "6db", "Acb"], aceLow.byRun)).toEqual(["Acb", "4dr", "5db", "6db", "7dr", "5dr", "wbr"]);
    });

    it("sorts by sets: rank, then suit, second copies after the first ones", () => {
        expect(sorted(["7sb", "wrb", "7hr", "7cr", "7hb", "2db"], aceLow.bySet)).toEqual(["2db", "7cr", "7hr", "7sb", "7hb", "wrb"]);
    });

    it("puts the ace where the game's rank order has it", () => {
        expect(sorted(["Kcr", "Acr", "2cr"], aceLow.byRun)).toEqual(["Acr", "2cr", "Kcr"]);
        expect(sorted(["Kcr", "Acr", "2cr"], aceHigh.byRun)).toEqual(["2cr", "Kcr", "Acr"]);
    });

    it("links neighbours the game's rules say could be a meld, with enough regular cards", () => {
        // a toy game: sets of one rank, jokers standing in
        const rules: MeldRules = {
            isRegular: (code) => !code.startsWith("w"),
            couldMeld: (codes) => new Set(codes.filter((code) => !code.startsWith("w")).map((code) => code[0])).size <= 1,
        };
        expect(linked(["7hr", "7sb", "wbr", "Acb", "wrb", "8hr"], rules)).toEqual([false, true, true, false, false, false]);
        expect(linked(["wbr", "wrb", "7hr"], rules)).toEqual([false, false, false]);
    });
});
