import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import chokidar from 'chokidar'
import { logger } from '#lib/logger'
const log = logger;

/**
 * Import ES module with cache busting
 */
async function importModule(modulePath) {
  const moduleURL = pathToFileURL(modulePath).href + `?t=${Date.now()}`
  try {
    const esm = await import(moduleURL)
    return esm?.default ?? esm
  } catch (error) {
    log.error(`Failed to import ${modulePath}: ${error.message}`)
    throw error
  }
}

/**
 * Plugin Loader Class
 * Manages loading, validation, and hot-reloading of plugins
 */
export default class PluginLoader {
  constructor(directory, options = {}) {
    if (!directory) {
      throw new Error('Plugin directory path is required')
    }

    this.directory = resolve(directory)
    this.plugins = new Map()
    this.commandMap = new Map()
    this.watcher = null
    this.middleware = []
    this.debug = options.debug ?? false
  }

  /**
   * Validate plugin structure
   */
  validatePlugin(plugin, filePath) {
    const errors = []

    // Required fields
    if (!plugin.name || typeof plugin.name !== 'string') {
      errors.push('Missing or invalid "name" (must be string)')
    }

    if (!plugin.code || typeof plugin.code !== 'function') {
      errors.push('Missing or invalid "code" (must be function)')
    }

    // Optional fields validation
    if (plugin.command && !Array.isArray(plugin.command)) {
      errors.push('"command" must be an array')
    }

    if (plugin.alias && !Array.isArray(plugin.alias)) {
      errors.push('"alias" must be an array')
    }

    if (plugin.settings && typeof plugin.settings !== 'object') {
      errors.push('"settings" must be an object')
    }

    if (plugin.category && typeof plugin.category !== 'string') {
      errors.push('"category" must be a string')
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid plugin structure in ${filePath}:\n  - ${errors.join('\n  - ')}`
      )
    }

    return true
  }

  /**
   * Register commands to command map
   */
  registerCommands(plugin, filePath) {
    const commands = [
      ...(plugin.command || []),
      ...(plugin.alias || [])
    ].map(cmd => cmd.toLowerCase())

    for (const cmd of commands) {
      if (this.commandMap.has(cmd)) {
        const existing = this.commandMap.get(cmd)
        log.warn(
          `Command collision: "${cmd}" in ${filePath} overrides ${existing.filePath}`
        )
      }
      this.commandMap.set(cmd, { plugin, filePath })
    }

    return commands.length
  }

  /**
   * Unregister plugin commands
   */
  unregisterCommands(filePath) {
    let count = 0
    for (const [cmd, data] of this.commandMap.entries()) {
      if (data.filePath === filePath) {
        this.commandMap.delete(cmd)
        count++
      }
    }
    return count
  }

  /**
   * Add/reload a single plugin
   */
  async add(filePath, options = {}) {
    const { silent = false } = options

    try {
      // Clean up old plugin
      if (this.plugins.has(filePath)) {
        this.unregisterCommands(filePath)
        this.plugins.delete(filePath)
      }

      // Import plugin
      const plugin = await importModule(filePath)

      // Validate structure
      this.validatePlugin(plugin, filePath)

      // Store plugin
      this.plugins.set(filePath, {
        ...plugin,
        _meta: {
          filePath,
          loadedAt: Date.now()
        }
      })

      // Register commands
      const cmdCount = this.registerCommands(plugin, filePath)

      if (this.debug && !silent) {
        log.success(`✓ Loaded: ${plugin.name} (${cmdCount} commands)`)
      }

      return plugin
    } catch (error) {
      // Clean up on error
      this.plugins.delete(filePath)
      this.unregisterCommands(filePath)

      if (!silent) {
        log.error(`✗ Failed to load ${filePath}`)
        log.error(`  Reason: ${error.message}`)
      }

      return null
    }
  }

  /**
   * Recursively scan directory for plugins
   */
  async scan(dir = this.directory) {
    try {
      const items = readdirSync(dir, { withFileTypes: true })
      const sorted = items.sort((a, b) => a.name.localeCompare(b.name))

      for (const item of sorted) {
        const fullPath = join(dir, item.name)

        if (item.isDirectory()) {
          await this.scan(fullPath)
        } else if (item.isFile() && fullPath.endsWith('.js')) {
          await this.add(fullPath, { silent: true })
        }
      }
    } catch (error) {
      log.error(`Error scanning ${dir}: ${error.message}`)
    }
  }

  /**
   * Load all plugins and start file watcher
   */
  async load() {
    log.info(`Loading plugins from: ${this.directory}`)

    // Scan all plugins
    await this.scan()

    log.success(
      `Loaded ${this.plugins.size} plugins (${this.commandMap.size} commands)`
    )

    // Close existing watcher
    if (this.watcher) {
      await this.watcher.close()
    }

    // Start file watcher
    this.watcher = chokidar.watch(this.directory, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    })

    // File added
    this.watcher.on('add', async (path) => {
      if (path.endsWith('.js')) {
        const plugin = await this.add(path)
        if (plugin) {
          log.info(`🆕 New plugin detected: ${plugin.name}`)
        }
      }
    })

    // File changed
    this.watcher.on('change', async (path) => {
      if (path.endsWith('.js')) {
        const plugin = await this.add(path)
        if (plugin) {
          log.info(`🔄 Plugin reloaded: ${plugin.name}`)
        }
      }
    })

    // File deleted
    this.watcher.on('unlink', (path) => {
      if (this.plugins.has(path)) {
        const plugin = this.plugins.get(path)
        this.unregisterCommands(path)
        this.plugins.delete(path)
        log.warn(`🗑️  Plugin removed: ${plugin.name}`)
      }
    })

    // Watcher error
    this.watcher.on('error', (error) => {
      log.error(`Watcher error: ${error.message}`)
    })

    return this
  }

  /**
   * Stop file watcher
   */
  async stop() {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      log.info('Plugin watcher stopped')
    }
  }

  /**
   * Get plugin by command name
   */
  getPluginByCommand(command) {
    return this.commandMap.get(command?.toLowerCase())
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins() {
    return Array.from(this.plugins.values())
  }

  /**
   * Get plugins by category
   */
  getPluginsByCategory(category) {
    return this.getAllPlugins().filter(p => p.category === category)
  }

  /**
   * Get all categories
   */
  getCategories() {
    const categories = new Set()
    for (const plugin of this.getAllPlugins()) {
      if (plugin.category) {
        categories.add(plugin.category)
      }
    }
    return Array.from(categories).sort()
  }

  /**
   * Register middleware
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function')
    }
    this.middleware.push(middleware)
    return this
  }

  /**
   * Get plugin statistics
   */
  getStats() {
    return {
      totalPlugins: this.plugins.size,
      totalCommands: this.commandMap.size,
      categories: this.getCategories().length,
      middleware: this.middleware.length
    }
  }
}