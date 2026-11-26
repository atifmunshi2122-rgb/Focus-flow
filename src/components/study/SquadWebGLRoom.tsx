/**
 * FocusFlow & Finance — 360° Interactive WebGL 3D Study Room (Three.js)
 *
 * Lazy-loaded only when the user selects the "360° WebGL Room" view inside a Study Squad.
 * Renders a cozy low-poly dark-academia / lo-fi study room with:
 * - OrbitControls (drag to rotate 360°, scroll/pinch to zoom, reset camera)
 * - Up to 8 interactive study desks arranged in a cozy lounge
 * - Live "Studying Now" desks: glowing desk lamp + warm point light + lit monitor + animated seated avatar + floating live label
 * - Offline/idle desks: dimmed screen, lamp off, subtle nameplate
 * - Raycaster click-to-select any desk to inspect member stats
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCcw, Sparkles, Move3d } from 'lucide-react';
import type { RankedLeaderboardEntry } from '../../types/leaderboard.ts';

interface SquadWebGLRoomProps {
  entries: RankedLeaderboardEntry[];
  selectedUid: string | null;
  onSelectMember: (uid: string) => void;
  ambiance: 'night' | 'dusk';
}

function createLabelSprite(
  name: string,
  subtitle: string,
  accentHex: string,
  isLive: boolean
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Rounded pill background
    const r = 28;
    const x = 16;
    const y = 16;
    const w = 480;
    const h = 112;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fillStyle = isLive ? 'rgba(15, 23, 42, 0.92)' : 'rgba(15, 23, 42, 0.78)';
    ctx.fill();
    ctx.lineWidth = isLive ? 4 : 2;
    ctx.strokeStyle = isLive ? '#f87171' : 'rgba(148, 163, 184, 0.35)';
    ctx.stroke();

    // Avatar dot / live pulse dot
    ctx.beginPath();
    ctx.arc(54, 56, 12, 0, Math.PI * 2);
    ctx.fillStyle = isLive ? '#ef4444' : accentHex;
    ctx.fill();

    // Member Name
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px ui-sans-serif, system-ui, -apple-system, sans-serif';
    const trimmedName = name.length > 18 ? `${name.slice(0, 17)}…` : name;
    ctx.fillText(trimmedName, 80, 66);

    // Subtitle (Subject / Hours)
    ctx.fillStyle = isLive ? '#fca5a5' : '#94a3b8';
    ctx.font = '600 22px ui-monospace, SFMono-Regular, monospace';
    const trimmedSub = subtitle.length > 28 ? `${subtitle.slice(0, 27)}…` : subtitle;
    ctx.fillText(trimmedSub, 80, 104);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.35, 0.66, 1);
  return sprite;
}

const DESK_SLOTS: Array<{ x: number; z: number; rotY: number }> = [
  { x: -3.4, z: -1.6, rotY: 0 },
  { x: -1.15, z: -1.6, rotY: 0 },
  { x: 1.15, z: -1.6, rotY: 0 },
  { x: 3.4, z: -1.6, rotY: 0 },
  { x: -3.4, z: 1.75, rotY: Math.PI },
  { x: -1.15, z: 1.75, rotY: Math.PI },
  { x: 1.15, z: 1.75, rotY: Math.PI },
  { x: 3.4, z: 1.75, rotY: Math.PI },
];

export const SquadWebGLRoom: React.FC<SquadWebGLRoomProps> = ({
  entries,
  selectedUid,
  onSelectMember,
  ambiance,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const autoOrbitRef = useRef(true);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  const handleResetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.set(0, 6.2, 8.6);
    controlsRef.current.target.set(0, 0.7, 0);
    controlsRef.current.update();
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setWebglError('WebGL is not available on this device/browser.');
      return;
    }

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 360);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const isNight = ambiance === 'night';
    scene.background = new THREE.Color(isNight ? 0x0b1020 : 0x1a1625);
    scene.fog = new THREE.Fog(isNight ? 0x0b1020 : 0x1a1625, 14, 28);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
    camera.position.set(0, 6.2, 8.6);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.5;
    controls.maxDistance = 15;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minPolarAngle = 0.25;
    controls.target.set(0, 0.7, 0);
    controls.update();
    controlsRef.current = controls;

    // Pause auto-orbit when user drags
    const onControlStart = () => {
      autoOrbitRef.current = false;
      setAutoOrbit(false);
    };
    controls.addEventListener('start', onControlStart);

    // Ambient + directional lights
    const ambientLight = new THREE.AmbientLight(isNight ? 0x7c8db5 : 0xc4a484, isNight ? 0.65 : 0.85);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(isNight ? 0x93c5fd : 0xfdba74, isNight ? 0.85 : 1.15);
    keyLight.position.set(5, 9, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    // Room floor
    const floorGeo = new THREE.BoxGeometry(11.6, 0.24, 7.6);
    const floorMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x171e30 : 0x241d2e,
      roughness: 0.85,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.12, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    // Cozy center rug
    const rugGeo = new THREE.BoxGeometry(9.4, 0.03, 5.2);
    const rugMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x1e293b : 0x31263d,
      roughness: 0.95,
    });
    const rug = new THREE.Mesh(rugGeo, rugMat);
    rug.position.set(0, 0.015, 0.05);
    rug.receiveShadow = true;
    scene.add(rug);

    // Subtle floor grid accent
    const grid = new THREE.GridHelper(11.4, 18, 0x334155, 0x1e293b);
    grid.position.y = 0.01;
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Back wall & left wall (cutaway diorama style so camera never gets blocked)
    const wallMat = new THREE.MeshStandardMaterial({
      color: isNight ? 0x131a2c : 0x201a2c,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(11.6, 3.8, 0.2), wallMat);
    backWall.position.set(0, 1.9, -3.7);
    backWall.receiveShadow = true;
    scene.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.8, 7.6), wallMat);
    leftWall.position.set(-5.7, 1.9, 0);
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Glowing Window on Back Wall
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.9, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
    );
    windowFrame.position.set(0, 2.25, -3.58);
    scene.add(windowFrame);

    const windowGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(3.15, 1.65),
      new THREE.MeshBasicMaterial({ color: isNight ? 0x1e3a8a : 0xd97706 })
    );
    windowGlass.position.set(0, 2.25, -3.5);
    scene.add(windowGlass);

    // Moon / Sun disc in window
    const orb = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 24),
      new THREE.MeshBasicMaterial({ color: isNight ? 0xfef08a : 0xfde047 })
    );
    orb.position.set(0.85, 2.55, -3.49);
    scene.add(orb);

    // Bookshelves on Back Wall (Left & Right of window)
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.8 });
    const bookColors = [0x6366f1, 0x10b981, 0xf59e0b, 0xec4899, 0x38bdf8, 0xa855f7];
    [-3.6, 3.6].forEach((sx) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.3, 0.36), shelfMat);
      frame.position.set(sx, 1.2, -3.42);
      frame.castShadow = true;
      scene.add(frame);

      for (let row = 0; row < 3; row++) {
        for (let b = 0; b < 6; b++) {
          const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.22, 0.38 + ((b + row) % 3) * 0.06, 0.24),
            new THREE.MeshStandardMaterial({
              color: bookColors[(b + row * 2) % bookColors.length],
              roughness: 0.7,
            })
          );
          book.position.set(sx - 0.75 + b * 0.3, 0.55 + row * 0.65, -3.35);
          scene.add(book);
        }
      }
    });

    // Clickable meshes map -> member uid
    const clickableMeshes: THREE.Object3D[] = [];
    const liveAvatars: Array<{ group: THREE.Group; baseY: number; phase: number }> = [];
    const liveLights: Array<{ light: THREE.PointLight; baseIntensity: number; phase: number }> = [];

    const visibleEntries = entries.slice(0, DESK_SLOTS.length);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4b3832, roughness: 0.75 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4, roughness: 0.5 });
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });

    DESK_SLOTS.forEach((slot, idx) => {
      const entry = visibleEntries[idx] || null;
      const isLive = Boolean(entry?.isStudyingLive);
      const isSelected = Boolean(entry && selectedUid === entry.uid);

      const deskGroup = new THREE.Group();
      deskGroup.position.set(slot.x, 0, slot.z);
      deskGroup.rotation.y = slot.rotY;

      // Desk tabletop
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.08, 0.92),
        isSelected
          ? new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.5 })
          : woodMat
      );
      top.position.set(0, 0.76, 0);
      top.castShadow = true;
      top.receiveShadow = true;
      deskGroup.add(top);

      // 4 Desk legs
      [
        [-0.78, -0.38],
        [0.78, -0.38],
        [-0.78, 0.38],
        [0.78, 0.38],
      ].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.76, 0.06), legMat);
        leg.position.set(lx, 0.38, lz);
        leg.castShadow = true;
        deskGroup.add(leg);
      });

      // Monitor stand & screen
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.08), legMat);
      stand.position.set(0, 0.91, -0.22);
      deskGroup.add(stand);

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.46, 0.04), legMat);
      bezel.position.set(0, 1.12, -0.22);
      bezel.castShadow = true;
      deskGroup.add(bezel);

      const screenMat = isLive
        ? new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x38bdf8,
            emissiveIntensity: 0.85,
            roughness: 0.2,
          })
        : new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.4,
          });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.38), screenMat);
      screen.position.set(0, 1.12, -0.195);
      deskGroup.add(screen);

      // Desk Lamp
      const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 12), legMat);
      lampBase.position.set(0.62, 0.82, -0.2);
      deskGroup.add(lampBase);

      const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 8), legMat);
      lampStem.position.set(0.62, 1.0, -0.2);
      deskGroup.add(lampStem);

      const lampShade = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.16, 12),
        new THREE.MeshStandardMaterial({
          color: isLive ? 0xfbbf24 : 0x475569,
          emissive: isLive ? 0xf59e0b : 0x000000,
          emissiveIntensity: isLive ? 0.9 : 0,
        })
      );
      lampShade.position.set(0.56, 1.18, -0.16);
      lampShade.rotation.z = 0.25;
      deskGroup.add(lampShade);

      if (isLive) {
        const lampLight = new THREE.PointLight(0xfbbf24, 1.9, 3.6, 1.8);
        lampLight.position.set(0.45, 1.12, -0.05);
        deskGroup.add(lampLight);
        liveLights.push({ light: lampLight, baseIntensity: 1.9, phase: idx * 1.1 });
      }

      // Chair
      const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.07, 0.52), chairMat);
      chairSeat.position.set(0, 0.46, 0.56);
      chairSeat.castShadow = true;
      deskGroup.add(chairSeat);

      const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.56, 0.07), chairMat);
      chairBack.position.set(0, 0.74, 0.8);
      chairBack.castShadow = true;
      deskGroup.add(chairBack);

      const chairPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.44, 10), legMat);
      chairPost.position.set(0, 0.23, 0.56);
      deskGroup.add(chairPost);

      // Seated Student Avatar if a member owns this desk
      if (entry) {
        const avatarColor = new THREE.Color(entry.avatarColor || '#6366f1');
        const avatarGroup = new THREE.Group();
        avatarGroup.position.set(0, 0.52, 0.52);

        const torso = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.18, 0.28, 6, 12),
          new THREE.MeshStandardMaterial({
            color: avatarColor,
            roughness: 0.55,
            emissive: isLive ? avatarColor : new THREE.Color(0x000000),
            emissiveIntensity: isLive ? 0.18 : 0,
          })
        );
        torso.position.y = 0.24;
        torso.castShadow = true;
        avatarGroup.add(torso);

        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.17, 16, 16),
          new THREE.MeshStandardMaterial({
            color: isLive ? 0xfde68a : 0xcbd5e1,
            roughness: 0.6,
          })
        );
        head.position.y = 0.62;
        head.castShadow = true;
        avatarGroup.add(head);

        deskGroup.add(avatarGroup);
        if (isLive) {
          liveAvatars.push({ group: avatarGroup, baseY: 0.52, phase: idx * 0.9 });
        }

        // Selection ring under desk
        if (isSelected) {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.95, 1.08, 32),
            new THREE.MeshBasicMaterial({ color: 0x818cf8, side: THREE.DoubleSide })
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.035;
          deskGroup.add(ring);
        }

        // Floating nameplate sprite
        const subtitle = isLive
          ? `LIVE • ${entry.activeSubject || 'Deep Focus'} • ${
              entry.liveElapsedMinutes > 0 ? `${entry.liveElapsedMinutes}m` : '<1m'
            }`
          : `#${entry.rank} • ${entry.hoursFormatted} • ${entry.streakDays}d`;
        const sprite = createLabelSprite(entry.displayName, subtitle, entry.avatarColor, isLive);
        sprite.position.set(0, 1.95, 0.15);
        deskGroup.add(sprite);

        // Invisible hit box for easy clicking
        const hitBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 2.0, 1.7),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitBox.position.set(0, 1.0, 0.25);
        hitBox.userData = { memberUid: entry.uid };
        deskGroup.add(hitBox);
        clickableMeshes.push(hitBox);
      }

      scene.add(deskGroup);
    });

    // Raycaster for desk click selection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // Ignore orbit drags
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const uid = hits[0].object.userData?.memberUid;
        if (typeof uid === 'string') {
          onSelectMember(uid);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // Responsive ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 340);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation loop
    let animFrameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (autoOrbitRef.current) {
        const radius = Math.hypot(camera.position.x, camera.position.z);
        const angle = Math.atan2(camera.position.x, camera.position.z) + 0.0022;
        camera.position.x = Math.sin(angle) * radius;
        camera.position.z = Math.cos(angle) * radius;
      }

      // Gentle breathing motion for live-studying avatars & subtle warm lamp shimmer
      for (const item of liveAvatars) {
        item.group.position.y = item.baseY + Math.sin(t * 2.4 + item.phase) * 0.025;
      }
      for (const l of liveLights) {
        l.light.intensity = l.baseIntensity + Math.sin(t * 3.1 + l.phase) * 0.14;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animFrameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else if (mat) {
          if ((mat as THREE.SpriteMaterial).map) {
            (mat as THREE.SpriteMaterial).map?.dispose();
          }
          mat.dispose();
        }
      });
      renderer.dispose();
      if (container) container.innerHTML = '';
    };
  }, [entries, selectedUid, ambiance, onSelectMember]);

  if (webglError) {
    return (
      <div className="p-8 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-center text-xs text-[var(--ff-text-muted)]">
        {webglError} Switch to <strong>Isometric Lounge</strong> or <strong>3D Pods</strong> above.
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[var(--ff-border-color)] bg-[#0b1020]">
      <div ref={containerRef} className="w-full h-[380px] sm:h-[460px] cursor-grab active:cursor-grabbing" />

      {/* Floating 3D Controls Overlay */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/75 backdrop-blur-md border border-slate-700/60 text-[11px] text-slate-200 pointer-events-none">
        <Move3d className="w-3.5 h-3.5 text-indigo-400" />
        <span>Drag to orbit 360° • Scroll to zoom • Click a desk</span>
      </div>

      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAutoOrbit((v) => !v)}
          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border backdrop-blur-md transition-colors flex items-center gap-1 ${
            autoOrbit
              ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-200'
              : 'bg-slate-950/75 border-slate-700/60 text-slate-300 hover:text-white'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          <span>{autoOrbit ? 'Orbiting' : 'Auto-Orbit'}</span>
        </button>
        <button
          type="button"
          onClick={handleResetCamera}
          className="p-1.5 rounded-xl bg-slate-950/75 border border-slate-700/60 text-slate-300 hover:text-white backdrop-blur-md transition-colors"
          title="Reset camera angle"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default SquadWebGLRoom;
