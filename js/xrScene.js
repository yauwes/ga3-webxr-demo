/**
 * SpatialInk — Three.js + WebXR Mixed Reality / VR / Desktop 3D Engine
 * Supports:
 * - Meta Quest 3 Mixed Reality Passthrough (immersive-ar)
 * - Meta Quest 2 / Pico 4 VR Fallback (immersive-vr)
 * - WebXR Hand Tracking (pinch-grab vector tip or pinch-draw 3D ink) + Controller Fallback
 * - Desktop / Tablet Orbit + Direct 3D Handle Drag + Freehand 3D Stylus Ink
 * - Loads all 5 Blender-built/optimized GLB assets (including KIRI Engine scan!)
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { WORKSPACE_MIN, WORKSPACE_MAX } from "./exercises.js";

export const WORKSPACE_ORIGIN = new THREE.Vector3(0, 1.28, -1.05);
export const UNIT_SCALE = 0.145; // 1 math unit = 14.5 cm -> 6 units = 0.87 m bounded tabletop cube

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function makeTextSprite(text, bgColor = "rgba(15,23,42,0.88)", borderColor = "#38bdf8", textColor = "#f8fafc", width = 256, height = 72) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  const draw = (label) => {
    ctx.clearRect(0, 0, width, height);
    const r = 16;
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(4, 4, width - 8, height - 8, r);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = "700 26px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, width / 2, height / 2 + 1, width - 32);
  };

  draw(text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.24 * (width / 256), 0.068 * (height / 72), 1);
  sprite.userData.updateText = (newText) => {
    draw(newText);
    tex.needsUpdate = true;
  };
  return sprite;
}

/**
 * Helper: Creates a sleek 3D vector arrow (cylinder shaft + cone head) from origin to tip in workspace coordinates.
 */
function createArrowGroup(colorHex, radius = 0.011, dashed = false) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: colorHex,
    emissiveIntensity: dashed ? 0.2 : 0.45,
    roughness: 0.25,
    metalness: 0.3,
    transparent: dashed,
    opacity: dashed ? 0.58 : 1.0,
  });

  const shaftGeo = new THREE.CylinderGeometry(radius, radius, 1, 16);
  shaftGeo.translate(0, 0.5, 0);
  const shaft = new THREE.Mesh(shaftGeo, mat);

  const headGeo = new THREE.ConeGeometry(radius * 2.55, radius * 6.5, 18);
  headGeo.translate(0, radius * 3.25, 0);
  const head = new THREE.Mesh(headGeo, mat);

  group.add(shaft, head);
  group.userData = { shaft, head, mat, radius };

  group.setVector = (startMath, vecMath) => {
    const start = new THREE.Vector3(startMath.x, startMath.y, startMath.z).multiplyScalar(UNIT_SCALE);
    const delta = new THREE.Vector3(vecMath.x, vecMath.y, vecMath.z).multiplyScalar(UNIT_SCALE);
    const len = delta.length();
    if (len < 0.004) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.position.copy(start);

    const dir = delta.clone().normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.quaternion.copy(quat);

    const headLen = Math.min(radius * 6.5, len * 0.45);
    const shaftLen = Math.max(0.001, len - headLen);
    shaft.scale.set(1, shaftLen, 1);
    head.position.set(0, shaftLen, 0);
    head.scale.set(1, headLen / (radius * 6.5), 1);
  };

  return group;
}

/**
 * High-DPI floating 3D Spatial Canvas Panel (legible inside Quest 3 / VR headsets)
 */
function createSpatialBoard(widthM, heightM, canvasW = 768, canvasH = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const group = new THREE.Group();
  const panelGeo = new THREE.PlaneGeometry(widthM, heightM);
  const panelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(panelGeo, panelMat);
  group.add(mesh);

  // Thin glowing frame border
  const frameGeo = new THREE.BoxGeometry(widthM + 0.02, heightM + 0.02, 0.012);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.12,
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.z = -0.008;
  group.add(frame);

  return { group, canvas, ctx, tex };
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 8) {
  const words = String(text || "").split(" ");
  let line = "";
  let cy = y;
  let count = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      line = words[i];
      cy += lineHeight;
      count++;
      if (count >= maxLines - 1) break;
    } else {
      line = test;
    }
  }
  if (line && count < maxLines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

export class SpatialInkScene {
  constructor(canvasContainer, callbacks = {}) {
    this.container = canvasContainer;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070d19);
    this.scene.fog = new THREE.FogExp2(0x070d19, 0.085);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.05, 40);
    this.camera.position.set(0.95, 1.85, 0.72);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.xr.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Player Rig (so thumbstick locomotion moves camera + controllers cleanly in VR/MR)
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.rig.add(this.camera);

    // Desktop OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.target.copy(WORKSPACE_ORIGIN);
    this.controls.minDistance = 0.55;
    this.controls.maxDistance = 4.2;
    this.controls.maxPolarAngle = Math.PI * 0.85;

    // Interactive state
    this.userVec = { x: 1, y: 1, z: 1 };
    this.snapEnabled = true;
    this.snapStep = 0.5;
    this.interactionMode = "vector"; // 'vector' | 'sketch'
    this.dragAxisMode = "camera"; // 'camera' | 'xz' | 'y'
    this.activeStylusType = "generated"; // 'generated' | 'scanned'
    this.isEquilibriumBalanced = false;
    this.axisState = "idle"; // 'idle' | 'thinking' | 'correct' | 'error' | 'offline'
    this.xrMode = "desktop"; // 'desktop' | 'vr' | 'ar'

    // Pointer / Dragging / Sketching
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.isDraggingHandle = false;
    this.dragPlane = new THREE.Plane();
    this.dragHitPoint = new THREE.Vector3();
    this.isDesktopSketching = false;
    this.spacePressed = false;
    this.lastSketchPoint = null;
    this.inkStrokes = [];
    this.currentStrokeGroup = null;
    this.inkColor = 0x38bdf8;

    // XR Controllers & Hand Tracking
    this.xrGrabbingHand = null;
    this.xrSketchingSource = null;
    this.xrLastSketchPoint = null;
    this.controllers = [];
    this.hands = [];
    this.vrStylusAnchor = new THREE.Group();

    // Asset containers
    this.studioEnvGroup = new THREE.Group();
    this.workspaceGroup = new THREE.Group();
    this.workspaceGroup.position.copy(WORKSPACE_ORIGIN);
    this.givenGroup = new THREE.Group();
    this.sketchGroup = new THREE.Group();
    this.showcaseGroup = new THREE.Group();

    this.scene.add(this.studioEnvGroup);
    this.scene.add(this.workspaceGroup);
    this.workspaceGroup.add(this.givenGroup);
    this.scene.add(this.sketchGroup);
    this.scene.add(this.showcaseGroup);

    // Performance tracking (Week 12 Profiler)
    this.perf = { frames: 0, lastSample: performance.now(), fps: 60, frameMs: 16.6 };
    this.clock = new THREE.Clock();

    // Build Scene
    this._setupLighting();
    this._setupStudioEnvironment();
    this._setupCoordinateFrame();
    this._setupUserVectorObjects();
    this._setupSpatialBoards();
    this._setupShowcaseStand();
    this._setupWebXR();
    this._setupDesktopEvents();
    this._loadBlenderAssets();

    // Start render loop (XR-compatible)
    this.renderer.setAnimationLoop((time, frame) => this._tick(time, frame));
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x0f172a, 0.95);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(2.5, 4.2, 2.8);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x38bdf8, 0.7);
    rim.position.set(-2.5, 2.4, -2.0);
    this.scene.add(rim);

    const accent = new THREE.PointLight(0x38bdf8, 0.9, 3.2);
    accent.position.set(WORKSPACE_ORIGIN.x, WORKSPACE_ORIGIN.y - 0.35, WORKSPACE_ORIGIN.z);
    this.scene.add(accent);
  }

  _setupStudioEnvironment() {
    // Sleek dark architectural floor + subtle holographic grid (automatically hidden in AR Passthrough!)
    const floorGeo = new THREE.CircleGeometry(7.5, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b1324,
      roughness: 0.72,
      metalness: 0.25,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    this.studioEnvGroup.add(floor);

    const floorGrid = new THREE.GridHelper(10, 20, 0x1e3a5f, 0x111c32);
    floorGrid.position.y = 0.002;
    this.studioEnvGroup.add(floorGrid);

    // Subtle floating ambient dust/star nodes for depth perception in VR/Desktop
    const pts = [];
    for (let i = 0; i < 120; i++) {
      const r = 2.4 + Math.random() * 4.5;
      const theta = Math.random() * Math.PI * 2;
      const y = 0.4 + Math.random() * 3.4;
      pts.push(r * Math.cos(theta), y, r * Math.sin(theta));
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const pMat = new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.018, transparent: true, opacity: 0.35 });
    this.studioEnvGroup.add(new THREE.Points(pGeo, pMat));
  }

  _setupCoordinateFrame() {
    const half = WORKSPACE_MAX * UNIT_SCALE; // 3 * 0.145 = 0.435m
    const full = half * 2;

    // Bounded wireframe cube showing the exact [-3, 3]^3 workspace boundary
    const boxGeo = new THREE.BoxGeometry(full, full, full);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const boxLines = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18 })
    );
    this.workspaceGroup.add(boxLines);

    // Subtle XZ mid-plane grid (y = 0)
    const xzGrid = new THREE.GridHelper(full, 6, 0x38bdf8, 0x1e3a5f);
    xzGrid.material.transparent = true;
    xzGrid.material.opacity = 0.32;
    this.workspaceGroup.add(xzGrid);

    // Right-handed Axes (+X Red, +Y Green, +Z Blue)
    const axisLen = half + 0.04;
    const makeAxis = (dir, colorHex, labelText) => {
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.45,
        roughness: 0.3,
      });
      // Full bidirectional shaft (-3 to +3)
      const shaftGeo = new THREE.CylinderGeometry(0.0042, 0.0042, axisLen * 2, 12);
      const shaft = new THREE.Mesh(shaftGeo, mat);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      shaft.quaternion.copy(quat);
      this.workspaceGroup.add(shaft);

      // Positive cone tip
      const coneGeo = new THREE.ConeGeometry(0.013, 0.036, 14);
      const cone = new THREE.Mesh(coneGeo, mat);
      cone.position.copy(dir).multiplyScalar(axisLen + 0.016);
      cone.quaternion.copy(quat);
      this.workspaceGroup.add(cone);

      // Axis Label Sprite (+X, +Y, +Z)
      const label = makeTextSprite(labelText, "rgba(9,14,26,0.9)", `#${colorHex.toString(16).padStart(6, "0")}`, "#ffffff", 140, 64);
      label.position.copy(dir).multiplyScalar(axisLen + 0.075);
      label.scale.set(0.11, 0.05, 1);
      this.workspaceGroup.add(label);

      // Integer Tick Marks (-3..+3 excluding 0)
      for (let i = WORKSPACE_MIN; i <= WORKSPACE_MAX; i++) {
        if (i === 0) continue;
        const tickGeo = new THREE.SphereGeometry(0.007, 8, 8);
        const tick = new THREE.Mesh(tickGeo, mat);
        tick.position.copy(dir).multiplyScalar(i * UNIT_SCALE);
        this.workspaceGroup.add(tick);
      }
    };

    makeAxis(new THREE.Vector3(1, 0, 0), 0xf87171, "+X");
    makeAxis(new THREE.Vector3(0, 1, 0), 0x34d399, "+Y");
    makeAxis(new THREE.Vector3(0, 0, 1), 0x38bdf8, "+Z");

    // Origin anchor sphere
    const originSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x38bdf8, emissiveIntensity: 0.6 })
    );
    this.workspaceGroup.add(originSphere);
  }

  _setupUserVectorObjects() {
    // Primary learner vector (cyan-blue)
    this.userArrow = createArrowGroup(0x38bdf8, 0.013, false);
    this.workspaceGroup.add(this.userArrow);

    // Interactive Grab Handle Orb at the vector tip
    const handleGeo = new THREE.SphereGeometry(0.042, 24, 24);
    this.handleMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0.2,
    });
    this.handleOrb = new THREE.Mesh(handleGeo, this.handleMat);
    this.handleOrb.name = "UserVectorHandle";
    this.workspaceGroup.add(this.handleOrb);

    // Outer subtle halo ring around handle orb
    const haloGeo = new THREE.RingGeometry(0.048, 0.058, 32);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, side: THREE.DoubleSide, transparent: true, opacity: 0.65 });
    this.handleHalo = new THREE.Mesh(haloGeo, haloMat);
    this.handleOrb.add(this.handleHalo);

    // Floating Coordinate Pill next to vector tip
    this.tipLabel = makeTextSprite("⟨1.0, 1.0, 1.0⟩", "rgba(7,13,25,0.92)", "#38bdf8", "#e0f2fe", 320, 74);
    this.tipLabel.scale.set(0.28, 0.066, 1);
    this.workspaceGroup.add(this.tipLabel);

    // Dashed Component Projection Lines (Vx red, Vy green, Vz blue)
    const makeProjLine = (color) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.018, gapSize: 0.012, transparent: true, opacity: 0.85 });
      const line = new THREE.Line(geo, mat);
      this.workspaceGroup.add(line);
      return line;
    };
    this.projX = makeProjLine(0xf87171); // from (0,0,z) to (x,0,z)
    this.projZ = makeProjLine(0x38bdf8); // from (x,0,0) to (x,0,z)
    this.projY = makeProjLine(0x34d399); // from (x,0,z) to (x,y,z)

    // Foot projection dot on XZ plane
    this.xzFootDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.01, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x94a3b8 })
    );
    this.workspaceGroup.add(this.xzFootDot);

    // Desktop floating stylus cursor (visible when drawing freehand ink)
    this.desktopStylusGroup = new THREE.Group();
    this.desktopStylusGroup.visible = false;
    this.scene.add(this.desktopStylusGroup);

    this.setUserVector(this.userVec, false);
  }

  _setupSpatialBoards() {
    // 1. Back-Left Exercise & Validator Board (visible inside Quest 3 MR / VR)
    this.exerciseBoard = createSpatialBoard(0.92, 0.56, 860, 520);
    this.exerciseBoard.group.position.set(-0.96, 1.56, -1.32);
    this.exerciseBoard.group.rotation.y = 0.34;
    this.scene.add(this.exerciseBoard.group);

    // 2. Right Axis Caption & Step History Board (docked cleanly under Axis guide)
    this.axisBoard = createSpatialBoard(0.82, 0.52, 780, 500);
    this.axisBoard.group.position.set(0.94, 1.24, -1.24);
    this.axisBoard.group.rotation.y = -0.36;
    this.scene.add(this.axisBoard.group);
  }

  _setupShowcaseStand() {
    // GA3 Asset Comparison Pedestal (KIRI Engine Scanned Marker vs Generated SpatialInk Stylus)
    this.showcaseGroup.position.set(-0.96, 1.0, -1.16);
    this.showcaseGroup.rotation.y = 0.34;

    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.025, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.75, roughness: 0.28 })
    );
    this.showcaseGroup.add(shelf);

    // Glowing trim bar
    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(0.60, 0.005, 0.008),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 1.5 })
    );
    trim.position.set(0, 0.013, 0.115);
    this.showcaseGroup.add(trim);

    this.scanDisplayPivot = new THREE.Group();
    this.scanDisplayPivot.position.set(-0.15, 0.13, 0);
    this.showcaseGroup.add(this.scanDisplayPivot);

    this.genDisplayPivot = new THREE.Group();
    this.genDisplayPivot.position.set(0.15, 0.13, 0);
    this.showcaseGroup.add(this.genDisplayPivot);

    const lblScan = makeTextSprite("KIRI Scan (7.0k tris)", "rgba(6,78,59,0.92)", "#34d399", "#d1fae5", 420, 66);
    lblScan.position.set(-0.15, 0.25, 0);
    lblScan.scale.set(0.26, 0.044, 1);
    this.showcaseGroup.add(lblScan);

    const lblGen = makeTextSprite("Blender Stylus (1.6k)", "rgba(12,74,110,0.92)", "#38bdf8", "#e0f2fe", 420, 66);
    lblGen.position.set(0.15, 0.25, 0);
    lblGen.scale.set(0.26, 0.044, 1);
    this.showcaseGroup.add(lblGen);
  }

  _loadBlenderAssets() {
    const loader = new GLTFLoader();

    // 1. Holographic Workbench Pedestal beneath bounded workspace
    loader.load("assets/workbench_pedestal.glb", (gltf) => {
      const pedestal = gltf.scene;
      // Place pedestal top cleanly below workspace bottom (-3 * UNIT_SCALE = -0.435)
      pedestal.position.set(WORKSPACE_ORIGIN.x, WORKSPACE_ORIGIN.y - 0.455, WORKSPACE_ORIGIN.z);
      pedestal.scale.setScalar(0.84);
      this.scene.add(pedestal);
    });

    // 2. "Axis" Non-Human Floating Line-and-Orbit Guide (Section 8)
    loader.load("assets/axis_guide.glb", (gltf) => {
      this.axisModel = gltf.scene;
      this.axisModel.position.set(0.56, 1.72, -1.24);
      this.axisModel.scale.setScalar(0.86);
      this.axisRings = [];
      this.axisCoreMesh = null;
      this.axisModel.traverse((child) => {
        if (child.isMesh) {
          if (child.name.includes("Orbit")) this.axisRings.push(child);
          if (child.name.includes("Core")) this.axisCoreMesh = child;
        }
      });
      this.scene.add(this.axisModel);
    });

    // 3. Engineering Force-Body Mass Node (shown on Force Decomposition & Equilibrium exercises)
    loader.load("assets/force_node.glb", (gltf) => {
      this.forceNodeModel = gltf.scene;
      this.forceNodeModel.visible = false;
      this.workspaceGroup.add(this.forceNodeModel);
    });

    // 4. KIRI Engine Photogrammetry Scanned Marker (assets/scan_stylus.glb)
    loader.load("assets/scan_stylus.glb", (gltf) => {
      this.scanStylusTemplate = gltf.scene;
      const displayClone = this.scanStylusTemplate.clone();
      displayClone.scale.setScalar(1.35);
      displayClone.rotation.set(0.35, 0, 0.55);
      this.scanDisplayPivot.add(displayClone);
      this._refreshActiveStylusModels();
    });

    // 5. Generated SpatialInk XR Stylus (assets/gen_stylus.glb)
    loader.load("assets/gen_stylus.glb", (gltf) => {
      this.genStylusTemplate = gltf.scene;
      const displayClone = this.genStylusTemplate.clone();
      displayClone.scale.setScalar(1.35);
      displayClone.rotation.set(0.35, 0, -0.55);
      this.genDisplayPivot.add(displayClone);
      this._refreshActiveStylusModels();
    });
  }

  _refreshActiveStylusModels() {
    const template =
      this.activeStylusType === "scanned"
        ? this.scanStylusTemplate || this.genStylusTemplate
        : this.genStylusTemplate || this.scanStylusTemplate;
    if (!template) return;

    // Update Desktop floating stylus
    this.desktopStylusGroup.clear();
    const dClone = template.clone();
    dClone.rotation.x = Math.PI / 2;
    dClone.position.set(0, 0, 0.0825); // tip at local origin (0,0,0)
    this.desktopStylusGroup.add(dClone);

    // Update VR Right-Hand Stylus
    this.vrStylusAnchor.clear();
    const vrClone = template.clone();
    vrClone.rotation.x = Math.PI / 2;
    vrClone.position.set(0, 0, -0.02);
    this.vrStylusAnchor.add(vrClone);
  }

  setActiveStylus(type) {
    this.activeStylusType = type === "scanned" ? "scanned" : "generated";
    this._refreshActiveStylusModels();
  }

  _setupWebXR() {
    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
      const ctrl = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(controllerModelFactory.createControllerModel(grip));
      this.rig.add(ctrl);
      this.rig.add(grip);

      // Visual laser pointer on controllers
      const rayGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -0.65),
      ]);
      const rayLine = new THREE.Line(
        rayGeo,
        new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45 })
      );
      ctrl.add(rayLine);

      // Attach SpatialInk Stylus to Right Controller (index 1 or first right-handed)
      if (i === 1) {
        this.vrStylusAnchor.position.set(0, -0.015, -0.09);
        ctrl.add(this.vrStylusAnchor);
      }

      ctrl.addEventListener("selectstart", () => this._onXRSelectStart(ctrl));
      ctrl.addEventListener("selectend", () => this._onXRSelectEnd(ctrl));
      ctrl.addEventListener("squeezestart", () => {
        if (this.callbacks.onXRQuickSubmit) this.callbacks.onXRQuickSubmit();
      });

      this.controllers.push(ctrl);

      // Hand Tracking (Meta Quest 3 primary target!)
      const hand = this.renderer.xr.getHand(i);
      hand.add(handModelFactory.createHandModel(hand, "mesh"));
      this.rig.add(hand);
      hand.addEventListener("pinchstart", () => this._onXRPinchStart(hand));
      hand.addEventListener("pinchend", () => this._onXRPinchEnd(hand));
      this.hands.push(hand);
    }

    this.renderer.xr.addEventListener("sessionstart", () => {
      const session = this.renderer.xr.getSession();
      const mode = session && session.environmentBlendMode && session.environmentBlendMode !== "opaque" ? "ar" : "vr";
      this.xrMode = mode;
      // In Quest 3 Mixed Reality Passthrough, hide opaque room & sky so real classroom shows behind!
      if (mode === "ar") {
        this.scene.background = null;
        this.scene.fog = null;
        this.studioEnvGroup.visible = false;
        this.renderer.setClearAlpha(0);
      }
      if (this.callbacks.onXRModeChange) this.callbacks.onXRModeChange(mode);
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      this.xrMode = "desktop";
      this.scene.background = new THREE.Color(0x070d19);
      this.scene.fog = new THREE.FogExp2(0x070d19, 0.085);
      this.studioEnvGroup.visible = true;
      this.renderer.setClearAlpha(1);
      if (this.callbacks.onXRModeChange) this.callbacks.onXRModeChange("desktop");
    });
  }

  async checkXRSupport() {
    if (!navigator.xr) return { ar: false, vr: false };
    const ar = await navigator.xr.isSessionSupported("immersive-ar").catch(() => false);
    const vr = await navigator.xr.isSessionSupported("immersive-vr").catch(() => false);
    return { ar, vr };
  }

  async enterXR(mode = "immersive-ar") {
    if (!navigator.xr) {
      throw new Error("WebXR is not available in this browser. Open on Meta Quest 3 / Pico 4 Browser or WebXR Emulator.");
    }
    const sessionInit = {
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
    };
    const session = await navigator.xr.requestSession(mode, sessionInit);
    await this.renderer.xr.setSession(session);
  }

  _getXRPointerTip(source) {
    // For hand tracking, use index-finger-tip if available
    if (source.joints && source.joints["index-finger-tip"]) {
      const pos = new THREE.Vector3();
      source.joints["index-finger-tip"].getWorldPosition(pos);
      return pos;
    }
    // For controller, project slightly in front of stylus tip
    const pos = new THREE.Vector3(0, 0, -0.14);
    source.localToWorld(pos);
    return pos;
  }

  _onXRSelectStart(ctrl) {
    if (this.interactionMode === "sketch") {
      this.xrSketchingSource = ctrl;
      this.xrLastSketchPoint = this._getXRPointerTip(ctrl);
      this._beginNewStroke();
    } else {
      this.xrGrabbingHand = ctrl;
    }
  }

  _onXRSelectEnd(ctrl) {
    if (this.xrGrabbingHand === ctrl) this.xrGrabbingHand = null;
    if (this.xrSketchingSource === ctrl) {
      this.xrSketchingSource = null;
      this.xrLastSketchPoint = null;
      this.currentStrokeGroup = null;
    }
  }

  _onXRPinchStart(hand) {
    if (this.interactionMode === "sketch") {
      this.xrSketchingSource = hand;
      this.xrLastSketchPoint = this._getXRPointerTip(hand);
      this._beginNewStroke();
    } else {
      const tip = this._getXRPointerTip(hand);
      const handleWorld = new THREE.Vector3();
      this.handleOrb.getWorldPosition(handleWorld);
      if (tip.distanceTo(handleWorld) < 0.35) {
        this.xrGrabbingHand = hand;
      }
    }
  }

  _onXRPinchEnd(hand) {
    if (this.xrGrabbingHand === hand) this.xrGrabbingHand = null;
    if (this.xrSketchingSource === hand) {
      this.xrSketchingSource = null;
      this.xrLastSketchPoint = null;
      this.currentStrokeGroup = null;
    }
  }

  _setupDesktopEvents() {
    const dom = this.renderer.domElement;

    const updatePointer = (ev) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    };

    dom.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      updatePointer(ev);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      // Freehand 3D Sketch Mode on desktop
      if (this.interactionMode === "sketch" || this.spacePressed) {
        this.isDesktopSketching = true;
        this.controls.enabled = false;
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), WORKSPACE_ORIGIN);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHitPoint)) {
          this._beginNewStroke();
          this.lastSketchPoint = this.dragHitPoint.clone();
          this.desktopStylusGroup.position.copy(this.dragHitPoint);
          this.desktopStylusGroup.visible = true;
        }
        return;
      }

      // Check handle orb hit for direct 3D vector manipulation
      const hits = this.raycaster.intersectObject(this.handleOrb, false);
      if (hits.length > 0) {
        this.isDraggingHandle = true;
        this.controls.enabled = false;
        const handleWorld = new THREE.Vector3();
        this.handleOrb.getWorldPosition(handleWorld);

        if (ev.shiftKey || this.dragAxisMode === "y") {
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          camDir.y = 0;
          camDir.normalize();
          this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), handleWorld);
        } else if (this.dragAxisMode === "xz") {
          this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), handleWorld);
        } else {
          const camDir = new THREE.Vector3();
          this.camera.getWorldDirection(camDir);
          this.dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), handleWorld);
        }
        dom.style.cursor = "grabbing";
      }
    });

    dom.addEventListener("pointermove", (ev) => {
      updatePointer(ev);
      this.raycaster.setFromCamera(this.pointer, this.camera);

      if (this.isDesktopSketching) {
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHitPoint)) {
          // Keep sketch inside extended workspace bounds
          const rel = this.dragHitPoint.clone().sub(WORKSPACE_ORIGIN);
          if (rel.length() < 0.72) {
            this.desktopStylusGroup.position.copy(this.dragHitPoint);
            if (this.lastSketchPoint && this.lastSketchPoint.distanceTo(this.dragHitPoint) > 0.012) {
              this._addInkSegment(this.lastSketchPoint, this.dragHitPoint);
              this.lastSketchPoint.copy(this.dragHitPoint);
            }
          }
        }
        return;
      }

      if (this.isDraggingHandle) {
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHitPoint)) {
          const local = this.workspaceGroup.worldToLocal(this.dragHitPoint.clone());
          let mx = local.x / UNIT_SCALE;
          let my = local.y / UNIT_SCALE;
          let mz = local.z / UNIT_SCALE;

          if (ev.shiftKey || this.dragAxisMode === "y") {
            mx = this.userVec.x;
            mz = this.userVec.z;
          } else if (this.dragAxisMode === "xz") {
            my = this.userVec.y;
          }

          if (this.snapEnabled) {
            mx = Math.round(mx / this.snapStep) * this.snapStep;
            my = Math.round(my / this.snapStep) * this.snapStep;
            mz = Math.round(mz / this.snapStep) * this.snapStep;
          } else {
            mx = Math.round(mx * 10) / 10;
            my = Math.round(my * 10) / 10;
            mz = Math.round(mz * 10) / 10;
          }

          this.setUserVector(
            {
              x: clamp(mx, WORKSPACE_MIN, WORKSPACE_MAX),
              y: clamp(my, WORKSPACE_MIN, WORKSPACE_MAX),
              z: clamp(mz, WORKSPACE_MIN, WORKSPACE_MAX),
            },
            true
          );
        }
        return;
      }

      // Hover cursor feedback
      const hits = this.raycaster.intersectObject(this.handleOrb, false);
      if (hits.length > 0 && this.interactionMode === "vector") {
        dom.style.cursor = "grab";
        this.handleMat.emissiveIntensity = 1.1;
      } else {
        dom.style.cursor = this.interactionMode === "sketch" ? "crosshair" : "default";
        this.handleMat.emissiveIntensity = 0.65;
      }
    });

    const endDrag = () => {
      if (this.isDraggingHandle) {
        this.isDraggingHandle = false;
        this.controls.enabled = true;
        dom.style.cursor = "default";
      }
      if (this.isDesktopSketching) {
        this.isDesktopSketching = false;
        this.controls.enabled = true;
        this.lastSketchPoint = null;
        this.currentStrokeGroup = null;
        this.desktopStylusGroup.visible = false;
      }
    };
    window.addEventListener("pointerup", endDrag);

    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.spacePressed = true;
      }
    });
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spacePressed = false;
        endDrag();
      }
    });

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _beginNewStroke() {
    this.currentStrokeGroup = new THREE.Group();
    this.sketchGroup.add(this.currentStrokeGroup);
    this.inkStrokes.push(this.currentStrokeGroup);
  }

  _addInkSegment(a, b) {
    if (!this.currentStrokeGroup) this._beginNewStroke();
    const diff = b.clone().sub(a);
    const len = diff.length();
    if (len < 0.002) return;
    const geo = new THREE.CylinderGeometry(0.0055, 0.0055, len, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: this.inkColor,
      emissive: this.inkColor,
      emissiveIntensity: 0.75,
      roughness: 0.2,
    });
    const seg = new THREE.Mesh(geo, mat);
    seg.position.copy(a).addScaledVector(diff, 0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
    this.currentStrokeGroup.add(seg);
  }

  undoInkStroke() {
    const last = this.inkStrokes.pop();
    if (last) {
      this.sketchGroup.remove(last);
      last.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }

  clearInk() {
    while (this.inkStrokes.length > 0) this.undoInkStroke();
  }

  setUserVector(vec, notify = false) {
    this.userVec = {
      x: clamp(Math.round(vec.x * 100) / 100, WORKSPACE_MIN, WORKSPACE_MAX),
      y: clamp(Math.round(vec.y * 100) / 100, WORKSPACE_MIN, WORKSPACE_MAX),
      z: clamp(Math.round(vec.z * 100) / 100, WORKSPACE_MIN, WORKSPACE_MAX),
    };

    const tipLocal = new THREE.Vector3(
      this.userVec.x * UNIT_SCALE,
      this.userVec.y * UNIT_SCALE,
      this.userVec.z * UNIT_SCALE
    );
    this.userArrow.setVector({ x: 0, y: 0, z: 0 }, this.userVec);
    this.handleOrb.position.copy(tipLocal);
    this.tipLabel.position.copy(tipLocal).add(new THREE.Vector3(0, 0.09, 0));
    this.tipLabel.userData.updateText(`⟨${this.userVec.x.toFixed(1)}, ${this.userVec.y.toFixed(1)}, ${this.userVec.z.toFixed(1)}⟩`);

    // Update dashed projection lines
    const pFoot = new THREE.Vector3(tipLocal.x, 0, tipLocal.z);
    const pXAxis = new THREE.Vector3(tipLocal.x, 0, 0);
    const pZAxis = new THREE.Vector3(0, 0, tipLocal.z);

    this.projX.geometry.setFromPoints([pZAxis, pFoot]);
    this.projX.computeLineDistances();

    this.projZ.geometry.setFromPoints([pXAxis, pFoot]);
    this.projZ.computeLineDistances();

    this.projY.geometry.setFromPoints([pFoot, tipLocal]);
    this.projY.computeLineDistances();

    this.xzFootDot.position.copy(pFoot);

    if (notify && this.callbacks.onVectorChange) {
      this.callbacks.onVectorChange({ ...this.userVec });
    }
  }

  setVectorFeedbackColor(status) {
    // 'neutral' | 'correct' | 'partial' | 'error'
    const colors = {
      neutral: 0x38bdf8,
      correct: 0x10b981,
      partial: 0xf59e0b,
      error: 0xf87171,
    };
    const hex = colors[status] || colors.neutral;
    this.userArrow.userData.mat.color.setHex(hex);
    this.userArrow.userData.mat.emissive.setHex(hex);
    this.handleMat.color.setHex(hex);
    this.handleMat.emissive.setHex(hex);
    this.isEquilibriumBalanced = status === "correct";
  }

  setAxisState(state) {
    this.axisState = state;
    if (!this.axisCoreMesh) return;
    const palette = {
      idle: 0x38bdf8,
      thinking: 0xfbbf24,
      correct: 0x10b981,
      error: 0xf87171,
      offline: 0x64748b,
    };
    const hex = palette[state] || palette.idle;
    this.axisCoreMesh.material.color.setHex(hex);
    this.axisCoreMesh.material.emissive.setHex(hex);
  }

  loadExercise(exercise) {
    this.givenGroup.clear();
    this.isEquilibriumBalanced = false;
    this.setVectorFeedbackColor("neutral");

    // Toggle engineering force block at origin
    if (this.forceNodeModel) {
      this.forceNodeModel.visible = Boolean(exercise.showForceNode);
      this.forceNodeModel.position.set(0, 0, 0);
    }

    // Add given vectors & labels
    for (const gv of exercise.givenVectors || []) {
      const origin = gv.origin || { x: 0, y: 0, z: 0 };
      const arrow = createArrowGroup(gv.color, gv.ghost ? 0.0085 : 0.0115, Boolean(gv.dashed));
      arrow.setVector(origin, gv.vec);
      this.givenGroup.add(arrow);

      const tip = new THREE.Vector3(origin.x + gv.vec.x, origin.y + gv.vec.y, origin.z + gv.vec.z).multiplyScalar(
        UNIT_SCALE
      );
      const hexStr = `#${gv.color.toString(16).padStart(6, "0")}`;
      const lbl = makeTextSprite(gv.label, "rgba(15,23,42,0.86)", hexStr, "#f8fafc", 240, 58);
      lbl.position.copy(tip).add(new THREE.Vector3(0, 0.065, 0));
      lbl.scale.set(0.21, 0.05, 1);
      this.givenGroup.add(lbl);
    }

    // Optional translucent reference plane (Exercise 5: Surface Normal Vector!)
    if (exercise.plane) {
      const sizeM = (exercise.plane.size || 3.4) * UNIT_SCALE;
      const pGeo = new THREE.PlaneGeometry(sizeM, sizeM);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.26,
        side: THREE.DoubleSide,
        roughness: 0.2,
      });
      const planeMesh = new THREE.Mesh(pGeo, pMat);
      const n = new THREE.Vector3(
        exercise.plane.normal.x,
        exercise.plane.normal.y,
        exercise.plane.normal.z
      ).normalize();
      planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);

      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(pGeo),
        new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85 })
      );
      planeMesh.add(border);
      this.givenGroup.add(planeMesh);
    }

    this.setUserVector(exercise.initialUserVector, true);
  }

  updateSpatialBoards(exercise, userVec, validation, axisCaption, stepLog = []) {
    // 1. Left Exercise Board
    {
      const { ctx, canvas, tex } = this.exerciseBoard;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8, 15, 30, 0.94)";
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 26);
      ctx.fill();

      ctx.strokeStyle = validation && validation.isCorrect ? "#10b981" : "#38bdf8";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.roundRect(6, 6, W - 12, H - 12, 22);
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "700 22px Inter, sans-serif";
      ctx.fillText(`SPATIALINK · ${exercise.id} · ${exercise.category.toUpperCase()}`, 34, 48);

      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 32px Inter, sans-serif";
      ctx.fillText(exercise.title, 34, 92);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "400 22px Inter, sans-serif";
      let y = wrapCanvasText(ctx, exercise.prompt, 34, 134, W - 68, 30, 4);

      ctx.fillStyle = "#7dd3fc";
      ctx.font = "600 22px 'JetBrains Mono', monospace";
      ctx.fillText(exercise.formula, 34, y + 14);

      const mag = Math.sqrt(userVec.x ** 2 + userVec.y ** 2 + userVec.z ** 2).toFixed(2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.beginPath();
      ctx.roundRect(30, H - 165, W - 60, 132, 16);
      ctx.fill();

      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 26px 'JetBrains Mono', monospace";
      ctx.fillText(`ACTIVE: ⟨${userVec.x.toFixed(1)}, ${userVec.y.toFixed(1)}, ${userVec.z.toFixed(1)}⟩   |v| = ${mag}`, 50, H - 122);

      if (validation) {
        ctx.fillStyle = validation.isCorrect ? "#34d399" : "#fbbf24";
        ctx.font = "600 21px Inter, sans-serif";
        wrapCanvasText(ctx, `VALIDATOR (${validation.passedSteps}/${validation.totalSteps}): ${validation.diagnosis}`, 50, H - 82, W - 100, 28, 2);
      } else {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "400 21px Inter, sans-serif";
        ctx.fillText("Drag the 3D cyan orb (or pinch in Quest 3) then press Validate Step.", 50, H - 82);
      }
      tex.needsUpdate = true;
    }

    // 2. Right Axis Caption & Step Log Board
    {
      const { ctx, canvas, tex } = this.axisBoard;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8, 15, 30, 0.94)";
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 26);
      ctx.fill();

      ctx.strokeStyle = this.axisState === "offline" ? "#64748b" : "#38bdf8";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(6, 6, W - 12, H - 12, 22);
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "700 24px Inter, sans-serif";
      ctx.fillText("AXIS · VIRTUAL GUIDE (MAX 2 SENTENCES)", 32, 48);

      ctx.fillStyle = "#f1f5f9";
      ctx.font = "500 24px Inter, sans-serif";
      let y = wrapCanvasText(ctx, `“${axisCaption}”`, 32, 92, W - 64, 34, 5);

      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(32, Math.max(y + 16, 265));
      ctx.lineTo(W - 32, Math.max(y + 16, 265));
      ctx.stroke();

      let ly = Math.max(y + 52, 300);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "700 20px 'JetBrains Mono', monospace";
      ctx.fillText("SUBMITTED STEPS (THIS SESSION ONLY):", 32, ly);
      ly += 34;

      const recent = stepLog.slice(-4);
      if (recent.length === 0) {
        ctx.fillStyle = "#64748b";
        ctx.font = "400 20px Inter, sans-serif";
        ctx.fillText("No submitted steps yet.", 32, ly);
      } else {
        ctx.font = "500 20px 'JetBrains Mono', monospace";
        for (const entry of recent) {
          ctx.fillStyle = entry.isCorrect ? "#34d399" : "#fbbf24";
          ctx.fillText(
            `${entry.isCorrect ? "✓" : "•"} ${entry.exerciseId} ⟨${entry.vec.x}, ${entry.vec.y}, ${entry.vec.z}⟩ (${entry.passedSteps}/${entry.totalSteps})`,
            32,
            ly
          );
          ly += 32;
        }
      }
      tex.needsUpdate = true;
    }
  }

  focusCameraPreset(preset) {
    if (preset === "workspace") {
      this.camera.position.set(0.95, 1.85, 0.72);
      this.controls.target.copy(WORKSPACE_ORIGIN);
    } else if (preset === "front") {
      this.camera.position.set(0, 1.38, 0.75);
      this.controls.target.copy(WORKSPACE_ORIGIN);
    } else if (preset === "side") {
      this.camera.position.set(1.65, 1.4, -1.05);
      this.controls.target.copy(WORKSPACE_ORIGIN);
    } else if (preset === "top") {
      this.camera.position.set(0.01, 2.85, -0.95);
      this.controls.target.copy(WORKSPACE_ORIGIN);
    } else if (preset === "assets") {
      this.camera.position.set(-0.72, 1.32, -0.45);
      this.controls.target.set(-0.96, 1.12, -1.16);
    }
    this.controls.update();
  }

  _handleXRInteractions(dt) {
    // 1. Grabbing vector handle in XR (Hand pinch or Controller trigger)
    if (this.xrGrabbingHand) {
      const tipWorld = this._getXRPointerTip(this.xrGrabbingHand);
      const local = this.workspaceGroup.worldToLocal(tipWorld.clone());
      let mx = local.x / UNIT_SCALE;
      let my = local.y / UNIT_SCALE;
      let mz = local.z / UNIT_SCALE;
      if (this.snapEnabled) {
        mx = Math.round(mx / this.snapStep) * this.snapStep;
        my = Math.round(my / this.snapStep) * this.snapStep;
        mz = Math.round(mz / this.snapStep) * this.snapStep;
      }
      this.setUserVector(
        {
          x: clamp(mx, WORKSPACE_MIN, WORKSPACE_MAX),
          y: clamp(my, WORKSPACE_MIN, WORKSPACE_MAX),
          z: clamp(mz, WORKSPACE_MIN, WORKSPACE_MAX),
        },
        true
      );
    }

    // 2. Freehand 3D Ink Drawing in XR
    if (this.xrSketchingSource) {
      const tip = this._getXRPointerTip(this.xrSketchingSource);
      if (this.xrLastSketchPoint && this.xrLastSketchPoint.distanceTo(tip) > 0.012) {
        this._addInkSegment(this.xrLastSketchPoint, tip);
        this.xrLastSketchPoint.copy(tip);
      }
    }

    // 3. Thumbstick Locomotion in XR (Quest / Pico controllers)
    const session = this.renderer.xr.getSession();
    if (session) {
      for (const source of session.inputSources) {
        if (!source.gamepad || !source.gamepad.axes || source.gamepad.axes.length < 4) continue;
        const axX = source.gamepad.axes[2] || 0;
        const axY = source.gamepad.axes[3] || 0;
        if (Math.abs(axX) > 0.15 || Math.abs(axY) > 0.15) {
          const xrCam = this.renderer.xr.getCamera();
          const forward = new THREE.Vector3();
          xrCam.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();
          const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
          this.rig.position.addScaledVector(forward, -axY * 1.6 * dt);
          this.rig.position.addScaledVector(right, axX * 1.6 * dt);
        }
      }
    }
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    if (!this.renderer.xr.isPresenting) {
      this.controls.update();
    } else {
      this._handleXRInteractions(dt);
    }

    // Face handle halo toward active camera
    this.handleHalo.lookAt(this.camera.position);

    // Animate "Axis" floating line-and-orbit guide (calm, non-human precision motion)
    if (this.axisModel) {
      const speed = this.axisState === "thinking" ? 2.4 : this.axisState === "offline" ? 0.25 : 0.85;
      this.axisModel.position.y = 1.72 + Math.sin(t * 1.8) * 0.022;
      if (this.axisRings[0]) this.axisRings[0].rotation.z += dt * 0.65 * speed;
      if (this.axisRings[1]) this.axisRings[1].rotation.x -= dt * 0.55 * speed;
      if (this.axisRings[2]) this.axisRings[2].rotation.y += dt * 0.72 * speed;
      if (this.axisCoreMesh) {
        this.axisCoreMesh.rotation.y += dt * 0.4 * speed;
        const pulse = this.axisState === "thinking" ? 1 + Math.sin(t * 8) * 0.08 : 1;
        this.axisCoreMesh.scale.setScalar(pulse);
      }
    }

    // Animate GA3 Asset Showcase display pedestals
    this.scanDisplayPivot.rotation.y = t * 0.55;
    this.genDisplayPivot.rotation.y = -t * 0.55;

    // Equilibrium Force Block visual feedback (subtly vibrates when unbalanced, locks steady when ΣF = 0!)
    if (this.forceNodeModel && this.forceNodeModel.visible) {
      if (this.isEquilibriumBalanced) {
        this.forceNodeModel.position.set(0, 0, 0);
        this.forceNodeModel.rotation.y += dt * 0.35;
      } else {
        this.forceNodeModel.position.set(
          Math.sin(t * 28) * 0.0035,
          Math.cos(t * 32) * 0.0035,
          Math.sin(t * 24) * 0.0035
        );
      }
    }

    this.renderer.render(this.scene, this.camera);

    // Performance Profiler Sampling (Week 12 Budget Telemetry)
    this.perf.frames++;
    const now = performance.now();
    if (now - this.perf.lastSample >= 500) {
      const elapsed = now - this.perf.lastSample;
      this.perf.fps = Math.round((this.perf.frames * 1000) / elapsed);
      this.perf.frameMs = Math.round((elapsed / Math.max(this.perf.frames, 1)) * 10) / 10;
      this.perf.frames = 0;
      this.perf.lastSample = now;
      if (this.callbacks.onPerfSample) {
        this.callbacks.onPerfSample({
          fps: this.perf.fps,
          frameMs: this.perf.frameMs,
          calls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
          mode: this.xrMode,
        });
      }
    }
  }
}
