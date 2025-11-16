export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface Trade {
  timestamp: number
  price: number
  amount: number
  side: 'buy' | 'sell'
}

export interface PriceTick {
  timestamp: number
  price: number
}
