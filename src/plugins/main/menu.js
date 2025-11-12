export default {
	name: "menu",
	command: ["menu", "help"],
	category: "main",
	description: "Display all available commands",

	settings: {
		group: false,
		private: false,
		wait: true,
		cooldown: 5,
	},

	async code(m, { Func, config }) {
		const pluginLoader = this.handler?.pluginLoader;
		if (!pluginLoader) {
			return m.reply("❌ Plugin loader not available");
		}

		const categories = {};
		const plugins = pluginLoader.getAllPlugins();

		// Group plugins by category
		for (const plugin of plugins) {
			const cat = plugin.category || "other";
			if (!categories[cat]) {
				categories[cat] = [];
			}
			categories[cat].push(plugin);
		}

		// Build menu message
		let menu = `╭─「 *BOT MENU* 」\n`;
		menu += `│ Prefix: *${config.prefix}*\n`;
		menu += `│ Total Commands: *${pluginLoader.commandMap.size}*\n`;
		menu += `│ Total Plugins: *${plugins.length}*\n`;
		menu += `╰────────────\n\n`;

		// List commands by category
		for (const [category, pluginList] of Object.entries(
			categories
		).sort()) {
			menu += `╭─「 *${category.toUpperCase()}* 」\n`;

			for (const plugin of pluginList) {
				const cmds = plugin.command || [];
				const cmdStr = cmds.join(", ");
				menu += `│ • ${config.prefix}${cmdStr}\n`;
				if (plugin.description) {
					menu += `│   _${plugin.description}_\n`;
				}
			}

			menu += `╰────────────\n\n`;
		}

		menu += `_@Slowly - NNN Experiment._`;

		await m.reply(menu);
	},
};
