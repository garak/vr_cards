// Small things every table scene needs: the felt, controls to pick, and freeing what a redraw throws away.

import * as THREE from "three";
import { Label } from "./label";

/** A rounded rectangle of felt, lying flat, its middle at the origin. */
export function felt(width: number, depth: number, color: string): THREE.Mesh {
    const shape = new THREE.Shape();
    const [w, d, r] = [width / 2, depth / 2, 0.08];
    shape.moveTo(-w + r, -d);
    shape.lineTo(w - r, -d);
    shape.quadraticCurveTo(w, -d, w, -d + r);
    shape.lineTo(w, d - r);
    shape.quadraticCurveTo(w, d, w - r, d);
    shape.lineTo(-w + r, d);
    shape.quadraticCurveTo(-w, d, -w, d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = "felt";

    return mesh;
}

/** Marks an object as something to pick (a button, the stock): the stage hands it to the game by its name. */
export function control<T extends THREE.Object3D>(object: T, name: string): T {
    object.name = name;
    object.userData.control = true;

    return object;
}

/** A patch under cards, to mark them (a meld the rules will not take, the cards drawn this turn). */
export function patch(width: number, height: number, color: string, opacity = 0.45): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color, transparent: true, opacity }));
    // its own geometry, unlike a card's: freed with it
    mesh.userData.ownGeometry = true;

    return mesh;
}

// Removes the children and frees what was made for them: the card faces are shared through the cache and stay,
// and so do the labels kept for good (userData.keep).
export function clear(group: THREE.Object3D): void {
    for (const child of [...group.children]) {
        child.traverse((object) => {
            if (object instanceof Label) {
                if (!object.userData.keep) {
                    object.dispose();
                }
            } else if (object instanceof THREE.Mesh) {
                (object.material as THREE.Material).dispose();
                if (object.userData.ownGeometry) {
                    object.geometry.dispose();
                }
            }
        });
        child.removeFromParent();
    }
}

/** A card taken out of its group (grabbed, dragged): removed and its materials freed. */
export function dispose(card: THREE.Object3D): void {
    const holder = new THREE.Group();
    holder.add(card);
    clear(holder);
}
