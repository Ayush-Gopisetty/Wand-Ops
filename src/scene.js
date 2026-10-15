import * as THREE from 'three';

const ARENA = 55;

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0xb8dff5, 0.0022);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 180);

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

  function makeGrassTexture() {
    const S = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#4c7536';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      ctx.strokeStyle = `hsl(${90 + Math.random() * 30}, ${30 + Math.random() * 20}%, ${22 + Math.random() * 18}%)`;
      ctx.lineWidth = 1 + Math.random();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(22, 22);
    return tex;
  }

  const grassMat = new THREE.MeshStandardMaterial({ map: makeGrassTexture(), roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, ARENA * 2), grassMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Flagstone inside the castle and on the paths out of each gate; polygonOffset keeps it from z-fighting the grass
  const flagTex = makeFlagstoneTexture();
  function addFlagstone(cx, cz, w, d) {
    const tex = flagTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 6, d / 6);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(cx, 0.005, cz);
    scene.add(tile);
  }
  addFlagstone(0, 0, 44, 44);
  addFlagstone(0, 33.5, 6, 23);
  addFlagstone(0, -33.5, 6, 23);
  addFlagstone(33.5, 0, 23, 6);
  addFlagstone(-33.5, 0, 23, 6);


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

  // Merlons sit on the outer edge only so the wall top stays walkable
  function addRingMerlons(cx, cz, wallLen, isVert, outerSign) {
    const count = Math.floor(wallLen / 2.4);
    const depth = 0.7;
    const edgeOff = outerSign * (halfRT + 0.2 - depth / 2);
    for (let i = 0; i < count; i++) {
      if (i % 2 !== 0) continue;
      const off = ((i + 0.5) / count - 0.5) * wallLen;
      const w = isVert ? depth : 1.5;
      const d = isVert ? 1.5 : depth;
      const mx = isVert ? cx + edgeOff : cx + off;
      const mz = isVert ? cz + off : cz + edgeOff;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), stoneMat);
      m.position.set(mx, RING_H + 0.6, mz);
      scene.add(m);
      ringWallBoxes.push({ xMin: mx - w / 2, xMax: mx + w / 2, zMin: mz - d / 2, zMax: mz + d / 2, maxY: RING_H + 1.2 });
    }
  }

  // Ladders: visual rungs only — they share a ramp collider with staircases,
  // so walking into the base auto-raises the player just like stairs do.
  // Uses a plain wood rail material (not stoneMat) since its brick texture
  // stretches badly on a thin rail box.
  const ladderRailMat = new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 0.8 });
  const ladderRungMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.85 });
  function addLadder(x, z, alongX, height, yBase = 0) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? 1.0 : 0.15, height, alongX ? 0.15 : 1.0),
      ladderRailMat,
    );
    rail.position.set(x, yBase + height / 2, z);
    scene.add(rail);
    const rungCount = Math.round(height / 0.5);
    for (let i = 0; i < rungCount; i++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? 0.7 : 0.16, 0.1, alongX ? 0.16 : 0.7),
        ladderRungMat,
      );
      rung.position.set(x, yBase + 0.3 + i * 0.5, z);
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
      addRingMerlons(wingX, wingZ, RING_WING_W, isX, sign);

      const xMin = wingX - boxW / 2, xMax = wingX + boxW / 2;
      const zMin = wingZ - boxD / 2, zMax = wingZ + boxD / 2;
      ringWallBoxes.push({ xMin, xMax, zMin, zMax, maxY: RING_H });
      elevPlatforms.push({ xMin, xMax, zMin, zMax, y: RING_WY });

      const isLadder  = isX && sign === 1;
      const stairHigh = constCoord - sign * halfRT;
      // A ladder's collider is a thin strip against the wall face, not a full staircase footprint.
      // It tops out 0.5 short of the face because wall collision stops the player (radius 0.45) there.
      const stairLow  = isLadder ? stairHigh - sign * 1.3 : sign * COURT_HW;
      const rampEnd   = isLadder ? stairHigh - sign * 0.5 : stairHigh;
      const rampHalfW = isLadder ? 0.6 : 2;
      if (isLadder) {
        addLadder(stairHigh, alongCoord, false, RING_H);
      } else {
        addStaircase(constAxis, alongCoord, 4, stairLow, stairHigh, RING_H);
      }
      const rXMin = isX ? Math.min(stairLow, stairHigh) : alongCoord - rampHalfW;
      const rXMax = isX ? Math.max(stairLow, stairHigh) : alongCoord + rampHalfW;
      const rZMin = isX ? alongCoord - rampHalfW : Math.min(stairLow, stairHigh);
      const rZMax = isX ? alongCoord + rampHalfW : Math.max(stairLow, stairHigh);
      elevRamps.push({ xMin: rXMin, xMax: rXMax, zMin: rZMin, zMax: rZMax, axis: constAxis, axisStart: stairLow, axisEnd: rampEnd, yStart: GRND_Y_, yEnd: RING_WY, steps: 6 });
    });

    // Gate lintel
    const lx = isX ? constCoord : 0;
    const lz = isX ? 0 : constCoord;
    addBox(lx, RING_H - 0.55, lz, isX ? RING_T : RING_GHW * 2, 1.0, isX ? RING_GHW * 2 : RING_T);
    const lhw = isX ? halfRT : RING_GHW, lhd = isX ? RING_GHW : halfRT;
    elevPlatforms.push({ xMin: lx - lhw, xMax: lx + lhw, zMin: lz - lhd, zMax: lz + lhd, y: RING_WY });
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
    // maxY lets players standing on a climbable tower's roof pass over its collider
    ringTowers.push({ x: tx, z: tz, radius: RING_CTR, maxY: RING_CTH });
  });

  // Two opposite corner towers are climbable by a ladder from the wall top
  const TOWER_TOP_Y = GRND_Y_ + RING_CTH;
  [[RING_HW, RING_HW], [-RING_HW, -RING_HW]].forEach(([tx, tz]) => {
    const sx = Math.sign(tx);
    addLadder(tx - sx * RING_CTR, tz, false, RING_CTH - RING_H, RING_H);
    // Tops out 0.5 before the tower face, where the tower collider stops a climbing player
    const start = tx - sx * 4.3;
    const end = tx - sx * 3.5;
    const reach = tx - sx * 2.2;
    elevRamps.push({
      xMin: Math.min(start, reach), xMax: Math.max(start, reach), zMin: tz - 0.6, zMax: tz + 0.6,
      axis: 'x', axisStart: start, axisEnd: end, yStart: RING_WY, yEnd: TOWER_TOP_Y, steps: 6,
    });
    elevPlatforms.push({ xMin: tx - 2.2, xMax: tx + 2.2, zMin: tz - 2.2, zMax: tz + 2.2, y: TOWER_TOP_Y });
  });

  // ── Cover ─────────────────────────────────────────────────────────────────
  // Solid blocks that stop players and fireballs but can be jumped onto; maxY is the mesh top like the ring walls
  const coverBoxes = [];
  const coverPillars = [];
  function addCoverCollider(cx, cz, w, h, d) {
    const rect = { xMin: cx - w / 2, xMax: cx + w / 2, zMin: cz - d / 2, zMax: cz + d / 2 };
    coverBoxes.push({ ...rect, maxY: h });
    elevPlatforms.push({ ...rect, y: GRND_Y_ + h });
  }
  function addCover(cx, cz, w, h, d) {
    addBox(cx, h / 2, cz, w, h, d);
    addCoverCollider(cx, cz, w, h, d);
  }
  function addPillar(x, z, h) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, h, 8), stoneMat);
    pillar.position.set(x, h / 2, z);
    scene.add(pillar);
    coverPillars.push({ x, z, radius: 0.6, maxY: h });
  }

  // Courtyard: a fountain in the middle, a pinwheel of low walls, broken pillars on the gate lines.
  // Low pieces must be taller than 1.05 or the player's step-over threshold (maxY - 0.3) lets them walk through.
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.45, 1.1, 8), stoneMat);
  basin.position.set(0, 0.55, 0);
  scene.add(basin);
  const basinWater = new THREE.Mesh(
    new THREE.CircleGeometry(1.95, 8),
    new THREE.MeshStandardMaterial({ color: 0x4f9fd0, emissive: 0x123a55, roughness: 0.2 }),
  );
  basinWater.rotation.x = -Math.PI / 2;
  basinWater.position.y = 1.0;
  scene.add(basinWater);
  addCoverCollider(0, 0, 4.1, 1.1, 4.1);
  addPillar(0, 0, 2.8);

  addCover( 5.5,  5.5, 3.2, 1.2, 0.6);
  addCover(-5.5,  5.5, 0.6, 1.2, 3.2);
  addCover(-5.5, -5.5, 3.2, 1.2, 0.6);
  addCover( 5.5, -5.5, 0.6, 1.2, 3.2);

  addPillar(0,  6.5, 2.6);
  addPillar(0, -6.5, 3.4);
  addPillar( 6.5, 0, 2.2);
  addPillar(-6.5, 0, 3.0);

  // Outside the walls: broken wall ruins between the platforms, plus boulders toward the corners
  function addRuin(cx, cz, alongX) {
    addCover(cx, cz, alongX ? 4.6 : 0.8, 2.2, alongX ? 0.8 : 4.6);
    // Lower broken chunk at the end nearer the map's centre line
    const chunkX = alongX ? cx - Math.sign(cx) * 3.2 : cx;
    const chunkZ = alongX ? cz : cz - Math.sign(cz) * 3.2;
    addCover(chunkX, chunkZ, alongX ? 1.8 : 0.8, 1.2, alongX ? 0.8 : 1.8);
  }
  [[12, 30], [-12, 30], [12, -30], [-12, -30]].forEach(([x, z]) => addRuin(x, z, true));
  [[30, 12], [30, -12], [-30, 12], [-30, -12]].forEach(([x, z]) => addRuin(x, z, false));

  const rockMat = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95, flatShading: true });
  function addRock(cx, cz) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 0), rockMat);
    rock.scale.set(1.15, 0.85, 1);
    rock.rotation.y = Math.random() * Math.PI;
    rock.position.set(cx, 0.9, cz);
    scene.add(rock);
    addCoverCollider(cx, cz, 2.6, 2.0, 2.6);
  }
  [[30, 44], [-30, -44], [44, -30], [-44, 30]].forEach(([x, z]) => addRock(x, z));

  // Respawn points spread over the map; the game picks the one farthest from enemies
  const spawnPoints = [
    [7.5, 7.5], [-7.5, -7.5],
    [0, 25], [0, -25], [25, 0], [-25, 0],
    [45, 45], [-45, 45], [45, -45], [-45, -45],
    [14, 45], [-14, -45], [45, -14], [-45, 14],
  ];

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
  // Hung just off the wall's inner face; clear of the gate (z ±2.2) and the stairs/ladders (z ±6.6 and beyond)
  const bannerX = RING_HW - halfRT - 0.05;
  addBanner(-bannerX, -4.4, true, 0x2244cc);
  addBanner(-bannerX,  4.4, true, 0x2244cc);
  addBanner( bannerX, -4.4, true, 0xcc2222);
  addBanner( bannerX,  4.4, true, 0xcc2222);

  // ── Decor: trees and bushes ──────────────────────────────────────────────
  const leafMat   = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
  const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 0.95 });

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

  const TREE_SPOTS = [[50, 0], [-50, 0]];
  TREE_SPOTS.forEach(([x, z]) => addTree(x, z));
  // Bushes flank each gate against the outer wall face rather than sitting in the opening
  const bushOff = RING_HW + halfRT + 1.1;
  [
    [bushOff, 3.6], [bushOff, -3.6], [-bushOff, 3.6], [-bushOff, -3.6],
    [3.6, bushOff], [-3.6, bushOff], [3.6, -bushOff], [-3.6, -bushOff],
    [0, -50],
  ].forEach(([x, z]) => addBush(x, z));

  const decorTrees = TREE_SPOTS.map(([x, z]) => ({ x, z, radius: 0.4 }));

  // ── Resize handler ────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const colliders = {
    arenaSize: ARENA,
    trees: [...ringTowers, ...coverPillars, ...decorTrees],
    platforms: elevPlatforms,
    ramps:     elevRamps,
    boxes:     [...elevBoxes, ...ringWallBoxes, ...coverBoxes],
    spawnPoints,
  };

  return { scene, camera, renderer, colliders };
}
