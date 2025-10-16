export function getStoneColor(seed: number): string {
  // Earth tone palette (browns, grays, tans)
  const palette = [
    "#8B7355", // tan
    "#6B5D52", // brown-gray
    "#9C8B7A", // light brown
    "#7A6A5C", // medium brown
    "#5C4F42", // dark brown
    "#A89885", // beige
    "#6E6259", // warm gray
    "#8A7968", // taupe
  ]

  // Use seed to pick color deterministically
  const index = seed % palette.length
  return palette[index]
}

/**
 * Get slightly darker shade for stone outline
 */
export function getStoneOutlineColor(baseColor: string): string {
  // Simple darkening by reducing RGB values
  const hex = baseColor.replace("#", "")
  const r = Math.max(0, Number.parseInt(hex.slice(0, 2), 16) - 30)
  const g = Math.max(0, Number.parseInt(hex.slice(2, 4), 16) - 30)
  const b = Math.max(0, Number.parseInt(hex.slice(4, 6), 16) - 30)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}
