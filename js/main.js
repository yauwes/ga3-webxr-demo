/**
 * SpatialInk — Main Application Controller
 * Connects Three.js/WebXR Scene, Deterministic Validator, Axis Virtual Guide,
 * Speech In/Out (optional), Break-It Probe Tester, and Week 14 Rubric Tracker.
 */

import { EXERCISES, TOLERANCE } from "./exercises.js";
import { validateVector, computeSessionRubric, magnitude } from "./validator.js";
import { AxisTutor } from "./axisTutor.js";
import { SpatialInkScene } from "./xrScene.js";

const $ = (id) => document.getElementById(id);

class SpatialInkApp {
  constructor() {
    this.currentIdx = 0;
    this.currentExercise = EXERCISES[0];
    this.userVec = { ...this.currentExercise.initialUserVector };
    this.lastValidation = null;
    this.axisCaption = "";
    this.stepLog = [];
    this.chatLog = [];

    this.sessionStats = {
      startedAt: Date.now(),
      totalAttempts: 0,
      solvedIds: new Set(),
      totalStepsPassed: 0,
      totalStepsChecked: 0,
    };

    this.tutor = new AxisTutor();
    this.scene = new SpatialInkScene($("canvas-container"), {
      onVectorChange: (vec) => this._handleSceneVectorChange(vec),
      onPerfSample: (stats) => this._updatePerfHUD(stats),
      onXRModeChange: (mode) => this._updateXRBadge(mode),
      onXRQuickSubmit: () => this.submitStep(),
    });

    this.speechRecognition = null;
    this.isListening = false;

    this._initUI();
    this._setupXRButtons();
    this._setupSpeechRecognition();
    this.selectExercise(0);

    // Session timer ticker
    setInterval(() => this._updateTimer(), 1000);
  }

  _initUI() {
    // Render exercise tabs
    const tabBar = $("exercise-tabs");
    tabBar.innerHTML = "";
    EXERCISES.forEach((ex, i) => {
      const btn = document.createElement("button");
      btn.className = "ex-tab";
      btn.dataset.index = String(i);
      btn.textContent = ex.shortTitle;
      btn.addEventListener("click", () => this.selectExercise(i));
      tabBar.appendChild(btn);
    });

    // Axis sliders & nudge controls
    ["x", "y", "z"].forEach((axis) => {
      const slider = $(`slider-${axis}`);
      slider.addEventListener("input", () => {
        this.userVec[axis] = parseFloat(slider.value);
        this.scene.setUserVector(this.userVec, false);
        this._syncVectorReadout();
      });

      $(`dec-${axis}`).addEventListener("click", () => this._nudgeAxis(axis, -0.5));
      $(`inc-${axis}`).addEventListener("click", () => this._nudgeAxis(axis, 0.5));
    });

    // Mode switch (Vector vs Freehand 3D Sketch)
    $("mode-vector").addEventListener("click", () => this._setInteractionMode("vector"));
    $("mode-sketch").addEventListener("click", () => this._setInteractionMode("sketch"));

    // Sketch tools
    $("btn-undo-ink").addEventListener("click", () => this.scene.undoInkStroke());
    $("btn-clear-ink").addEventListener("click", () => this.scene.clearInk());

    // Snap & Drag Plane & Stylus Switcher
    $("toggle-snap").addEventListener("change", (e) => {
      this.scene.snapEnabled = e.target.checked;
    });

    $("btn-drag-plane").addEventListener("click", () => {
      const modes = ["camera", "xz", "y"];
      const labels = { camera: "Drag: 3D Free", xz: "Drag: XZ Floor", y: "Drag: Y Vertical" };
      const next = modes[(modes.indexOf(this.scene.dragAxisMode) + 1) % modes.length];
      this.scene.dragAxisMode = next;
      $("btn-drag-plane").textContent = labels[next];
    });

    $("btn-swap-stylus").addEventListener("click", () => {
      const next = this.scene.activeStylusType === "generated" ? "scanned" : "generated";
      this.scene.setActiveStylus(next);
      $("btn-swap-stylus").textContent = next === "scanned" ? "Stylus: KIRI Scan" : "Stylus: Blender Gen";
      this._toast(
        next === "scanned"
          ? "Active stylus switched to KIRI Engine Photogrammetry Scan (7.0k tris)."
          : "Active stylus switched to Blender Generated SpatialInk Stylus (1.6k tris)."
      );
    });

    // Validate, Reset, Worked Example
    $("btn-validate").addEventListener("click", () => this.submitStep());
    $("btn-reset-vec").addEventListener("click", () => {
      this.userVec = { ...this.currentExercise.initialUserVector };
      this.lastValidation = null;
      this.scene.setVectorFeedbackColor("neutral");
      this.scene.setUserVector(this.userVec, false);
      this._syncVectorReadout();
      this._renderValidationPanel(null);
      this._refreshSpatialBoards();
    });

    $("btn-worked-example").addEventListener("click", () => {
      const box = $("worked-example-box");
      const open = box.classList.toggle("hidden") === false;
      this.tutor.sessionMemory.workedExampleOpen = open;
      $("btn-worked-example").classList.toggle("active", open);
    });

    // Camera viewpoint presets
    document.querySelectorAll("[data-cam]").forEach((btn) => {
      btn.addEventListener("click", () => this.scene.focusCameraPreset(btn.dataset.cam));
    });

    // Axis Tutor Controls
    $("btn-hint").addEventListener("click", () => {
      const res = this.tutor.getProgressiveHint(this.currentExercise);
      this._displayAxisReply(res, "Hint requested");
    });

    $("axis-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("axis-input");
      const q = input.value.trim();
      if (!q) return;
      input.value = "";
      this._askAxis(q);
    });

    $("btn-tts").addEventListener("click", () => {
      this.tutor.ttsEnabled = !this.tutor.ttsEnabled;
      $("btn-tts").classList.toggle("active", this.tutor.ttsEnabled);
      $("btn-tts").textContent = this.tutor.ttsEnabled ? "🔊 Voice On" : "🔇 Captions Only";
      if (!this.tutor.ttsEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    });

    $("btn-offline-sim").addEventListener("click", () => {
      this.tutor.simulateOffline = !this.tutor.simulateOffline;
      $("btn-offline-sim").classList.toggle("active", this.tutor.simulateOffline);
      this.scene.setAxisState(this.tutor.simulateOffline ? "offline" : "idle");
      this._updateAxisStatusBadge();
      if (this.tutor.simulateOffline) {
        const res = {
          text: "I can't reach the tutor service right now. Your vector workspace is still available.",
          source: "offline-fallback",
          probe: "6 · Network down",
        };
        this._displayAxisReply(res, "[Simulated Network Down]");
      }
    });

    // Break-It Quick Probe Buttons (Week 7 / 15 / 16 live defence verification)
    document.querySelectorAll("[data-probe]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = btn.dataset.probe;
        if (prompt === "__OFFLINE__") {
          if (!this.tutor.simulateOffline) $("btn-offline-sim").click();
          else this._askAxis("Can you check my step?");
          return;
        }
        this._askAxis(prompt);
      });
    });

    // Panel collapse toggles (helpful on mobile / small laptop screens)
    $("toggle-left-panel").addEventListener("click", () => {
      $("left-panel").classList.toggle("collapsed");
    });
    $("toggle-right-panel").addEventListener("click", () => {
      $("right-panel").classList.toggle("collapsed");
    });

    // Modal: Rubric, Provenance & Settings
    $("btn-open-modal").addEventListener("click", () => {
      this._refreshModalData();
      $("info-modal").classList.remove("hidden");
    });
    $("btn-close-modal").addEventListener("click", () => $("info-modal").classList.add("hidden"));
    $("info-modal").addEventListener("click", (e) => {
      if (e.target === $("info-modal")) $("info-modal").classList.add("hidden");
    });

    $("api-key-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.tutor.apiKey = $("input-api-key").value.trim();
      this._updateAxisStatusBadge();
      this._toast(
        this.tutor.apiKey
          ? "Optional Gemini API key saved in session memory (8s wait limit active)."
          : "API key cleared. Running in 100% local deterministic mode."
      );
    });

    $("btn-reset-session").addEventListener("click", () => {
      this.sessionStats = {
        startedAt: Date.now(),
        totalAttempts: 0,
        solvedIds: new Set(),
        totalStepsPassed: 0,
        totalStepsChecked: 0,
      };
      this.stepLog = [];
      this.chatLog = [];
      this.tutor.resetSession(this.currentExercise);
      this.scene.clearInk();
      this._renderChatLog();
      this._refreshModalData();
      this.selectExercise(0);
      this._toast("Session state cleared (no learner identifiers retained).");
    });
  }

  async _setupXRButtons() {
    const support = await this.scene.checkXRSupport();
    const btnAR = $("btn-enter-ar");
    const btnVR = $("btn-enter-vr");

    if (support.ar) {
      btnAR.disabled = false;
      btnAR.title = "Enter Mixed Reality Passthrough (Meta Quest 3 / Pico 4 Ultra)";
    } else {
      btnAR.title = "Open on Meta Quest 3 Browser for Mixed Reality Passthrough";
    }

    if (support.vr) {
      btnVR.disabled = false;
      btnVR.title = "Enter Immersive VR Mode (Quest 2 / Quest 3 / Pico 4)";
    } else {
      btnVR.title = "Open on a WebXR headset browser to enter VR";
    }

    btnAR.addEventListener("click", async () => {
      try {
        await this.scene.enterXR("immersive-ar");
      } catch (err) {
        this._toast(err.message || "Mixed Reality (immersive-ar) requires Meta Quest 3 / WebXR AR browser.");
      }
    });

    btnVR.addEventListener("click", async () => {
      try {
        await this.scene.enterXR("immersive-vr");
      } catch (err) {
        this._toast(err.message || "VR Mode (immersive-vr) requires a WebXR-capable headset browser.");
      }
    });
  }

  _setupSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btnMic = $("btn-mic");
    if (!SpeechRec) {
      btnMic.title = "Speech input unavailable in this browser — text input & captions remain active.";
      btnMic.classList.add("dim");
      btnMic.addEventListener("click", () => {
        this._toast("Web Speech recognition is not supported here. Use text input below (captions stay active).");
      });
      return;
    }

    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.isListening = true;
      btnMic.classList.add("active");
      btnMic.textContent = "🎙 Listening...";
    };
    rec.onend = () => {
      this.isListening = false;
      btnMic.classList.remove("active");
      btnMic.textContent = "🎙 Speak";
    };
    rec.onerror = () => {
      this.isListening = false;
      btnMic.classList.remove("active");
      btnMic.textContent = "🎙 Speak";
      this._toast("Microphone unavailable or permission denied. Text input & captions remain active.");
    };
    rec.onresult = (ev) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || "";
      if (transcript.trim()) {
        this._askAxis(transcript.trim());
      }
    };

    this.speechRecognition = rec;
    btnMic.addEventListener("click", () => {
      if (this.isListening) {
        rec.stop();
      } else {
        try {
          rec.start();
        } catch {
          this._toast("Could not start microphone capture.");
        }
      }
    });
  }

  selectExercise(idx) {
    this.currentIdx = idx;
    this.currentExercise = EXERCISES[idx];
    this.lastValidation = null;
    this.userVec = { ...this.currentExercise.initialUserVector };

    // Highlight active tab
    document.querySelectorAll(".ex-tab").forEach((el, i) => {
      el.classList.toggle("active", i === idx);
      el.classList.toggle("solved", this.sessionStats.solvedIds.has(EXERCISES[i].id));
    });

    // Populate Exercise info
    $("ex-badge").textContent = `${this.currentExercise.id} · ${this.currentExercise.category}`;
    $("ex-title").textContent = this.currentExercise.title;
    $("ex-prompt").textContent = this.currentExercise.prompt;
    $("ex-formula").textContent = this.currentExercise.formula;

    // Worked Example Box (closed by default per Section 8)
    const weBox = $("worked-example-box");
    weBox.classList.add("hidden");
    $("btn-worked-example").classList.remove("active");
    weBox.innerHTML =
      `<div class="we-title">Worked Example Mode (Explicitly Opened)</div><ol>` +
      this.currentExercise.workedExample.map((s) => `<li>${s}</li>`).join("") +
      `</ol>`;

    // Load 3D objects & notify Axis
    this.scene.loadExercise(this.currentExercise);
    this.tutor.setExercise(this.currentExercise);
    this.scene.setAxisState(this.tutor.simulateOffline ? "offline" : "idle");

    this._syncVectorReadout();
    this._renderValidationPanel(null);

    const intro = this.tutor.getExerciseOpening(this.currentExercise);
    this.axisCaption = intro.text;
    $("axis-caption-text").textContent = intro.text;
    $("axis-source-tag").textContent = `tolerance ±${TOLERANCE}`;
    this._updateAxisStatusBadge();
    this._refreshSpatialBoards();
  }

  _setInteractionMode(mode) {
    this.scene.interactionMode = mode;
    $("mode-vector").classList.toggle("active", mode === "vector");
    $("mode-sketch").classList.toggle("active", mode === "sketch");
    $("sketch-controls").classList.toggle("hidden", mode !== "sketch");
  }

  _nudgeAxis(axis, delta) {
    const next = Math.max(-3, Math.min(3, Math.round((this.userVec[axis] + delta) * 10) / 10));
    this.userVec[axis] = next;
    this.scene.setUserVector(this.userVec, false);
    this._syncVectorReadout();
  }

  _handleSceneVectorChange(vec) {
    this.userVec = { ...vec };
    this._syncVectorReadout();
    this._refreshSpatialBoards();
  }

  _syncVectorReadout() {
    ["x", "y", "z"].forEach((axis) => {
      $(`slider-${axis}`).value = String(this.userVec[axis]);
      $(`val-${axis}`).textContent = this.userVec[axis].toFixed(1);
    });
    const mag = magnitude(this.userVec).toFixed(2);
    $("live-vec-summary").textContent = `⟨${this.userVec.x.toFixed(1)}, ${this.userVec.y.toFixed(1)}, ${this.userVec.z.toFixed(1)}⟩  |v| = ${mag}`;
  }

  async submitStep() {
    const result = validateVector(this.currentExercise, this.userVec, TOLERANCE);
    this.lastValidation = result;

    // Track Week 14 evaluation metrics
    this.sessionStats.totalAttempts++;
    this.sessionStats.totalStepsPassed += result.passedSteps;
    this.sessionStats.totalStepsChecked += result.totalSteps;
    if (result.isCorrect) {
      this.sessionStats.solvedIds.add(this.currentExercise.id);
    }

    this.stepLog.push({
      exerciseId: this.currentExercise.id,
      vec: result.submitted,
      passedSteps: result.passedSteps,
      totalSteps: result.totalSteps,
      isCorrect: result.isCorrect,
    });

    // Visual 3D feedback
    this.scene.setVectorFeedbackColor(
      result.isCorrect ? "correct" : result.passedSteps >= 2 ? "partial" : "error"
    );
    this.scene.setAxisState("thinking");

    this._renderValidationPanel(result);
    document.querySelectorAll(".ex-tab").forEach((el, i) => {
      el.classList.toggle("solved", this.sessionStats.solvedIds.has(EXERCISES[i].id));
    });

    // Axis explains deterministic validator result
    const reply = await this.tutor.explainValidation(this.currentExercise, result);
    this.scene.setAxisState(
      this.tutor.simulateOffline ? "offline" : result.isCorrect ? "correct" : "error"
    );
    this._displayAxisReply(reply, `Submitted ⟨${result.submitted.x}, ${result.submitted.y}, ${result.submitted.z}⟩`);
  }

  async _askAxis(question) {
    this.scene.setAxisState("thinking");
    $("axis-caption-text").textContent = "Checking structured exercise state...";
    const res = await this.tutor.ask(question, this.currentExercise, this.userVec, this.lastValidation);
    this.scene.setAxisState(this.tutor.simulateOffline ? "offline" : "idle");
    this._displayAxisReply(res, question);
  }

  _displayAxisReply(res, userLabel) {
    this.axisCaption = res.text;
    $("axis-caption-text").textContent = res.text;
    $("axis-source-tag").textContent = res.probe ? `Probe: ${res.probe}` : `Source: ${res.source}`;

    this.chatLog.push({ user: userLabel, axis: res.text, badge: res.probe || res.source });
    if (this.chatLog.length > 20) this.chatLog.shift();
    this._renderChatLog();
    this._refreshSpatialBoards();
  }

  _renderValidationPanel(result) {
    const list = $("step-checklist");
    const banner = $("validator-banner");

    if (!result) {
      banner.className = "validator-banner neutral";
      banner.textContent = `Deterministic checker ready (±${TOLERANCE} tolerance). Position the 3D vector and press Validate Step.`;
      list.innerHTML = this.currentExercise.steps
        .map(
          (s) => `
          <div class="step-row pending">
            <span class="step-icon">○</span>
            <span class="step-text">${s.label}</span>
          </div>`
        )
        .join("");
      return;
    }

    banner.className = `validator-banner ${result.isCorrect ? "ok" : "warn"}`;
    banner.textContent = result.diagnosis;

    list.innerHTML = result.stepResults
      .map(
        (s) => `
        <div class="step-row ${s.passed ? "pass" : "fail"}">
          <span class="step-icon">${s.passed ? "✓" : "✕"}</span>
          <span class="step-text">${s.label}</span>
          <span class="step-detail">${s.detail}</span>
        </div>`
      )
      .join("");
  }

  _renderChatLog() {
    const box = $("axis-log");
    if (this.chatLog.length === 0) {
      box.innerHTML = `<div class="log-empty">Session log empty. Axis clears memory when session resets.</div>`;
      return;
    }
    box.innerHTML = this.chatLog
      .slice()
      .reverse()
      .map(
        (item) => `
        <div class="log-entry">
          <div class="log-meta"><span>You: ${this._esc(item.user)}</span><span class="log-badge">${this._esc(item.badge)}</span></div>
          <div class="log-axis">Axis: ${this._esc(item.axis)}</div>
        </div>`
      )
      .join("");
  }

  _refreshSpatialBoards() {
    this.scene.updateSpatialBoards(
      this.currentExercise,
      this.userVec,
      this.lastValidation,
      this.axisCaption,
      this.stepLog
    );
  }

  _updateAxisStatusBadge() {
    const el = $("axis-status-pill");
    if (this.tutor.simulateOffline) {
      el.textContent = "Offline · Local Fallback";
      el.className = "status-pill offline";
    } else if (this.tutor.apiKey) {
      el.textContent = "Hosted Gemini (8s Limit)";
      el.className = "status-pill hosted";
    } else {
      el.textContent = "Local Rule Engine";
      el.className = "status-pill local";
    }
  }

  _updatePerfHUD(stats) {
    const el = $("perf-badge");
    const trisK = (stats.triangles / 1000).toFixed(1);
    el.textContent = `${stats.fps} FPS · ${stats.frameMs}ms · ${trisK}k tris · ${stats.calls} draws`;
  }

  _updateXRBadge(mode) {
    const labels = { desktop: "Desktop 3D", vr: "WebXR VR", ar: "Quest 3 MR Passthrough" };
    $("xr-mode-badge").textContent = labels[mode] || mode;
  }

  _updateTimer() {
    const secs = Math.floor((Date.now() - this.sessionStats.startedAt) / 1000);
    const mm = String(Math.floor(secs / 60)).padStart(2, "0");
    const ss = String(secs % 60).padStart(2, "0");
    const el = $("session-timer");
    if (el) el.textContent = `${mm}:${ss}`;
  }

  _refreshModalData() {
    const summary = computeSessionRubric(this.sessionStats);
    $("rubric-score").textContent = `${summary.rubric} / 4`;
    $("rubric-band").textContent = summary.band;
    $("rubric-solved").textContent = `${summary.solvedCount} / ${EXERCISES.length} Exercises`;
    const attempts = this.sessionStats.totalAttempts;
    $("rubric-accuracy").textContent = `${summary.stepAccuracy}% (${attempts} ${attempts === 1 ? "submission" : "submissions"})`;
  }

  _toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
  }

  _esc(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.spatialInkApp = new SpatialInkApp();
});
