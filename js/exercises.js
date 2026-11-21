/**
 * SpatialInk — Bounded 3D Vector & Force Exercise Curriculum
 * Aligned with Final Project Proposal Contract (Group 4 · Eau de Vision Pemula)
 * Tolerance: ±0.25 units (documented deterministic mathematical rule).
 */

export const TOLERANCE = 0.25;
export const WORKSPACE_MIN = -3;
export const WORKSPACE_MAX = 3;

export const EXERCISES = [
  {
    id: "EX-01",
    shortTitle: "1 · Position",
    title: "Construct a 3D Position Vector",
    category: "Vector Construction",
    type: "exact_vector",
    prompt:
      "Construct position vector v = ⟨2, 3, -1⟩ starting from the origin O(0, 0, 0). Use the 3D handle (or X/Y/Z controls) to inspect depth along Z.",
    formula: "v = 2i + 3j − 1k   (|v| = √14 ≈ 3.74)",
    target: { x: 2, y: 3, z: -1 },
    initialUserVector: { x: 1, y: 1, z: 1 },
    givenVectors: [],
    showForceNode: false,
    plane: null,
    steps: [
      { id: "S1", label: "Set horizontal component vx = +2.0", check: "x" },
      { id: "S2", label: "Set vertical component vy = +3.0", check: "y" },
      { id: "S3", label: "Set depth component vz = -1.0 (into −Z)", check: "z" },
    ],
    hints: [
      "Start with the red X-axis: move the vector tip to x = +2.0 units.",
      "Next check the green Y-axis height: raise the tip to y = +3.0 units.",
      "Finally check depth along the blue Z-axis: negative Z points away from you toward z = -1.0.",
    ],
    workedExample: [
      "Origin is fixed at (0, 0, 0) on the workbench pedestal.",
      "Move +2 units along +X (red), +3 units along +Y (green), and −1 unit along −Z (blue).",
      "Resulting magnitude: |v| = √(2² + 3² + (−1)²) = √14 ≈ 3.74 units.",
    ],
  },
  {
    id: "EX-02",
    shortTitle: "2 · Force Split",
    title: "Resolve a 3D Force into Components",
    category: "Force Decomposition",
    type: "exact_vector",
    prompt:
      "A 3.0 kN cable tension F acts along ⟨2, 2, 1⟩ kN on the metallic mass node. Match the gold reference force with your blue construction vector and inspect Fx, Fy, Fz.",
    formula: "F = ⟨Fx, Fy, Fz⟩ = ⟨2, 2, 1⟩ kN   (|F| = 3.00 kN)",
    target: { x: 2, y: 2, z: 1 },
    initialUserVector: { x: 2, y: 0, z: 0 },
    givenVectors: [
      {
        label: "F_ref (3.0 kN)",
        vec: { x: 2, y: 2, z: 1 },
        color: 0xfbbf24,
        dashed: true,
        ghost: true,
      },
    ],
    showForceNode: true,
    plane: null,
    steps: [
      { id: "S1", label: "Match Fx = +2.0 kN along red X-axis", check: "x" },
      { id: "S2", label: "Match Fy = +2.0 kN along green Y-axis", check: "y" },
      { id: "S3", label: "Match Fz = +1.0 kN along blue Z-axis", check: "z" },
    ],
    hints: [
      "Inspect the dashed gold projection lines from the force tip down to each coordinate axis.",
      "The horizontal projection sits at Fx = 2.0 and Fz = 1.0 on the XZ floor plane.",
      "The vertical lift is Fy = 2.0, giving |F| = √(2² + 2² + 1²) = √9 = 3.00 kN.",
    ],
    workedExample: [
      "Project F onto the XZ plane first: Fx = 2.0 kN, Fz = 1.0 kN.",
      "Measure the vertical elevation from the XZ plane: Fy = 2.0 kN.",
      "Check magnitude: √(4 + 4 + 1) = 3.00 kN with direction cosines (2/3, 2/3, 1/3).",
    ],
  },
  {
    id: "EX-03",
    shortTitle: "3 · Vector Sum",
    title: "Resultant Vector Addition (R = A + B)",
    category: "Vector Addition",
    type: "vector_sum",
    prompt:
      "Given A = ⟨2, 1, 0⟩ (amber) and B = ⟨-1, 2, 2⟩ (violet), construct the 3D resultant vector R = A + B from the origin.",
    formula: "R = A + B = ⟨2+(−1), 1+2, 0+2⟩ = ⟨1, 3, 2⟩",
    target: { x: 1, y: 3, z: 2 },
    initialUserVector: { x: 1, y: 1, z: 0 },
    givenVectors: [
      { label: "A ⟨2,1,0⟩", vec: { x: 2, y: 1, z: 0 }, color: 0xf59e0b },
      { label: "B ⟨-1,2,2⟩", vec: { x: -1, y: 2, z: 2 }, color: 0xa855f7 },
      {
        label: "B (tip-to-tail)",
        origin: { x: 2, y: 1, z: 0 },
        vec: { x: -1, y: 2, z: 2 },
        color: 0xa855f7,
        dashed: true,
        ghost: true,
      },
    ],
    showForceNode: false,
    plane: null,
    steps: [
      { id: "S1", label: "Add X components: Rx = 2 + (−1) = +1.0", check: "x" },
      { id: "S2", label: "Add Y components: Ry = 1 + 2 = +3.0", check: "y" },
      { id: "S3", label: "Add Z components: Rz = 0 + 2 = +2.0", check: "z" },
    ],
    hints: [
      "Follow the violet tip-to-tail dashed guide starting from the head of amber vector A.",
      "Add each axis independently: Rx = Ax + Bx = 2 + (−1) = 1.",
      "Do not forget the Z-depth from vector B: Rz = 0 + 2 = +2.0.",
    ],
    workedExample: [
      "Place the tail of B = ⟨−1, 2, 2⟩ at the tip of A = ⟨2, 1, 0⟩.",
      "Sum component-wise: Rx = 1, Ry = 3, Rz = 2.",
      "Draw resultant R from (0,0,0) to (1, 3, 2). Magnitude |R| = √14 ≈ 3.74.",
    ],
  },
  {
    id: "EX-04",
    shortTitle: "4 · Equilibrium",
    title: "3D Force Equilibrium (ΣF = 0)",
    category: "Force Equilibrium",
    type: "equilibrium",
    prompt:
      "Two forces F₁ = ⟨2, 0, 1⟩ N and F₂ = ⟨-1, 2, 1⟩ N pull on the engineering node. Construct the balancing force F₃ so that ΣF = F₁ + F₂ + F₃ = 0.",
    formula: "F₃ = −(F₁ + F₂) = −⟨1, 2, 2⟩ = ⟨−1, −2, −2⟩ N",
    target: { x: -1, y: -2, z: -2 },
    initialUserVector: { x: 0, y: -1, z: 0 },
    givenVectors: [
      { label: "F₁ ⟨2,0,1⟩", vec: { x: 2, y: 0, z: 1 }, color: 0xf97316 },
      { label: "F₂ ⟨-1,2,1⟩", vec: { x: -1, y: 2, z: 1 }, color: 0xec4899 },
    ],
    showForceNode: true,
    plane: null,
    steps: [
      { id: "S1", label: "Balance X: F3x = −(2 − 1) = −1.0 N", check: "x" },
      { id: "S2", label: "Balance Y: F3y = −(0 + 2) = −2.0 N", check: "y" },
      { id: "S3", label: "Balance Z: F3z = −(1 + 1) = −2.0 N", check: "z" },
    ],
    hints: [
      "First sum the two given forces: F₁ + F₂ = ⟨1, 2, 2⟩ N.",
      "An equilibrant force has equal magnitude but opposite sign on every axis.",
      "Flip all three signs to cancel the net force: F₃ = ⟨−1, −2, −2⟩ N.",
    ],
    workedExample: [
      "Net applied force: F_net = F₁ + F₂ = ⟨2−1, 0+2, 1+1⟩ = ⟨1, 2, 2⟩ N.",
      "For static equilibrium (ΣF = 0), set F₃ = −F_net = ⟨−1, −2, −2⟩ N.",
      "When balanced, the central engineering node stops vibrating and locks in emerald.",
    ],
  },
  {
    id: "EX-05",
    shortTitle: "5 · Plane Normal",
    title: "Construct a Surface Normal (n ⊥ Plane)",
    category: "Cross Product & Normals",
    type: "plane_normal",
    prompt:
      "A tilted plane is spanned by u = ⟨2, 0, 0⟩ and v = ⟨0, 1, -1⟩. Construct a normal vector n perpendicular to the plane with magnitude |n| ≥ 1.5.",
    formula: "n · u = 0  and  n · v = 0   ⇒   n ∥ ⟨0, 1, 1⟩ (or ⟨0, −1, −1⟩)",
    target: { x: 0, y: 2, z: 2 },
    planeBasis: {
      u: { x: 2, y: 0, z: 0 },
      v: { x: 0, y: 1, z: -1 },
    },
    minMagnitude: 1.5,
    initialUserVector: { x: 1, y: 2, z: 0 },
    givenVectors: [
      { label: "u ⟨2,0,0⟩", vec: { x: 2, y: 0, z: 0 }, color: 0xfb7185 },
      { label: "v ⟨0,1,-1⟩", vec: { x: 0, y: 1, z: -1 }, color: 0x34d399 },
    ],
    showForceNode: false,
    plane: {
      normal: { x: 0, y: 1, z: 1 },
      size: 3.4,
    },
    steps: [
      { id: "S1", label: "Orthogonal to u: n·u = 0  (so nx ≈ 0)", check: "dot_u" },
      { id: "S2", label: "Orthogonal to v: n·v = 0  (so ny ≈ nz)", check: "dot_v" },
      { id: "S3", label: "Sufficient length: |n| ≥ 1.5 units", check: "mag" },
    ],
    hints: [
      "Since u = ⟨2, 0, 0⟩ lies along the X-axis, any perpendicular vector must have nx = 0.",
      "For n · v = 0 with v = ⟨0, 1, −1⟩, we need ny − nz = 0, meaning ny = nz.",
      "Try placing the tip at ⟨0, 2, 2⟩ (or ⟨0, −2, −2⟩) so it sticks straight out of the translucent plane.",
    ],
    workedExample: [
      "Compute cross product: u × v = ⟨2,0,0⟩ × ⟨0,1,−1⟩ = ⟨0, 2, 2⟩.",
      "Verify orthogonality: n·u = 0 and n·v = 0(0) + 2(1) + 2(−1) = 0.",
      "Magnitude |n| = √(0 + 4 + 4) = 2.83 ≥ 1.5 — valid surface normal!",
    ],
  },
];
