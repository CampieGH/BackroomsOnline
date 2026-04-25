import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);

    this.composer.addPass(new RenderPass(scene, camera));

    this.film = new FilmPass(0.3, 0.1, 648, false);
    this.composer.addPass(this.film);
  }

  update() {
    this.composer.render();
  }
}
