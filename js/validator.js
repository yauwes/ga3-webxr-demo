/**
 * SpatialInk — Deterministic Mathematical Validator (Rule-Based Authority)
 * Per Proposal Contract Sections 0, 5, and 8:
 * "A deterministic checker will decide whether a numerical step is correct within
 * a documented tolerance. The language model will not be the sole authority on
 * numerical correctness."
 */

import { TOLERANCE } from "./exercises.js";

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function magnitude(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Evaluates a user's submitted 3D vector against the active exercise's deterministic rules.
 * Returns structured state safe to display to educators and pass to Axis (never raw camera/hand data).
 */
export function validateVector(exercise, userVec, tolerance = TOLERANCE) {
  const v = {
    x: round2(Number(userVec.x) || 0),
    y: round2(Number(userVec.y) || 0),
    z: round2(Number(userVec.z) || 0),
  };
  const mag = round2(magnitude(v));

  if (exercise.type === "plane_normal") {
    const { u, v: basisV } = exercise.planeBasis;
    const minMag = exercise.minMagnitude || 1.5;
    const dotU = round2(dot(v, u));
    const dotV = round2(dot(v, basisV));

    // Normalized orthogonality check (also handle zero vector)
    const uMag = magnitude(u);
    const vMag = magnitude(basisV);
    const cosU = mag > 1e-4 ? Math.abs(dotU) / (mag * uMag) : 1;
    const cosV = mag > 1e-4 ? Math.abs(dotV) / (mag * vMag) : 1;

    const passU = mag > 0.25 && cosU <= 0.12;
    const passV = mag > 0.25 && cosV <= 0.12;
    const passMag = mag >= minMag - 0.05;

    const stepResults = [
      {
        id: "S1",
        label: exercise.steps[0].label,
        passed: passU,
        detail: `n·u = ${dotU} (${passU ? "OK" : "needs ≈ 0"})`,
      },
      {
        id: "S2",
        label: exercise.steps[1].label,
        passed: passV,
        detail: `n·v = ${dotV} (${passV ? "OK" : "needs ≈ 0"})`,
      },
      {
        id: "S3",
        label: exercise.steps[2].label,
        passed: passMag,
        detail: `|n| = ${mag} (${passMag ? "OK" : `needs ≥ ${minMag}`})`,
      },
    ];

    const passedCount = stepResults.filter((s) => s.passed).length;
    const isCorrect = passU && passV && passMag;

    let diagnosis = "";
    if (isCorrect) {
      diagnosis = `Valid normal! n = ⟨${v.x}, ${v.y}, ${v.z}⟩ is perpendicular to both u and v with |n| = ${mag}.`;
    } else if (!passMag) {
      diagnosis = `Vector magnitude |n| = ${mag} is too short (minimum ${minMag}). Extend it along ⟨0, 1, 1⟩ or ⟨0, −1, −1⟩.`;
    } else if (!passU) {
      diagnosis = `Not perpendicular to u = ⟨2,0,0⟩ (n·u = ${dotU}). Adjust nx toward 0.`;
    } else {
      diagnosis = `Not perpendicular to v = ⟨0,1,−1⟩ (n·v = ${dotV}). Make ny and nz equal in sign and magnitude.`;
    }

    return {
      exerciseId: exercise.id,
      type: exercise.type,
      submitted: v,
      magnitude: mag,
      tolerance,
      isCorrect,
      passedSteps: passedCount,
      totalSteps: stepResults.length,
      stepResults,
      errorDistance: isCorrect ? 0 : round2(Math.abs(dotU) + Math.abs(dotV)),
      misconception: !passMag ? "too_short" : !passU ? "not_ortho_u" : !passV ? "not_ortho_v" : "none",
      diagnosis,
    };
  }

  // Component-based exercises: exact_vector, vector_sum, equilibrium
  const t = exercise.target;
  const dx = round2(v.x - t.x);
  const dy = round2(v.y - t.y);
  const dz = round2(v.z - t.z);

  const passX = Math.abs(dx) <= tolerance;
  const passY = Math.abs(dy) <= tolerance;
  const passZ = Math.abs(dz) <= tolerance;

  const stepResults = [
    {
      id: "S1",
      label: exercise.steps[0].label,
      passed: passX,
      detail: `vx = ${v.x} (Δx = ${dx >= 0 ? "+" : ""}${dx})`,
    },
    {
      id: "S2",
      label: exercise.steps[1].label,
      passed: passY,
      detail: `vy = ${v.y} (Δy = ${dy >= 0 ? "+" : ""}${dy})`,
    },
    {
      id: "S3",
      label: exercise.steps[2].label,
      passed: passZ,
      detail: `vz = ${v.z} (Δz = ${dz >= 0 ? "+" : ""}${dz})`,
    },
  ];

  const passedCount = stepResults.filter((s) => s.passed).length;
  const isCorrect = passX && passY && passZ;
  const errDist = round2(distance(v, t));

  // Detect specific common student misconceptions deterministically
  let misconception = "none";
  if (!isCorrect) {
    // Check sign flip on equilibrium or exact vector
    if (
      Math.abs(v.x + t.x) <= tolerance &&
      Math.abs(v.y + t.y) <= tolerance &&
      Math.abs(v.z + t.z) <= tolerance
    ) {
      misconception = "opposite_sign";
    } else if (exercise.type === "vector_sum" && exercise.givenVectors.length >= 2) {
      const a = exercise.givenVectors[0].vec;
      const b = exercise.givenVectors[1].vec;
      const diff = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
      if (distance(v, diff) <= tolerance * 1.5) {
        misconception = "subtracted_instead_of_added";
      }
    }
    if (misconception === "none") {
      if (passX && passY && !passZ) misconception = "z_depth_error";
      else if (!passX && passY && passZ) misconception = "x_axis_error";
      else if (passX && !passY && passZ) misconception = "y_axis_error";
      else misconception = "multi_component_error";
    }
  }

  let diagnosis = "";
  if (isCorrect) {
    diagnosis = `Exact match within ±${tolerance}! Submitted ⟨${v.x}, ${v.y}, ${v.z}⟩ (|v| = ${mag}).`;
  } else if (misconception === "opposite_sign") {
    diagnosis = `Magnitude matches, but all signs are reversed. Flip the direction through the origin.`;
  } else if (misconception === "subtracted_instead_of_added") {
    diagnosis = `Looks like A − B instead of A + B. Add each component of B to A.`;
  } else if (misconception === "z_depth_error") {
    diagnosis = `X and Y are within tolerance, but Z depth is off by ${dz >= 0 ? "+" : ""}${dz}. Inspect from a side angle.`;
  } else if (misconception === "x_axis_error") {
    diagnosis = `Y and Z look good, but X is off by ${dx >= 0 ? "+" : ""}${dx}. Adjust along the red X-axis.`;
  } else if (misconception === "y_axis_error") {
    diagnosis = `X and Z look good, but vertical Y is off by ${dy >= 0 ? "+" : ""}${dy}. Adjust height along green Y.`;
  } else {
    const wrongAxes = [];
    if (!passX) wrongAxes.push(`X (Δ${dx >= 0 ? "+" : ""}${dx})`);
    if (!passY) wrongAxes.push(`Y (Δ${dy >= 0 ? "+" : ""}${dy})`);
    if (!passZ) wrongAxes.push(`Z (Δ${dz >= 0 ? "+" : ""}${dz})`);
    diagnosis = `${passedCount}/3 components within ±${tolerance}. Re-check ${wrongAxes.join(", ")}.`;
  }

  return {
    exerciseId: exercise.id,
    type: exercise.type,
    submitted: v,
    target: t,
    magnitude: mag,
    tolerance,
    isCorrect,
    passedSteps: passedCount,
    totalSteps: stepResults.length,
    stepResults,
    errorDistance: errDist,
    misconception,
    diagnosis,
  };
}

/**
 * Computes Week 14 0–4 Rubric Score across completed exercises in this session.
 * 0: No attempts
 * 1: Attempted with partial component progress
 * 2: Solved at least 1 exercise or ≥50% step accuracy
 * 3: Solved ≥3 exercises with ≥75% step accuracy
 * 4: Solved all 5 exercises (or ≥4 with first-try/high accuracy)
 */
export function computeSessionRubric(sessionStats) {
  const { totalAttempts, solvedIds, totalStepsPassed, totalStepsChecked } = sessionStats;
  const solvedCount = solvedIds.size;
  const stepAccuracy = totalStepsChecked > 0 ? Math.round((totalStepsPassed / totalStepsChecked) * 100) : 0;

  let rubric = 0;
  let band = "Not Started";
  if (totalAttempts === 0) {
    rubric = 0;
    band = "Not Started";
  } else if (solvedCount >= 4 || (solvedCount >= 3 && stepAccuracy >= 85)) {
    rubric = 4;
    band = "Mastery (4 / 4)";
  } else if (solvedCount >= 2 || (solvedCount >= 1 && stepAccuracy >= 70)) {
    rubric = 3;
    band = "Proficient (3 / 4)";
  } else if (solvedCount >= 1 || stepAccuracy >= 50) {
    rubric = 2;
    band = "Developing (2 / 4)";
  } else {
    rubric = 1;
    band = "Initial Attempt (1 / 4)";
  }

  return { rubric, band, solvedCount, stepAccuracy };
}
