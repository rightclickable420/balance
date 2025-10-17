const EPSILON = 1e-8

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export const clamp01 = (value: number): number => clamp(value, 0, 1)

export const lerp = (start: number, end: number, t: number): number => start + (end - start) * t

export const tanhSafe = (value: number): number => {
  if (value === 0) return 0
  // For large magnitudes tanh saturates, avoid overflow via Math.exp
  const expPos = Math.exp(Math.min(20, value))
  const expNeg = Math.exp(Math.max(-20, -value))
  return (expPos - expNeg) / (expPos + expNeg)
}

export const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value))

export const ensurePositive = (value: number): number => (value <= EPSILON ? EPSILON : value)

export const hslToHex = (h: number, s: number, l: number): string => {
  const hue = ((h % 360) + 360) % 360 / 360
  const sat = clamp01(s)
  const light = clamp01(l)

  if (sat === 0) {
    const gray = Math.round(light * 255)
    return `#${gray.toString(16).padStart(2, '0')}${gray.toString(16).padStart(2, '0')}${gray.toString(16).padStart(2, '0')}`
  }

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q

  const hueToRGB = (t: number) => {
    let temp = t
    if (temp < 0) temp += 1
    if (temp > 1) temp -= 1
    if (temp < 1 / 6) return p + (q - p) * 6 * temp
    if (temp < 1 / 2) return q
    if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6
    return p
  }

  const r = Math.round(clamp(hueToRGB(hue + 1 / 3), 0, 1) * 255)
  const g = Math.round(clamp(hueToRGB(hue), 0, 1) * 255)
  const b = Math.round(clamp(hueToRGB(hue - 1 / 3), 0, 1) * 255)

  const toHex = (value: number) => value.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
