/**
 * Pakasir QRIS Payment Integration
 * https://pakasir.com
 */
import axios from 'axios'

const PAKASIR_API_BASE = 'https://app.pakasir.com/api'

/**
 * Pakasir QRIS Payment Class
 */
export class Pakasir {
  constructor(options = {}) {
    this.slug = options.slug || process.env.PAKASIR_SLUG
    this.apiKey = options.apiKey || process.env.PAKASIR_API_KEY
    
    if (!this.slug || !this.apiKey) {
      throw new Error('PAKASIR_SLUG and PAKASIR_API_KEY are required')
    }
  }

  /**
   * Create QRIS payment
   * @param {number} amount - Payment amount
   * @param {string} orderId - Optional custom order ID
   * @returns {Promise<Object>} Payment data
   */
  async createQris(amount, orderId = null) {
    if (!amount || amount < 1000) {
      throw new Error('Minimum payment amount is 1000')
    }

    try {
      const order_id = orderId || Math.random().toString(25).slice(2, 10).toUpperCase()

      const response = await axios.post(
        `${PAKASIR_API_BASE}/transactioncreate/qris`,
        {
          project: this.slug,
          order_id: order_id,
          amount: amount,
          api_key: this.apiKey
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      if (!response.data?.payment) {
        throw new Error('Invalid response from Pakasir API')
      }

      return response.data.payment
    } catch (error) {
      console.error('[PAKASIR] Create QRIS error:', error)
      throw new Error(`Failed to create QRIS: ${error.message}`)
    }
  }

  /**
   * Check transaction status
   * @param {string} orderId - Order ID
   * @param {number} amount - Payment amount
   * @returns {Promise<Object>} Transaction data
   */
  async checkStatus(orderId, amount) {
    if (!orderId || !amount) {
      throw new Error('Order ID and amount are required')
    }

    try {
      const response = await axios.get(
        `${PAKASIR_API_BASE}/transactiondetail`,
        {
          params: {
            project: this.slug,
            amount: amount,
            order_id: orderId,
            api_key: this.apiKey
          }
        }
      )

      if (!response.data?.transaction) {
        throw new Error('Invalid response from Pakasir API')
      }

      return response.data.transaction
    } catch (error) {
      console.error('[PAKASIR] Check status error:', error)
      throw new Error(`Failed to check status: ${error.message}`)
    }
  }

  /**
   * Generate QR code URL
   * @param {string} paymentNumber - QRIS payment number
   * @returns {string} QR code image URL
   */
  generateQrUrl(paymentNumber) {
    return `https://quickchart.io/qr?text=${encodeURIComponent(paymentNumber)}&size=500`
  }
}

// Export singleton instance
export const pakasir = new Pakasir({
  slug: global.PAKASIR_SLUG || process.env.PAKASIR_SLUG,
  apiKey: global.PAKASIR_API_KEY || process.env.PAKASIR_API_KEY,
})