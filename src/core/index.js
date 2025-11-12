/**
 * Copyright © 2025 [ slowlyh ]
 *
 * All rights reserved. This source code is the property of [ ChatGPT ].
 * Unauthorized copying, distribution, modification, or use of this file,
 * via any medium, is strictly prohibited without prior written permission.
 *
 * Contact: [ hyuuoffc@gmail.com ]
 * GitHub: https://github.com/slowlyh
 * Official: https://hyuu.tech
 */

import "#config/index";
import MessageHandler from "#core/handler";
import PluginLoader from "#lib/loader";
import { logger } from "#lib/logger";
import printMessage from "#lib/print";
import serialize, { Client } from "#lib/serialize";
import { Boom } from "@hapi/boom";
import makeWASocket, {
	Browsers,
	fetchLatestBaileysVersion,
	jidNormalizedUser,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
} from "baileys";
import fs from "fs";
import pino from "pino";

const pluginLoader = new PluginLoader("./src/plugins", { debug: true });
await pluginLoader.load();

const handler = new MessageHandler(pluginLoader, {
	ownerNumbers: global.ownerNumber || [],
	public: global.pubelik ?? true,
	prefix: global.BOT_PREFIXES || ".",
	messages: {
		owner: global.mess?.owner || "⛔ This command is for owner only.",
		admin: global.mess?.admin || "⛔ This command is for group admins only.",
		group: global.mess?.group || "⛔ This command can only be used in groups.",
		private: global.mess?.private || "⛔ This command can only be used in private chat.",
		botAdmin: global.mess?.botAdmin || "⛔ Bot needs to be admin to execute this command.",
		wait: global.mess?.wait || "⏳ Processing your request...",
		cooldown: "⏱️ Please wait {time} seconds before using this command again.",
		error: "❌ An error occurred while executing the command.",
	},
});

pluginLoader.use(async (m, ctx, plugin) => {
	if (pluginLoader.debug) {
		logger.info(`[${plugin.name}] executed by ${m.sender}`);
	}
	return true;
});

global.plugins = pluginLoader.plugins;
global.pluginLoader = pluginLoader;
global.handler = handler;

async function startWA() {
	const { state, saveCreds } = await useMultiFileAuthState("sessions");
	const { version } = await fetchLatestBaileysVersion();

	const sock = makeWASocket({
		auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
            state.keys,
            pino().child({ level: 'fatal', stream: 'store' })
        )
    },
    version,
    logger: pino({ level: 'silent' }),
    browser: Browsers.ubuntu('Edge'),
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => true,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60_000,
	keepAliveIntervalMs: 30_000,
	retryRequestDelayMs: 250,
	maxMsgRetryCount: 5
	});

	await Client(sock);
	if (!sock.chats) sock.chats = {};

	sock.handler = handler;
	sock.pluginLoader = pluginLoader;

	if (!sock.authState.creds.registered && global.PAIRING_NUMBER) {
		setTimeout(async () => {
			try {
				const code = await sock.requestPairingCode(global.PAIRING_NUMBER);
				logger.info(`Pairing Code: ${code}`);
			} catch (err) {
				logger.error(`Failed to get pairing code: ${err}`);
			}
		}, 3000);
	}

	sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
		if (connection) logger.info(`Connection Status: ${connection}`);

		if (connection === "close") {
			const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

			switch (statusCode) {
				case 408:
				case 503:
				case 428:
				case 515:
					logger.error("Connection issue. Restarting...");
					await startWA();
					break;

				case 401:
				case 403:
				case 405:
					logger.error("Session error. Recreating session...");
					fs.rmSync("./sessions", { recursive: true, force: true });
					await startWA();
					break;

				default:
					logger.error(`Unhandled connection issue. Code: ${statusCode}`);
					process.exit(1);
			}
		}

		if (connection === "open") {
			logger.success("Bot connected successfully.");
			const stats = handler.getStats();
			logger.info(`Loaded ${stats.totalPlugins} plugins with ${stats.totalCommands} commands`);
			await sock.insertAllGroup();
		}
	});

	sock.ev.on("creds.update", saveCreds);

	sock.ev.on("groups.update", (updates) => {
		for (const update of updates) {
			const id = update.id;
			if (sock.chats[id]) {
				sock.chats[id] = { ...(sock.chats[id] || {}), ...(update || {}) };
			}
		}
	});

	sock.ev.on("group-participants.update", ({ id, participants, action }) => {
		const metadata = sock.chats[id];
		if (!metadata) return;

		switch (action) {
			case "add":
			case "revoked_membership_requests":
				metadata.participants.push(
					...participants.map((id) => ({ id: jidNormalizedUser(id), admin: null }))
				);
				break;
			case "demote":
			case "promote":
				for (const participant of metadata.participants) {
					const participantId = jidNormalizedUser(participant.id);
					if (participants.includes(participantId)) {
						participant.admin = action === "promote" ? "admin" : null;
					}
				}
				break;
			case "remove":
				metadata.participants = metadata.participants.filter(
					(p) => !participants.includes(jidNormalizedUser(p.id))
				);
				break;
		}
	});

	sock.ev.on("messages.upsert", async ({ messages }) => {
		if (!messages[0]) return;
		const m = await serialize(sock, messages[0]);
		if (m.chat.endsWith("@broadcast") || m.chat.endsWith("@newsletter")) return;

		if (m.message && !m.isBot && m.type !== "protocolMessage") {
			printMessage(m, sock);
		}

		try {
			await handler.handle(sock, m);
		} catch (error) {
			logger.error("[MESSAGE HANDLER ERROR]:", error);
		}
	});

	return sock;
}

startWA();

process.on("uncaughtException", (err) => {
	logger.error("[UNCAUGHT EXCEPTION]:", err);
});

process.on("unhandledRejection", (reason) => {
	logger.error("[UNHANDLED REJECTION]:", reason);
});

process.on("SIGINT", async () => {
	logger.info("Shutting down gracefully...");
	await pluginLoader.stop();
	handler.stop();
	logger.success("Shutdown complete");
	process.exit(0);
});

process.on("SIGTERM", async () => {
	logger.info("Received SIGTERM, shutting down...");
	await pluginLoader.stop();
	handler.stop();
	process.exit(0);
});
