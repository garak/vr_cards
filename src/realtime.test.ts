import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameUpdate, Realtime } from "./api";
import { subscribe } from "./realtime";

const later = new Date(Date.now() + 3600_000).toISOString();
const earlier = new Date(Date.now() - 1000).toISOString();

const stream = (...updates: GameUpdate[]) =>
    new Response(updates.map((update) => `event: mercure\ndata: ${JSON.stringify(update)}\n\n`).join(""), { status: 200 });

const bearers = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers.Authorization);

describe("realtime", () => {
    const update: GameUpdate = { game: "g1", status: "playing", revision: "2" };
    let fetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("renews a token the hub refuses, after the pause", async () => {
        const renew = vi.fn(async (): Promise<Realtime> => ({ url: "https://hub.test/mercure?match=g1", token: "new", expires: later }));
        const onUpdate = vi.fn();
        fetch.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(stream(update));
        const stop = subscribe({ url: "https://hub.test/mercure?match=g1", token: "old", expires: later }, onUpdate, false, renew);

        await vi.advanceTimersByTimeAsync(0);
        expect(renew).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        stop();

        expect(renew).toHaveBeenCalledOnce();
        expect(bearers(fetch).slice(0, 2)).toEqual(["Bearer old", "Bearer new"]);
        expect(onUpdate).toHaveBeenCalledWith(update);
    });

    it("renews an expired token before connecting", async () => {
        const renew = vi.fn(async (): Promise<Realtime> => ({ url: "https://hub.test/mercure?match=g1", token: "new", expires: later }));
        fetch.mockResolvedValue(stream(update));
        const stop = subscribe({ url: "https://hub.test/mercure?match=g1", token: "old", expires: earlier }, vi.fn(), false, renew);

        await vi.advanceTimersByTimeAsync(0);
        stop();

        expect(bearers(fetch)[0]).toBe("Bearer new");
    });

    it("keeps the same token without renew, and with a date it cannot read", async () => {
        fetch.mockResolvedValue(new Response(null, { status: 401 }));
        const stop = subscribe({ url: "https://hub.test/mercure?match=g1", token: "demo", expires: "" }, vi.fn(), false);

        await vi.advanceTimersByTimeAsync(3000);
        stop();

        expect(new Set(bearers(fetch))).toEqual(new Set(["Bearer demo"]));
    });
});
