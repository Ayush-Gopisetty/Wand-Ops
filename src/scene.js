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
  scene.add(new THREE.AmbientLight(0x88779a, 0.6));

  const moon = new THREE.DirectionalLight(0xc8d8ff, 1.2);
  moon.position.set(-20, 50, 10);
  scene.add(moon);

  const warmFill = new THREE.DirectionalLight(0xff9944, 0.35);
  warmFill.position.set(20, 10, -20);
  scene.add(warmFill);

  // ── Ground (dark grey flagstone) ──────────────────────────────────────────
  function makeFlagstoneTexture() {
    const S = 1024;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, S, S);

    const COLS = 8, ROWS = 8;
    const cw = S / COLS, ch = S / ROWS;

    const pts = [];
    for (let r = 0; r <= ROWS; r++) {
      pts[r] = [];
      for (let c = 0; c <= COLS; c++) {
        pts[r][c] = {
          x: c * cw + (r > 0 && r < ROWS ? (Math.random() - 0.5) * cw * 0.42 : 0),
          y: r * ch + (c > 0 && c < COLS ? (Math.random() - 0.5) * ch * 0.42 : 0),
        };
      }
    }

    // Dark grey palette with subtle variation
    const PALETTES = [
      [220, 4, 20], [220, 3, 24], [220, 5, 18],
      [220, 3, 26], [220, 4, 22], [220, 2, 28],
    ];

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const [h, s, l] = PALETTES[Math.floor(Math.random() * PALETTES.length)];
        const lv = l + (Math.random() - 0.5) * 5;
        const gap = 4;
        const tl = pts[r][c],     tr = pts[r][c + 1];
        const br = pts[r+1][c+1], bl = pts[r+1][c];
        const mx = (tl.x + tr.x + br.x + bl.x) / 4;
        const my = (tl.y + tr.y + br.y + bl.y) / 4;

        ctx.fillStyle = `hsl(${h},${s}%,${lv}%)`;
        ctx.beginPath();
        ctx.moveTo(tl.x + gap, tl.y + gap);
        ctx.lineTo(tr.x - gap, tr.y + gap);
        ctx.lineTo(br.x - gap, br.y - gap);
        ctx.lineTo(bl.x + gap, bl.y - gap);
        ctx.closePath();
        ctx.fill();

        const grad = ctx.createRadialGradient(mx - cw * 0.1, my - ch * 0.1, 0, mx, my, Math.max(cw, ch) * 0.65);
        grad.addColorStop(0, `hsla(${h},${s}%,${lv + 8}%,0.35)`);
        grad.addColorStop(1, `hsla(${h},${s}%,${lv - 10}%,0.5)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(tl.x + gap, tl.y + gap);
        ctx.lineTo(tr.x - gap, tr.y + gap);
        ctx.lineTo(br.x - gap, br.y - gap);
        ctx.lineTo(bl.x + gap, bl.y - gap);
        ctx.closePath();
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    return tex;
  }

  const groundMat = new THREE.MeshStandardMaterial({ map: makeFlagstoneTexture(), roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);


  // ── Arena walls (stone fortress) ──────────────────────────────────────────
  function makeStoneWallTexture() {
    const S = 1024, MORTAR = 5;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, S, S);

    const ROW_H = 90;
    let y = 0, row = 0;
    while (y < S) {
      const rh = ROW_H + (Math.random() - 0.5) * 16;
      const stagger = (row % 2) * 110;
      let x = -stagger;
      while (x < S) {
        const bw = 140 + (Math.random() - 0.5) * 60;
        const l  = 18 + Math.random() * 10;  // dark grey range
        const h  = 220;
        const s  = 3 + Math.random() * 4;
        ctx.fillStyle = `hsl(${h},${s}%,${l}%)`;
        ctx.fillRect(x + MORTAR, y + MORTAR, bw - MORTAR * 2, rh - MORTAR * 2);

        // Highlight top-left
        ctx.fillStyle = `hsla(${h},${s}%,${l + 10}%,0.35)`;
        ctx.fillRect(x + MORTAR, y + MORTAR, bw - MORTAR * 2, 6);
        ctx.fillRect(x + MORTAR, y + MORTAR, 6, rh - MORTAR * 2);

        // Shadow bottom-right
        ctx.fillStyle = `hsla(${h},${s}%,${l - 10}%,0.5)`;
        ctx.fillRect(x + MORTAR, y + rh - MORTAR - 6, bw - MORTAR * 2, 6);
        ctx.fillRect(x + bw - MORTAR - 6, y + MORTAR, 6, rh - MORTAR * 2);

        x += bw;
      }
      y += rh;
      row++;
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 1);
    return tex;
  }

  const stoneMat = new THREE.MeshStandardMaterial({ map: makeStoneWallTexture(), roughness: 0.93, metalness: 0.04 });

  function buildWall(cx, cz, isVertical) {
    const len = ARENA * 2;
    const w = isVertical ? 1.2 : len;
    const d = isVertical ? len : 1.2;

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.8, d), stoneMat);
    body.position.set(cx, 1.9, cz);
    scene.add(body);

    // Battlements (merlons)
    const count = Math.floor(len / 4.5);
    for (let i = 0; i < count; i++) {
      const t   = (i + 0.5) / count;
      const off = (t - 0.5) * (len - 4.5);
      const mx  = isVertical ? cx       : cx + off;
      const mz  = isVertical ? cz + off : cz;
      const mw  = isVertical ? 1.5 : 1.9;
      const md  = isVertical ? 1.9 : 1.5;
      const m   = new THREE.Mesh(new THREE.BoxGeometry(mw, 1.4, md), stoneMat);
      m.position.set(mx, 4.6, mz);
      scene.add(m);
    }
  }

  buildWall(0,      -ARENA, false);
  buildWall(0,       ARENA, false);
  buildWall(-ARENA,  0,     true);
  buildWall( ARENA,  0,     true);

  // Corner towers + torchlight
  const torchMat = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff4400, emissiveIntensity: 1.2, roughness: 0.5 });
  [-ARENA, ARENA].forEach(tx => [-ARENA, ARENA].forEach(tz => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 6.8, 8), stoneMat);
    tower.position.set(tx, 3.4, tz);
    scene.add(tower);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 1.1), stoneMat);
      mb.position.set(tx + Math.cos(a) * 1.9, 7.35, tz + Math.sin(a) * 1.9);
      scene.add(mb);
    }

    // Torch bracket + flame
    const inset = tx > 0 ? -3.5 : 3.5;
    const insetZ = tz > 0 ? -3.5 : 3.5;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 6), torchMat);
    flame.position.set(tx + inset * 0.5, 5.2, tz + insetZ * 0.5);
    scene.add(flame);

    const pt = new THREE.PointLight(0xff8833, 3.5, 22);
    pt.position.set(tx + inset * 0.5, 5.2, tz + insetZ * 0.5);
    scene.add(pt);
  }));

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


  // ── Elevated platforms + ramps ─────────────────────────────────────────────
  const PLAT_H     = 3.0;
  const RAMP_HDIST = 5.5;
  const RAMP_SLEN  = Math.sqrt(RAMP_HDIST * RAMP_HDIST + PLAT_H * PLAT_H);
  const RAMP_ANG   = Math.atan2(PLAT_H, RAMP_HDIST);
  const PAR_H      = 1.2;
  const PAR_T      = 0.45;
  const GRND_Y_    = 0.75;

  const elevPlatforms = [], elevRamps = [], elevBoxes = [];

  function addBox(x, y, z, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // [cx, cz, axis]  axis='z' → slope along Z (N/S platforms), 'x' → slope along X (W/E)
  [
    [0,     -30.5, 'z'],
    [0,      30.5, 'z'],
    [-30.5,  0,    'x'],
    [ 30.5,  0,    'x'],
  ].forEach(([cx, cz, axis]) => {
    const isZ  = axis === 'z';
    const sign = isZ ? Math.sign(cz) : Math.sign(cx);
    const pw   = isZ ? 10 : 9;   // x-dimension of platform box
    const pd   = isZ ?  9 : 10;  // z-dimension of platform box
    const hw   = pw / 2, hd = pd / 2;

    // Platform body
    addBox(cx, PLAT_H / 2, cz, pw, PLAT_H, pd);

    // Ramp — sloped box connecting ground to platform top
    const edgeP = isZ ? (cz - sign * hd) : (cx - sign * hw); // platform edge facing center
    const edgeG = edgeP - sign * RAMP_HDIST;                  // ramp's ground-level end
    const rc    = (edgeP + edgeG) / 2;                        // ramp center on slope axis

    const rampMesh = addBox(
      isZ ? cx : rc,
      PLAT_H / 2,
      isZ ? rc : cz,
      isZ ? pw : RAMP_SLEN,
      0.5,
      isZ ? RAMP_SLEN : pd
    );
    if (isZ) rampMesh.rotation.x = -sign * RAMP_ANG;
    else     rampMesh.rotation.z =  sign * RAMP_ANG;

    // Parapets — 3-sided stone wall on top for cover (visual only)
    const parY = PLAT_H + PAR_H / 2;
    if (isZ) {
      addBox(cx,      parY, cz + sign * hd, pw,   PAR_H, PAR_T); // back wall
      addBox(cx - hw, parY, cz,             PAR_T, PAR_H, pd);   // left wall
      addBox(cx + hw, parY, cz,             PAR_T, PAR_H, pd);   // right wall
    } else {
      addBox(cx + sign * hw, parY, cz,      PAR_T, PAR_H, pd);   // back wall
      addBox(cx, parY, cz - hd,             pw,   PAR_H, PAR_T); // left wall
      addBox(cx, parY, cz + hd,             pw,   PAR_H, PAR_T); // right wall
    }

    // Collision data
    if (isZ) {
      elevPlatforms.push({ xMin: cx - hw, xMax: cx + hw, zMin: cz - hd, zMax: cz + hd, y: GRND_Y_ + PLAT_H });
      elevBoxes.push({     xMin: cx - hw, xMax: cx + hw, zMin: cz - hd, zMax: cz + hd, maxY: GRND_Y_ + PLAT_H });
      elevRamps.push({
        xMin: cx - hw, xMax: cx + hw,
        zMin: Math.min(edgeP, edgeG), zMax: Math.max(edgeP, edgeG),
        axis: 'z', axisStart: edgeG, axisEnd: edgeP,
        yStart: GRND_Y_, yEnd: GRND_Y_ + PLAT_H,
      });
    } else {
      elevPlatforms.push({ xMin: cx - hw, xMax: cx + hw, zMin: cz - hd, zMax: cz + hd, y: GRND_Y_ + PLAT_H });
      elevBoxes.push({     xMin: cx - hw, xMax: cx + hw, zMin: cz - hd, zMax: cz + hd, maxY: GRND_Y_ + PLAT_H });
      elevRamps.push({
        xMin: Math.min(edgeP, edgeG), xMax: Math.max(edgeP, edgeG),
        zMin: cz - hd, zMax: cz + hd,
        axis: 'x', axisStart: edgeG, axisEnd: edgeP,
        yStart: GRND_Y_, yEnd: GRND_Y_ + PLAT_H,
      });
    }
  });


  // ── Central Castle ───────────────────────────────────────────────────────────
  const CW      = 9;      // half-size: walls sit at x=±CW, z=±CW
  const CWAH    = 5.5;    // curtain wall height
  const CWT     = 1.2;    // wall thickness
  const CTR     = 2.2;    // corner tower radius
  const CTH     = 8.0;    // corner tower height
  const CKR     = 3.2;    // keep radius
  const CKH     = 13.0;   // keep height
  const CKZ     = -3.0;   // keep Z (north side of courtyard)
  const GATE_HW = 1.6;    // gate half-width (total opening = 3.2)
  const INNER   = (CW - CTR) * 2;            // wall span between towers = 13.6
  const SW_W    = CW - CTR - GATE_HW;        // each south wall half-width = 5.2

  function addMerlons(cx, cz, wallLen, isVert) {
    const count = Math.floor(wallLen / 2.4);
    for (let i = 0; i < count; i++) {
      if (i % 2 !== 0) continue;
      const off = ((i + 0.5) / count - 0.5) * wallLen;
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        isVert ? CWT + 0.5 : 1.5,
        1.2,
        isVert ? 1.5 : CWT + 0.5,
      ), stoneMat);
      m.position.set(isVert ? cx : cx + off, CWAH + 0.6, isVert ? cz + off : cz);
      scene.add(m);
    }
  }

  // North wall
  addBox(0, CWAH / 2, -CW, INNER, CWAH, CWT);
  addMerlons(0, -CW, INNER, false);

  // South wall — left & right of gate
  addBox(-(GATE_HW + SW_W / 2), CWAH / 2, CW, SW_W, CWAH, CWT);
  addBox( (GATE_HW + SW_W / 2), CWAH / 2, CW, SW_W, CWAH, CWT);
  addMerlons(-(GATE_HW + SW_W / 2), CW, SW_W, false);
  addMerlons( (GATE_HW + SW_W / 2), CW, SW_W, false);

  // Gate lintel (visual only — players walk under it)
  addBox(0, CWAH - 0.55, CW, GATE_HW * 2, 1.0, CWT);

  // East & West walls
  addBox( CW, CWAH / 2, 0, CWT, CWAH, INNER);
  addBox(-CW, CWAH / 2, 0, CWT, CWAH, INNER);
  addMerlons( CW, 0, INNER, true);
  addMerlons(-CW, 0, INNER, true);

  // Corner towers
  [[-CW, -CW], [CW, -CW], [CW, CW], [-CW, CW]].forEach(([tx, tz]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(CTR, CTR * 1.1, CTH, 10), stoneMat);
    tower.position.set(tx, CTH / 2, tz);
    scene.add(tower);
    for (let i = 0; i < 10; i++) {
      if (i % 2 !== 0) continue;
      const a = (i / 10) * Math.PI * 2;
      const mb = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.85), stoneMat);
      mb.position.set(tx + Math.cos(a) * (CTR - 0.35), CTH + 0.52, tz + Math.sin(a) * (CTR - 0.35));
      scene.add(mb);
    }
    const tPt = new THREE.PointLight(0xff8833, 2.2, 14);
    tPt.position.set(tx * 0.68, 4.5, tz * 0.68);
    scene.add(tPt);
  });

  // Central keep
  const keepMesh = new THREE.Mesh(new THREE.CylinderGeometry(CKR, CKR * 1.1, CKH, 12), stoneMat);
  keepMesh.position.set(0, CKH / 2, CKZ);
  scene.add(keepMesh);
  for (let i = 0; i < 12; i++) {
    if (i % 2 !== 0) continue;
    const a = (i / 12) * Math.PI * 2;
    const mb = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.3, 1.05), stoneMat);
    mb.position.set(Math.cos(a) * (CKR - 0.4), CKH + 0.65, CKZ + Math.sin(a) * (CKR - 0.4));
    scene.add(mb);
  }
  // Flag on keep
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x666677, roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), poleMat);
  pole.position.set(0, CKH + 1.6, CKZ);
  scene.add(pole);
  const flagMat2 = new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0x550000, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), flagMat2);
  flagMesh.position.set(0.8, CKH + 2.5, CKZ);
  scene.add(flagMesh);
  const keepPt = new THREE.PointLight(0xff7733, 3.5, 24);
  keepPt.position.set(0, 5.5, CKZ);
  scene.add(keepPt);

  // Castle colliders
  const castleBoxes = [
    { xMin: -(CW - CTR), xMax:  CW - CTR,  zMin: -CW - CWT/2, zMax: -CW + CWT/2, maxY: CWAH + 3 }, // north wall
    { xMin: -(CW - CTR), xMax: -GATE_HW,   zMin:  CW - CWT/2, zMax:  CW + CWT/2, maxY: CWAH + 3 }, // south wall left
    { xMin:  GATE_HW,    xMax:  CW - CTR,  zMin:  CW - CWT/2, zMax:  CW + CWT/2, maxY: CWAH + 3 }, // south wall right
    { xMin:  CW - CWT/2, xMax:  CW + CWT/2, zMin: -(CW - CTR), zMax:  CW - CTR, maxY: CWAH + 3 }, // east wall
    { xMin: -CW - CWT/2, xMax: -CW + CWT/2, zMin: -(CW - CTR), zMax:  CW - CTR, maxY: CWAH + 3 }, // west wall
  ];
  const castleTowers = [
    { x: -CW, z: -CW, radius: CTR },
    { x:  CW, z: -CW, radius: CTR },
    { x:  CW, z:  CW, radius: CTR },
    { x: -CW, z:  CW, radius: CTR },
    { x:   0, z: CKZ, radius: CKR },
  ];

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
    trees: [...TREE_POSITIONS.map(([x, z]) => ({ x, z, radius: 0.7 })), ...castleTowers],
    platforms: elevPlatforms,
    ramps:     elevRamps,
    boxes:     [...elevBoxes, ...castleBoxes],
  };

  return { scene, camera, renderer, colliders };
}
