/**
 * SpatialInk — "Axis" Non-Human Line-and-Orbit Virtual Guide
 * Strict compliance with Proposal Contract Section 8:
 * - Max 2 sentences per reply.
 * - Calm, precise, patient, brief; never claims to be human or see raw camera/room.
 * - Deterministic validator is authoritative for numerical correctness.
 * - Session-only memory (exercise ID, submitted steps, shown hints); no learner name.
 * - Exact 8-second wait limit + exact 3 locally stored fallback lines.
 * - Handles all 6 Week 7 Break-It probes reliably.
 */

export const AXIS_WAIT_LIMIT_MS = 8000;

export const EXACT_IDENTITY_LINE =
  "I'm Axis, a virtual guide in this app, not a human. I can help you practise the vector task using the steps you submit.";

export const WAIT_LIMIT_LINE =
  "I haven't received a reply yet. You can keep working while I reconnect.";

export const LOCAL_FALLBACK_LINES = [
  "I can't reach the tutor service right now. Your vector workspace is still available.",
  "Check the component values shown on the panel, then submit the step again.",
  "I don't have enough information to check that step. Select the vector components or choose a hint.",
];

const SYSTEM_PROMPT = `You are Axis, a non-human guide inside an XR spatial-math practice application (SpatialInk).
Follow this specification strictly:
- Stay in role and reply in AT MOST TWO SENTENCES.
- Personality: calm, precise, patient, and brief. Do not praise every action.
- Use ONLY the structured exercise state and deterministic validator result supplied below.
- NEVER claim to see the physical room, camera view, or arbitrary 3D handwriting.
- NEVER reveal the complete final answer during an active exercise unless Worked Example Mode is active.
- NEVER claim to be human or remember previous sessions. Never ask for the learner's name.
- If asked whether you are real or human, reply EXACTLY: "${EXACT_IDENTITY_LINE}"`;

/**
 * Enforces the contract's hard 2-sentence ceiling on any generated response.
 */
function clampTwoSentences(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return LOCAL_FALLBACK_LINES[2];
  // Split only on sentence-ending punctuation followed by whitespace (never inside decimals like 0.25)
  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"⟨(])|(?<=[!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.slice(0, 2).join(" ");
}

export class AxisTutor {
  constructor() {
    this.sessionMemory = {
      exerciseId: null,
      submittedSteps: [],
      hintsShown: 0,
      workedExampleOpen: false,
    };
    this.simulateOffline = false;
    this.apiKey = ""; // Optional user-supplied Gemini API key (stored in memory only, never hardcoded)
    this.modelName = "gemini-2.0-flash";
    this.ttsEnabled = false;
    this.fallbackIndex = 0;
  }

  setExercise(exercise) {
    this.sessionMemory.exerciseId = exercise.id;
    this.sessionMemory.hintsShown = 0;
    this.sessionMemory.workedExampleOpen = false;
  }

  resetSession(exercise) {
    this.sessionMemory = {
      exerciseId: exercise ? exercise.id : null,
      submittedSteps: [],
      hintsShown: 0,
      workedExampleOpen: false,
    };
  }

  recordSubmission(validation) {
    this.sessionMemory.submittedSteps.push({
      exerciseId: validation.exerciseId,
      vec: validation.submitted,
      passedSteps: validation.passedSteps,
      isCorrect: validation.isCorrect,
    });
    if (this.sessionMemory.submittedSteps.length > 15) {
      this.sessionMemory.submittedSteps.shift();
    }
  }

  getNextFallbackLine() {
    const line = LOCAL_FALLBACK_LINES[this.fallbackIndex % LOCAL_FALLBACK_LINES.length];
    this.fallbackIndex++;
    return line;
  }

  /**
   * Generates a concise 1–2 sentence intro when starting an exercise.
   */
  getExerciseOpening(exercise) {
    const line = clampTwoSentences(
      `${exercise.id}: ${exercise.title}. Adjust the 3D vector components in the workspace, then submit your step for validation.`
    );
    this.speak(line);
    return { text: line, source: "local-spec", probe: null };
  }

  /**
   * Explains a deterministic validation result (never overrides the math checker).
   */
  async explainValidation(exercise, validation) {
    this.recordSubmission(validation);

    if (this.simulateOffline) {
      const fb = `${LOCAL_FALLBACK_LINES[0]} Validator: ${validation.passedSteps}/${validation.totalSteps} steps within ±${validation.tolerance}.`;
      const out = clampTwoSentences(fb);
      this.speak(out);
      return { text: out, source: "offline-fallback", probe: "network-down" };
    }

    if (this.apiKey) {
      const hosted = await this._callHostedLLM(
        exercise,
        validation,
        "Explain this validation result briefly and ask the learner for the next step without giving away the answer."
      );
      if (hosted) {
        this.speak(hosted.text);
        return hosted;
      }
    }

    // Deterministic local explanation (strictly <= 2 sentences)
    let reply = "";
    if (validation.isCorrect) {
      reply = `Step verified: ⟨${validation.submitted.x}, ${validation.submitted.y}, ${validation.submitted.z}⟩ satisfies ${exercise.id} within ±${validation.tolerance}. Select the next exercise when you are ready.`;
    } else if (validation.misconception === "opposite_sign") {
      reply = `The magnitude matches, but all component signs are inverted from the required direction. Reverse the vector through the origin and submit again.`;
    } else if (validation.misconception === "subtracted_instead_of_added") {
      reply = `Your submitted components match A − B instead of A + B. Add each component of B to A and re-submit your step.`;
    } else if (validation.misconception === "z_depth_error") {
      reply = `X and Y are within tolerance, while Z depth is still outside ±${validation.tolerance}. Rotate the view to inspect the blue Z-axis and adjust vz.`;
    } else if (validation.misconception === "not_ortho_u") {
      reply = `Your vector is not yet perpendicular to u = ⟨2, 0, 0⟩. Adjust the red X component toward 0 and submit again.`;
    } else if (validation.misconception === "not_ortho_v") {
      reply = `Your vector is not yet perpendicular to v = ⟨0, 1, −1⟩. Align ny and nz so their dot product with v is zero.`;
    } else {
      const nextHint = exercise.hints[Math.min(this.sessionMemory.hintsShown, exercise.hints.length - 1)];
      reply = `${validation.passedSteps} of ${validation.totalSteps} checks passed for ⟨${validation.submitted.x}, ${validation.submitted.y}, ${validation.submitted.z}⟩. ${nextHint}`;
    }

    const finalReply = clampTwoSentences(reply);
    this.speak(finalReply);
    return { text: finalReply, source: "local-validator", probe: null };
  }

  /**
   * Gives exactly one progressive hint at a time.
   */
  getProgressiveHint(exercise) {
    if (this.simulateOffline) {
      const fb = LOCAL_FALLBACK_LINES[1];
      this.speak(fb);
      return { text: fb, source: "offline-fallback", probe: "network-down" };
    }
    const idx = Math.min(this.sessionMemory.hintsShown, exercise.hints.length - 1);
    const hintText = exercise.hints[idx];
    this.sessionMemory.hintsShown = Math.min(this.sessionMemory.hintsShown + 1, exercise.hints.length);
    const out = clampTwoSentences(`Hint ${idx + 1}/${exercise.hints.length}: ${hintText}`);
    this.speak(out);
    return { text: out, source: "local-hint", probe: null };
  }

  /**
   * Processes learner text or speech input, enforcing all 6 Week 7 Break-It probes
   * before optionally calling a hosted LLM with the 8-second wait limit.
   */
  async ask(question, exercise, currentVec, lastValidation) {
    const q = String(question || "").trim();
    if (!q) {
      return { text: LOCAL_FALLBACK_LINES[2], source: "local-fallback", probe: null };
    }

    const lower = q.toLowerCase();

    // PROBE 5 · Are you real? (EXACT required honest identity line)
    if (
      /\b(are you real|are you human|are you a person|who are you|what are you|siapa kamu|apakah kamu manusia|kamu nyata|kamu beneran)\b/i.test(
        lower
      )
    ) {
      this.speak(EXACT_IDENTITY_LINE);
      return { text: EXACT_IDENTITY_LINE, source: "spec-guard", probe: "5 · Are you real?" };
    }

    // PROBE 3 · Do it for me (Refuse silent completion unless Worked Example Mode is open)
    if (
      /\b(do it for me|give me the answer|just solve|tell me the answer|jawaban|jawabannya|kerjakan|selesaikan untukku|langsung kasih)\b/i.test(
        lower
      )
    ) {
      if (this.sessionMemory.workedExampleOpen) {
        const out = clampTwoSentences(
          `Worked Example Mode is open: ${exercise.workedExample[exercise.workedExample.length - 1]} Review each axis step on the panel.`
        );
        this.speak(out);
        return { text: out, source: "worked-example", probe: "3 · Do it for me" };
      }
      const out = clampTwoSentences(
        `I won't complete ${exercise.id} for you while the exercise is active. Request a step hint or open Worked Example Mode if you want the full walkthrough.`
      );
      this.speak(out);
      return { text: out, source: "spec-guard", probe: "3 · Do it for me" };
    }

    // PROBE 2 · Memory (Session-only memory; no cross-session memory; no name)
    if (
      /\b(remember me|yesterday|last time|my name|what did i submit|memory|ingat aku|kemarin|namaku|riwayat)\b/i.test(
        lower
      )
    ) {
      const count = this.sessionMemory.submittedSteps.length;
      const last = count > 0 ? this.sessionMemory.submittedSteps[count - 1] : null;
      const out = last
        ? `I only track this session (${count} step${count > 1 ? "s" : ""} submitted, latest ⟨${last.vec.x}, ${last.vec.y}, ${last.vec.z}⟩ on ${last.exerciseId}) and never store your name. I cannot remember previous visits once this session ends.`
        : `I only keep track of steps submitted in this active session and never store your name. No steps are recorded yet on ${exercise.id}, and I have no memory of past visits.`;
      this.speak(out);
      return { text: out, source: "spec-guard", probe: "2 · Memory" };
    }

    // PROBE 4 · Out of bounds (Camera/room vision, arbitrary handwriting, full calculus)
    if (
      /\b(see my room|camera|what am i wearing|handwriting|read my paper|integral|multivariable|curl|divergence|lihat kamar|kamera|tulisan tangan)\b/i.test(
        lower
      )
    ) {
      const out = clampTwoSentences(
        `I cannot view your physical room, camera feed, or handwritten equations, and I only support this bounded 3D vector workspace. Submit structured components for ${exercise.id} and I can guide your next step.`
      );
      this.speak(out);
      return { text: out, source: "spec-guard", probe: "4 · Out of bounds" };
    }

    // PROBE 1 · Off-world (Unrelated topics: weather, jokes, politics, movies, sports, recipes)
    if (
      /\b(weather|joke|president|movie|football|recipe|cook|stock|bitcoin|music|game|cuaca|lelucon|film|masak|bola)\b/i.test(
        lower
      )
    ) {
      const out = clampTwoSentences(
        `That topic is outside SpatialInk's vector practice scope. Let's focus back on ${exercise.id}: adjust ⟨${currentVec.x}, ${currentVec.y}, ${currentVec.z}⟩ or request a hint.`
      );
      this.speak(out);
      return { text: out, source: "spec-guard", probe: "1 · Off-world" };
    }

    // PROBE 6 · Network down (Simulated offline or disconnected)
    if (this.simulateOffline || !navigator.onLine) {
      const out = this.getNextFallbackLine();
      this.speak(out);
      return { text: out, source: "offline-fallback", probe: "6 · Network down" };
    }

    // If user configured an optional hosted Gemini API key, call it with 8s wait limit
    if (this.apiKey) {
      const hosted = await this._callHostedLLM(exercise, lastValidation, q, currentVec);
      if (hosted) {
        this.speak(hosted.text);
        return hosted;
      }
    }

    // Local structured Q&A for domain questions (component, magnitude, dot product, normal, axis, equilibrium)
    let localReply = "";
    if (/\b(hint|help|stuck|bingung|bantu|petunjuk)\b/i.test(lower)) {
      return this.getProgressiveHint(exercise);
    } else if (/\b(magnitude|length|panjang|besar)\b/i.test(lower)) {
      const m = Math.sqrt(currentVec.x ** 2 + currentVec.y ** 2 + currentVec.z ** 2).toFixed(2);
      localReply = `Magnitude is |v| = √(vx² + vy² + vz²); your current vector ⟨${currentVec.x}, ${currentVec.y}, ${currentVec.z}⟩ has length ${m}. Adjust a component and submit when ready.`;
    } else if (/\b(normal|perpendicular|tegak lurus|cross|dot)\b/i.test(lower)) {
      localReply = `A surface normal is perpendicular to both spanning vectors of the plane, so n·u = 0 and n·v = 0. Check both dot products by adjusting your vector tip and submitting.`;
    } else if (/\b(equilibrium|balance|seimbang|sigma|net)\b/i.test(lower)) {
      localReply = `Static equilibrium requires ΣF = 0, so the balancing force must equal −(F₁ + F₂) on every axis. Check each component sign and submit your step.`;
    } else if (/\b(z|depth|blue|biru|x|red|merah|y|green|hijau|axis|sumbu)\b/i.test(lower)) {
      localReply = `Red is +X (right), green is +Y (up), and blue is +Z (toward you), all bounded from −3 to +3. Orbit the workspace or move closer in XR to inspect depth before submitting.`;
    } else {
      localReply = `Your current vector on ${exercise.id} is ⟨${currentVec.x}, ${currentVec.y}, ${currentVec.z}⟩. Submit your step for deterministic validation or request a hint if you want guidance on one component.`;
    }

    const out = clampTwoSentences(localReply);
    this.speak(out);
    return { text: out, source: "local-structured", probe: null };
  }

  /**
   * Calls optional user-supplied Gemini API with ONLY minimal structured exercise state
   * and an exact 8,000 ms AbortController wait limit (Contract Section 8).
   */
  async _callHostedLLM(exercise, validation, userMessage, currentVec = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AXIS_WAIT_LIMIT_MS);

    const structuredState = {
      exerciseId: exercise.id,
      title: exercise.title,
      category: exercise.category,
      workedExampleOpen: this.sessionMemory.workedExampleOpen,
      hintsAlreadyShown: this.sessionMemory.hintsShown,
      currentVector: currentVec || (validation ? validation.submitted : null),
      validatorResult: validation
        ? {
            isCorrect: validation.isCorrect,
            passedSteps: validation.passedSteps,
            totalSteps: validation.totalSteps,
            misconception: validation.misconception,
            diagnosis: validation.diagnosis,
          }
        : "Not submitted yet",
    };

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.modelName
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `STRUCTURED_STATE: ${JSON.stringify(structuredState)}\nLEARNER_INPUT: ${userMessage}`,
                },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 90,
            temperature: 0.25,
          },
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { text: this.getNextFallbackLine(), source: "hosted-error-fallback", probe: "6 · Network down" };
      }
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return { text: clampTwoSentences(raw), source: "hosted-gemini", probe: null };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        return { text: WAIT_LIMIT_LINE, source: "timeout-8s", probe: "6 · Network down" };
      }
      return { text: this.getNextFallbackLine(), source: "offline-fallback", probe: "6 · Network down" };
    }
  }

  speak(text) {
    if (!this.ttsEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 1.02;
      utter.pitch = 1.05;
      window.speechSynthesis.speak(utter);
    } catch {
      // Captions always remain visible if TTS fails
    }
  }
}
