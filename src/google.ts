// The quick sign-in: Google Identity Services on the flat page, before entering the table.
// It hands over an ID token for the backend's web client id, which its `/auth/google` accepts as it is.
// The page's origin (the dev server's, in development) must be among the client's authorised JavaScript origins.

interface CredentialResponse {
    credential: string;
}

interface GoogleIdentity {
    accounts: {
        id: {
            initialize(options: { client_id: string; callback: (response: CredentialResponse) => void; auto_select?: boolean }): void;
            renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
        };
    };
}

declare global {
    interface Window {
        google?: GoogleIdentity;
    }
}

let loading: Promise<GoogleIdentity> | null = null;

function load(): Promise<GoogleIdentity> {
    loading ??= new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.onload = () => (undefined === window.google ? reject(new Error("Google sign-in did not load.")) : resolve(window.google));
        script.onerror = () => reject(new Error("Google sign-in could not be reached."));
        document.head.append(script);
    });

    return loading;
}

/** Shows Google's button in the given element; the promise is the ID token, once the player has picked an account. */
export async function googleIdToken(parent: HTMLElement, clientId: string): Promise<string> {
    const google = await load();

    return new Promise((resolve) => {
        google.accounts.id.initialize({ client_id: clientId, callback: (response) => resolve(response.credential) });
        google.accounts.id.renderButton(parent, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with" });
    });
}
