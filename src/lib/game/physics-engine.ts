import Matter from "matter-js"
import decomp from "poly-decomp"
import type { StoneParams } from "../types"
import type { AnchoredTrapezoid, Point } from "./stone-generator"
import { calculateArea } from "./stone-generator"

// Configure Matter.js to use poly-decomp for concave polygon decomposition
Matter.Common.setDecomp(decomp)

const normalizeAngle = (angle: number) => {
  let result = angle % (Math.PI * 2)
  if (result > Math.PI) result -= Math.PI * 2
  if (result < -Math.PI) result += Math.PI * 2
  return result
}

export interface Stone {
  id: string
  body: Matter.Body
  params: StoneParams
  vertices: Point[]
  color: string
  isFlipped: boolean
  createdAt: number
  topAngle?: number
  anchor?: AnchoredTrapezoid | null
  supportTargetX: number
  targetBodyAngle?: number
}

export interface StoneTelemetry {
  bodyId: number
  angularVelocity: number
  linearVelocity: { x: number; y: number }
  contacts: Array<{
    normal: { x: number; y: number }
    point: { x: number; y: number }
    impulse: number
    otherId: number | null
  }>
}

interface AddStoneInput {
  vertices: Point[]
  params: StoneParams
  x: number
  y: number
  color: string
  topAngle?: number
  anchor?: AnchoredTrapezoid | null
  supportTargetX?: number
}

type ForceStrengthInput = {
  stabilizer: number
  disturber: number
  direction?: number
  energyPhase?: "calm" | "building" | "critical"
  energyRatio?: number
  volatility?: number
}

/**
 * Physics engine wrapper using Matter.js
 */
export class PhysicsEngine {
  private engine: Matter.Engine
  private world: Matter.World
  private ground: Matter.Body
  private stones: Map<number, Stone> = new Map()
  private nextId = 0
  private telemetryBuffer: StoneTelemetry[] = []
  private stabilizerStrength = 0
  private disturberStrength = 0
  private disturberDirection = 0
  private energyPhase: "calm" | "building" | "critical" = "calm"
  private energyRatio = 0
  private volatility = 0
  private gravityBias: { x: number; y: number } = { x: 0, y: 0 }

  constructor(width: number, height: number, gravity: number) {
    // Ensure poly-decomp is configured (defensive check for SSR/hydration issues)
    if (!Matter.Common.decomp) {
      console.warn("[PhysicsEngine] poly-decomp not found, configuring now")
      Matter.Common.setDecomp(decomp)
    }

    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: gravity / 1000 }, // Convert to Matter.js units
    })
    this.world = this.engine.world

    // Create ground (static body at bottom)
    this.ground = Matter.Bodies.rectangle(width / 2, height - 10, width, 20, {
      isStatic: true,
      friction: 0.8,
      restitution: 0.1,
    })
    Matter.World.add(this.world, this.ground)
  }

  /**
   * Add a stone to the physics world
   */
  addStone({ vertices, params, x, y, color, topAngle, anchor = null, supportTargetX }: AddStoneInput): Stone | null {
    // Defensive check: ensure poly-decomp is available
    if (!Matter.Common.decomp) {
      console.error("[PhysicsEngine] poly-decomp not configured! Configuring now...")
      Matter.Common.setDecomp(decomp)
    }

    // Convert vertices to Matter.js format
    const matterVertices = vertices.map((v) => ({ x: v.x, y: v.y }))

    // Validate vertices
    if (matterVertices.length < 3) {
      console.error(`[PhysicsEngine] Invalid vertices count: ${matterVertices.length}`)
      return null
    }

    // Calculate mass from area and density
    const area = calculateArea(vertices)
    const mass = area * params.density

    // Create physics body
    const body = Matter.Bodies.fromVertices(x, y, [matterVertices], {
      friction: params.friction,
      restitution: params.restitution,
      density: params.density,
      mass,
    })

    // Validate body was created successfully
    if (!body || !body.vertices || body.vertices.length === 0) {
      console.error("[PhysicsEngine] Failed to create body from vertices:", matterVertices)
      return null
    }

    // Add to world
    Matter.World.add(this.world, body)

    const resolvedTopAngle = topAngle ?? body.angle
    const anchorRotation = anchor?.transform.rotation ?? 0
    const anchorTopAngle = anchor?.metrics.topAngle ?? 0
    const targetBodyAngle = resolvedTopAngle - anchorRotation - anchorTopAngle

    // Create stone object
    const stone: Stone = {
      id: `stone-${this.nextId++}`,
      body,
      params,
      vertices,
      color,
      isFlipped: false,
      createdAt: Date.now(),
      topAngle: resolvedTopAngle,
      anchor,
      supportTargetX: supportTargetX ?? x,
      targetBodyAngle: Number.isFinite(targetBodyAngle) ? targetBodyAngle : undefined,
    }

    this.stones.set(body.id, stone)
    return stone
  }

  getTelemetry(): StoneTelemetry[] {
    const data = this.telemetryBuffer
    this.telemetryBuffer = []
    return data
  }
  /**
   * Remove a stone from the physics world
   */
  removeStone(stone: Stone): void {
    Matter.World.remove(this.world, stone.body)
    this.stones.delete(stone.body.id)
  }

  /**
   * Set whether a stone is static
   */
  setStoneStatic(stone: Stone, isStatic: boolean): void {
    Matter.Body.setStatic(stone.body, isStatic)
  }

  /**
   * Set the angle of a stone and clear residual spin
   */
  setStoneAngle(stone: Stone, angle: number): void {
    Matter.Body.setAngle(stone.body, angle)
    Matter.Body.setAngularVelocity(stone.body, 0)
    stone.topAngle = angle
  }

  /**
   * Apply an impulse (force) to a stone at its center of mass
   */
  applyForce(stone: Stone, force: { x: number; y: number }): void {
    Matter.Body.applyForce(stone.body, stone.body.position, force)
  }

  /**
   * Flip a stone 180 degrees
   */
  flipStone(stone: Stone): void {
    Matter.Body.rotate(stone.body, Math.PI)
    stone.isFlipped = !stone.isFlipped
    if (typeof stone.topAngle === "number") {
      stone.topAngle = (stone.topAngle + Math.PI) % (Math.PI * 2)
    }
  }

  /**
   * Step the physics simulation
   */
  update(deltaTime: number, options?: { applyHelpers?: boolean; wakeBodies?: boolean }): void {
    Matter.Engine.update(this.engine, deltaTime)
    const applyHelpers = options?.applyHelpers ?? true
    if (deltaTime > 0 && applyHelpers) {
      this.applyContinuousForces()
    }
    if (options?.wakeBodies) {
      for (const stone of this.stones.values()) {
        Matter.Sleeping.set(stone.body, false)
      }
    }
    const contactsByBody = new Map<number, StoneTelemetry>()
    const pushContact = (
      bodyId: number,
      normal: { x: number; y: number },
      point: { x: number; y: number },
      impulse: number,
      otherId: number | null,
    ) => {
      let telemetry = contactsByBody.get(bodyId)
      if (!telemetry) {
        telemetry = {
          bodyId,
          angularVelocity: 0,
          linearVelocity: { x: 0, y: 0 },
          contacts: [],
        }
        contactsByBody.set(bodyId, telemetry)
      }
      telemetry.contacts.push({ normal, point, impulse, otherId })
    }
    const pairs = (this.engine as unknown as { pairs?: { list: Matter.Pair[] } }).pairs?.list ?? []
    for (const pair of pairs) {
      if (!pair.isActive) continue
      const activeContacts = (pair as unknown as { activeContacts?: Array<{ vertex: Matter.Vector }> }).activeContacts
      if (!activeContacts || activeContacts.length === 0) continue
      const { bodyA, bodyB, collision } = pair
      const normal = collision?.normal ?? { x: 0, y: -1 }
      const penetration =
        collision?.penetration ?? (collision?.depth ? { x: 0, y: collision.depth } : { x: 0, y: 0 })
      const impulse = Matter.Vector.magnitude(penetration)
      const contactVertex = activeContacts[0]?.vertex ?? collision?.supports?.[0] ?? { x: 0, y: 0 }
      const point = { x: contactVertex.x, y: contactVertex.y }
      const normalA = { x: normal.x, y: normal.y }
      const normalB = { x: -normal.x, y: -normal.y }
      pushContact(bodyA.id, normalA, point, impulse, bodyB.id)
      pushContact(bodyB.id, normalB, point, impulse, bodyA.id)
    }
    for (const stone of this.stones.values()) {
      const telemetry = contactsByBody.get(stone.body.id)
      const angularVelocity = stone.body.angularVelocity ?? 0
      const linearVelocity = stone.body.velocity ?? { x: 0, y: 0 }
      if (telemetry) {
        telemetry.angularVelocity = angularVelocity
        telemetry.linearVelocity = { x: linearVelocity.x, y: linearVelocity.y }
        this.telemetryBuffer.push(telemetry)
      } else if (Math.abs(angularVelocity) > 0.0001 || Math.hypot(linearVelocity.x, linearVelocity.y) > 0.0001) {
        this.telemetryBuffer.push({
          bodyId: stone.body.id,
          angularVelocity,
          linearVelocity: { x: linearVelocity.x, y: linearVelocity.y },
          contacts: [],
        })
      }
    }
  }

  stabilizeBodies(): void {
    for (const stone of this.stones.values()) {
      Matter.Body.setVelocity(stone.body, { x: 0, y: 0 })
      Matter.Body.setAngularVelocity(stone.body, 0)
      Matter.Sleeping.set(stone.body, true)
    }
  }

  setForceStrengths(stabilizer: number, disturber: number): void
  setForceStrengths(input: ForceStrengthInput): void
  setForceStrengths(arg1: number | ForceStrengthInput, arg2?: number): void {
    if (typeof arg1 === "number") {
      this.stabilizerStrength = arg1
      this.disturberStrength = arg2 ?? 0
      if (arg2 === undefined) {
        this.disturberDirection = 0
      }
      return
    }

    this.stabilizerStrength = arg1.stabilizer
    this.disturberStrength = arg1.disturber
    if (typeof arg1.direction === "number" && Number.isFinite(arg1.direction)) {
      this.disturberDirection = Math.sign(arg1.direction)
    }
    if (arg1.energyPhase) {
      this.energyPhase = arg1.energyPhase
    }
    if (typeof arg1.energyRatio === "number" && Number.isFinite(arg1.energyRatio)) {
      this.energyRatio = Math.max(0, arg1.energyRatio)
    }
    if (typeof arg1.volatility === "number" && Number.isFinite(arg1.volatility)) {
      this.volatility = Math.max(0, arg1.volatility)
    }
  }

  setGravityBias(vector: { x: number; y: number }): void {
    this.gravityBias = vector
  }

  private computeAnchoredOffset(
    anchor: AnchoredTrapezoid,
    body: Matter.Body,
    cosBody: number,
    sinBody: number,
    cosAnchor: number,
    sinAnchor: number,
    point: Point,
  ): { x: number; y: number } {
    // Note: anchor coordinates use y-up (mathematical), but canvas uses y-down (screen)
    // Transform: flip Y, negate angle
    // Standard rotation matrix for angle θ: [cos(θ) -sin(θ); sin(θ) cos(θ)]
    // For angle -θ (flipped): [cos(θ) sin(θ); -sin(θ) cos(θ)]
    const anchorY = -point.y
    const rotatedX = point.x * cosAnchor + anchorY * sinAnchor + anchor.transform.translation.x
    const rotatedY = -point.x * sinAnchor + anchorY * cosAnchor + anchor.transform.translation.y
    return {
      x: rotatedX * cosBody - rotatedY * sinBody,
      y: rotatedX * sinBody + rotatedY * cosBody,
    }
  }

  private computeAnchoredWorldPosition(
    anchor: AnchoredTrapezoid,
    body: Matter.Body,
    cosBody: number,
    sinBody: number,
    cosAnchor: number,
    sinAnchor: number,
    point: Point,
  ): { x: number; y: number } {
    const offset = this.computeAnchoredOffset(anchor, body, cosBody, sinBody, cosAnchor, sinAnchor, point)
    return {
      x: body.position.x + offset.x,
      y: body.position.y + offset.y,
    }
  }

  private applyContinuousForces() {
    if (this.stones.size === 0) return

    const stonesList = Array.from(this.stones.values())
    if (stonesList.length === 0) return

    const dynamicStones = stonesList.filter((stone) => !stone.body.isStatic)
    const sortedByHeight = [...dynamicStones].sort(
      (a, b) => (a.body.position?.y ?? 0) - (b.body.position?.y ?? 0),
    )
    const topCount = Math.min(sortedByHeight.length, 3)
    const topIds = new Set<number>()
    for (let i = 0; i < topCount; i++) {
      const candidate = sortedByHeight[i]
      if (candidate) {
        topIds.add(candidate.body.id)
      }
    }
    const topPrimaryId = sortedByHeight[0]?.body.id ?? null

    const stabilizer = Math.max(0, this.stabilizerStrength)
    const disturber = Math.max(0, this.disturberStrength)
    const gravityBias = this.gravityBias
    const energyRatio = Math.min(Math.max(this.energyRatio, 0), 2)
    const disturberDirection = this.disturberDirection || 0
    const volatility = Math.min(Math.max(this.volatility, 0), 2)
    const jitterIntensity = disturber * volatility
    const jitterPhaseBoost =
      this.energyPhase === "critical" ? 1.8 : this.energyPhase === "building" ? 1.25 : 0.6

    for (const stone of stonesList) {
      const body = stone.body
      if (body.isStatic) continue
      if ((stabilizer > 0 || disturber > 0) && body.isSleeping) {
        Matter.Sleeping.set(body, false)
      }

      const velocity = body.velocity ?? { x: 0, y: 0 }
      const velocityMag = Matter.Vector.magnitude(velocity)
      const baseFriction = stone.params.friction
      const anchor = stone.anchor ?? null
      const bodyAngle = body.angle ?? 0
      const cosBody = Math.cos(bodyAngle)
      const sinBody = Math.sin(bodyAngle)
      const anchorRotation = anchor?.transform.rotation ?? 0
      const cosAnchor = Math.cos(anchorRotation)
      const sinAnchor = Math.sin(anchorRotation)
      const isTop = topIds.has(body.id)
      const isPrimaryTop = topPrimaryId === body.id

      if (stabilizer > 0) {
        const dampingFactor = 1 + stabilizer * (0.45 + energyRatio * 0.2) * (isTop ? 1 : 0.6)
        body.frictionAir = Math.min(0.05 * dampingFactor, 0.28)
        const stabilizerFrictionBoost = isTop ? 0.85 : 0.45
        body.friction = Math.min(
          baseFriction * (1 + stabilizer * (0.55 + energyRatio * 0.3) * stabilizerFrictionBoost),
          1.4,
        )
        body.friction = Math.max(body.friction, baseFriction)

        if (velocityMag > 0.002) {
          const counterForce = Matter.Vector.mult(velocity, -0.013 * stabilizer * (isTop ? 1 : 0.3))
          Matter.Body.applyForce(body, body.position, counterForce)
        } else if (!isTop && stabilizer > disturber && velocityMag > 0) {
          Matter.Body.setVelocity(body, {
            x: velocity.x * 0.25,
            y: velocity.y * 0.6,
          })
          Matter.Body.setAngularVelocity(body, (body.angularVelocity ?? 0) * 0.4)
        }

        if (anchor && isPrimaryTop) {
          const bottomCenter = this.computeAnchoredWorldPosition(
            anchor,
            body,
            cosBody,
            sinBody,
            cosAnchor,
            sinAnchor,
            { x: 0, y: 0 },
          )
          const supportX = stone.supportTargetX
          if (Number.isFinite(supportX)) {
            const offsetX = (supportX - bottomCenter.x) * (0.35 + energyRatio * 0.25)
            const correction = Math.max(-4, Math.min(4, offsetX)) * 7e-5 * stabilizer
            if (Math.abs(correction) > 1e-6) {
              Matter.Body.applyForce(body, bottomCenter, {
                x: correction,
                y: -Math.abs(correction) * 0.4,
              })
            }
          }

          const desiredTop = stone.topAngle
          const topAngleOffset = anchor.metrics.topAngle + anchorRotation
          if (typeof desiredTop === "number") {
            const currentTop = bodyAngle + topAngleOffset
            const angleError = normalizeAngle(desiredTop - currentTop)
            if (Math.abs(angleError) > 0.0005) {
              const torque = angleError * (0.006 + energyRatio * 0.003) * stabilizer
              Matter.Body.setAngularVelocity(body, (body.angularVelocity ?? 0) + torque)
            }
          } else if (typeof stone.targetBodyAngle === "number") {
            const bodyError = normalizeAngle(stone.targetBodyAngle - bodyAngle)
            if (Math.abs(bodyError) > 0.0005) {
              const torque = bodyError * 0.004 * stabilizer
              Matter.Body.setAngularVelocity(body, (body.angularVelocity ?? 0) + torque)
            }
          }
        }
      } else {
        body.frictionAir = baseFriction * 0.02
        body.friction = baseFriction
      }

      if (disturber > 0) {
        const leanDirection = disturberDirection !== 0 ? disturberDirection : Math.sign(gravityBias.x || 0) || 1
        const angular = body.angularVelocity ?? 0
        const angularDamp = -angular * disturber * 0.0025 * (isTop ? 1 : 0.35)
        Matter.Body.setAngularVelocity(body, angular + angularDamp)

        const shearScale = isPrimaryTop ? 0.5 : isTop ? 0.2 : 0.05
        const shearBase = disturber * (0.00035 + energyRatio * 0.00012) * shearScale
        const shearForce = shearBase * leanDirection
        const applicationPoint =
          anchor && anchor.metrics.topMid
            ? this.computeAnchoredWorldPosition(
                anchor,
                body,
                cosBody,
                sinBody,
                cosAnchor,
                sinAnchor,
                anchor.metrics.topMid,
              )
            : body.position

        Matter.Body.applyForce(body, applicationPoint, { x: shearForce, y: 0 })

        const frictionDropScale = isPrimaryTop ? 0.6 : isTop ? 0.25 : 0.05
        body.friction = Math.max(
          baseFriction * 0.65,
          Math.max(0.04, baseFriction * (1 - disturber * (0.35 + 0.15 * energyRatio) * frictionDropScale)),
        )

        if (jitterIntensity > 0) {
          const jitterMagnitude =
            jitterIntensity *
            (0.00045 + 0.0002 * energyRatio) *
            jitterPhaseBoost *
            (isPrimaryTop ? 1 : isTop ? 0.25 : 0)
          if (jitterMagnitude > 0 && isPrimaryTop) {
            const jitterForce = {
              x: (Math.random() - 0.5) * 2 * jitterMagnitude,
              y: (Math.random() - 0.35) * jitterMagnitude * 0.6,
            }
            Matter.Body.applyForce(body, applicationPoint, jitterForce)
          }
        }
      }

      if (gravityBias.x !== 0 || gravityBias.y !== 0) {
        if (isPrimaryTop) {
          Matter.Body.applyForce(body, body.position, {
            x: gravityBias.x * body.mass * 0.75,
            y: gravityBias.y * body.mass * 0.75,
          })
        } else if (isTop) {
          Matter.Body.applyForce(body, body.position, {
            x: gravityBias.x * body.mass * 0.2,
            y: gravityBias.y * body.mass * 0.2,
          })
        }
      }
    }
  }

  /**
   * Get all stones
   */
  getStones(): Stone[] {
    return Array.from(this.stones.values())
  }

  /**
   * Get stone by body id
   */
  getStone(bodyId: number): Stone | undefined {
    return this.stones.get(bodyId)
  }

  /**
   * Check if a stone is stable (not tilted too much)
   */
  isStoneStable(stone: Stone, threshold: number): boolean {
    const angle = stone.body.angle % (Math.PI * 2)
    const normalizedAngle = Math.abs(angle > Math.PI ? angle - Math.PI * 2 : angle)
    return normalizedAngle < threshold
  }

  /**
   * Detect if tower is tumbling (any stone exceeds stability threshold)
   */
  detectTumble(threshold: number): Stone[] {
    const unstableStones: Stone[] = []
    for (const stone of this.stones.values()) {
      if (!this.isStoneStable(stone, threshold)) {
        unstableStones.push(stone)
      }
    }
    return unstableStones
  }

  /**
   * Get tower height (highest stone position)
   */
  getTowerHeight(): number {
    let maxHeight = 0
    for (const stone of this.stones.values()) {
      let minLocalY = Infinity
      for (const vertex of stone.vertices) {
        if (vertex.y < minLocalY) minLocalY = vertex.y
      }
      const stoneTop = stone.body.position.y + minLocalY
      maxHeight = Math.max(maxHeight, -stoneTop) // Negative because y increases downward
    }
    return maxHeight
  }

  /**
   * Clear all stones
   */
  clear(): void {
    for (const stone of this.stones.values()) {
      Matter.World.remove(this.world, stone.body)
    }
    this.stones.clear()
  }

  /**
   * Get the engine for direct access if needed
   */
  getEngine(): Matter.Engine {
    return this.engine
  }

  /**
   * Get the world for direct access if needed
   */
  getWorld(): Matter.World {
    return this.world
  }
}
