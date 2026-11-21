// A pixelfx effect living in the 3D house: the effect draws into its own small frame, the frame is
// composited to RGBA and uploaded to a CanvasTexture on a camera-facing THREE.Sprite. The effect's origin
// (its feet, usually) sits on the sprite's position, and one effect pixel is `scale` world units.
// pixelfx keeps color and light apart, and so does this: color goes on a normal sprite, light on a second,
// additive one, so a candle's halo really brightens what's behind it instead of drawing a hazy box.
import * as THREE from "three";
import { createFrame, clearFrame, createFx, composite } from "../../../src/core/index.js";

const REDRAW = 1 / 30;

export class FxSprite {
  constructor(mod, opts = {}, { scale = 1 / 40, position, renderOrder = 0, glow = 1 } = {}) {
    const [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
    this.mod = mod;
    this.w = w;
    this.h = h;
    this.glow = glow;
    this.frame = createFrame(w, h);
    // the same color buffer with no light, for the color layer
    this.colorOnly = { w, h, color: this.frame.color, light: new Uint32Array(w * h) };
    this.layers = [false, true].map((additive) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        fog: true,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.center.set(ox / w, 1 - oy / h);
      sprite.scale.set(w * scale, h * scale, 1);
      sprite.renderOrder = renderOrder + (additive ? 1 : 0);
      return { canvas, ctx, img: ctx.createImageData(w, h), texture, material, sprite };
    });
    // the light layer fades out towards the frame's edges so a halo never shows its box
    this.edge = new Float32Array(w * h);
    const m = Math.max(4, Math.min(w, h) * 0.18);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.min(x, w - 1 - x, y, h - 1 - y) / m, k = Math.min(1, d);
        this.edge[y * w + x] = k * k * (3 - 2 * k);
      }
    this.sprite = this.layers[0].sprite;
    this.sprite.add(this.layers[1].sprite);
    // the child copies the parent's scale, so undo it
    this.layers[1].sprite.scale.set(1, 1, 1);
    this.layers[1].sprite.center.copy(this.sprite.center);
    this.material = this.layers[0].material;
    this.fx = createFx(mod, { ...opts, x: ox, y: oy });
    if (position) this.sprite.position.copy(position);
    this.acc = REDRAW;
    this.paint();
  }

  /** The same live effect on a flat quad (a window, a wall), w x h metres, centred on the group. */
  makeMesh(w, h) {
    if (!this.meshMats)
      this.meshMats = this.layers.map((l, i) =>
        new THREE.MeshBasicMaterial({ map: l.texture, transparent: true, depthWrite: false, fog: true, blending: i ? THREE.AdditiveBlending : THREE.NormalBlending }),
      );
    const g = new THREE.Group(), geo = new THREE.PlaneGeometry(w, h);
    this.meshMats.forEach((m, i) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.z = i * 0.002;
      mesh.renderOrder = 2 + i;
      g.add(mesh);
    });
    return g;
  }

  set opacity(v) {
    for (const l of this.layers) l.material.opacity = v;
  }

  get done() {
    return this.fx.done();
  }

  stop() {
    this.fx.stop();
  }

  paint() {
    clearFrame(this.frame);
    this.fx.draw(this.frame);
    const [col, lit] = this.layers;
    composite(this.colorOnly, col.img.data, null);
    col.ctx.putImageData(col.img, 0, 0);
    col.texture.needsUpdate = true;
    const L = this.frame.light, d = lit.img.data, E = this.edge, k = this.glow;
    for (let i = 0, n = L.length; i < n; i++) {
      const l = L[i], e = E[i] * k, j = i * 4;
      d[j] = (l & 255) * e;
      d[j + 1] = ((l >>> 8) & 255) * e;
      d[j + 2] = ((l >>> 16) & 255) * e;
      d[j + 3] = 255;
    }
    lit.ctx.putImageData(lit.img, 0, 0);
    lit.texture.needsUpdate = true;
  }

  /** Step the effect; repaint its texture at 30 fps, and only when the camera might see it. */
  update(dt, camera) {
    this.fx.update(dt);
    this.acc += dt;
    if (this.acc < REDRAW || !this.sprite.visible) return;
    if (camera && !this.always) {
      const d = this.sprite.position.distanceTo(camera.position);
      if (d > 22) return;
      const to = this.sprite.position.clone().sub(camera.position);
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      if (d > 3 && to.dot(fwd) < 0) return;
    }
    this.acc = 0;
    this.paint();
  }

  dispose() {
    this.sprite.removeFromParent();
    for (const l of this.layers) {
      l.texture.dispose();
      l.material.dispose();
    }
  }
}
