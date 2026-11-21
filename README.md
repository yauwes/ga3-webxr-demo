# SpatialInk — WebXR 3D Vector & Force Lab

**Course:** Extended Reality · Realitas X (`EF234711 / EA234505`, Semester 2026/1)  
**Team:** Group 4 · *Eau de Vision Pemula* · Class RKA  
**Live Demo:** https://yauwes.github.io/ga3-webxr-demo/

| Name | NRP | GitHub | Role |
| --- | --- | --- | --- |
| Imam Muhammad Diponegoro | 5054231018 | `@imdipo` | Hand interaction & headset input prototype |
| Pandji Seno Aji | 5054231023 | `@yauwes` | 3D vector scene & mathematical validation |
| Gandrung Ghafar | 5054231008 | `@Gghafar` | Generated 3D objects & Blender asset pipeline |
| Shalahuddin Ahmad Cahyoga | 5054231014 | `@A-d-d-i-n` | Real-world object photogrammetry scanning (KIRI Engine) |
| Jonathan Anderson Manurung | 5054241014 | `@lovingsir123` | Concept drafting & documentation |

---

## Overview

**SpatialInk** is a bounded 3D WebXR workspace designed for first-year engineering and science students practising **3D vectors, force decomposition, vector addition, static equilibrium, and surface normal vectors**.

Built directly from the Group 4 Proposal Contract:
- **Mixed Reality & VR Ready:** Runs on **Meta Quest 3** (`immersive-ar` passthrough, hiding the virtual floor/sky so the bounded `[-3, +3]³` coordinate frame floats in the classroom) with automatic **VR fallback** (`immersive-vr` for Quest 2 / Pico 4) and full **Desktop / Tablet** browser support.
- **Hand Tracking + Controller + Accessible Sliders:** Pinch-grab or controller-trigger to reposition 3D vector endpoints, draw freehand 3D ink with a swappable stylus (**KIRI Engine Scanned Marker** vs **Blender Generated SpatialInk Stylus**), or adjust exact X/Y/Z components with precision sliders & `±0.5` step buttons.
- **Deterministic Mathematical Validator (`js/validator.js`):** Numerical correctness is always decided locally by explicit mathematical rules (`±0.25` unit tolerance), intermediate step checks (`vx, vy, vz` or orthogonality dot products `n·u = 0, n·v = 0`), and misconception detection (sign inversion, subtraction instead of addition, Z-depth error).
- **"Axis" Virtual Guide (`js/axisTutor.js` + `assets/axis_guide.glb`):** A calm, non-human floating line-and-orbit marker beside the workspace with strict 2-sentence replies, session-only memory (no PII), exact identity honesty line, 8-second timeout protection, 3 local fallback lines, optional Web Speech TTS/STT, and an interactive **Week 7 Break-It Probe Tester**.
- **In-Headset 3D Spatial Boards & Live Performance Telemetry:** High-DPI floating canvas boards display exercise prompts, validator feedback, and Axis captions inside the headset, alongside a live FPS / frame-time / draw-call / triangle-count telemetry bar (Week 12 ready).

---

## Bounded Exercise Curriculum (`js/exercises.js`)

| ID | Topic | Mathematical Rule |
| --- | --- | --- |
| `EX-01` | 3D Position Vector | Construct `v = ⟨2, 3, -1⟩` from origin `O(0,0,0)` |
| `EX-02` | 3D Force Decomposition | Resolve `F = 3.0 kN` along `⟨2, 2, 1⟩ kN` on the metallic mass node |
| `EX-03` | 3D Vector Addition | Construct resultant `R = A + B = ⟨1, 3, 2⟩` from `A = ⟨2,1,0⟩`, `B = ⟨-1,2,2⟩` |
| `EX-04` | Static Force Equilibrium | Construct balancing force `F₃ = −(F₁ + F₂) = ⟨-1, -2, -2⟩ N` (`ΣF = 0`) |
| `EX-05` | Plane Surface Normal | Construct `n ⊥ plane(u, v)` with `n·u = 0`, `n·v = 0`, `|n| ≥ 1.5` |

---

## Controls

- **Meta Quest 3 (MR / VR):**
  - **Hands:** Pinch the cyan vector tip orb to move it in 3D free space (or pinch anywhere in *3D SpatialInk Sketch* mode to ink).
  - **Controllers:** Right Trigger grabs vector tip / draws 3D ink; Grip (Squeeze) submits the step for validation; Left Thumbstick moves around the workspace.
- **Desktop / Laptop:**
  - **Orbit / Zoom:** Left-drag background to orbit, scroll to zoom.
  - **Vector Handle:** Drag the cyan orb directly (`Shift` + drag locks to vertical Y; or cycle `Drag: 3D Free / XZ Floor / Y Vertical`).
  - **3D Ink Sketch:** Hold `Space` + drag (or toggle *3D SpatialInk Sketch* mode).
  - **Accessible Precision:** Use X / Y / Z sliders or `− / +` buttons.

---

## Section 11 · Asset Provenance Log

All runtime 3D assets live in `assets/` (total payload: **~680 KB** for fast WebXR headset loading) and are reproducibly built/optimized via `scripts/build_assets.py` in Blender 4.3.2.

| Asset | Made With (Tool / Capture Source) | By Whom | Licence / Terms | What We Edited by Hand |
| --- | --- | --- | --- | --- |
| `assets/scan_stylus.glb` (`scan_fitted.glb`) | KIRI Engine photogrammetry scan (`3DModel.obj` + `3DModel.jpg`, 249,999 raw tris) | Shalahuddin A. C. & Team | Team-captured original scan | Cropped desk background, PCA principal-axis aligned, scaled to real 16.5 cm marker length, decimated to 7,052 tris, texture resized to 1024px JPEG (2.7 MB → 276 KB) in Blender 4.3 |
| `assets/gen_stylus.glb` (`gen_fitted.glb`) | Procedural 3D model generated via Blender 4.3 Python script (`scripts/build_assets.py`) | Gandrung Ghafar & Team | Original team asset (MIT) | Modeled ergonomic barrel, grip rings, cyan LED collar, trigger button, tapered cone & tip centered at local origin (102 KB) |
| `assets/axis_guide.glb` | Procedural 3D model in Blender 4.3 (`scripts/build_assets.py`) | Group 4 | Original team asset (MIT) | Designed non-human faceted crystal core + 3 RGB X/Y/Z orbital rings + 6 cardinal axis ticks per Contract Section 8 (137 KB) |
| `assets/workbench_pedestal.glb` | Procedural 3D model in Blender 4.3 (`scripts/build_assets.py`) | Group 4 | Original team asset (MIT) | Octagonal holographic workbench base with 4 corner emitter pods & cyan perimeter ring (88 KB) |
| `assets/force_node.glb` | Procedural 3D model in Blender 4.3 (`scripts/build_assets.py`) | Group 4 | Original team asset (MIT) | Beveled metallic mass block with 6 anchor ports for force decomposition & static equilibrium (77 KB) |
| Three.js `0.170.0` (CDN) | Open-source WebGL / WebXR library via jsDelivr | Three.js Contributors | MIT License | Used unmodified via ES module importmap |

---

## Section 10 · AI Disclosure

- **What an AI assistant was used for:** Structuring the WebXR Three.js architecture, authoring the Blender 4.3 asset optimization/generation script (`scripts/build_assets.py`), implementing the deterministic validator and Axis guardrails, and styling the responsive HUD.
- **Verification & honesty boundaries:** All numerical grading is deterministic (`js/validator.js`) rather than delegated to an LLM. No API keys are stored in the repository; the default build runs 100% locally offline, and no fabricated Week 14 user study data or interview quotes are included in the app.

---

## Local Development

Because ES modules and `.glb` loading require HTTP (not `file://`), run any static server:

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```
