import { describe, expect, it } from "vitest";
import { Layout } from "./layout";
import { cardOrder } from "./sorting";

const { byRun, bySet } = cardOrder("A23456789TJQK");

const layout = () => new Layout([["Khr", "Qhr", "Jhr"], ["7cb", "7dr", "7sb"]], ["Ahr", "Thr", "2cb"]);

describe("Layout", () => {
    it("starts as dealt, unchanged", () => {
        const l = layout();
        expect(l.table).toEqual([["Khr", "Qhr", "Jhr"], ["7cb", "7dr", "7sb"]]);
        expect(l.hand).toEqual(["Ahr", "Thr", "2cb"]);
        expect(l.changed()).toBe(false);
    });

    it("lays a card from the hand into a meld, at the given place", () => {
        const l = layout();
        expect(l.move("Ahr", { kind: "meld", meld: 0, index: 0 })).toBe(true);
        expect(l.move("Thr", { kind: "meld", meld: 0, index: 4 })).toBe(true);
        expect(l.table[0]).toEqual(["Ahr", "Khr", "Qhr", "Jhr", "Thr"]);
        expect(l.hand).toEqual(["2cb"]);
        expect(l.changed()).toBe(true);
    });

    it("starts a new meld", () => {
        const l = layout();
        l.move("2cb", { kind: "new" });
        expect(l.table).toEqual([["Khr", "Qhr", "Jhr"], ["7cb", "7dr", "7sb"], ["2cb"]]);
    });

    it("moves a card within its meld, counting places as they were before the move", () => {
        const l = layout();
        l.move("Khr", { kind: "meld", meld: 0, index: 3 });
        expect(l.table[0]).toEqual(["Qhr", "Jhr", "Khr"]);
        l.move("Khr", { kind: "meld", meld: 0, index: 0 });
        expect(l.table[0]).toEqual(["Khr", "Qhr", "Jhr"]);
        expect(l.changed()).toBe(false);
    });

    it("drops a meld left empty, and still finds the target after it", () => {
        const l = new Layout([["Khr"], ["7cb", "7dr"]], []);
        l.move("Khr", { kind: "meld", meld: 1, index: 2 });
        expect(l.table).toEqual([["7cb", "7dr", "Khr"]]);
    });

    it("takes back a card of the hand, where it is dropped", () => {
        const l = layout();
        l.move("Thr", { kind: "new" });
        l.move("Ahr", { kind: "new" });
        expect(l.hand).toEqual(["2cb"]);
        expect(l.move("Thr", { kind: "hand", index: 1 })).toBe(true);
        expect(l.hand).toEqual(["2cb", "Thr"]);
        expect(l.table).toEqual([["Khr", "Qhr", "Jhr"], ["7cb", "7dr", "7sb"], ["Ahr"]]);
    });

    it("moves a card along the hand, counting places as they were before the move", () => {
        const l = layout();
        l.move("Ahr", { kind: "hand", index: 3 });
        expect(l.hand).toEqual(["Thr", "2cb", "Ahr"]);
        l.move("2cb", { kind: "hand", index: 0 });
        expect(l.hand).toEqual(["2cb", "Thr", "Ahr"]);
        l.move("Thr", { kind: "hand", index: 2 });
        expect(l.hand).toEqual(["2cb", "Thr", "Ahr"]);
        expect(l.changed()).toBe(false);
    });

    it("refuses a table card into the hand, and a card it does not know", () => {
        const l = layout();
        expect(l.move("Khr", { kind: "hand", index: 0 })).toBe(false);
        expect(l.move("9sb", { kind: "new" })).toBe(false);
        expect(l.move("Ahr", { kind: "meld", meld: 7, index: 0 })).toBe(false);
        expect(l.changed()).toBe(false);
    });

    it("resets to the dealt table, and keeps the order of the hand", () => {
        const l = layout();
        l.move("2cb", { kind: "hand", index: 0 });
        l.move("Ahr", { kind: "new" });
        l.reset();
        expect(l.changed()).toBe(false);
        expect(l.hand).toEqual(["2cb", "Ahr", "Thr"]);
    });

    it("starts from a stored order; cards it does not know go at the end, in the server's order", () => {
        const l = new Layout([], ["Ahr", "Thr", "2cb", "9sb"], { stored: ["2cb", "Kdr", "Ahr"] });
        expect(l.hand).toEqual(["2cb", "Ahr", "Thr", "9sb"]);
        expect(l.arrangement).toEqual(["2cb", "Ahr", "Thr", "9sb"]);
    });

    it("sorts the hand, laid cards and all", () => {
        const l = new Layout([], ["7cb", "wbr", "5hr", "6cr"]);
        l.move("6cr", { kind: "new" });
        l.sort(byRun);
        expect(l.hand).toEqual(["7cb", "5hr", "wbr"]);
        l.reset();
        expect(l.hand).toEqual(["6cr", "7cb", "5hr", "wbr"]);
        l.sort(bySet);
        expect(l.hand).toEqual(["5hr", "6cr", "7cb", "wbr"]);
    });

    it("keeps what was on the table there when fixed, the cards laid this turn still free", () => {
        const l = new Layout([["Khr", "Qhr", "Jhr"]], ["Thr", "9hr", "2cb"], { fixed: true });
        expect(l.movable("Khr")).toBe(false);
        expect(l.move("Khr", { kind: "new" })).toBe(false);
        expect(l.move("Thr", { kind: "meld", meld: 0, index: 3 })).toBe(true);
        expect(l.movable("Thr")).toBe(true);
        expect(l.move("Thr", { kind: "hand", index: 0 })).toBe(true);
        expect(l.table).toEqual([["Khr", "Qhr", "Jhr"]]);
        expect(l.hand).toEqual(["Thr", "9hr", "2cb"]);
    });
});
