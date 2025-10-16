import Matter from "matter-js"
import type { StoneParams } from "../types"
import type { Point } from "./stone-generator"
import { calculateArea } from "./stone-generator"

export interface Stone {
  id: string
  body: Matter.Body
  params: StoneParams
  vertices: Point[]
  color: string
  isFlipped: boolean
  createdAt: number
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

  constructor(width: number, height: number, gravity: number) {
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
  addStone(vertices: Point[], params: StoneParams, x: number, y: number, color: string): Stone {
    // Convert vertices to Matter.js format
    const matterVertices = vertices.map((v) => ({ x: v.x, y: v.y }))

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

    // Add to world
    Matter.World.add(this.world, body)

    // Create stone object
    const stone: Stone = {
      id: `stone-${this.nextId++}`,
      body,
      params,
      vertices,
      color,
      isFlipped: false,
      createdAt: Date.now(),
    }

    this.stones.set(body.id, stone)
    return stone
  }

  /**
   * Remove a stone from the physics world
   */
  removeStone(stone: Stone): void {
    Matter.World.remove(this.world, stone.body)
    this.stones.delete(stone.body.id)
  }

  /**
   * Flip a stone 180 degrees
   */
  flipStone(stone: Stone): void {
    Matter.Body.rotate(stone.body, Math.PI)
    stone.isFlipped = !stone.isFlipped
  }

  /**
   * Step the physics simulation
   */
  update(deltaTime: number): void {
    Matter.Engine.update(this.engine, deltaTime)
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
      const stoneTop = stone.body.position.y - stone.params.radius
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
