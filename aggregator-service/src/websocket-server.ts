/**
 * WebSocket server for broadcasting candles to frontend clients
 */

import { WebSocketServer, WebSocket } from 'ws'
import { Candle } from './types'

export class CandleWebSocketServer {
  private wss: WebSocketServer
  private clients: Set<WebSocket> = new Set()

  constructor(port: number) {
    this.wss = new WebSocketServer({ port })

    this.wss.on('connection', (ws) => {
      console.log('[WebSocket] Client connected. Total clients:', this.clients.size + 1)
      this.clients.add(ws)

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected. Total clients:', this.clients.size - 1)
        this.clients.delete(ws)
      })

      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error)
        this.clients.delete(ws)
      })

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to Balance aggregator service',
        timestamp: Date.now()
      }))
    })

    console.log(`[WebSocket] Server listening on port ${port}`)
  }

  /**
   * Broadcast candle to all connected clients
   */
  broadcast(candle: Candle) {
    const message = JSON.stringify({
      type: 'candle',
      data: candle
    })

    let sent = 0
    let failed = 0

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message)
          sent++
        } catch (error) {
          console.error('[WebSocket] Failed to send to client:', error)
          failed++
        }
      } else {
        // Clean up dead connections
        this.clients.delete(client)
        failed++
      }
    })

    if (sent > 0) {
      console.log(`[WebSocket] Broadcasted candle to ${sent} client(s)`)
    }
    if (failed > 0) {
      console.log(`[WebSocket] Failed to send to ${failed} client(s)`)
    }
  }

  /**
   * Send status update to all clients
   */
  broadcastStatus(status: {
    jupiterConnected: boolean
    raydiumConnected: boolean
    candlesGenerated: number
  }) {
    const message = JSON.stringify({
      type: 'status',
      data: status
    })

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    })
  }

  /**
   * Close the server
   */
  close() {
    this.clients.forEach((client) => client.close())
    this.wss.close()
    console.log('[WebSocket] Server closed')
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size
  }
}
