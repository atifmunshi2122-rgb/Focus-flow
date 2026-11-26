/**
 * Generates shared, rigged, skinned, multi-animation binary GLB anime models
 * for the FocusFlow Multi-User Avatar Catalog:
 *   - public/models/avatars/anime-boy-01.glb
 *   - public/models/avatars/anime-boy-02.glb
 *   - public/models/avatars/anime-girl-01.glb
 *   - public/models/avatars/anime-girl-02.glb
 *
 * All materials use semantic names (HairMain, HairAccent, EyeIris, OutfitPrimary,
 * OutfitSecondary) so user-specific colors apply at runtime without per-user GLBs.
 *
 * Run with: node scripts/generateAnimeAvatars.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (typeof this.onloadend === 'function') this.onloadend({ target: this });
        if (typeof this.onload === 'function') this.onload({ target: this });
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
        if (typeof this.onloadend === 'function') this.onloadend({ target: this });
        if (typeof this.onload === 'function') this.onload({ target: this });
      });
    }
  };
}

function makeMat(name, hex, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: opts.roughness ?? 0.55,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  });
  mat.name = name;
  return mat;
}

function createAnimeHeadGeometry(radius = 0.145) {
  const geo = new THREE.SphereGeometry(radius, 28, 22);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    if (y < 0) {
      const t = Math.min(1, Math.abs(y) / radius);
      const narrow = 1 - t * 0.34;
      x *= narrow;
      z *= 1 - t * 0.14;
      if (z > 0) z += t * 0.014;
    } else {
      x *= 1.02;
    }
    z *= 0.96;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function createTaperedLimb(topR, botR, length, radialSegs = 14) {
  const geo = new THREE.CylinderGeometry(topR, botR, length, radialSegs, 4);
  geo.translate(0, -length / 2, 0);
  return geo;
}

function buildAnimeCharacter(config) {
  const root = new THREE.Group();
  root.name = `${config.id}_Root`;

  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.set(0, 0.52, 0);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  spine.position.set(0, 0.14, 0);
  hips.add(spine);

  const chest = new THREE.Bone();
  chest.name = 'Chest';
  chest.position.set(0, 0.18, 0);
  spine.add(chest);

  const neck = new THREE.Bone();
  neck.name = 'Neck';
  neck.position.set(0, 0.17, 0);
  chest.add(neck);

  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.set(0, 0.08, 0);
  neck.add(head);

  const shoulderW = config.style === 'female' ? 0.155 : 0.175;
  const leftUpperArm = new THREE.Bone();
  leftUpperArm.name = 'LeftUpperArm';
  leftUpperArm.position.set(shoulderW, 0.13, 0);
  chest.add(leftUpperArm);

  const leftLowerArm = new THREE.Bone();
  leftLowerArm.name = 'LeftLowerArm';
  leftLowerArm.position.set(0, -0.22, 0);
  leftUpperArm.add(leftLowerArm);

  const leftHand = new THREE.Bone();
  leftHand.name = 'LeftHand';
  leftHand.position.set(0, -0.20, 0);
  leftLowerArm.add(leftHand);

  const rightUpperArm = new THREE.Bone();
  rightUpperArm.name = 'RightUpperArm';
  rightUpperArm.position.set(-shoulderW, 0.13, 0);
  chest.add(rightUpperArm);

  const rightLowerArm = new THREE.Bone();
  rightLowerArm.name = 'RightLowerArm';
  rightLowerArm.position.set(0, -0.22, 0);
  rightUpperArm.add(rightLowerArm);

  const rightHand = new THREE.Bone();
  rightHand.name = 'RightHand';
  rightHand.position.set(0, -0.20, 0);
  rightLowerArm.add(rightHand);

  const hipW = config.style === 'female' ? 0.085 : 0.095;
  const leftUpperLeg = new THREE.Bone();
  leftUpperLeg.name = 'LeftUpperLeg';
  leftUpperLeg.position.set(hipW, -0.02, 0);
  hips.add(leftUpperLeg);

  const leftLowerLeg = new THREE.Bone();
  leftLowerLeg.name = 'LeftLowerLeg';
  leftLowerLeg.position.set(0, -0.26, 0);
  leftUpperLeg.add(leftLowerLeg);

  const rightUpperLeg = new THREE.Bone();
  rightUpperLeg.name = 'RightUpperLeg';
  rightUpperLeg.position.set(-hipW, -0.02, 0);
  hips.add(rightUpperLeg);

  const rightLowerLeg = new THREE.Bone();
  rightLowerLeg.name = 'RightLowerLeg';
  rightLowerLeg.position.set(0, -0.26, 0);
  rightUpperLeg.add(rightLowerLeg);

  root.add(hips);

  const skinMat = makeMat('Skin', config.skinTone, { roughness: 0.58, metalness: 0.02 });
  const hairMat = makeMat('HairMain', config.hairColor, { roughness: 0.42, metalness: 0.08 });
  const hairAccentMat = makeMat('HairAccent', config.hairHighlight, { roughness: 0.38, metalness: 0.12 });
  const outfitMainMat = makeMat('OutfitPrimary', config.outfitPrimary, { roughness: 0.68 });
  const outfitTrimMat = makeMat('OutfitSecondary', config.outfitSecondary, { roughness: 0.62 });
  const pantsMat = makeMat('Pants', config.pantsColor, { roughness: 0.72 });
  const shoeMat = makeMat('Shoes', config.shoeColor, { roughness: 0.55 });
  const scleraMat = makeMat('EyeSclera', '#f8fafc', { roughness: 0.25 });
  const irisMat = makeMat('EyeIris', config.eyeColor, {
    roughness: 0.2,
    emissive: config.eyeColor,
    emissiveIntensity: 0.15,
  });
  const pupilMat = makeMat('EyePupil', '#0f172a', { roughness: 0.15 });
  const highlightMat = makeMat('EyeCatchlight', '#ffffff', {
    roughness: 0.1,
    emissive: '#ffffff',
    emissiveIntensity: 0.6,
  });
  const lashMat = makeMat('EyeLash', '#1e1b2e', { roughness: 0.4 });
  const blushMat = makeMat('CheekBlush', '#fda4af', { roughness: 0.7 });

  const attach = (bone, mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bone.add(mesh);
    return mesh;
  };

  // Torso & Outfit
  const pelvisGeo = new THREE.CylinderGeometry(
    config.style === 'female' ? 0.115 : 0.12,
    config.style === 'female' ? 0.145 : 0.125,
    0.15,
    16
  );
  attach(hips, new THREE.Mesh(pelvisGeo, config.style === 'female' ? outfitTrimMat : pantsMat));

  const waistGeo = new THREE.CylinderGeometry(
    config.style === 'female' ? 0.105 : 0.122,
    config.style === 'female' ? 0.115 : 0.12,
    0.20,
    16
  );
  const waistMesh = new THREE.Mesh(waistGeo, outfitMainMat);
  waistMesh.position.set(0, 0.08, 0);
  attach(spine, waistMesh);

  const chestGeo = new THREE.CylinderGeometry(
    config.style === 'female' ? 0.125 : 0.148,
    config.style === 'female' ? 0.108 : 0.125,
    0.22,
    16
  );
  const chestMesh = new THREE.Mesh(chestGeo, outfitMainMat);
  chestMesh.position.set(0, 0.08, 0);
  attach(chest, chestMesh);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.085, 0.07, 14), outfitTrimMat);
  collar.position.set(0, 0.16, 0.02);
  attach(chest, collar);

  [-1, 1].forEach((side) => {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.18, 0.025), outfitTrimMat);
    lapel.position.set(side * 0.042, 0.07, 0.112);
    lapel.rotation.z = side * -0.14;
    attach(chest, lapel);
  });

  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.10, 12), skinMat);
  neckMesh.position.set(0, 0.03, 0);
  attach(neck, neckMesh);

  const headCenterY = 0.12;
  const headMesh = new THREE.Mesh(createAnimeHeadGeometry(0.145), skinMat);
  headMesh.position.set(0, headCenterY, 0);
  attach(head, headMesh);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 10), skinMat);
    ear.scale.set(0.45, 1.15, 0.75);
    ear.position.set(side * 0.142, headCenterY - 0.01, -0.005);
    attach(head, ear);
  });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.026, 6), skinMat);
  nose.rotation.x = Math.PI / 2.2;
  nose.position.set(0, headCenterY - 0.025, 0.142);
  attach(head, nose);

  const mouth = new THREE.Mesh(new THREE.CapsuleGeometry(0.004, 0.024, 4, 8), lashMat);
  mouth.rotation.z = Math.PI / 2;
  mouth.position.set(0, headCenterY - 0.068, 0.128);
  attach(head, mouth);

  [-1, 1].forEach((side) => {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.052, headCenterY - 0.005, 0.122);
    eyeGroup.rotation.y = side * 0.18;

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12), scleraMat);
    sclera.scale.set(1.05, 1.22, 0.45);
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.019, 14, 12), irisMat);
    iris.scale.set(0.95, 1.2, 0.45);
    iris.position.set(0, -0.002, 0.007);
    eyeGroup.add(iris);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 10), pupilMat);
    pupil.scale.set(0.9, 1.1, 0.5);
    pupil.position.set(0, -0.002, 0.012);
    eyeGroup.add(pupil);

    const catchlight1 = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 8, 8), highlightMat);
    catchlight1.position.set(-0.006, 0.008, 0.014);
    eyeGroup.add(catchlight1);

    const catchlight2 = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 8), highlightMat);
    catchlight2.position.set(0.006, -0.007, 0.014);
    eyeGroup.add(catchlight2);

    const upperLash = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.008, 0.012), lashMat);
    upperLash.position.set(0, 0.028, 0.008);
    upperLash.rotation.z = side * -0.08;
    eyeGroup.add(upperLash);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.006, 0.01), hairMat);
    brow.position.set(0, 0.044, 0.006);
    brow.rotation.z = side * (config.style === 'female' ? 0.08 : -0.06);
    eyeGroup.add(brow);

    const blush = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), blushMat);
    blush.scale.set(1.25, 0.55, 0.35);
    blush.position.set(side * 0.012, -0.038, -0.006);
    eyeGroup.add(blush);

    attach(head, eyeGroup);
  });

  // Hairstyle variations
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.156, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairMat
  );
  hairCap.position.set(0, headCenterY + 0.012, -0.008);
  hairCap.rotation.x = -0.18;
  attach(head, hairCap);

  const backHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.155, 20, 16, Math.PI * 0.65, Math.PI * 1.7, 0.2, Math.PI * 0.72),
    hairMat
  );
  backHair.position.set(0, headCenterY - 0.01, -0.015);
  attach(head, backHair);

  const bangConfigs = [
    { x: -0.072, y: 0.072, z: 0.126, rz: 0.28, rx: -0.2, s: [0.042, 0.108, 0.032] },
    { x: -0.022, y: 0.086, z: 0.136, rz: 0.12, rx: -0.24, s: [0.045, 0.115, 0.034] },
    { x: 0.028, y: 0.084, z: 0.135, rz: -0.15, rx: -0.22, s: [0.044, 0.112, 0.034] },
    { x: 0.078, y: 0.07, z: 0.124, rz: -0.32, rx: -0.18, s: [0.04, 0.105, 0.03] },
  ];
  bangConfigs.forEach((b, idx) => {
    const lock = new THREE.Mesh(
      new THREE.ConeGeometry(b.s[0], b.s[1], 8),
      idx % 2 === 0 ? hairMat : hairAccentMat
    );
    lock.position.set(b.x, headCenterY + b.y, b.z);
    lock.rotation.set(Math.PI + b.rx, 0, b.rz);
    attach(head, lock);
  });

  [-1, 1].forEach((side) => {
    const sideLock = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.024, config.style === 'female' ? 0.18 : 0.08, 6, 10),
      hairMat
    );
    sideLock.position.set(side * 0.135, headCenterY - (config.style === 'female' ? 0.06 : 0.01), 0.055);
    sideLock.rotation.z = side * 0.08;
    attach(head, sideLock);
  });

  if (config.hairVariant === 'ponytail') {
    const ponytail = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.24, 8, 12), hairAccentMat);
    ponytail.position.set(0, headCenterY - 0.05, -0.175);
    ponytail.rotation.x = 0.28;
    attach(head, ponytail);
  } else if (config.hairVariant === 'twintails') {
    [-1, 1].forEach((side) => {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.24, 8, 12), hairAccentMat);
      tail.position.set(side * 0.16, headCenterY - 0.06, -0.09);
      tail.rotation.z = side * -0.22;
      attach(head, tail);
    });
  } else if (config.hairVariant === 'spiky') {
    [-0.06, 0, 0.06].forEach((sx) => {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.11, 8), hairAccentMat);
      spike.position.set(sx, headCenterY + 0.145, -0.02);
      spike.rotation.x = -0.35;
      attach(head, spike);
    });
  }

  // Arms & Hands
  [
    { upper: leftUpperArm, lower: leftLowerArm, hand: leftHand },
    { upper: rightUpperArm, lower: rightLowerArm, hand: rightHand },
  ].forEach(({ upper, lower, hand }) => {
    attach(upper, new THREE.Mesh(createTaperedLimb(0.044, 0.036, 0.22), outfitMainMat));
    attach(lower, new THREE.Mesh(createTaperedLimb(0.035, 0.028, 0.20), skinMat));
    const hMesh = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), skinMat);
    hMesh.scale.set(0.85, 1.15, 0.65);
    hMesh.position.set(0, -0.02, 0);
    attach(hand, hMesh);
  });

  // Legs & Shoes
  [leftUpperLeg, rightUpperLeg].forEach((uLeg, idx) => {
    const lLeg = idx === 0 ? leftLowerLeg : rightLowerLeg;
    const thighMat = config.style === 'female' ? skinMat : pantsMat;
    attach(uLeg, new THREE.Mesh(createTaperedLimb(0.062, 0.048, 0.26), thighMat));
    attach(lLeg, new THREE.Mesh(createTaperedLimb(0.046, 0.034, 0.26), thighMat));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, 0.14), shoeMat);
    shoe.position.set(0, -0.255, 0.032);
    attach(lLeg, shoe);
  });

  // Animations (idle, studying, typing, reading, writing)
  const createClip = (name, duration, keyframesFn) => {
    const times = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    const tracks = [];
    const addQuatTrack = (boneName, eulers) => {
      const values = [];
      for (const [rx, ry, rz] of eulers) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
        values.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values));
    };
    keyframesFn(addQuatTrack);
    return new THREE.AnimationClip(name, duration, tracks);
  };

  const addSeatedLegs = (addQ) => {
    addQ('LeftUpperLeg', Array(5).fill([-1.42, 0.05, 0]));
    addQ('RightUpperLeg', Array(5).fill([-1.42, -0.05, 0]));
    addQ('LeftLowerLeg', Array(5).fill([1.42, 0, 0]));
    addQ('RightLowerLeg', Array(5).fill([1.42, 0, 0]));
  };

  const idleClip = createClip('idle', 3.6, (addQ) => {
    addSeatedLegs(addQ);
    addQ('Spine', [[0.03, 0, 0], [0.01, 0, 0], [0.03, 0, 0], [0.05, 0, 0], [0.03, 0, 0]]);
    addQ('Head', [[0.04, -0.04, 0], [0.02, 0.03, 0.02], [0.05, 0.05, 0], [0.03, -0.02, -0.02], [0.04, -0.04, 0]]);
    addQ('LeftUpperArm', Array(5).fill([-0.35, 0, -0.12]));
    addQ('RightUpperArm', Array(5).fill([-0.35, 0, 0.12]));
    addQ('LeftLowerArm', Array(5).fill([-0.85, 0.15, 0]));
    addQ('RightLowerArm', Array(5).fill([-0.85, -0.15, 0]));
  });

  const studyingClip = createClip('studying', 3.2, (addQ) => {
    addSeatedLegs(addQ);
    addQ('Spine', [[0.12, 0, 0], [0.14, 0, 0], [0.12, 0, 0], [0.1, 0, 0], [0.12, 0, 0]]);
    addQ('Head', [[0.12, 0, 0], [0.16, 0.04, 0], [0.11, 0, 0], [0.15, -0.04, 0], [0.12, 0, 0]]);
    addQ('LeftUpperArm', Array(5).fill([-0.68, 0.12, -0.12]));
    addQ('RightUpperArm', Array(5).fill([-0.68, -0.12, 0.12]));
    addQ('LeftLowerArm', [[-0.75, 0.2, 0], [-0.82, 0.2, 0], [-0.75, 0.2, 0], [-0.7, 0.2, 0], [-0.75, 0.2, 0]]);
    addQ('RightLowerArm', [[-0.75, -0.2, 0], [-0.7, -0.2, 0], [-0.75, -0.2, 0], [-0.82, -0.2, 0], [-0.75, -0.2, 0]]);
  });

  const typingClip = createClip('typing', 1.4, (addQ) => {
    addSeatedLegs(addQ);
    addQ('Spine', Array(5).fill([0.1, 0, 0]));
    addQ('Head', [[0.06, 0, 0], [0.08, 0.03, 0], [0.06, 0, 0], [0.08, -0.03, 0], [0.06, 0, 0]]);
    addQ('LeftUpperArm', Array(5).fill([-0.65, 0.15, -0.1]));
    addQ('RightUpperArm', Array(5).fill([-0.65, -0.15, 0.1]));
    addQ('LeftLowerArm', [[-0.72, 0.18, 0], [-0.88, 0.22, 0], [-0.74, 0.18, 0], [-0.84, 0.15, 0], [-0.72, 0.18, 0]]);
    addQ('RightLowerArm', [[-0.88, -0.22, 0], [-0.72, -0.18, 0], [-0.85, -0.16, 0], [-0.74, -0.2, 0], [-0.88, -0.22, 0]]);
  });

  const readingClip = createClip('reading', 3.4, (addQ) => {
    addSeatedLegs(addQ);
    addQ('Spine', Array(5).fill([0.15, 0, 0]));
    addQ('Head', [[0.26, -0.07, 0], [0.28, 0, 0], [0.26, 0.07, 0], [0.28, 0, 0], [0.26, -0.07, 0]]);
    addQ('LeftUpperArm', Array(5).fill([-0.6, 0.22, -0.08]));
    addQ('RightUpperArm', Array(5).fill([-0.6, -0.22, 0.08]));
    addQ('LeftLowerArm', Array(5).fill([-0.92, 0.18, 0]));
    addQ('RightLowerArm', Array(5).fill([-0.92, -0.18, 0]));
  });

  const writingClip = createClip('writing', 1.8, (addQ) => {
    addSeatedLegs(addQ);
    addQ('Spine', Array(5).fill([0.16, 0.04, 0]));
    addQ('Head', [[0.24, -0.05, 0.03], [0.27, -0.02, 0.03], [0.24, -0.06, 0.03], [0.26, -0.03, 0.03], [0.24, -0.05, 0.03]]);
    addQ('LeftUpperArm', Array(5).fill([-0.62, 0.18, -0.12]));
    addQ('LeftLowerArm', Array(5).fill([-0.85, 0.22, 0]));
    addQ('RightUpperArm', Array(5).fill([-0.72, -0.1, 0.08]));
    addQ('RightLowerArm', [[-0.78, -0.18, 0], [-0.86, -0.25, 0], [-0.76, -0.14, 0], [-0.84, -0.22, 0], [-0.78, -0.18, 0]]);
  });

  return {
    root,
    animations: [idleClip, studyingClip, typingClip, readingClip, writingClip],
  };
}

async function exportGLB(scene, animations, outPath) {
  const exporter = new GLTFExporter();
  const buffer = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result),
      (err) => reject(err),
      { binary: true, animations }
    );
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(buffer));
  const stats = fs.statSync(outPath);
  console.log(`Generated ${outPath} (${(stats.size / 1024).toFixed(1)} KB)`);
}

const SHARED_MODELS = [
  {
    id: 'anime-boy-01',
    out: 'public/models/avatars/anime-boy-01.glb',
    style: 'male',
    hairVariant: 'spiky',
    skinTone: '#fce0c8',
    hairColor: '#1e2438',
    hairHighlight: '#3b4a78',
    eyeColor: '#4f46e5',
    outfitPrimary: '#312e81',
    outfitSecondary: '#e2e8f0',
    pantsColor: '#1e293b',
    shoeColor: '#0f172a',
  },
  {
    id: 'anime-boy-02',
    out: 'public/models/avatars/anime-boy-02.glb',
    style: 'male',
    hairVariant: 'swept',
    skinTone: '#f7d5b9',
    hairColor: '#27272a',
    hairHighlight: '#52525b',
    eyeColor: '#0284c7',
    outfitPrimary: '#0f766e',
    outfitSecondary: '#f1f5f9',
    pantsColor: '#1e293b',
    shoeColor: '#18181b',
  },
  {
    id: 'anime-girl-01',
    out: 'public/models/avatars/anime-girl-01.glb',
    style: 'female',
    hairVariant: 'ponytail',
    skinTone: '#fde4d0',
    hairColor: '#3b2436',
    hairHighlight: '#6b3e62',
    eyeColor: '#8b5cf6',
    outfitPrimary: '#c4b5fd',
    outfitSecondary: '#f8fafc',
    pantsColor: '#334155',
    shoeColor: '#4c1d95',
  },
  {
    id: 'anime-girl-02',
    out: 'public/models/avatars/anime-girl-02.glb',
    style: 'female',
    hairVariant: 'twintails',
    skinTone: '#fce1cb',
    hairColor: '#4a2c2a',
    hairHighlight: '#7c4a46',
    eyeColor: '#db2777',
    outfitPrimary: '#fda4af',
    outfitSecondary: '#fff1f2',
    pantsColor: '#334155',
    shoeColor: '#831843',
  },
];

for (const cfg of SHARED_MODELS) {
  const { root, animations } = buildAnimeCharacter(cfg);
  await exportGLB(root, animations, cfg.out);
}
