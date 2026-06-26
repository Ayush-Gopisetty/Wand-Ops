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

  // ── Central Castle ────────────────────────────────────────────────────────
  const CW      = 13;    // half-size: walls at x=±CW, z=±CW
  const CWAH    = 5.5;   // curtain wall height
  const CWT     = 3.0;   // wall thickness (wide enough to walk on top)
  const CTR     = 2.8;   // corner tower radius
  const CTH     = 9.0;   // corner tower height
  const GATE_HW = 1.8;   // gate half-width
  const INNER   = (CW - CTR) * 2;       // 20.4 — wall span between towers
  const SW_W    = CW - CTR - GATE_HW;   // 8.4  — each south wing width
  const halfCWT = CWT / 2;
  const WALL_Y  = GRND_Y_ + CWAH;       // 6.25 — player foot level on wall top

  function addMerlons(cx, cz, wallLen, isVert) {
    const count = Math.floor(wallLen / 2.4);
    for (let i = 0; i < count; i++) {
      if (i % 2 !== 0) continue;
      const off = ((i + 0.5) / count - 0.5) * wallLen;
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        isVert ? CWT + 0.4 : 1.5, 1.2, isVert ? 1.5 : CWT + 0.4,
      ), stoneMat);
      m.position.set(isVert ? cx : cx + off, CWAH + 0.6, isVert ? cz + off : cz);
      scene.add(m);
    }
  }

  // Curtain walls
  addBox(0, CWAH / 2, -CW, INNER, CWAH, CWT);
  addBox(-(GATE_HW + SW_W / 2), CWAH / 2,  CW, SW_W, CWAH, CWT);
  addBox( (GATE_HW + SW_W / 2), CWAH / 2,  CW, SW_W, CWAH, CWT);
  addBox(0, CWAH - 0.55, CW, GATE_HW * 2, 1.0, CWT);  // gate lintel
  addBox( CW, CWAH / 2, 0, CWT, CWAH, INNER);
  addBox(-CW, CWAH / 2, 0, CWT, CWAH, INNER);
  addMerlons(0, -CW, INNER, false);
  addMerlons(-(GATE_HW + SW_W / 2), CW, SW_W, false);
  addMerlons( (GATE_HW + SW_W / 2), CW, SW_W, false);
  addMerlons( CW, 0, INNER, true);
  addMerlons(-CW, 0, INNER, true);

  // Wall-top walkable platforms (players can stand on wall tops)
  elevPlatforms.push({ xMin: -(CW - CTR), xMax: CW - CTR,  zMin: -CW - halfCWT, zMax: -CW + halfCWT, y: WALL_Y });
  elevPlatforms.push({ xMin: -(CW - CTR), xMax: -GATE_HW,  zMin:  CW - halfCWT, zMax:  CW + halfCWT, y: WALL_Y });
  elevPlatforms.push({ xMin:  GATE_HW,    xMax:  CW - CTR, zMin:  CW - halfCWT, zMax:  CW + halfCWT, y: WALL_Y });
  elevPlatforms.push({ xMin:  CW - halfCWT, xMax:  CW + halfCWT, zMin: -(CW - CTR), zMax: CW - CTR,  y: WALL_Y });
  elevPlatforms.push({ xMin: -CW - halfCWT, xMax: -CW + halfCWT, zMin: -(CW - CTR), zMax: CW - CTR,  y: WALL_Y });

  // Stairs from courtyard up to each wall top
  // North stairs (x=3..7,  z=-3 → z=-(CW-halfCWT)=-11.5)
  { addStaircase('z', 5, 4, -3, -CW + halfCWT, CWAH);
    elevRamps.push({ xMin: 3, xMax: 7, zMin: -CW + halfCWT, zMax: -3, axis: 'z', axisStart: -3, axisEnd: -CW + halfCWT, yStart: GRND_Y_, yEnd: WALL_Y, steps: 6 }); }

  // South stairs (x=-7..-3, z=3 → z=CW-halfCWT=11.5)
  { addStaircase('z', -5, 4, 3, CW - halfCWT, CWAH);
    elevRamps.push({ xMin: -7, xMax: -3, zMin: 3, zMax: CW - halfCWT, axis: 'z', axisStart: 3, axisEnd: CW - halfCWT, yStart: GRND_Y_, yEnd: WALL_Y, steps: 6 }); }

  // East stairs  (z=3..7,   x=3 → x=CW-halfCWT=11.5) — SE corner, clear of North's NE corner
  { addStaircase('x', 5, 4, 3, CW - halfCWT, CWAH);
    elevRamps.push({ xMin: 3, xMax: CW - halfCWT, zMin: 3, zMax: 7, axis: 'x', axisStart: 3, axisEnd: CW - halfCWT, yStart: GRND_Y_, yEnd: WALL_Y, steps: 6 }); }

  // West stairs  (z=-7..-3, x=-3 → x=-(CW-halfCWT)=-11.5) — NW corner, clear of South's SW corner
  { addStaircase('x', -5, 4, -3, -CW + halfCWT, CWAH);
    elevRamps.push({ xMin: -CW + halfCWT, xMax: -3, zMin: -7, zMax: -3, axis: 'x', axisStart: -3, axisEnd: -CW + halfCWT, yStart: GRND_Y_, yEnd: WALL_Y, steps: 6 }); }

  // Corner towers
  [[-CW, -CW], [CW, -CW], [CW, CW], [-CW, CW]].forEach(([tx, tz]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(CTR, CTR * 1.1, CTH, 10), stoneMat);
    tower.position.set(tx, CTH / 2, tz);
    scene.add(tower);
    for (let i = 0; i < 10; i++) {
      if (i % 2 !== 0) continue;
      const a = (i / 10) * Math.PI * 2;
      const mb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), stoneMat);
      mb.position.set(tx + Math.cos(a) * (CTR - 0.35), CTH + 0.55, tz + Math.sin(a) * (CTR - 0.35));
      scene.add(mb);
    }
    const tPt = new THREE.PointLight(0xff8833, 2.5, 16);
    tPt.position.set(tx * 0.75, 4.5, tz * 0.75);
    scene.add(tPt);
  });

  // Banners on the curtain walls (red/blue, like the reference image)
  function addBanner(x, z, faceX, hex) {
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 2.8),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, side: THREE.DoubleSide }),
    );
    flag.position.set(x, CWAH - 1.0, z);
    flag.rotation.y = faceX ? Math.PI / 2 : 0;
    scene.add(flag);
  }
  addBanner(CW - 0.2, -6,  true,  0xcc2222);
  addBanner(CW - 0.2,  6,  true,  0x2244cc);
  addBanner(-CW + 0.2, -6, true,  0x2244cc);
  addBanner(-CW + 0.2,  6, true,  0xcc2222);

  // ── Central Keep — rises above the curtain walls, the map's high ground ──
  const KEEP_HW   = 2.5;                 // half-size: keep walls at x=±KEEP_HW, z=±KEEP_HW
  const KEEP_H    = 7.0;                 // height above ground (taller than CWAH=5.5)
  const KEEP_TOPY = GRND_Y_ + KEEP_H;    // 7.75 — clears the curtain wall top (6.25)

  addBox(0, KEEP_H / 2, 0, KEEP_HW * 2, KEEP_H, KEEP_HW * 2);
  [[-KEEP_HW, -KEEP_HW], [KEEP_HW, -KEEP_HW], [KEEP_HW, KEEP_HW], [-KEEP_HW, KEEP_HW]].forEach(([mx, mz]) => {
    addBox(mx, KEEP_H + 0.6, mz, 0.9, 1.2, 0.9);
  });

  // North keep stairs: ground at z=-11.5 (low) up to the keep's north face at z=-2.5 (high)
  { addStaircase('z', 0, 3, -(CW - halfCWT), -KEEP_HW, KEEP_H);
    elevRamps.push({ xMin: -1.5, xMax: 1.5, zMin: -(CW - halfCWT), zMax: -KEEP_HW, axis: 'z', axisStart: -(CW - halfCWT), axisEnd: -KEEP_HW, yStart: GRND_Y_, yEnd: KEEP_TOPY, steps: 6 }); }

  // South keep stairs: ground at z=11.5 (low) up to the keep's south face at z=2.5 (high)
  { addStaircase('z', 0, 3, CW - halfCWT, KEEP_HW, KEEP_H);
    elevRamps.push({ xMin: -1.5, xMax: 1.5, zMin: KEEP_HW, zMax: CW - halfCWT, axis: 'z', axisStart: CW - halfCWT, axisEnd: KEEP_HW, yStart: GRND_Y_, yEnd: KEEP_TOPY, steps: 6 }); }

  elevPlatforms.push({ xMin: -KEEP_HW, xMax: KEEP_HW, zMin: -KEEP_HW, zMax: KEEP_HW, y: KEEP_TOPY });
  elevBoxes.push({     xMin: -KEEP_HW, xMax: KEEP_HW, zMin: -KEEP_HW, zMax: KEEP_HW, maxY: KEEP_TOPY });

  // Flag + light atop the keep
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x555566, roughness: 0.6 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.0, 6), poleMat);
  pole.position.set(0, KEEP_TOPY + 2.0, 0);
  scene.add(pole);
  const flagMat2 = new THREE.MeshStandardMaterial({ color: 0xcc1111, emissive: 0x550000, emissiveIntensity: 0.5, side: THREE.DoubleSide });
  const flagMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1), flagMat2);
  flagMesh.position.set(1.0, KEEP_TOPY + 3.3, 0);
  scene.add(flagMesh);
  const keepPt = new THREE.PointLight(0xff7733, 3.0, 24);
  keepPt.position.set(0, KEEP_TOPY + 1.0, 0);
  scene.add(keepPt);

  // Castle AABB wall colliders (maxY=CWAH so players on wall tops are not blocked)
  const castleBoxes = [
    { xMin: -(CW - CTR), xMax:  CW - CTR, zMin: -CW - halfCWT, zMax: -CW + halfCWT, maxY: CWAH },
    { xMin: -(CW - CTR), xMax: -GATE_HW,  zMin:  CW - halfCWT, zMax:  CW + halfCWT, maxY: CWAH },
    { xMin:  GATE_HW,    xMax:  CW - CTR, zMin:  CW - halfCWT, zMax:  CW + halfCWT, maxY: CWAH },
    { xMin:  CW - halfCWT, xMax:  CW + halfCWT, zMin: -(CW - CTR), zMax: CW - CTR,  maxY: CWAH },
    { xMin: -CW - halfCWT, xMax: -CW + halfCWT, zMin: -(CW - CTR), zMax: CW - CTR,  maxY: CWAH },
  ];
  const castleTowers = [
    { x: -CW, z: -CW, radius: CTR },
    { x:  CW, z: -CW, radius: CTR },
    { x:  CW, z:  CW, radius: CTR },
    { x: -CW, z:  CW, radius: CTR },
  ];

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

  const TREE_SPOTS = [[16, 16], [-16, 16], [16, -16], [-16, -16], [50, 0], [-50, 0]];
  TREE_SPOTS.forEach(([x, z]) => addTree(x, z));
  [[20, 0], [-20, 0], [0, 20], [0, -20], [0, -50]].forEach(([x, z]) => addBush(x, z));
  [[8, 8], [-8, 8], [8, -8], [-8, -8]].forEach(([x, z]) => addPuddle(x, z, 1.4));

  const decorTrees = TREE_SPOTS.map(([x, z]) => ({ x, z, radius: 0.4 }));

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const colliders = {
    arenaSize: ARENA,
    trees: [...castleTowers, ...decorTrees],
    platforms: elevPlatforms,
    ramps:     elevRamps,
    boxes:     [...elevBoxes, ...castleBoxes],
  };

  return { scene, camera, renderer, colliders };
}
