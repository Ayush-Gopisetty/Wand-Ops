import * as THREE from 'three';

const ARENA = 55;

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0xb8dff5, 0.0022);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 120);

  // ── Lighting ───────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xfff5e0, 1.1));

  const sun = new THREE.DirectionalLight(0xfffbe8, 2.8);
  sun.position.set(-24, 42, 18);
  scene.add(sun);

  const skyFill = new THREE.DirectionalLight(0xc8e8ff, 0.8);
  skyFill.position.set(20, 18, -20);
  scene.add(skyFill);

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
    tex.repeat.set(18, 18);
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
  const torchMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0xff6a1a, emissiveIntensity: 0.5, roughness: 0.5 });
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

    const pt = new THREE.PointLight(0xffa04d, 1.1, 14);
    pt.position.set(tx + inset * 0.5, 5.2, tz + insetZ * 0.5);
    scene.add(pt);
  }));

  // ── Shared helpers ────────────────────────────────────────────────────────
  const GRND_Y_ = 0.75;
  const elevPlatforms = [], elevRamps = [], elevBoxes = [];

  function addBox(x, y, z, w, h, d) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat);
    m.position.set(x, y, z);
    scene.add(m);
    return m;
  }

  // Stepped staircase visual (replaces a single sloped ramp box with stacked
  // steps, like the reference image). Collision still uses a smooth ramp.
  function addStaircase(axis, otherCenter, otherLen, lowCoord, highCoord, height, steps = 6) {
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const a0 = lowCoord + (highCoord - lowCoord) * t0;
      const a1 = lowCoord + (highCoord - lowCoord) * t1;
      const aCenter = (a0 + a1) / 2;
      const aLen    = Math.abs(a1 - a0) + 0.08;
      const stepTop = height * t1;
      addBox(
        axis === 'z' ? otherCenter : aCenter, stepTop / 2, axis === 'z' ? aCenter : otherCenter,
        axis === 'z' ? otherLen : aLen, stepTop, axis === 'z' ? aLen : otherLen,
      );
    }
  }

  // ── Outer cardinal platforms (L1, height 3.5) ────────────────────────────
  const L1_H    = 3.5;
  const L1_RUN  = 7.0;

  [
    { cx:  0,   cz: -40, axis: 'z', pw: 14, pd: 10 },
    { cx:  0,   cz:  40, axis: 'z', pw: 14, pd: 10 },
    { cx: -40,  cz:   0, axis: 'x', pw: 10, pd: 14 },
    { cx:  40,  cz:   0, axis: 'x', pw: 10, pd: 14 },
  ].forEach(({ cx, cz, axis, pw, pd }) => {
    const isZ  = axis === 'z';
    const sign = isZ ? Math.sign(cz) : Math.sign(cx);
    const hw = pw / 2, hd = pd / 2;

    addBox(cx, L1_H / 2, cz, pw, L1_H, pd);

    const edgeP = isZ ? (cz - sign * hd) : (cx - sign * hw);
    const edgeG = edgeP - sign * L1_RUN;
    addStaircase(axis, isZ ? cx : cz, isZ ? pw : pd, edgeG, edgeP, L1_H);

    // Parapets (3-sided cover)
    const parY = L1_H + 0.6;
    if (isZ) {
      addBox(cx,      parY, cz + sign * hd, pw,   1.2, 0.45);
      addBox(cx - hw, parY, cz,             0.45, 1.2, pd);
      addBox(cx + hw, parY, cz,             0.45, 1.2, pd);
    } else {
      addBox(cx + sign * hw, parY, cz, 0.45, 1.2, pd);
      addBox(cx, parY, cz - hd,        pw,   1.2, 0.45);
      addBox(cx, parY, cz + hd,        pw,   1.2, 0.45);
    }

    elevPlatforms.push({ xMin: cx - hw, xMax: cx + hw, zMin: cz - hd, zMax: cz + hd, y: GRND_Y_ + L1_H });
    elevBoxes.push({     xMin: cx - hw, xMax: cx + hw, zMin: cz - hd, zMax: cz + hd, maxY: GRND_Y_ + L1_H });
    if (isZ) {
      elevRamps.push({ xMin: cx - hw, xMax: cx + hw, zMin: Math.min(edgeP, edgeG), zMax: Math.max(edgeP, edgeG), axis: 'z', axisStart: edgeG, axisEnd: edgeP, yStart: GRND_Y_, yEnd: GRND_Y_ + L1_H, steps: 6 });
    } else {
      elevRamps.push({ xMin: Math.min(edgeP, edgeG), xMax: Math.max(edgeP, edgeG), zMin: cz - hd, zMax: cz + hd, axis: 'x', axisStart: edgeG, axisEnd: edgeP, yStart: GRND_Y_, yEnd: GRND_Y_ + L1_H, steps: 6 });
    }
  });

  // ── Diagonal mid-platforms (L2, height 2.2) — placed well outside castle ──
  const L2_H    = 2.2;
  const L2_RUN  = 5.5;

  // At ±28 the ramp ground-end lands at ±22 — clear of castle walls at ±13
  [[-28, -28], [28, -28], [-28, 28], [28, 28]].forEach(([cx, cz]) => {
    const signX = Math.sign(cx);
    addBox(cx, L2_H / 2, cz, 9, L2_H, 9);

    const edgeP = cx - signX * 4.5;
    const edgeG = edgeP - signX * L2_RUN;
    addStaircase('x', cz, 9, edgeG, edgeP, L2_H);

    const parY = L2_H + 0.55;
    addBox(cx + signX * 4.5, parY, cz, 0.4, 1.1, 9);
    addBox(cx, parY, cz - 4.5, 9, 1.1, 0.4);
    addBox(cx, parY, cz + 4.5, 9, 1.1, 0.4);

    elevPlatforms.push({ xMin: cx - 4.5, xMax: cx + 4.5, zMin: cz - 4.5, zMax: cz + 4.5, y: GRND_Y_ + L2_H });
    elevBoxes.push({     xMin: cx - 4.5, xMax: cx + 4.5, zMin: cz - 4.5, zMax: cz + 4.5, maxY: GRND_Y_ + L2_H });
    elevRamps.push({ xMin: Math.min(edgeP, edgeG), xMax: Math.max(edgeP, edgeG), zMin: cz - 4.5, zMax: cz + 4.5, axis: 'x', axisStart: edgeG, axisEnd: edgeP, yStart: GRND_Y_, yEnd: GRND_Y_ + L2_H, steps: 6 });
  });

  // ── Central fortress compound — open courtyard framed by a gated ring wall ──
  const COURT_HW = 10;   // open courtyard half-size — keeps the map's true center clear
  const RING_HW  = 18;   // ring wall half-size: walls at x=±RING_HW, z=±RING_HW
  const RING_H   = 5.5;  // wall height
  const RING_T   = 3.0;  // wall thickness (wide enough to walk on top)
  const RING_CTR = 3.0;  // corner tower radius
  const RING_CTH = 9.5;  // corner tower height
  const RING_GHW = 2.2;  // gate half-width
  const halfRT   = RING_T / 2;
  const RING_WY  = GRND_Y_ + RING_H; // player foot level on wall top

  function addRingMerlons(cx, cz, wallLen, isVert) {
    const count = Math.floor(wallLen / 2.4);
    for (let i = 0; i < count; i++) {
      if (i % 2 !== 0) continue;
      const off = ((i + 0.5) / count - 0.5) * wallLen;
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        isVert ? RING_T + 0.4 : 1.5, 1.2, isVert ? 1.5 : RING_T + 0.4,
      ), stoneMat);
      m.position.set(isVert ? cx : cx + off, RING_H + 0.6, isVert ? cz + off : cz);
      scene.add(m);
    }
  }

  // Ladders: visual rungs only — they share a ramp collider with staircases,
  // so walking into the base auto-raises the player just like stairs do.
  // Uses a plain wood rail material (not stoneMat) since its brick texture
  // stretches badly on a thin rail box.
  const ladderRailMat = new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 0.8 });
  const ladderRungMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.85 });
  function addLadder(x, z, alongX, height) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? 1.0 : 0.15, height, alongX ? 0.15 : 1.0),
      ladderRailMat,
    );
    rail.position.set(x, height / 2, z);
    scene.add(rail);
    const rungCount = Math.round(height / 0.5);
    for (let i = 0; i < rungCount; i++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? 0.7 : 0.16, 0.1, alongX ? 0.16 : 0.7),
        ladderRungMat,
      );
      rung.position.set(x, 0.3 + i * 0.5, z);
      scene.add(rung);
    }
  }

  const ringWallBoxes = [];
  const ringTowers = [];
  const RING_WING_W = RING_HW - RING_CTR - RING_GHW;
  const wingOffset  = RING_GHW + RING_WING_W / 2;

  // 4 gated sides — north/south walls run along x (constAxis 'z'); east/west
  // run along z (constAxis 'x'). East gets ladders instead of stairs.
  [
    { constAxis: 'z', sign: -1 }, // north
    { constAxis: 'z', sign:  1 }, // south
    { constAxis: 'x', sign: -1 }, // west
    { constAxis: 'x', sign:  1 }, // east
  ].forEach(({ constAxis, sign }) => {
    const isX = constAxis === 'x';
    const constCoord = sign * RING_HW;

    [-1, 1].forEach(wingSign => {
      const alongCoord = wingSign * wingOffset;
      const wingX = isX ? constCoord  : alongCoord;
      const wingZ = isX ? alongCoord  : constCoord;
      const boxW  = isX ? RING_T      : RING_WING_W;
      const boxD  = isX ? RING_WING_W : RING_T;
      addBox(wingX, RING_H / 2, wingZ, boxW, RING_H, boxD);
      addRingMerlons(wingX, wingZ, RING_WING_W, isX);

      const xMin = wingX - boxW / 2, xMax = wingX + boxW / 2;
      const zMin = wingZ - boxD / 2, zMax = wingZ + boxD / 2;
      ringWallBoxes.push({ xMin, xMax, zMin, zMax, maxY: RING_H });
      elevPlatforms.push({ xMin, xMax, zMin, zMax, y: RING_WY });

      const stairLow  = sign * COURT_HW;
      const stairHigh = constCoord - sign * halfRT;
      if (isX && sign === 1) {
        addLadder(stairHigh, alongCoord, false, RING_H);
      } else {
        addStaircase(constAxis, alongCoord, 4, stairLow, stairHigh, RING_H);
      }
      const rXMin = isX ? Math.min(stairLow, stairHigh) : alongCoord - 2;
      const rXMax = isX ? Math.max(stairLow, stairHigh) : alongCoord + 2;
      const rZMin = isX ? alongCoord - 2 : Math.min(stairLow, stairHigh);
      const rZMax = isX ? alongCoord + 2 : Math.max(stairLow, stairHigh);
      elevRamps.push({ xMin: rXMin, xMax: rXMax, zMin: rZMin, zMax: rZMax, axis: constAxis, axisStart: stairLow, axisEnd: stairHigh, yStart: GRND_Y_, yEnd: RING_WY, steps: 6 });
    });

    // Gate lintel
    const lx = isX ? constCoord : 0;
    const lz = isX ? 0 : constCoord;
    addBox(lx, RING_H - 0.55, lz, isX ? RING_T : RING_GHW * 2, 1.0, isX ? RING_GHW * 2 : RING_T);
  });

  // Corner towers
  [[-RING_HW, -RING_HW], [RING_HW, -RING_HW], [RING_HW, RING_HW], [-RING_HW, RING_HW]].forEach(([tx, tz]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(RING_CTR, RING_CTR * 1.1, RING_CTH, 10), stoneMat);
    tower.position.set(tx, RING_CTH / 2, tz);
    scene.add(tower);
    for (let i = 0; i < 10; i++) {
      if (i % 2 !== 0) continue;
      const a = (i / 10) * Math.PI * 2;
      const mb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), stoneMat);
      mb.position.set(tx + Math.cos(a) * (RING_CTR - 0.35), RING_CTH + 0.55, tz + Math.sin(a) * (RING_CTR - 0.35));
      scene.add(mb);
    }
    const tPt = new THREE.PointLight(0xff8833, 2.2, 15);
    tPt.position.set(tx * 0.85, 4.5, tz * 0.85);
    scene.add(tPt);
    ringTowers.push({ x: tx, z: tz, radius: RING_CTR });
  });

  // Team-colored banners on the ring wall (blue west, red east)
  function addBanner(x, z, faceX, hex) {
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 2.8),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, side: THREE.DoubleSide }),
    );
    flag.position.set(x, RING_H - 1.0, z);
    flag.rotation.y = faceX ? Math.PI / 2 : 0;
    scene.add(flag);
  }
  addBanner(-RING_HW + 0.2, -6, true, 0x2244cc);
  addBanner(-RING_HW + 0.2,  6, true, 0x2244cc);
  addBanner( RING_HW - 0.2, -6, true, 0xcc2222);
  addBanner( RING_HW - 0.2,  6, true, 0xcc2222);

  // ── Decor: trees, bushes, puddles in the open courtyard ground ───────────
  const leafMat   = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
  const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.95 });
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x1c2b33, roughness: 0.15, metalness: 0.3 });

  function addTree(x, z) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6), trunkMat);
    trunk.position.set(x, 1.1, z);
    scene.add(trunk);
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 6), leafMat);
    leaves.position.set(x, 2.6, z);
    scene.add(leaves);
  }

  function addBush(x, z) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 7, 5), leafMat);
      b.position.set(x + Math.cos(a) * 0.35, 0.35, z + Math.sin(a) * 0.35);
      scene.add(b);
    }
  }

  function addPuddle(x, z, r) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 16), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.03, z);
    scene.add(p);
  }

  const TREE_SPOTS = [[50, 0], [-50, 0]];
  TREE_SPOTS.forEach(([x, z]) => addTree(x, z));
  [[20, 0], [-20, 0], [0, 20], [0, -20], [0, -50]].forEach(([x, z]) => addBush(x, z));
  [[8, 8], [-8, 8], [8, -8]].forEach(([x, z]) => addPuddle(x, z, 1.4));
  addPuddle(-8, -8, 2.2);

  const decorTrees = TREE_SPOTS.map(([x, z]) => ({ x, z, radius: 0.4 }));

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const colliders = {
    arenaSize: ARENA,
    trees: [...ringTowers, ...decorTrees],
    platforms: elevPlatforms,
    ramps:     elevRamps,
    boxes:     [...elevBoxes, ...ringWallBoxes],
  };

  return { scene, camera, renderer, colliders };
}
