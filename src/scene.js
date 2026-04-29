import * as THREE from 'three';

const ARENA = 40; // half-size of the square arena

export function createScene(canvas) {
  // ── Core objects ──────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0d1a);
  scene.fog = new THREE.FogExp2(0x0d0d1a, 0.018);

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
  scene.add(new THREE.AmbientLight(0x8888cc, 0.7));

  const sun = new THREE.DirectionalLight(0xfff0cc, 1.1);
  sun.position.set(8, 14, 6);
  scene.add(sun);

  // Subtle fill from below for a magical atmosphere
  const fillLight = new THREE.PointLight(0x6600ff, 0.8, 60);
  fillLight.position.set(0, 0.5, 0);
  scene.add(fillLight);

  // ── Ground ─────────────────────────────────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(ARENA * 2, ARENA * 2, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1a3320, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Grid overlay
  const grid = new THREE.GridHelper(ARENA * 2, 32, 0x00ff88, 0x003311);
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

  // ── Stars (skybox feel) ───────────────────────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starCount = 600;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3]     = (Math.random() - 0.5) * 200;
    starPos[i * 3 + 1] = Math.random() * 80 + 10;
    starPos[i * 3 + 2] = (Math.random() - 0.5) * 200;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25 }));
  scene.add(stars);

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
