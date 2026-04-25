import * as THREE from 'three';
import { PLAYER, WORLD, AUDIO, FLASHLIGHT } from '../config.js';
import { bus, EVT } from '../core/EventBus.js';
import { clamp, damp } from '../utils/Helpers.js';
import { Sanity } from './Sanity.js';
import { Inventory } from './Inventory.js';
import { ItemRegistry } from '../items/ItemRegistry.js';

export class Player {
  constructor({ camera, controls, physics, audio, world = null }) {
    this.camera   = camera;
    this.controls = controls;
    this.physics  = physics;
    this.audio    = audio;
    this.worldRef = world;

    this.position = new THREE.Vector3(WORLD.spawn.x, 0, WORLD.spawn.z);
    this.velocity = new THREE.Vector3();
    this.onGround = false;
    this.crouching = false;
    this.eyeHeight = PLAYER.eyeHeightStand;
    this.targetEyeHeight = PLAYER.eyeHeightStand;

    this.sanity   = new Sanity();
    this.inventory = new Inventory();

    this._footTimer = 0;
    this._peakY     = 0;
    this._wasAir    = false;

    this._bobPhase = 0;
    this._bobAmp   = 0;
    this._shakeMag = 0;
    this._camTime  = 0;

    // Dev-mode flags
    this.dev = { fly: false, noclip: false, speed: false, bright: false };

    this._nearbyPeers = 0;
    this._gravityMul  = 1;
    this._inElevator  = false;
    this._sanMul      = 1.0;  // set by level modifier

    const flashlight = ItemRegistry.create('flashlight');
    this.inventory.add(flashlight);
    this.camera.add(flashlight.light);
    this.camera.add(flashlight.light.target);
    flashlight.light.target.position.set(0, 0, -1);
    this.flashlight = flashlight;
  }

  addShake(mag) {
    this._shakeMag = Math.min(3.0, this._shakeMag + mag);
  }

  respawn(spawnPos) {
    const sp = spawnPos ?? new THREE.Vector3(WORLD.spawn.x, WORLD.level0FloorY, WORLD.spawn.z);
    this.position.copy(sp);
    this.velocity.set(0, 0, 0);
    this._inElevator = false;
  }

  update(dt) {
    this._updateMovement(dt);
    this._updateEyeHeight(dt);
    this._updateCameraFX(dt);
    this._updateCamera();
    this._updateFootsteps(dt);
    this._updateSanity(dt);
    this.flashlight?.update(dt);
  }

  _updateMovement(dt) {
    const c = this.controls;
    const { fwd, strafe } = c.moveInput();
    const crouching = c.crouchHeld();
    this.crouching = crouching;
    this.targetEyeHeight = crouching ? PLAYER.eyeHeightCrouch : PLAYER.eyeHeightStand;

    const sprinting = c.sprintHeld() && !crouching && fwd > 0;
    let baseSpeed = crouching ? PLAYER.crouchSpeed
                  : sprinting ? PLAYER.sprintSpeed
                  : PLAYER.walkSpeed;
    if (this.dev.speed) baseSpeed *= 4;

    const yaw = c.yaw;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    const forwardX = -sinY, forwardZ = -cosY;
    const rightX = cosY,    rightZ = -sinY;
    let wishX = forwardX * fwd + rightX * strafe;
    let wishZ = forwardZ * fwd + rightZ * strafe;
    const len = Math.hypot(wishX, wishZ);
    if (len > 0) { wishX /= len; wishZ /= len; }

    if (this.dev.fly) {
      const pitch = c.pitch;
      this.velocity.x = (wishX * Math.cos(pitch)) * baseSpeed;
      this.velocity.z = (wishZ * Math.cos(pitch)) * baseSpeed;
      this.velocity.y = (-Math.sin(pitch) * fwd) * baseSpeed;
      if (c.jumpHeld())   this.velocity.y =  baseSpeed;
      if (c.crouchHeld()) this.velocity.y = -baseSpeed;
      if (this.dev.noclip) {
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;
        this.position.z += this.velocity.z * dt;
      } else {
        const { pos } = this.physics.moveAndSlide(this.position, this.velocity, dt);
        this.position.copy(pos);
      }
      this.onGround = false;
      this._peakY = this.position.y;
      this._wasAir = false;
      return;
    }

    this.velocity.x = wishX * baseSpeed;
    this.velocity.z = wishZ * baseSpeed;

    if (this.dev.noclip) {
      if (c.jumpHeld())        this.velocity.y =  baseSpeed;
      else if (c.crouchHeld()) this.velocity.y = -baseSpeed;
      else                     this.velocity.y = 0;
      this.position.x += this.velocity.x * dt;
      this.position.y += this.velocity.y * dt;
      this.position.z += this.velocity.z * dt;
      this.onGround = true;
      this._peakY = this.position.y;
      this._wasAir = false;
      return;
    }

    if (this.onGround && c.jumpHeld()) {
      this.velocity.y = PLAYER.jumpVelocity;
      this.onGround = false;
    }
    this.velocity.y -= PLAYER.gravity * (this._gravityMul ?? 1) * dt;

    if (!this.onGround) {
      this._peakY = Math.max(this._peakY, this.position.y);
      this._wasAir = true;
    }

    const { pos, onGround } = this.physics.moveAndSlide(this.position, this.velocity, dt);
    this.position.copy(pos);

    if (onGround && !this.onGround) {
      const fallDist = this._peakY - this.position.y;
      if (fallDist > 0.4) this.addShake(Math.min(fallDist * 0.15, 1.2));
      this._peakY = this.position.y;
      this._wasAir = false;
      this.audio?.footstep?.(0.5);
    }
    this.onGround = onGround;
    if (!this._wasAir) this._peakY = this.position.y;
  }

  _updateEyeHeight(dt) {
    this.eyeHeight = damp(this.eyeHeight, this.targetEyeHeight, 14, dt);
  }

  _updateCameraFX(dt) {
    this._camTime += dt;
    const speedH = Math.hypot(this.velocity.x, this.velocity.z);
    const moving = this.onGround && speedH > 0.3;

    const targetAmp = moving ? Math.min(speedH / PLAYER.sprintSpeed, 1.0) : 0;
    this._bobAmp = damp(this._bobAmp, targetAmp, 10, dt);
    if (moving) this._bobPhase += dt * speedH * 1.85;
    this._shakeMag = Math.max(0, this._shakeMag - dt * 3.5);
  }

  _updateCamera() {
    const t = this._camTime;
    const bobY    = Math.sin(this._bobPhase * 2.0) * 0.042 * this._bobAmp;
    const bobRoll = Math.sin(this._bobPhase)        * 0.016 * this._bobAmp;
    const breathY = Math.sin(t * 0.61) * 0.0055 + Math.sin(t * 1.07) * 0.0022;
    const swayX   = Math.sin(t * 0.38) * 0.0030 + Math.sin(t * 0.71) * 0.0015;
    const swayRoll = Math.sin(t * 0.29) * 0.0030;
    const mag    = this._shakeMag;
    const shakeX = mag > 0.01 ? (Math.random() - 0.5) * mag * 0.048 : 0;
    const shakeY = mag > 0.01 ? (Math.random() - 0.5) * mag * 0.048 : 0;

    this.camera.position.set(
      this.position.x + swayX + shakeX,
      this.position.y + this.eyeHeight + bobY + breathY + shakeY,
      this.position.z,
    );
    this.camera.rotation.set(
      this.controls.pitch,
      this.controls.yaw,
      bobRoll + swayRoll,
      'YXZ',
    );
  }

  _updateFootsteps(dt) {
    if (!this.onGround) return;
    const moving = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z > 0.2;
    if (!moving) { this._footTimer = 0; return; }

    const sprinting = this.controls.sprintHeld() && !this.crouching;
    const interval = this.crouching ? AUDIO.footstepIntervalCrouch
                   : sprinting     ? AUDIO.footstepIntervalRun
                                   : AUDIO.footstepIntervalWalk;
    const vol = this.crouching ? AUDIO.footstep.crouch
              : sprinting     ? AUDIO.footstep.run
                              : AUDIO.footstep.walk;

    this._footTimer += dt;
    if (this._footTimer >= interval) { this._footTimer = 0; this.audio?.footstep?.(vol); }
  }

  _updateSanity(dt) {
    const world  = this.worldRef;
    const isSafe = world?.isSafe ?? true;
    if (isSafe) return;

    const inDark = !(this.flashlight && this.flashlight.on);
    const alone  = this._nearbyPeers === 0;
    this.sanity.update(dt, { inDark, alone, sanMul: this._sanMul });
  }

  getForward() {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    return v;
  }

  getEyePos() {
    return new THREE.Vector3(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }
}
