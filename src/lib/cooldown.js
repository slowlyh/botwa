
/**
 * Cooldown Manager
 * Manages command cooldowns per user
 */
export class CooldownManager {
  constructor() {
    this.cooldowns = new Map()
  }

  /**
   * Generate unique key for user-command pair
   */
  _getKey(userId, commandName) {
    return `${userId}:${commandName}`
  }

  /**
   * Check if user is on cooldown
   */
  isOnCooldown(userId, commandName, duration) {
    const key = this._getKey(userId, commandName)
    const lastUsed = this.cooldowns.get(key)

    if (!lastUsed) return false

    const elapsed = Date.now() - lastUsed
    return elapsed < duration
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  getRemainingTime(userId, commandName, duration) {
    const key = this._getKey(userId, commandName)
    const lastUsed = this.cooldowns.get(key)

    if (!lastUsed) return 0

    const elapsed = Date.now() - lastUsed
    return Math.max(0, duration - elapsed)
  }

  /**
   * Set cooldown for user
   */
  setCooldown(userId, commandName) {
    const key = this._getKey(userId, commandName)
    this.cooldowns.set(key, Date.now())
  }

  /**
   * Clear cooldown for user
   */
  clearCooldown(userId, commandName) {
    const key = this._getKey(userId, commandName)
    this.cooldowns.delete(key)
  }

  /**
   * Clear all cooldowns for a user
   */
  clearUserCooldowns(userId) {
    for (const key of this.cooldowns.keys()) {
      if (key.startsWith(`${userId}:`)) {
        this.cooldowns.delete(key)
      }
    }
  }

  /**
   * Cleanup old cooldowns (older than 24 hours)
   */
  cleanup() {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000

    for (const [key, timestamp] of this.cooldowns.entries()) {
      if (now - timestamp > maxAge) {
        this.cooldowns.delete(key)
      }
    }
  }

  /**
   * Get cooldown stats
   */
  getStats() {
    return {
      activeCooldowns: this.cooldowns.size
    }
  }
}