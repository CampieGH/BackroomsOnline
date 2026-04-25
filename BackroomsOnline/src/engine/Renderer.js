import * as THREE from 'three';
import { PLAYER, WORLD, LIGHT } from '../config.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WORLD.fogColor);
    this.scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      PLAYER.fov,
      window.innerWidth / window.innerHeight,
      0.05,
      50
    );
    this.camera.position.set(0, PLAYER.eyeHeightStand, 0);
    // Camera must be in the scene graph so children (flashlight SpotLight) get world matrices.
    this.scene.add(this.camera);

    // Ambient dim fill so nothing is absolute black when no flashlight
    this.ambient = new THREE.AmbientLight(WORLD.ambientColor, LIGHT.ambientIntensity);
    this.scene.add(this.ambient);

    window.addEventListener('resize', () => this._onResize());
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  add(obj) { this.scene.add(obj); }
  remove(obj) { this.scene.remove(obj); }

  render() { this.renderer.render(this.scene, this.camera); }
}
