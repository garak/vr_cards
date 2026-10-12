// The flat page's sign-in section, the same for every game: Google's button when there is a client id, a pairing
// code that works anywhere (the packaged app included), and in development a button per player of the backend's
// dev login. It expects the markup of the starter page: #google, #pair, #pairing, #pair-url, #pair-code, #pair-cancel,
// #dev-signin, #dev-identities.

import type { ApiClient, Player } from "./api";
import { googleIdToken } from "./google";

export interface SignInOptions {
    /** The web OAuth client id of the backend; empty for a build that signs in with codes only. */
    googleClientId: string;
    /** What the backend shows for this device when the browser does not name a headset. */
    appName: string;
    /** Whether to offer the dev login's players: the dev server only. */
    dev: boolean;
    signedIn(player: Player): void;
    failed(error: unknown): void;
    say(text: string): void;
    /** What to say when a code runs out; English by default. */
    codeExpired?: string;
}

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

export class SignIn {
    private stopPairing: () => void = () => undefined;

    constructor(
        private readonly client: ApiClient,
        private readonly options: SignInOptions,
    ) {
        $("pair").addEventListener("click", () => void this.withCode().catch(options.failed));
        $("pair-cancel").addEventListener("click", () => this.stopPairing());
    }

    /** Offers every way in; the promise settles once Google's button has been used, or at once without it. */
    async offer(): Promise<void> {
        if (this.options.dev) {
            void this.devPlayers();
        }
        $("google").hidden = "" === this.options.googleClientId;
        if ("" === this.options.googleClientId) {
            return;
        }
        try {
            const player = await this.client.signIn(await googleIdToken($("google"), this.options.googleClientId), deviceName(this.options.appName));
            this.done(player);
        } catch (error) {
            this.options.failed(error);
        }
    }

    private done(player: Player): void {
        this.stopPairing();
        this.options.signedIn(player);
    }

    // A code to confirm on the backend's site, from a phone or a computer already signed in there. The page polls until it
    // is confirmed, cancelled or expired.
    private async withCode(): Promise<void> {
        this.stopPairing();
        const pairing = await this.client.startPairing(deviceName(this.options.appName));
        let stopped = false;
        this.stopPairing = () => {
            stopped = true;
            $("pairing").hidden = true;
            $("pair").hidden = false;
        };
        $("pair-url").textContent = pairing.verify.replace(/^https?:\/\//, "");
        $("pair-code").textContent = pairing.code;
        $("pairing").hidden = false;
        $("pair").hidden = true;
        const expires = Date.parse(pairing.expires);
        while (!stopped) {
            await new Promise((resolve) => setTimeout(resolve, pairing.interval * 1000));
            if (stopped) {
                return;
            }
            if (Date.now() > expires) {
                this.stopPairing();
                this.options.say(this.options.codeExpired ?? "The code expired: ask for a new one.");

                return;
            }
            try {
                const player = await this.client.pollPairing(pairing.pairing);
                if (null !== player) {
                    this.done(player);
                }
            } catch (error) {
                this.stopPairing();
                this.options.failed(error);
            }
        }
    }

    // A button per player the backend's dev login offers: no Google account needed.
    private async devPlayers(): Promise<void> {
        const buttons = (await this.client.devIdentities()).map((identity) => {
            const button = document.createElement("button");
            button.textContent = identity.label;
            button.title = identity.identifier;
            button.addEventListener("click", () => {
                this.client.devSignIn(identity.identifier).then((player) => this.done(player)).catch(this.options.failed);
            });

            return button;
        });
        $("dev-identities").replaceChildren(...buttons);
        $("dev-signin").hidden = 0 === buttons.length;
    }
}

/** What the player sees on the backend's site before confirming: the headset by name when the browser says it. */
export function deviceName(fallback: string): string {
    const quest = /Quest[\w ]*/.exec(navigator.userAgent)?.[0].trim();

    return quest ? `Meta ${quest}` : fallback;
}
