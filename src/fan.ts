// Cards held in a fan: the player's own hand, held up over the near edge, and the backs (or, once a hand is over,
// the faces) of the other players' hands at the table's edges.

import * as THREE from "three";
import { CARD_HEIGHT, CARD_WIDTH, backMesh, cardMesh } from "./cards";
import { clear } from "./scene";

export class HandFan {
    readonly group = new THREE.Group();
    private angles: number[] = [];

    /** `radius`: of the arc the cards' middles lie on. `depth`: how far off the fan's plane a card still counts as over it. */
    constructor(
        readonly radius = 0.5,
        readonly depth = 0.08,
    ) {}

    /**
     * Lays the cards out, replacing the ones there were: the wider the hand, the tighter the angle between cards.
     * Neighbours linked (they could be a meld together) sit closer, so the hand reads as the melds it holds.
     */
    hold(codes: string[], links: boolean[] = []): THREE.Group[] {
        clear(this.group);
        const gaps = codes.map((_, i): number => (0 === i ? 0 : links[i] ? 0.6 : 1));
        const step = Math.min(0.075, 1.1 / Math.max(gaps.reduce((sum, gap) => sum + gap, 0), 1));
        let angle = 0;
        const angles = gaps.map((gap) => (angle += gap * step));
        const middle = ((angles[0] ?? 0) + (angles.at(-1) ?? 0)) / 2;
        this.angles = angles.map((a) => a - middle);

        return codes.map((code, i) => {
            const a = this.angles[i] ?? 0;
            const card = cardMesh(code);
            card.position.set(Math.sin(a) * this.radius, Math.cos(a) * this.radius - this.radius, i * 0.0006);
            card.rotation.z = -a;
            this.group.add(card);

            return card;
        });
    }

    /**
     * Whether a point (in the fan's own space) is over the hand: within the fan's outline, with a margin, and close to
     * its plane. The whole fan counts, its low ends included: they hang well below the cards' middle.
     */
    over(at: THREE.Vector3): boolean {
        const xs = this.angles.map((a) => Math.sin(a) * this.radius);
        const ys = this.angles.map((a) => Math.cos(a) * this.radius - this.radius);
        const margin = 0.03;
        const left = Math.min(-0.1, ...xs) - CARD_WIDTH / 2 - margin;
        const right = Math.max(0.1, ...xs) + CARD_WIDTH / 2 + margin;
        const bottom = Math.min(0, ...ys) - CARD_HEIGHT / 2 - margin;
        const top = CARD_HEIGHT / 2 + margin;

        return at.x > left && at.x < right && at.y > bottom && at.y < top && Math.abs(at.z) < this.depth;
    }

    /** The angle of a point of the fan (in its own space), as a card there would be turned. */
    angle(at: THREE.Vector3): number {
        return Math.atan2(at.x, at.y + this.radius);
    }

    /** Where along the hand a point of it falls (in the fan's own space): before the first card whose middle is past it. */
    index(at: THREE.Vector3): number {
        const angle = this.angle(at);

        return this.angles.filter((card) => card < angle).length;
    }

    /** A point of the world in the fan's own space. */
    local(world: THREE.Vector3): THREE.Vector3 {
        return this.group.worldToLocal(world.clone());
    }
}

/**
 * A fan like the player's own, smaller in its spread: it is read from across the table, not held. Backs ("r",
 * "b") while the hand is on; card codes, face up, once it is over.
 */
export function heldFan(cards: string[], faceUp = false): THREE.Group {
    const fan = new THREE.Group();
    const radius = 0.35;
    const step = Math.min(0.06, 0.8 / Math.max(cards.length, 1));
    cards.forEach((code, i) => {
        const angle = (i - (cards.length - 1) / 2) * step;
        const card = faceUp ? cardMesh(code) : backMesh(code);
        // a face up card is for looking at, not for taking
        delete card.userData.code;
        card.position.set(Math.sin(angle) * radius, Math.cos(angle) * radius - radius, i * 0.0006);
        card.rotation.z = -angle;
        fan.add(card);
    });

    return fan;
}
