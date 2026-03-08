<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=200&section=header&text=NovaChat-Bot&fontSize=60&fontColor=fff&animation=twinkling&fontAlignY=40&desc=Advanced%20WhatsApp%20Bot%20powered%20by%20Baileys&descAlignY=62&descSize=18" width="100%"/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Fira+Code&size=22&duration=3000&pause=1000&color=00D4FF&center=true&vCenter=true&multiline=true&width=700&height=80&lines=🤖+NovaChat-Bot+%7C+WhatsApp+Automation;⚡+Fast+%7C+Powerful+%7C+Feature-Rich)](https://git.io/typing-svg)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <img src="https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white"/>
  <img src="https://img.shields.io/badge/Baileys-000000?style=for-the-badge&logo=github&logoColor=white"/>
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue?style=for-the-badge"/>
  <img src="https://img.shields.io/github/stars/simoabid/NovaChat-Bot?style=for-the-badge&color=yellow"/>
  <img src="https://img.shields.io/github/forks/simoabid/NovaChat-Bot?style=for-the-badge&color=orange"/>
</p>

</div>

---

## 👤 About the Developer

<img align="right" width="200" src="https://github-readme-stats.vercel.app/api?simoabid=simoabid&show_icons=true&theme=tokyonight&hide_border=true&count_private=true"/>

**Hey there! 👋 I'm `SeeMoo`**

A passionate developer and botmaker building tools to automate and enhance daily WhatsApp experiences.

| | |
|---|---|
| 👤 **Name** | `SeeMoo` |
| 🐙 **GitHub** | [@simoabid](https://github.com/simoabid) |
| 📸 **Instagram** | [@simoabiid](https://instagram.com/simoabiid) |
| 🎥 **LinkedIn** | [@mohamed-amine-abidd](https://www.linkedin.com/mohamed-amine-abidd) |
| 💬 **WhatsApp** | [Join Here](https://wa.me/212676226120) |

<br clear="right"/>

---

## 🤖 What is NovaChat-Bot?

**NovaChat-Bot** is a powerful, feature-rich WhatsApp bot built on top of the [Baileys](https://github.com/WhiskeySockets/Baileys) library. It is designed to be fast, modular, and easy to extend — covering everything from AI conversations to group management and a fully-featured in-chat RPG game.

### ✨ Feature Highlights

<details>
<summary><b>🧠 AI & Smart Responses</b></summary>

- Google Gemini AI (v1, v2, Pro Max)
- DeepSeek AI integration
- Auto AI replies in group/private chats
- Image analysis and AI art generation
- AI music and voice tools

</details>

<details>
<summary><b>📥 Downloaders</b></summary>

- Facebook (HD, Reels, Stories)
- Instagram (Posts, Reels, Stories)
- CapCut videos
- Google Drive files
- And more via plugin architecture

</details>

<details>
<summary><b>🎨 Media & Stickers</b></summary>

- Image-to-sticker conversion (ATTP, animated)
- Brat sticker generator
- Image colorization
- Carbon code screenshots
- Blur, resize, and image effects

</details>

<details>
<summary><b>🛡️ Group Management</b></summary>

- Anti-link, anti-spam, anti-call protection
- Auto welcome / goodbye with canvas images
- Anti bad-word, anti-sticker, anti-media filters
- Admin-only mode, group lock/unlock scheduler
- Ghost tag, promote/demote tracking

</details>

<details>
<summary><b>🎮 RPG Game System</b></summary>

- Full in-chat RPG with 250+ per-user stats
- Farming, fishing, mining, hunting, dungeons
- Pet system (cat, dragon, kyubi, griffin…)
- Duels, wars, item crafting and trading
- Level-up progression and skill system

</details>

<details>
<summary><b>🔧 System & Owner Tools</b></summary>

- Plugin hot-reload without restart
- Session manager, database backup
- Disk usage monitor, cache cleaner
- Remote exec, ban/unban users and chats
- Pairing code authentication (no QR needed)

</details>

---

## 🚀 Installation & Setup

### Prerequisites

- [Node.js](https://nodejs.org) **v18+**
- [Git](https://git-scm.com)
- A dedicated WhatsApp number for the bot (not your personal number)

### Step 1 — Clone the repository

```bash
git clone https://github.com/simoabid/NovaChat-Bot.git
cd NovaChat-Bot
```

### Step 2 — Install dependencies

```bash
npm install
```

> ⚠️ If you encounter peer dependency errors, use `npm install --legacy-peer-deps`

### Step 3 — Configure the bot

Open `function/settings/settings.js` and update your details:

```js
global.info = {
  nomerbot:      'YOUR_BOT_WA_NUMBER',    // bot number (digits only, no +)
  pairingNumber: 'YOUR_BOT_WA_NUMBER',    // same number for pairing
  figlet:        'NOVACHAT',              // ASCII art name at startup
  nameown:       'YOUR_NAME',             // your display name
  nomerown:      'YOUR_PERSONAL_NUMBER',  // your WhatsApp number (owner)
  namebot:       '乂 NOVA CHAT',           // bot name shown in messages
  wm:            'NOVACHAT.',             // watermark
}
```

Also update `config.js`:

```js
global.owner = [
  ['YOUR_PERSONAL_WA_NUMBER', 'YOUR_NAME', true]
]
```

### Step 4 — Start the bot

```bash
npm start
```

On first run, a **pairing code** will appear in your terminal.
Open WhatsApp on your bot number → **Linked Devices** → **Link with phone number** → enter the code.

### Step 5 — Done! 🎉

```
┌────────────────┬─────────────────┐
│ Name Bot       │ NovaChat-Bot    │
│ Version        │ 1.0.0           │
│ OS             │ Linux           │
│ Feature        │ 100+ features   │
│ Creator        │ SeeMoo       │
└────────────────┴─────────────────┘
```

---

## 📁 Project Structure

```
NovaChat-Bot/
├── index.js                   # Process manager (spawns main.js)
├── main.js                    # WhatsApp connection & DB initialization
├── handler.js                 # Message router & plugin dispatcher
├── config.js                  # Global config loader
│
├── function/
│   ├── settings/settings.js   # ⭐ Primary config (bot identity, APIs, media)
│   ├── system/function.js     # Group scheduler functions
│   └── database/              # Runtime JSON database files
│
├── lib/                       # Shared utility libraries
│   ├── simple.js              # Extended Baileys socket methods
│   ├── canvas.js              # Image generation
│   ├── scrape.js              # Web scraping utilities
│   └── ...
│
└── plugins/                   # 100+ feature plugins (hot-reloadable)
    ├── _*.js                  # Internal/system plugins
    └── *.js                   # Feature plugins (AI, downloads, games…)
```

---

## 🧩 Adding Plugins

Drop a `.js` file in `plugins/` — the bot hot-reloads it automatically.

```js
// plugins/hello.js
let handler = async (m, { conn, command, args, text }) => {
  m.reply(`👋 Hello! You said: ${text}`)
}

handler.command = /^hello$/i
handler.help    = ['hello <text>']
handler.tags    = ['utility']

export default handler
```

---

## 🤝 Contributing

1. **Fork** this repository
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a **Pull Request**

---

## 📜 Credits & Acknowledgements

This project builds on the work of these open-source developers:

| Project | Author | Link |
|---|---|---|
| **Silana Lite Ofc** | Noureddine Ouafy | [noureddineouafy/Silana-Lite](https://github.com/noureddineouafy/Silana-Lite) |
| **Tixo-md** | Tiooxy | [Tiooxy/Tixo-md](https://github.com/Tiooxy/Tixo-md) |
| **Baileys** | WhiskeySockets | [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys) |

> NovaChat-Bot adds its own identity, modifications, and extended features on top of these foundations. Respect and credit to all original authors.

---

## ⚠️ Disclaimer

- This project is **not affiliated** with WhatsApp Inc. or Meta Platforms.
- Automating WhatsApp **may violate their Terms of Service** — use a dedicated number.
- The developer is **not responsible** for any misuse or account bans.

---

## 📄 License

Licensed under the **GNU General Public License v3.0**.
See the [LICENSE](LICENSE) file for details.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%"/>

**Made with ❤️ by [SeeMoo](https://github.com/simoabid)**

⭐ **Star this repo** if you found it useful!
📢 **Join me on LinkedIn** for updates → [LinkedIn URL](https://www.linkedin.com/mohamed-amine-abidd)

</div>
