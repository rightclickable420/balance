/**
 * Jupiter API client for aggregated SOL/USDC pricing
 * Polls Jupiter Quote API for best execution price across all Solana DEXs
 */

// Updated to new Jupiter API endpoint (December 2024+)
// Old v6 endpoint deprecated: quote-api.jup.ag/v6/quote
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote'
const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const QUOTE_AMOUNT = 1_000_000_000 // 1 SOL in lamports

interface JupiterQuoteResponse {
  inputMint: string
  inAmount: string
  outputMint: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
}

export class JupiterClient {
  private pollInterval: number
  private isRunning = false
  private onPriceCallback: ((price: number) => void) | null = null

  constructor(pollIntervalMs = 100) {
    this.pollInterval = pollIntervalMs
  }

  /**
   * Start polling Jupiter for SOL/USDC prices
   */
  start(onPrice: (price: number) => void) {
    this.onPriceCallback = onPrice
    this.isRunning = true
    this.poll()
    console.log('[Jupiter] Started polling at', this.pollInterval, 'ms interval')
  }

  /**
   * Stop polling
   */
  stop() {
    this.isRunning = false
    console.log('[Jupiter] Stopped polling')
  }

  private async poll() {
    while (this.isRunning) {
      try {
        const price = await this.fetchPrice()
        if (this.onPriceCallback) {
          this.onPriceCallback(price)
        }
      } catch (error) {
        console.error('[Jupiter] Failed to fetch price:', error)
      }

      await this.sleep(this.pollInterval)
    }
  }

  /**
   * Fetch current SOL/USDC price from Jupiter Quote API
   * Returns price in USDC per SOL
   */
  private async fetchPrice(): Promise<number> {
    const url = `${JUPITER_QUOTE_API}?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${QUOTE_AMOUNT}&slippageBps=50`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as JupiterQuoteResponse

    // Calculate price: outAmount (USDC with 6 decimals) / inAmount (SOL with 9 decimals)
    const outAmountUsdc = parseInt(data.outAmount) / 1_000_000 // USDC has 6 decimals
    const inAmountSol = parseInt(data.inAmount) / 1_000_000_000 // SOL has 9 decimals

    return outAmountUsdc / inAmountSol
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
