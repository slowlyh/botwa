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

import { logger } from "#lib/logger";
import { unwatchFile, watchFile } from "fs";
import { fileURLToPath } from "url";

// Nomor pairing (untuk scan QR/Pairing code)
global.PAIRING_NUMBER = 62895622412769;

global.BOT_PREFIXES = ".";

// Nomor owner utama + cadangan
global.ownerNumber = ["6283849999299", "62895622412769"];

global.PAKASIR_SLUG = "takeshi";
global.PAKASIR_API_KEY = "2v6UveJqyqIgkoNBf2lV7Q4vMowhpMkO";

// Mode bot:
// false  = self mode (hanya owner)
// true = public (semua user)
global.pubelik = true

// Pesan default untuk respon bot
global.mess = {
	wait: "Harap tunggu sebentar...",
	owner: "Fitur ini hanya bisa digunakan oleh Owner.",
	group: "Fitur ini hanya bisa digunakan dalam Group.",
	admin: "Fitur ini hanya bisa digunakan oleh Admin Group.",
	botAdmin: "Bot harus menjadi Admin terlebih dahulu.",
	private: "Fitur ini hanya bisa digunakan di chat pribadi.",
};

// Default watermark untuk stiker
global.stickpack = "@takeshnow";
global.stickauth = "Slolwy";

global.title = "@slowly";
global.body = "";
global.thumbnailUrl = "https://c.termai.cc/i37/jcnGyv.jpg";

const file = fileURLToPath(import.meta.url);
watchFile(file, () => {
	unwatchFile(file);
	logger.info("berhasil relooad file config.");
	import(`${file}?update=${Date.now()}`);
});
