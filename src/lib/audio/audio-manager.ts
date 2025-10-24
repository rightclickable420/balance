"use client"

import * as Tone from "tone"

/**
 * Audio manager using Tone.js for game sound effects
 */
export class AudioManager {
  private synth: Tone.Synth | null = null
  private noiseSynth: Tone.NoiseSynth | null = null
  private initialized = false
  private currentEnergyPhase: "calm" | "building" | "critical" = "calm"
  private currentEnergyLevel = 0
  private lastEnergyCueAt = 0

  async initialize() {
    if (this.initialized) return

    await Tone.start()

    // Synth for landing sounds (pitched)
    this.synth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0,
        release: 0.1,
      },
    }).toDestination()

    // Noise synth for tumbling sounds (unpitched)
    this.noiseSynth = new Tone.NoiseSynth({
      noise: { type: "brown" },
      envelope: {
        attack: 0.001,
        decay: 0.05,
        sustain: 0,
      },
    }).toDestination()

    this.initialized = true
  }

  /**
   * Play landing sound when stone hits ground or another stone
   * Pitch varies based on stone size/mass
   */
  playLanding(mass: number) {
    if (!this.synth || !this.initialized) return

    // Map mass to frequency (heavier = lower pitch)
    const frequency = 200 + (1 / mass) * 100 // ~150-300 Hz range
    const volume = -20 + Math.min(10, mass * 2) // Louder for heavier stones

    this.synth.volume.value = volume
    this.synth.triggerAttackRelease(frequency, "16n")
  }

  /**
   * Play tumbling sound when stones become unstable
   */
  playTumble() {
    if (!this.noiseSynth || !this.initialized) return

    this.noiseSynth.volume.value = -25
    this.noiseSynth.triggerAttackRelease("32n")
  }

  /**
   * Play flip sound when player flips a stone
   */
  playFlip() {
    if (!this.synth || !this.initialized) return

    this.synth.volume.value = -30
    this.synth.triggerAttackRelease(440, "64n")
  }

  /**
   * Play discard sound when player discards a stone
   */
  playDiscard() {
    if (!this.synth || !this.initialized) return

    this.synth.volume.value = -28
    // Descending pitch for discard
    this.synth.triggerAttackRelease(600, "32n")
    setTimeout(() => {
      if (this.synth) {
        this.synth.triggerAttackRelease(400, "32n")
      }
    }, 50)
  }

  dispose() {
    this.synth?.dispose()
    this.noiseSynth?.dispose()
    this.initialized = false
    this.currentEnergyPhase = "calm"
    this.currentEnergyLevel = 0
    this.lastEnergyCueAt = 0
  }

  setEnergyPhase(phase: "calm" | "building" | "critical", level: number) {
    const normalized = Math.max(0, Math.min(1, level))
    const previousPhase = this.currentEnergyPhase
    const previousLevel = this.currentEnergyLevel
    this.currentEnergyPhase = phase
    this.currentEnergyLevel = normalized

    if (!this.initialized || !this.noiseSynth) {
      return
    }

    const now = Tone.now()
    const phaseChanged = previousPhase !== phase
    const levelShift = Math.abs(previousLevel - normalized)

    if (phase === "calm") {
      if (phaseChanged && now - this.lastEnergyCueAt > 0.4) {
        this.noiseSynth.volume.value = -32
        this.noiseSynth.triggerAttackRelease("16n", undefined, now)
        this.lastEnergyCueAt = now
      }
      this.noiseSynth.volume.value = -40
      return
    }

    if (phaseChanged || levelShift > 0.25 || now - this.lastEnergyCueAt > 0.6) {
      const baseVolume = phase === "critical" ? -12 : -18
      const volume = baseVolume + normalized * 6
      this.noiseSynth.volume.value = volume
      this.noiseSynth.triggerAttackRelease("8n", undefined, now)
      this.lastEnergyCueAt = now
    }
  }
}
