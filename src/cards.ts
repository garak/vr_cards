// Card meshes. Faces are SVGs served by the app under `cards/` (e.g. RevK's playing cards, CC0, plus jokers),
// rasterised once per code into a canvas: a texture straight from an SVG would be blurry at a headset's reading
// distance.

import * as THREE from "three";

/** A bit over a real card (63 × 88 mm): the 3S display is not sharp enough for the real size across a table. */
export const CARD_WIDTH = 0.075;
export const CARD_HEIGHT = CARD_WIDTH * 1.4;

const PIXELS = { width: 400, height: 560 };

/** Card code (rank, suit, back: "Khr", "Tcb", "wbr") → the SVG under `cards/`. */
function file(code: string): string {
    if ("w" === code[0]) {
        return "b" === code[1] ? "2J" : "1J";
    }

    return code.slice(0, 2).toUpperCase();
}

const faces = new Map<string, THREE.Texture>();
let anisotropy = 1;

export function setAnisotropy(value: number): void {
    anisotropy = value;
}

// Images on their way. Nothing else points at an image being loaded for a canvas, and a browser may collect it
// before it calls back: the face would stay blank for good. So each one is held here until it is drawn.
const loading = new Set<HTMLImageElement>();
const ATTEMPTS = 3;
// a load that has said nothing by then is tried again, as one that failed
const STALL_MS = 15000;

function texture(svg: string): THREE.Texture {
    const cached = faces.get(svg);
    if (undefined !== cached) {
        return cached;
    }
    const canvas = document.createElement("canvas");
    canvas.width = PIXELS.width;
    canvas.height = PIXELS.height;
    // readable at once, and if the picture never comes: never a black card
    placeholder(canvas, svg);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = anisotropy;
    load(svg, canvas, map, 1);
    faces.set(svg, map);

    return map;
}

function load(svg: string, canvas: HTMLCanvasElement, map: THREE.Texture, attempt: number): void {
    const image = new Image();
    loading.add(image);
    let settled = false;
    const settle = (): boolean => {
        if (settled) {
            return false;
        }
        settled = true;
        clearTimeout(stall);
        loading.delete(image);

        return true;
    };
    const retry = (): void => {
        if (settle() && attempt < ATTEMPTS) {
            setTimeout(() => load(svg, canvas, map, attempt + 1), 1000 * attempt);
        }
    };
    const stall = setTimeout(retry, STALL_MS);
    image.src = `${import.meta.env.BASE_URL}cards/${svg}.svg${attempt > 1 ? `?attempt=${attempt}` : ""}`;
    // decoded before it is drawn: an SVG drawn as soon as it has loaded may come out empty (Firefox)
    image
        .decode()
        .catch(() => {
            // some browsers will not decode what they did load: draw what there is, if there is something
            if (!image.complete || 0 === image.naturalWidth) {
                throw new Error(`card ${svg} did not load`);
            }
        })
        .then(() => {
            if (!settle()) {
                return;
            }
            const context = canvas.getContext("2d");
            context?.clearRect(0, 0, PIXELS.width, PIXELS.height);
            context?.drawImage(image, 0, 0, PIXELS.width, PIXELS.height);
            map.needsUpdate = true;
        })
        .catch(retry);
}

const SUITS: Record<string, { symbol: string; red: boolean }> = {
    C: { symbol: "♣", red: false },
    D: { symbol: "♦", red: true },
    H: { symbol: "♥", red: true },
    S: { symbol: "♠", red: false },
};

// What a card looks like until its picture is in: white, with its rank and suit; a back in its deck's colour.
function placeholder(canvas: HTMLCanvasElement, svg: string): void {
    const context = canvas.getContext("2d");
    if (null === context) {
        return;
    }
    const { width, height } = canvas;
    context.beginPath();
    context.roundRect(4, 4, width - 8, height - 8, 28);
    if (svg.endsWith("B")) {
        context.fillStyle = "1B" === svg ? "#2f55a4" : "#b03a3a";
        context.fill();

        return;
    }
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "#9a9a9a";
    context.stroke();
    const joker = svg.endsWith("J");
    const suit = SUITS[svg.charAt(1)];
    // 1J is the red joker, 2J the black one (see file)
    context.fillStyle = (joker ? "1J" === svg : suit?.red) ? "#c8102e" : "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 96px system-ui, sans-serif";
    context.fillText(joker ? "★" : "T" === svg[0] ? "10" : svg.charAt(0), 74, 84);
    context.font = "88px system-ui, sans-serif";
    context.fillText(joker ? "" : (suit?.symbol ?? ""), 74, 176);
    context.font = joker ? "700 72px system-ui, sans-serif" : "240px system-ui, sans-serif";
    context.fillText(joker ? "JOKER" : (suit?.symbol ?? ""), width / 2, height / 2 + 30);
}

const geometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);

/** The back of the deck a card belongs to: "r" or "b". Red back is 2B.svg, blue 1B.svg. */
export function backTexture(back: string): THREE.Texture {
    return texture("r" === back ? "2B" : "1B");
}

/**
 * A card lying face up: a group with the face on +Z and the back on −Z, so that it can be turned over in a hand.
 * The code is kept in userData, which is what a play is written with.
 */
export function cardMesh(code: string): THREE.Group {
    const card = new THREE.Group();
    card.name = code;
    card.userData.code = code;
    const face = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture(file(code)) }));
    const back = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: backTexture(code[2] ?? "r") }));
    back.rotation.y = Math.PI;
    card.add(face, back);

    return card;
}

/** A back alone, facing +Z, with the same size as a card: the top of the stock, a card in an opponent's hand. */
export function backMesh(back: string): THREE.Mesh {
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: backTexture(back) }));
}

export function stockMesh(back: string): THREE.Mesh {
    const mesh = backMesh(back);
    mesh.name = "stock";

    return mesh;
}
