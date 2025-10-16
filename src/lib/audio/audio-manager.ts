"use client"

import * as Tone from "tone"

/**
 * Audio manager using Tone.js for game sound effects
 */
export class AudioManager {
  private synth: Tone.Synth | null = null
  private noiseSynth: Tone.NoiseSynth | null = null
  private initialized = false

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
  }
}
