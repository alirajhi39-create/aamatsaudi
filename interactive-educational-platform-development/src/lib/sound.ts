"use client";

import { narrationKey } from "@/lib/sound-keys";

type SoundMeta = { key: string; url: string; etag: string; mimeType: string };

/**
 * Sound manager:
 *  - Loads the list of custom sounds uploaded by the teacher (stored as BYTEA in PostgreSQL).
 *  - Plays custom sound if one exists for the key, otherwise synthesizes a friendly effect with Web Audio.
 *  - Narration: custom recording per slide, or falls back to the browser's Arabic speech synthesis.
 */
class SoundManager {
  private available = new Map<string, SoundMeta>();
  private loadPromise: Promise<void> | null = null;
  private ctx: AudioContext | null = null;
  private narrationAudio: HTMLAudioElement | null = null;
  private effectsMuted = false;
  private listeners = new Set<() => void>();
  public narrating = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.effectsMuted = window.localStorage.getItem("ssa2.muted") === "1";
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((l) => l());
  }

  get muted() {
    return this.effectsMuted;
  }
  setMuted(v: boolean) {
    this.effectsMuted = v;
    if (typeof window !== "undefined") window.localStorage.setItem("ssa2.muted", v ? "1" : "0");
    if (v) this.stopNarration();
    this.emit();
  }

  /** Load the custom sound catalogue (safe to call many times). */
  load(force = false): Promise<void> {
    if (this.loadPromise && !force) return this.loadPromise;
    this.loadPromise = (async () => {
      try {
        const res = await fetch("/api/sounds", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { sounds?: SoundMeta[] };
        this.available.clear();
        for (const s of data.sounds ?? []) this.available.set(s.key, s);
        this.emit();
      } catch {
        /* offline — fall back to synthesized sounds */
      }
    })();
    return this.loadPromise;
  }

  hasCustom(key: string) {
    return this.available.has(key);
  }

  private getCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!this.ctx) this.ctx = new Ctx();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType = "sine", gain = 0.18) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + duration + 0.05);
  }

  private synth(key: string) {
    switch (key) {
      case "click":
        this.tone(660, 0, 0.07, "triangle", 0.12);
        break;
      case "flip":
        this.tone(520, 0, 0.08, "sine", 0.12);
        this.tone(780, 0.07, 0.1, "sine", 0.1);
        break;
      case "correct":
        this.tone(523, 0, 0.12, "sine");
        this.tone(659, 0.1, 0.12, "sine");
        this.tone(784, 0.2, 0.22, "sine");
        break;
      case "wrong":
        this.tone(220, 0, 0.18, "sawtooth", 0.08);
        this.tone(180, 0.15, 0.25, "sawtooth", 0.08);
        break;
      case "success":
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, i * 0.09, 0.16, "triangle", 0.14));
        break;
      case "celebrate":
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, i * 0.11, 0.2, "triangle", 0.14));
        break;
      case "welcome":
        [392, 523, 659].forEach((f, i) => this.tone(f, i * 0.12, 0.25, "sine", 0.12));
        break;
      default:
        this.tone(600, 0, 0.08, "sine", 0.1);
    }
  }

  /** Play a short effect. */
  play(key: string) {
    if (this.effectsMuted) return;
    const custom = this.available.get(key);
    if (custom) {
      try {
        const a = new Audio(custom.url);
        a.volume = 0.9;
        void a.play().catch(() => this.synth(key));
        return;
      } catch {
        /* fall through */
      }
    }
    this.synth(key);
  }

  /** Narrate a slide: custom recording if uploaded, else TTS with the provided text. */
  async narrateSlide(slideIndex: number, fallbackText: string) {
    this.stopNarration();
    const key = narrationKey(slideIndex);
    const custom = this.available.get(key);
    this.narrating = true;
    this.emit();
    if (custom) {
      const a = new Audio(custom.url);
      this.narrationAudio = a;
      a.onended = () => {
        this.narrating = false;
        this.narrationAudio = null;
        this.emit();
      };
      a.onerror = () => this.speak(fallbackText);
      try {
        await a.play();
      } catch {
        this.speak(fallbackText);
      }
      return;
    }
    this.speak(fallbackText);
  }

  private speak(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.narrating = false;
      this.emit();
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ar-SA";
    utter.rate = 0.92;
    const voices = synth.getVoices();
    const arabic = voices.find((v) => v.lang?.toLowerCase().startsWith("ar"));
    if (arabic) utter.voice = arabic;
    utter.onend = utter.onerror = () => {
      this.narrating = false;
      this.emit();
    };
    synth.speak(utter);
  }

  stopNarration() {
    if (this.narrationAudio) {
      this.narrationAudio.pause();
      this.narrationAudio = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (this.narrating) {
      this.narrating = false;
      this.emit();
    }
  }
}

export const sound = typeof window !== "undefined" ? new SoundManager() : (null as unknown as SoundManager);

export function playSound(key: string) {
  sound?.play(key);
}
