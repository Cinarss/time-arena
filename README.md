# Arena.io | Realistic Battle 🚀 (Made by Gemini)

A fast-paced, momentum-based multiplayer arena game built with Node.js, Socket.io, and HTML5 Canvas.  
Knock your opponents out of a shrinking arena to be the last one standing!

---

## 🎮 Game Features

- **Realistic Physics**  
  Momentum-based movement with friction, recoil, and elastic collisions.

- **Dynamic Maps**  
  5 unique environments including Neon Void, Lava Pit, and Galactic Core.

- **Shrinking Arena**  
  The play area constricts over time, forcing intense close-quarters combat.

- **Dash Mechanic**  
  High-speed dash with built-in cooldowns for strategic positioning.

- **Lobby System**  
  Host private rooms, share 5-letter codes, and customize match settings.

- **Atmospheric Audio**  
  Immersive background music and punchy hit effects.

---

## 🛠️ Tech Stack

**Frontend**
- HTML5 Canvas  
- Vanilla JavaScript (ES6+)  
- CSS3  

**Backend**
- Node.js  
- Express  

**Networking**
- Socket.io (WebSockets for real-time state synchronization)

---

## 🚀 Installation & Setup

### Clone the repository
```bash
git clone https://github.com/Cinarss/time-arena.git
cd arena-io
Install dependencies
npm install
Add audio assets
Place your .mp3 files in the public/ folder:

bgm.mp3 — Background Music

hit.mp3 — Collision SFX

dash.mp3 — Dash SFX

Run the server
npm start
Server runs at: http://localhost:3000

🕹️ Controls
Key	Action
W / A / S / D	Move
SPACE	Dash
ENTER	Send Chat (optional)
📁 Project Structure
├── public/
│   ├── client.js      # Game rendering and client-side logic
│   ├── index.html     # Game UI and entry point
│   ├── bgm.mp3        # Audio assets
│   └── ...
├── server.js          # Node.js server and physics engine
├── package.json       # Project dependencies
└── README.md          # Documentation
🛡️ License
Distributed under the MIT License. See LICENSE for more information.

👤 Author
Developed by Cinarss


If you want, I can also:
- Add badges (Node, Socket.io, MIT)
- Add a **demo GIF** section
- Make it look 🔥 on GitHub Explore

Just say the word 🚀