# 🧠 WhatsApp Bot

> A modular, powerful, and easy-to-extend WhatsApp bot framework built with Node.js.

---

## 🚀 Overview

This WhatsApp bot project provides a simple yet flexible foundation for creating custom commands, automation, and AI integrations.  
It’s designed to be modular — meaning every feature or command is a separate **plugin** that you can easily add, remove, or modify.

### ✨ Features

- 🔌 **Plugin-based architecture** — each command is an independent module.  
- ⚡ **Fast and lightweight** — powered by modern JavaScript (ESM).  
- 🔐 **Per-command settings** — cooldowns, permission flags, and execution options.  
- 💬 **Simple syntax** — easy to read, easy to extend.

---

## 🧩 Example Plugin

Below is a simple example of a test command plugin inside this bot:

```js
export default {
  name: "test",
  description: "A simple test command.",
  category: "utility",
  command: ["test"],
  settings: {
    owner: false,
    admin: false,
    botAdmin: false,
    group: false,
    private: false,
    wait: true,
    cooldown: 5
  },
  code: async (m) => {
      await m.reply("✅ The bot is running.!");
  }
};
```

### 🧱 How it Works
1. Define the plugin metadata (`name`, `description`, `category`, `settings`).
2. Write your main logic in the `code` function.
3. The bot automatically loads and registers your command.

---

## 🤝 Contributing

Contributions are welcome! Here’s how you can help:

1. **Fork** this repository.  
2. **Create a new branch** for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Add your plugin** inside the `plugins` directory.  
4. **Test** your command locally before pushing.  
5. **Commit and push** your changes:
   ```bash
   git commit -m "Add: new command plugin"
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request** describing what you’ve added or changed.

Please follow the project’s coding style and keep the plugins clean, modular, and easy to understand.

---

## 📜 License

This project is protected under international copyright laws.  
Unauthorized copying, modification, or distribution of this software is strictly prohibited.  
© 2025 [slowlyh] — All Rights Reserved.

---
