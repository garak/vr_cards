// A client for a card game's JSON API (see the README for the contract): the bearer token kept in the browser, the
// error envelope, the sign-ins (Google, pairing code, a dev login) and the standings. Each game adds its own calls
// through `call`, and its own game view as the `G` of ApiError.

export interface Player {
    id: string;
    name: string;
    email?: string;
    avatar: string | null;
}

export interface Realtime {
    url: string;
    token: string;
    expires: string;
}

/** What the hub says when a game moves on: only its revision, the client re-fetches the view. */
export interface GameUpdate {
    game: string;
    status: string;
    revision: string;
}

export interface Pairing {
    code: string;
    pairing: string;
    verify: string;
    expires: string;
    interval: number;
}

export interface DevIdentity {
    identifier: string;
    label: string;
}

export interface Stats {
    played: number;
    won: number;
    tied: number;
    lost: number;
    best: number | null;
    average: number | null;
}

export interface Podium {
    place: number;
    player: Player;
    played: number;
    won: number;
    lost: number;
    average: number;
}

/** The error envelope every failed call answers with. On a 409 the body may also carry the current game view. */
export class ApiError<G = unknown> extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly game: G | null = null,
    ) {
        super(message);
    }
}

export class ApiClient {
    private token: string | null;

    /**
     * `base`: where the API lives as the browser sees it, relative behind the dev server's proxy.
     * `tokenKey`: where the token is kept in this browser.
     */
    constructor(
        readonly base: string,
        private readonly tokenKey: string,
    ) {
        this.token = this.storedToken();
    }

    /** Whether the API goes through the dev server's proxy: the hub's absolute address must then too. */
    get proxied(): boolean {
        return !/^https?:/.test(this.base);
    }

    storedToken(): string | null {
        try {
            return localStorage.getItem(this.tokenKey);
        } catch {
            return null;
        }
    }

    private keep(token: string | null): void {
        this.token = token;
        try {
            if (null === token) {
                localStorage.removeItem(this.tokenKey);
            } else {
                localStorage.setItem(this.tokenKey, token);
            }
        } catch {
            // private mode: the token lives as long as the page
        }
    }

    async call<T>(method: string, path: string, body?: unknown): Promise<T> {
        const headers: Record<string, string> = { Accept: "application/json" };
        if (null !== this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        if (undefined !== body) {
            headers["Content-Type"] = "application/json";
        }
        const response = await fetch(this.base + path, { method, headers, body: undefined === body ? undefined : JSON.stringify(body) });
        if (204 === response.status) {
            return undefined as T;
        }
        const json = await response.json().catch(() => null);
        if (!response.ok) {
            if (401 === response.status) {
                this.keep(null);
            }
            const error = json?.error ?? { code: "http_" + response.status, message: response.statusText };
            throw new ApiError(response.status, error.code, error.message, json?.game ?? null);
        }

        return json as T;
    }

    /** Google's ID token for the backend's web client, as it is. `device` names the token among the player's. */
    async signIn(idToken: string, device?: string): Promise<Player> {
        const answer = await this.call<{ token: string; player: Player }>("POST", "/auth/google", undefined === device ? { idToken } : { idToken, device });
        this.keep(answer.token);

        return answer.player;
    }

    /** A code for the player to confirm on the backend's site, for where Google's sign-in cannot run (the packaged app). */
    startPairing(device: string): Promise<Pairing> {
        return this.call<Pairing>("POST", "/auth/pair", { device });
    }

    /** The player once the code is confirmed, null while it waits. A 404 (ApiError) once it has expired. */
    async pollPairing(pairing: string): Promise<Player | null> {
        const answer = await this.call<{ status: "pending" } | { token: string; player: Player }>("POST", "/auth/pair/token", { pairing });
        if (!("token" in answer)) {
            return null;
        }
        this.keep(answer.token);

        return answer.player;
    }

    // The backend's dev login (`/_dev/login`), development only: who can be signed in as, without Google.
    // Same origin as the page, through the dev server's proxy, so the session cookie it sets comes back.
    async devIdentities(): Promise<DevIdentity[]> {
        const response = await fetch("/_dev/login", { headers: { Accept: "application/json" } }).catch(() => null);
        if (null === response || !response.ok || !response.headers.get("Content-Type")?.includes("json")) {
            return [];
        }

        return ((await response.json()) as { identities?: DevIdentity[] }).identities ?? [];
    }

    /** Signs in as a player through the dev login, then turns that session into an API token. */
    async devSignIn(identifier: string): Promise<Player> {
        const login = await fetch(`/_dev/login/${encodeURIComponent(identifier)}`, { headers: { Accept: "application/json" } });
        if (!login.ok) {
            throw new Error(`The dev login refused ${identifier} (${login.status}).`);
        }
        const response = await fetch("/_dev/api-token", { method: "POST", headers: { Accept: "application/json" } });
        const answer = (await response.json()) as { token: string; player: Player } & { error?: { message: string } };
        if (!response.ok) {
            throw new Error(answer.error?.message ?? `No API token (${response.status}).`);
        }
        this.keep(answer.token);

        return answer.player;
    }

    async signOut(): Promise<void> {
        await this.call<void>("DELETE", "/auth/token").catch(() => undefined);
        this.keep(null);
    }

    me(): Promise<Player> {
        return this.call<Player>("GET", "/me");
    }

    leaderboard<S extends Stats = Stats>(): Promise<{ standings: { place: number; player: Player; stats: S }[] }> {
        return this.call("GET", "/leaderboard");
    }

    hallOfFame(): Promise<{ months: { month: string; podium: Podium[] }[] }> {
        return this.call("GET", "/hall-of-fame");
    }
}
