// Text in the scene: a plane with a canvas on it, redrawn when the text changes. Big type, dark plate:
// it has to read over whatever the passthrough shows behind it.

import * as THREE from "three";

const PX_PER_M = 1600;

export interface Line {
    text: string;
    size?: number; // in pixels on the canvas; 40 by default
    color?: string;
    bold?: boolean;
}

export class Label extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
    private readonly canvas: HTMLCanvasElement;
    private readonly map: THREE.CanvasTexture;
    private current = "";

    constructor(
        readonly widthM: number,
        readonly heightM: number,
    ) {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(widthM * PX_PER_M);
        canvas.height = Math.round(heightM * PX_PER_M);
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        super(new THREE.PlaneGeometry(widthM, heightM), new THREE.MeshBasicMaterial({ map, transparent: true }));
        this.canvas = canvas;
        this.map = map;
    }

    set(lines: Line[], accent: string | null = null): void {
        const key = JSON.stringify([lines, accent]);
        if (key === this.current) {
            return;
        }
        this.current = key;
        const context = this.canvas.getContext("2d");
        if (null === context) {
            return;
        }
        const { width, height } = this.canvas;
        context.clearRect(0, 0, width, height);
        context.fillStyle = "rgba(16, 24, 20, 0.82)";
        context.beginPath();
        context.roundRect(4, 4, width - 8, height - 8, 24);
        context.fill();
        if (null !== accent) {
            context.strokeStyle = accent;
            context.lineWidth = 8;
            context.stroke();
        }
        context.textAlign = "center";
        context.textBaseline = "middle";
        const sizes = lines.map((line) => line.size ?? 40);
        const total = sizes.reduce((sum, size) => sum + size * 1.25, 0);
        let y = (height - total) / 2;
        lines.forEach((line, i) => {
            const size = sizes[i] ?? 40;
            context.font = `${line.bold ? "700" : "400"} ${size}px system-ui, sans-serif`;
            context.fillStyle = line.color ?? "#f4f1e8";
            y += size * 0.625;
            context.fillText(line.text, width / 2, y, width - 32);
            y += size * 0.625;
        });
        this.map.needsUpdate = true;
    }

    dispose(): void {
        this.map.dispose();
        this.material.dispose();
        this.geometry.dispose();
    }
}
