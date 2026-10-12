// Putting the table on a real surface, and keeping it there. While placing, the table follows the surface the
// player looks at (a hit test from the viewer), turned to face them; a pinch or a trigger sets it down. It is
// then held by an anchor, which the Quest browser can keep across sessions: the next time, the cards are
// back on the same piece of furniture without asking.
// No hit test (an opaque VR session, a laptop): the table stays where it starts, and none of this shows.

import * as THREE from "three";

const UP = new THREE.Vector3(0, 1, 0);

export class Placement {
    placing = false;
    private session: XRSession | null = null;
    private source: XRHitTestSource | null = null;
    private anchor: XRAnchor | null = null;
    private requested = false;
    private readonly position = new THREE.Vector3();
    private readonly quaternion = new THREE.Quaternion();

    /** `key`: where the anchor's handle is kept in this browser, one per game: each has its own table. */
    constructor(
        private readonly target: THREE.Object3D,
        private readonly onChange: () => void,
        private readonly key: string,
    ) {}

    /** Whether the table can be moved to a surface in this session. */
    get available(): boolean {
        return null !== this.source;
    }

    async start(session: XRSession): Promise<void> {
        this.session = session;
        try {
            const viewer = await session.requestReferenceSpace("viewer");
            this.source = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
        } catch {
            this.source = null;
        }
        const handle = this.stored();
        if (null !== handle && undefined !== session.restorePersistentAnchor) {
            try {
                this.anchor = await session.restorePersistentAnchor(handle);
                this.setPlacing(false);

                return;
            } catch {
                // gone (another room, cleared data): ask again
                this.store(null);
            }
        }
        this.setPlacing(null !== this.source);
    }

    stop(): void {
        this.source?.cancel();
        this.source = null;
        this.anchor = null;
        this.session = null;
        this.setPlacing(false);
    }

    /** Sets the table down where it is now: on the next frame, which holds the hit test to anchor it with. */
    place(): void {
        if (this.placing) {
            this.requested = true;
        }
    }

    /** Lets go of the anchor, and asks for a surface again. */
    async move(): Promise<void> {
        const handle = this.stored();
        this.store(null);
        if (null !== handle && undefined !== this.session?.deletePersistentAnchor) {
            await this.session.deletePersistentAnchor(handle).catch(() => undefined);
        } else {
            this.anchor?.delete();
        }
        this.anchor = null;
        this.setPlacing(null !== this.source);
    }

    update(frame: XRFrame, space: XRReferenceSpace): void {
        if (null !== this.anchor) {
            // an anchor the headset has lost track of leaves the table where it was last seen
            const pose = frame.trackedAnchors?.has(this.anchor) === false ? undefined : frame.getPose(this.anchor.anchorSpace, space);
            if (pose) {
                const { position, orientation } = pose.transform;
                this.target.position.set(position.x, position.y, position.z);
                this.target.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
            }

            return;
        }
        if (!this.placing || null === this.source) {
            return;
        }
        const viewer = frame.getViewerPose(space);
        const hit = frame
            .getHitTestResults(this.source)
            .map((result) => result.getPose(space))
            .find((pose) => {
                const o = pose?.transform.orientation;
                // a surface facing up (a table, the floor), not a wall
                return undefined !== o && UP.clone().applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w)).y > 0.9;
            });
        if (!hit || !viewer) {
            return;
        }
        const at = hit.transform.position;
        const eye = viewer.transform.position;
        // the near edge towards the player
        this.position.set(at.x, at.y, at.z);
        this.quaternion.setFromAxisAngle(UP, Math.atan2(eye.x - at.x, eye.z - at.z));
        this.target.position.copy(this.position);
        this.target.quaternion.copy(this.quaternion);
        if (!this.requested) {
            return;
        }
        this.requested = false;
        this.setPlacing(false);
        const q = this.quaternion;
        frame
            .createAnchor?.(new XRRigidTransform(at, { x: q.x, y: q.y, z: q.z, w: q.w }), space)
            .then((anchor) => {
                this.anchor = anchor;
                return anchor.requestPersistentHandle?.().then((handle) => this.store(handle));
            })
            // no anchors: the table stays where it was set down, for this session
            .catch(() => undefined);
    }

    private setPlacing(placing: boolean): void {
        this.placing = placing;
        this.requested = false;
        this.onChange();
    }

    private stored(): string | null {
        try {
            return localStorage.getItem(this.key);
        } catch {
            return null;
        }
    }

    private store(handle: string | null): void {
        try {
            if (null === handle) {
                localStorage.removeItem(this.key);
            } else {
                localStorage.setItem(this.key, handle);
            }
        } catch {
            // the anchor lasts as long as the session
        }
    }
}
