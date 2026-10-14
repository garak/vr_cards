// Live updates from the Mercure hub. EventSource cannot send a header, and the hub wants the subscriber token
// as a bearer here (no cookie across origins), so the stream is read with fetch. The updates carry only the
// game's revision: whoever listens re-fetches the view when it is newer than what it shows. The token expires, and
// the hub then closes the stream and answers 401: whoever can get a fresh one passes `renew`.

import type { GameUpdate, Realtime } from "./api";

/**
 * Listens until stopped; reconnects after a drop, with a growing pause. Returns the function that stops it.
 * `proxied`: the API goes through the dev server, and so must the hub (see ApiClient.proxied).
 * `renew`: a fresh token (and address), asked once the one in hand has expired or the hub refused it. Without it,
 * the stream keeps trying the same token.
 */
export function subscribe(
    realtime: Realtime,
    onUpdate: (update: GameUpdate) => void,
    proxied: boolean,
    renew?: () => Promise<Realtime>,
): () => void {
    const controller = new AbortController();
    // the hub's address is absolute, built from the host the API saw: behind the dev proxy, that is the backend's
    const address = (url: string) => (proxied ? (({ pathname, search }) => pathname + search)(new URL(url)) : url);

    void (async () => {
        let pause = 1000;
        let current = realtime;
        let refused = false;
        while (!controller.signal.aborted) {
            try {
                if (renew && (refused || expired(current))) {
                    current = await renew();
                    refused = false;
                }
                const response = await fetch(address(current.url), {
                    headers: { Accept: "text/event-stream", Authorization: `Bearer ${current.token}` },
                    signal: controller.signal,
                });
                // renewed on the next round, after the pause: a token refused again must not spin
                refused = 401 === response.status;
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

// an unreadable date (as in a demo) never expires
function expired(realtime: Realtime): boolean {
    return Date.parse(realtime.expires) <= Date.now();
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
