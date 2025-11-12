import { jidNormalizedUser } from 'baileys'
import util from 'util'
import cp from 'child_process'
import Func from '#lib/functions'
import { CooldownManager } from '#lib/cooldown'

/**
 * Message Handler Class
 * Processes incoming messages and executes plugins
 */
export default class MessageHandler {
  constructor(pluginLoader, config = {}) {
    this.pluginLoader = pluginLoader
    this.cooldownManager = new CooldownManager()
    
    // Configuration
    this.config = {
      ownerNumbers: config.ownerNumbers || [],
      public: config.public ?? true,
      prefix: config.prefix || '.',
      messages: {
        owner: '⛔ This command is for owner only.',
        admin: '⛔ This command is for group admins only.',
        group: '⛔ This command can only be used in groups.',
        private: '⛔ This command can only be used in private chat.',
        botAdmin: '⛔ Bot needs to be admin to execute this command.',
        wait: '⏳ Processing your request...',
        cooldown: '⏱️ Please wait {time} seconds before using this command again.',
        error: '❌ An error occurred while executing the command.',
        ...config.messages
      },
      ...config
    }

    // Start cooldown cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.cooldownManager.cleanup()
    }, 60 * 60 * 1000)
  }

  /**
   * Stop the handler
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Create context object for plugins
   */
  async createContext(sock, m) {
    const quoted = m.isQuoted ? m.quoted : m
    const downloadM = async (filename) => 
      await sock.downloadMediaMessage(quoted, filename)

    // Check if user is owner
    const isOwner = m.fromMe || 
      this.config.ownerNumbers.includes(m.sender.split('@')[0])

    // Group metadata and permissions
    let metadata = {}
    let isAdmin = false
    let isBotAdmin = false

    if (m.isGroup) {
      metadata = sock.chats[m.chat] || 
        (await sock.groupMetadata(m.chat).catch(() => ({})))
      
      const participants = metadata.participants || []
      
      isAdmin = participants.find(
        u => sock.getJid(u.id) === m.sender
      )?.admin === 'admin' || false

      isBotAdmin = participants.find(
        u => sock.getJid(u.id) === jidNormalizedUser(sock.user.id)
      )?.admin === 'admin' || false
    }

    return {
      // Utilities
      Func,
      downloadM,

      // Message data
      quoted,
      metadata,
      participants: metadata.participants || [],

      // Permissions
      isOwner,
      isAdmin,
      isBotAdmin,

      // Helper methods
      reply: async (text, options) => await m.reply(text, options),
      
      react: async (emoji) => 
        await sock.sendMessage(m.chat, { 
          react: { text: emoji, key: m.key } 
        }),

      // Send methods
      send: async (content, options) => 
        await sock.sendMessage(m.chat, content, options),

      // Config access
      config: this.config,

      // Cooldown manager
      cooldown: this.cooldownManager,

      // Expose message properties directly in context
      // So plugins can access them via destructuring
      text: m.text,
      body: m.body,
      command: m.command,
      args: m.args,
      sender: m.sender,
      chat: m.chat,
      isGroup: m.isGroup,
      isMedia: m.isMedia,
      isQuoted: m.isQuoted,
      type: m.type,
      message: m.message,
      key: m.key,
      pushName: m.pushName,
      mentionedJid: m.mentionedJid,
      fromMe: m.fromMe
    }
  }

  /**
   * Check if command meets all permission requirements
   */
  async checkPermissions(plugin, m, ctx) {
    const settings = plugin.settings || {}
    const msg = this.config.messages

    // Owner only
    if (settings.owner && !ctx.isOwner) {
      await m.reply(msg.owner)
      return false
    }

    // Private chat only
    if (settings.private && m.isGroup) {
      await m.reply(msg.private)
      return false
    }

    // Group only
    if (settings.group && !m.isGroup) {
      await m.reply(msg.group)
      return false
    }

    // Admin only
    if (settings.admin && !ctx.isAdmin) {
      await m.reply(msg.admin)
      return false
    }

    // Bot admin required
    if (settings.botAdmin && !ctx.isBotAdmin) {
      await m.reply(msg.botAdmin)
      return false
    }

    // Cooldown check (skip for owners)
    if (settings.cooldown && !ctx.isOwner) {
      const cooldownMs = settings.cooldown * 1000

      if (this.cooldownManager.isOnCooldown(m.sender, plugin.name, cooldownMs)) {
        const remainingMs = this.cooldownManager.getRemainingTime(
          m.sender, 
          plugin.name, 
          cooldownMs
        )
        const remainingSec = Math.ceil(remainingMs / 1000)
        
        await m.reply(msg.cooldown.replace('{time}', remainingSec))
        return false
      }
    }

    return true
  }

  /**
   * Execute plugin with full error handling
   */
  async executePlugin(plugin, sock, m, ctx) {
    try {
      // Run middleware (can block execution)
      for (const middleware of this.pluginLoader.middleware) {
        const result = await middleware(m, ctx, plugin)
        if (result === false) {
          return // Middleware blocked execution
        }
      }

      // Check all permissions
      const hasPermission = await this.checkPermissions(plugin, m, ctx)
      if (!hasPermission) return

      // Send loading message
      if (plugin.settings?.wait) {
        await m.reply(this.config.messages.wait)
      }

      // Execute plugin code - supports both styles:
      // 1. code(m, ctx) or code: async function(m, ctx) {}
      // 2. code: async (m, ctx) => {}
      await plugin.code.call(sock, m, ctx)

      // Set cooldown after successful execution
      if (plugin.settings?.cooldown && !ctx.isOwner) {
        this.cooldownManager.setCooldown(m.sender, plugin.name)
      }

    } catch (error) {
      console.error(`[PLUGIN ERROR] ${plugin.name}:`, error)

      // Try custom error handler - supports both styles
      if (typeof plugin.onError === 'function') {
        try {
          await plugin.onError.call(sock, error, m, ctx)
          return
        } catch (handlerError) {
          console.error(`[ERROR HANDLER FAILED] ${plugin.name}:`, handlerError)
        }
      }

      // Default error message
      const errorMsg = this.config.messages.error
      await m.reply(`${errorMsg}\n\n_${error.message}_`)
    }
  }

  /**
   * Main message handler
   */
  async handle(sock, m) {
    try {
      // Ignore bot messages
      if (m.isBot) return

      // Create context
      const ctx = await this.createContext(sock, m)

      // Check if bot is public or user is owner
      if (!this.config.public && !ctx.isOwner) return

      // Detect if message is a command
      const isCommand = m.prefix && m.body?.startsWith(m.prefix)

      // Run event-based plugins (for all messages)
      for (const plugin of this.pluginLoader.getAllPlugins()) {
        if (typeof plugin.on === 'function') {
          try {
            const handled = await plugin.on.call(sock, m, ctx)
            if (handled === true) {
              return // Plugin handled message, stop processing
            }
          } catch (error) {
            console.error(`[EVENT HANDLER ERROR] ${plugin.name}:`, error)
          }
        }
      }

      // Handle command execution
      if (isCommand && m.command) {
        const command = m.command.toLowerCase()
        const pluginData = this.pluginLoader.getPluginByCommand(command)

        if (pluginData) {
          await this.executePlugin(pluginData.plugin, sock, m, ctx)
        }
      }

      // Owner eval command
      if (ctx.isOwner && ['>', '=>'].some(p => m.body?.startsWith(p))) {
        await this.handleEval(sock, m)
      }

      // Owner shell command
      if (ctx.isOwner && m.body?.startsWith('$')) {
        await this.handleShell(sock, m)
      }

    } catch (error) {
      console.error('[HANDLER ERROR]:', error)
    }
  }

  /**
   * Handle JavaScript eval (owner only)
   */
  async handleEval(sock, m) {
    let result
    try {
      result = /await/i.test(m.text)
        ? eval(`(async() => { ${m.text} })()`)
        : eval(m.text)
    } catch (error) {
      result = error
    }

    new Promise((resolve, reject) => {
      try {
        resolve(result)
      } catch (err) {
        reject(err)
      }
    })
      .then((res) => m.reply(util.format(res)))
      .catch((err) => m.reply(util.format(err)))
  }

  /**
   * Handle shell command (owner only)
   */
  async handleShell(sock, m) {
    const exec = util.promisify(cp.exec).bind(cp)
    let output

    try {
      output = await exec(m.text)
    } catch (error) {
      output = error
    }

    const { stdout, stderr } = output

    if (stdout?.trim()) {
      await m.reply('```\n' + stdout + '\n```')
    }
    
    if (stderr?.trim()) {
      await m.reply('```\n' + stderr + '\n```')
    }
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      ...this.pluginLoader.getStats(),
      ...this.cooldownManager.getStats(),
      isPublic: this.config.public,
      ownerCount: this.config.ownerNumbers.length
    }
  }
}