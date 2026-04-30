import * as THREE from 'three';

const ARENA = 40; // half-size of the square arena

export function createScene(canvas) {
  // ── Core objects ──────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.014);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(
    72,
    window.innerWidth / window.innerHeight,
    0.1,
    120
  );

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  const sun = new THREE.DirectionalLight(0xfff5e0, 2.0);
  sun.position.set(20, 40, 15);
  scene.add(sun);

  // ── Ground ─────────────────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(ARENA * 2, ARENA * 2, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Grid overlay
  const grid = new THREE.GridHelper(ARENA * 2, 32, 0x2d5a1b, 0x2d5a1b);
  grid.position.y = 0.01;
  scene.add(grid);

  // ── Arena walls (low glowing borders) ────────────────────────────────────
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x550099, transparent: true, opacity: 0.45 });
  const wallH = new THREE.BoxGeometry(ARENA * 2, 3, 0.5);
  const wallV = new THREE.BoxGeometry(0.5, 3, ARENA * 2);

  const wallDefs = [
    { geo: wallH, pos: [0, 1.5, -ARENA] },
    { geo: wallH, pos: [0, 1.5,  ARENA] },
    { geo: wallV, pos: [-ARENA, 1.5, 0] },
    { geo: wallV, pos: [ ARENA, 1.5, 0] },
  ];
  wallDefs.forEach(({ geo, pos }) => {
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(...pos);
    scene.add(m);
  });

  // ── Pillars (cover/obstacles) ─────────────────────────────────────────────
  const pillarGeo = new THREE.BoxGeometry(2, 4, 2);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a1060, roughness: 0.8 });
  const pillarPositions = [
    [-12, 2, -12], [12, 2, -12],
    [-12, 2,  12], [12, 2,  12],
    [0, 2, -20],   [0, 2,  20],
    [-20, 2, 0],   [20, 2,  0],
  ];
  pillarPositions.forEach(([x, y, z]) => {
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(x, y, z);
    scene.add(p);
  });

  // ── Clouds (simple white spheres high up) ─────────────────────────────────
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const cloudPositions = [
    [-30, 28, -20], [10, 32, -35], [35, 26, 5],
    [-15, 30, 30],  [25, 34, 20], [-40, 29, -5],
  ];
  cloudPositions.forEach(([x, y, z]) => {
    const group = new THREE.Group();
    [[0,0,0,2.5],[2.2,0.4,0,2],[-2,0.2,0,1.8],[0.8,0.8,1,1.5]].forEach(([cx,cy,cz,r]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 7), cloudMat);
      m.position.set(cx, cy, cz);
      group.add(m);
    });
    group.position.set(x, y, z);
    scene.add(group);
  });

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
