import * as THREE from 'three';

const ARENA = 40;

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120822);
  scene.fog = new THREE.FogExp2(0x1e0d38, 0.010);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 120);

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x7755cc, 0.7));

  const moon = new THREE.DirectionalLight(0xaad4ff, 1.4);
  moon.position.set(-20, 50, 10);
  scene.add(moon);

  const warmFill = new THREE.DirectionalLight(0xff9944, 0.4);
  warmFill.position.set(20, 10, -20);
  scene.add(warmFill);

  // ── Ground ─────────────────────────────────────────────────────────────────
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x0e2208, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(ARENA * 2, 32, 0x2a0d55, 0x1a0833);
  grid.position.y = 0.01;
  scene.add(grid);

  // ── Arena walls ────────────────────────────────────────────────────────────
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x6600cc, transparent: true, opacity: 0.5 });
  [
    { geo: new THREE.BoxGeometry(ARENA * 2, 3, 0.5), pos: [0, 1.5, -ARENA] },
    { geo: new THREE.BoxGeometry(ARENA * 2, 3, 0.5), pos: [0, 1.5,  ARENA] },
    { geo: new THREE.BoxGeometry(0.5, 3, ARENA * 2), pos: [-ARENA, 1.5, 0] },
    { geo: new THREE.BoxGeometry(0.5, 3, ARENA * 2), pos: [ ARENA, 1.5, 0] },
  ].forEach(({ geo, pos }) => {
    const m = new THREE.Mesh(geo, wallMat);
    m.position.set(...pos);
    scene.add(m);
  });

  // ── Fantasy Trees ──────────────────────────────────────────────────────────
  const TREE_VARIANTS = [
    { trunk: 0x3d1a08, foliage: 0x0d3d1a, glow: 0x04200e, mushColor: 0xcc44ff, height: 4.0 },
    { trunk: 0x2a1505, foliage: 0x2d1669, glow: 0x150832, mushColor: 0x44aaff, height: 5.2 },
    { trunk: 0x4a2010, foliage: 0x0d4d42, glow: 0x04261e, mushColor: 0x44ffaa, height: 4.6 },
  ];

  const trunkMats  = TREE_VARIANTS.map(v => new THREE.MeshStandardMaterial({ color: v.trunk, roughness: 0.95 }));
  const foliageMats = TREE_VARIANTS.map(v => new THREE.MeshStandardMaterial({
    color: v.foliage, roughness: 0.8, emissive: v.glow, emissiveIntensity: 0.6,
  }));

  function makeTree(x, z, vi) {
    const v = TREE_VARIANTS[vi];
    const group = new THREE.Group();

    // Trunk — slightly tapered cylinder
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.44, v.height, 7),
      trunkMats[vi]
    );
    trunk.position.y = v.height / 2;
    group.add(trunk);

    // Knot / root buttresses
    for (let r = 0; r < 4; r++) {
      const angle = (r / 4) * Math.PI * 2;
      const root = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.7, 0.5),
        trunkMats[vi]
      );
      root.position.set(Math.cos(angle) * 0.38, 0.35, Math.sin(angle) * 0.38);
      root.rotation.y = angle;
      root.rotation.z = Math.cos(angle) * 0.35;
      group.add(root);
    }

    // Canopy — stacked spheres for fluffy look
    [
      [0,    0,    0,    2.3],
      [0.5,  0,    0.3,  1.9],
      [-0.4, 0,   -0.2,  1.8],
      [0,    1.4,  0,    1.6],
      [0,    2.7,  0,    1.1],
    ].forEach(([cx, cy, cz, r]) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), foliageMats[vi]);
      leaf.position.set(cx, v.height + 0.6 + cy, cz);
      group.add(leaf);
    });

    // Glowing mushrooms at base
    const mushMat = new THREE.MeshStandardMaterial({
      color: v.mushColor, emissive: v.mushColor, emissiveIntensity: 1.0, roughness: 0.4,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xddddc8, roughness: 0.9 });

    for (let m = 0; m < 4; m++) {
      const angle = (m / 4) * Math.PI * 2 + vi * 0.9;
      const dist  = 0.75 + (m % 2) * 0.3;
      const mush  = new THREE.Group();
      const stem  = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.32, 5), stemMat);
      stem.position.y = 0.16;
      mush.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), mushMat);
      cap.scale.y = 0.55;
      cap.position.y = 0.34;
      mush.add(cap);
      mush.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      group.add(mush);
    }

    group.position.set(x, 0, z);
    scene.add(group);
  }

  const TREE_POSITIONS = [
    [-12, -12, 0], [12, -12, 1],
    [-12,  12, 2], [12,  12, 0],
    [0,  -20, 1],  [0,   20, 2],
    [-20,  0, 0],  [20,   0, 1],
  ];
  TREE_POSITIONS.forEach(([x, z, vi]) => makeTree(x, z, vi));


  // ── Stars in the sky ──────────────────────────────────────────────────────
  const starGeo = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 400; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(Math.random());          // upper hemisphere
    const r     = 90 + Math.random() * 20;
    starPositions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, sizeAttenuation: true });
  scene.add(new THREE.Points(starGeo, starMat));

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const colliders = {
    arenaSize: ARENA,
    trees: TREE_POSITIONS.map(([x, z]) => ({ x, z, radius: 0.7 })),
  };

  return { scene, camera, renderer, colliders };
}
