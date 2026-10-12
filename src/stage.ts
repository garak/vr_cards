// The table in the room, whatever is played on it: the renderer and its XR session, the felt set down on a real
// surface (see Placement), the player's hand held up over the near edge, the status board, and every way of taking
// and letting go of a card: a pinch right on it, a controller's ray or a hand's from afar, the mouse on the flat
// page. Shown in the flat page too (orbit with the mouse), so most of it can be checked without the headset.
// The game puts its cards and controls on `table`, and is told what the player picked, took and let go.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { CARD_HEIGHT, CARD_WIDTH, setAnisotropy } from "./cards";
import { HandFan } from "./fan";
import { Label, type Line } from "./label";
import { Placement } from "./placement";
import { control, dispose, felt } from "./scene";
import { sounds } from "./sounds";

export const ACCENT = "#f2c14e";
// A card dragged with the mouse slides this high over the felt.
const DRAG_HEIGHT = 0.03;

/** Where a card was let go: along the hand, before the card at `index`, or at a point of the table (its own space). */
export type Drop = { kind: "hand"; index: number } | { kind: "table"; at: THREE.Vector3 };

export interface StageDelegate {
    /** What the rays can hit: groups of cards (userData.code) and controls (see `control`). */
    pickables(): THREE.Object3D[];
    /** The cards a pinch may take right between the fingers. */
    cards(): THREE.Object3D[];
    /** Whether the player may take this card now. */
    canTake(card: THREE.Object3D): boolean;
    /** A control was picked, by its name. "standings" included; "move" the stage handles itself. */
    activate(name: string): void;
    /** A card taken was let go (the card is gone already): null when it went nowhere, and goes back where it was. */
    release(code: string, drop: Drop | null): void;
}

/** What the stage itself writes on the table, for a game in another language. English by default. */
export interface StageTexts {
    placingTitle: string;
    placingHint: string;
    standings: string;
    moveTable: string;
}

const TEXTS: StageTexts = {
    placingTitle: "Where is your table?",
    placingHint: "look at it, then pinch or pull the trigger",
    standings: "Standings",
    moveTable: "Move table",
};

export interface StageOptions {
    /** Metres, in the floor-level space the session starts in, where the table stands when not set on a surface. */
    position: THREE.Vector3;
    felt: { width: number; depth: number; color: string };
    /** Where the hand floats, over the near edge. */
    hand: THREE.Vector3;
    /** Where the table's anchor is kept in this browser (see Placement). */
    anchorKey: string;
    background?: string;
    /** Where the flat page looks from; by default a seat at the near edge, eyes 66 cm over the felt. */
    camera?: THREE.Vector3;
    texts?: Partial<StageTexts>;
}

export class Stage {
    readonly table = new THREE.Group();
    readonly hand = new HandFan();
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene = new THREE.Scene();
    private readonly camera: THREE.PerspectiveCamera;
    private readonly orbit: OrbitControls;
    private readonly hud: Label;
    private readonly standingsButton = control(new Label(0.17, 0.05), "standings");
    private readonly moveButton = control(new Label(0.17, 0.05), "move");
    private readonly panel = new Label(0.5, 0.66);
    private readonly placement: Placement;
    private readonly inputs = new Map<THREE.Object3D, XRInputSource>();
    private hudLines: Line[] = [];
    private hudHighlight = false;
    private readonly raycaster = new THREE.Raycaster();
    private readonly grabs = new Map<THREE.Object3D, THREE.Object3D>();
    // the card the mouse (or the flat page's pointer, in the headset) is dragging
    private dragged: THREE.Object3D | null = null;
    private readonly background: THREE.Color;
    private readonly texts: StageTexts;

    constructor(
        container: HTMLElement,
        private readonly delegate: StageDelegate,
        private readonly options: StageOptions,
    ) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType("local-floor");
        container.append(this.renderer.domElement);
        setAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

        this.camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 20);
        this.camera.position.copy(options.camera ?? new THREE.Vector3(options.position.x, options.position.y + 0.66, options.position.z + options.felt.depth / 2 + 0.65));
        this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
        this.orbit.target.copy(options.position);
        this.orbit.update();
        this.background = new THREE.Color(options.background ?? "#20262b");
        this.texts = { ...TEXTS, ...options.texts };
        this.scene.background = this.background;

        this.hud = new Label(0.6, 0.16);
        this.placement = new Placement(this.table, () => this.placingChanged(), options.anchorKey);
        this.build();
        this.bindControllers();
        this.bindMouse();

        // in passthrough the room is the background; in an opaque session (or on a laptop) a dark one is
        this.renderer.xr.addEventListener("sessionstart", () => {
            const session = this.renderer.xr.getSession();
            this.scene.background = session && "opaque" !== session.environmentBlendMode ? null : this.background;
            if (session) {
                void this.placement.start(session);
            }
        });
        this.renderer.xr.addEventListener("sessionend", () => {
            this.scene.background = this.background;
            this.placement.stop();
            this.table.position.copy(options.position);
            this.table.quaternion.identity();
        });
        window.addEventListener("resize", () => {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        });
        this.renderer.setAnimationLoop((_, frame) => {
            const space = this.renderer.xr.getReferenceSpace();
            if (frame && space) {
                this.placement.update(frame, space);
            }
            this.renderer.render(this.scene, this.camera);
        });
    }

    get xr(): THREE.WebXRManager {
        return this.renderer.xr;
    }

    /** The status board over the far edge; highlighted on the player's turn. */
    status(lines: Line[], highlight = false): void {
        this.hudLines = lines;
        this.hudHighlight = highlight;
        this.placingChanged();
    }

    /** The standings panel off the table's right edge; null puts it away. */
    standings(lines: Line[] | null): void {
        this.panel.visible = null !== lines;
        if (null !== lines) {
            this.panel.set(lines);
        }
    }

    get showingStandings(): boolean {
        return this.panel.visible;
    }

    /** Lets go of every card held or dragged: they belong to a table about to be replaced. */
    letGo(): void {
        for (const card of this.grabs.values()) {
            dispose(card);
        }
        this.grabs.clear();
        if (null !== this.dragged) {
            dispose(this.dragged);
            this.dragged = null;
            this.orbit.enabled = true;
        }
    }

    // While the table looks for a surface, the status board says how to set it down; the cards wait.
    private placingChanged(): void {
        const placing = this.placement.placing;
        this.hud.set(
            placing ? [{ text: this.texts.placingTitle, bold: true, size: 46 }, { text: this.texts.placingHint, size: 32 }] : this.hudLines,
            placing || this.hudHighlight ? ACCENT : null,
        );
        this.moveButton.visible = this.placement.available && !placing;
    }

    private build(): void {
        const { width, depth, color } = this.options.felt;
        this.table.position.copy(this.options.position);
        this.scene.add(this.table);
        this.table.add(felt(width, depth, color));

        // the hand, held up at the near edge and tilted back towards the eyes
        this.hand.group.position.copy(this.options.hand);
        this.hand.group.rotation.x = -0.55;
        this.table.add(this.hand.group);

        const far = -depth / 2 - 0.1;
        this.hud.position.set(0, 0.38, far);
        this.hud.rotation.x = 0.15;
        this.table.add(this.hud);

        // stacked to the right of the status board
        this.standingsButton.set([{ text: this.texts.standings, size: 36 }]);
        this.standingsButton.position.set(0.41, 0.41, far);
        this.standingsButton.rotation.x = 0.15;
        this.moveButton.set([{ text: this.texts.moveTable, size: 36 }]);
        this.moveButton.position.set(0.41, 0.35, far);
        this.moveButton.rotation.x = 0.15;
        this.moveButton.visible = false;
        this.table.add(this.standingsButton, this.moveButton);

        // off the right edge, turned towards the player: on the left it sits behind the page
        this.panel.position.set(width / 2 + 0.25, 0.3, -0.1);
        this.panel.rotation.y = -0.7;
        this.panel.visible = false;
        this.table.add(this.panel);
    }

    private activate(object: THREE.Object3D): void {
        if ("move" === object.name) {
            sounds.pick();
            void this.placement.move();

            return;
        }
        this.delegate.activate(object.name);
    }

    private release(card: THREE.Object3D, drop: Drop | null): void {
        const code = card.userData.code as string;
        dispose(card);
        sounds.drop();
        this.delegate.release(code, drop);
    }

    // A point of the world, as a drop: over the hand, or on the table.
    private dropAt(world: THREE.Vector3): Drop {
        const inHand = this.hand.local(world);
        if (this.hand.over(inHand)) {
            return { kind: "hand", index: this.hand.index(inHand) };
        }

        return { kind: "table", at: this.table.worldToLocal(world.clone()) };
    }

    private bindControllers(): void {
        const models = new XRControllerModelFactory();
        const hands = new XRHandModelFactory();
        const pointer = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.6)]),
            new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.6 }),
        );
        for (const i of [0, 1]) {
            // the target ray: a controller's pointer, or a tracked hand's (a pinch is its select)
            const controller = this.renderer.xr.getController(i);
            controller.add(pointer.clone());
            controller.addEventListener("selectstart", () => this.pick(controller, i));
            controller.addEventListener("selectend", () => this.drop(controller));
            controller.addEventListener("connected", (event) => {
                if (event.data) {
                    this.inputs.set(controller, event.data);
                }
            });
            controller.addEventListener("disconnected", () => {
                this.inputs.delete(controller);
                // a hand out of sight never ends its pinch: what it held goes back
                const card = this.grabs.get(controller);
                if (undefined !== card) {
                    this.grabs.delete(controller);
                    this.release(card, null);
                }
            });
            this.scene.add(controller);

            const grip = this.renderer.xr.getControllerGrip(i);
            grip.add(models.createControllerModel(grip));
            this.scene.add(grip);

            const hand = this.renderer.xr.getHand(i);
            hand.add(hands.createHandModel(hand, "mesh"));
            this.scene.add(hand);
        }
    }

    // On the laptop, and on the flat page in the headset (whose rays come as a pointer): a click (not the end of an
    // orbit drag) picks a control. A card is dragged: upright along the hand while the pointer is over it, flat
    // across the felt once it is past, and let go over the hand or the table. A drag the browser takes back (a
    // pointercancel: a hand's gesture read as a scroll) puts the card back where it was.
    private bindMouse(): void {
        const canvas = this.renderer.domElement;
        const down = new THREE.Vector2();
        const hand = this.hand.group;
        // the felt, and the height a dragged card slides at, where the table is now
        const top = (above = 0) => new THREE.Plane(new THREE.Vector3(0, 1, 0), -(this.table.position.y + above));
        const aim = (event: PointerEvent | MouseEvent): void => {
            const rect = canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
            this.raycaster.setFromCamera(ndc, this.camera);
        };
        // where the pointer meets the fan's plane, in the hand's own space, when that is over the hand
        const onHand = (): THREE.Vector3 | null => {
            const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
            const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hand.getWorldPosition(new THREE.Vector3()));
            const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
            if (null === point) {
                return null;
            }
            const at = hand.worldToLocal(point);

            return this.hand.over(at) ? at : null;
        };
        const slide = (): void => {
            const card = this.dragged;
            if (null === card) {
                return;
            }
            const along = onHand();
            if (null !== along) {
                // a hair in front of the fan, turned like the cards around it
                hand.attach(card);
                card.position.set(along.x, along.y, 0.03);
                card.rotation.set(0, 0, -this.hand.angle(along));

                return;
            }
            const point = this.raycaster.ray.intersectPlane(top(DRAG_HEIGHT), new THREE.Vector3());
            if (null !== point) {
                this.table.attach(card);
                card.position.copy(this.table.worldToLocal(point));
                card.rotation.set(-Math.PI / 2, 0, 0);
            }
        };
        const finish = (event: PointerEvent | null): void => {
            const card = this.dragged;
            if (null === card) {
                return;
            }
            this.dragged = null;
            this.orbit.enabled = true;
            if (null === event) {
                this.release(card, null);

                return;
            }
            aim(event);
            const along = onHand();
            // the felt under the pointer, not under the lifted card: in perspective, those are centimetres apart
            const point = this.raycaster.ray.intersectPlane(top(), new THREE.Vector3());
            this.release(
                card,
                null !== along ? { kind: "hand", index: this.hand.index(along) } : null === point ? null : { kind: "table", at: this.table.worldToLocal(point) },
            );
        };
        canvas.addEventListener("pointerdown", (event) => {
            down.set(event.clientX, event.clientY);
            // a drag that never ended (an event lost on the way) goes back first
            finish(null);
            aim(event);
            const target = this.target();
            if (null === target || undefined === target.userData.code || !this.delegate.canTake(target)) {
                return;
            }
            this.dragged = target;
            this.orbit.enabled = false;
            sounds.pick();
            slide();
            canvas.setPointerCapture(event.pointerId);
        });
        canvas.addEventListener("pointermove", (event) => {
            if (null !== this.dragged) {
                aim(event);
                slide();
            }
        });
        canvas.addEventListener("pointerup", (event) => finish(event));
        canvas.addEventListener("pointercancel", () => finish(null));
        canvas.addEventListener("lostpointercapture", () => finish(null));
        canvas.addEventListener("click", (event) => {
            if (down.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) {
                return;
            }
            aim(event);
            const target = this.target();
            if (null !== target && undefined === target.userData.code) {
                this.activate(target);
            }
        });
    }

    // What the ray set on the raycaster hits first: a card (the group, which carries the code) or a control.
    private target(): THREE.Object3D | null {
        const objects = [this.hand.group, ...this.delegate.pickables(), this.standingsButton, this.moveButton].filter((object) => object.visible);
        const hit = this.raycaster.intersectObjects(objects, true)[0];
        for (let object = hit?.object ?? null; null !== object; object = object.parent) {
            if (undefined !== object.userData.code || object.userData.control) {
                return object;
            }
        }

        return null;
    }

    // A pinch or a trigger. While the table looks for a surface, it sets it down. A hand pinching right on a card
    // takes that card between its fingers; otherwise the ray picks what it points at, from afar.
    private pick(controller: THREE.XRTargetRaySpace, i: number): void {
        if (this.placement.placing) {
            this.placement.place();
            sounds.drop();
            this.pulse(controller, 0.6, 60);

            return;
        }
        const fingers = this.pinched(i);
        if (null !== fingers) {
            this.grab(controller, fingers.card, fingers.holder);

            return;
        }
        this.raycaster.setFromXRController(controller);
        const target = this.target();
        if (null === target) {
            return;
        }
        if (undefined === target.userData.code) {
            this.pulse(controller, 0.3, 30);
            this.activate(target);

            return;
        }
        if (this.delegate.canTake(target)) {
            this.grab(controller, target, controller);
        }
    }

    private grab(controller: THREE.XRTargetRaySpace, card: THREE.Object3D, holder: THREE.Object3D): void {
        this.grabs.set(controller, card);
        holder.attach(card);
        sounds.pick();
        this.pulse(controller, 0.4, 40);
    }

    private drop(controller: THREE.XRTargetRaySpace): void {
        const card = this.grabs.get(controller);
        if (undefined === card) {
            return;
        }
        this.grabs.delete(controller);
        this.pulse(controller, 0.25, 30);
        this.release(card, this.dropAt(card.getWorldPosition(new THREE.Vector3())));
    }

    /**
     * The card a tracked hand pinches: the point between thumb and index tips within a card's outline and a couple of
     * centimetres off its face, the closest if more than one. The card then follows the index tip. Null for a controller.
     */
    private pinched(i: number): { card: THREE.Object3D; holder: THREE.Object3D } | null {
        const joints = this.renderer.xr.getHand(i).joints;
        const index = joints["index-finger-tip"];
        const thumb = joints["thumb-tip"];
        if (undefined === index || undefined === thumb || !index.visible) {
            return null;
        }
        const pinch = index.getWorldPosition(new THREE.Vector3()).add(thumb.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
        let card: THREE.Object3D | null = null;
        let closest = 0.025;
        for (const candidate of [...this.hand.group.children, ...this.delegate.cards()]) {
            if (undefined === candidate.userData.code || !this.delegate.canTake(candidate)) {
                continue;
            }
            const at = candidate.worldToLocal(pinch.clone());
            if (Math.abs(at.x) < CARD_WIDTH / 2 + 0.01 && Math.abs(at.y) < CARD_HEIGHT / 2 + 0.01 && Math.abs(at.z) < closest) {
                card = candidate;
                closest = Math.abs(at.z);
            }
        }

        return null === card ? null : { card, holder: index };
    }

    // A tap on the controller in the hand; a tracked hand has nothing to buzz.
    private pulse(controller: THREE.Object3D, intensity: number, milliseconds: number): void {
        void this.inputs.get(controller)?.gamepad?.hapticActuators?.[0]?.pulse(intensity, milliseconds).catch(() => undefined);
    }
}
