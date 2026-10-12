// Live updates from the Mercure hub. EventSource cannot send a header, and the hub wants the subscriber token
// as a bearer here (no cookie across origins), so the stream is read with fetch. The updates carry only the
// game's revision: whoever listens re-fetches the view when it is newer than what it shows.

import type { GameUpdate, Realtime } from "./api";

/**
 * Listens until stopped; reconnects after a drop, with a growing pause. Returns the function that stops it.
 * `proxied`: the API goes through the dev server, and so must the hub (see ApiClient.proxied).
 */
export function subscribe(realtime: Realtime, onUpdate: (update: GameUpdate) => void, proxied: boolean): () => void {
    const controller = new AbortController();
    // the hub's address is absolute, built from the host the API saw: behind the dev proxy, that is the backend's
    const url = proxied ? (({ pathname, search }) => pathname + search)(new URL(realtime.url)) : realtime.url;

    void (async () => {
        let pause = 1000;
        while (!controller.signal.aborted) {
            try {
                const response = await fetch(url, {
                    headers: { Accept: "text/event-stream", Authorization: `Bearer ${realtime.token}` },
                    signal: controller.signal,
                });
                if (!response.ok || null === response.body) {
                    throw new Error(`Hub answered ${response.status}.`);
                }
                pause = 1000;
                await read(response.body, onUpdate);
            } catch (error) {
                if (controller.signal.aborted) {
                    return;
                }
                console.warn("realtime", error);
            }
            await new Promise((resolve) => setTimeout(resolve, pause));
            pause = Math.min(pause * 2, 30000);
        }
    })();

    return () => controller.abort();
}

// Server-sent events: blocks separated by a blank line, the payload on "data:" lines.
async function read(body: ReadableStream<Uint8Array>, onUpdate: (update: GameUpdate) => void): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
        const { value, done } = await reader.read();
        if (done) {
            return;
        }
        buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
            if ("" !== data) {
                try {
                    onUpdate(JSON.parse(data) as GameUpdate);
                } catch (error) {
                    console.warn("realtime: not an update", data, error);
                }
            }
        }
    }
}
