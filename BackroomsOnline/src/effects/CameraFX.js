export class CameraFX {
  constructor(camera) {
    this.camera = camera;
    this.bobTime = 0;

    this.shake = 0;
    this.targetShake = 0;
  }

  update(dt, isMoving = false) {
    // шаги
    if (isMoving) this.bobTime += dt * 10;

    this.camera.position.y += Math.sin(this.bobTime) * 0.03;
    this.camera.position.x += Math.cos(this.bobTime * 0.5) * 0.02;

    // затухающая тряска
    this.shake *= 0.9;

    this.camera.rotation.x += (Math.random() - 0.5) * this.shake;
    this.camera.rotation.y += (Math.random() - 0.5) * this.shake;
  }

  addShake(amount = 0.01) {
    this.shake += amount;
  }
}
