# Wand Ops

A multiplayer wizard first-person shooter that runs in the browser. Cast elemental spells at other players (and AI bots) in a castle arena.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). Multiplayer uses [Photon Realtime](https://www.photonengine.com/), and sign-in and saved stats use [Firebase](https://firebase.google.com/). It deploys to [Vercel](https://vercel.com/).

![Wand Ops gameplay](docs/gameplay.png)

[▶ Watch the gameplay demo (mp4)](docs/demo.mp4)

## Features

- **Quick Match arena**: a castle with walls, towers, stairs, ladders, ramps, a fountain and ruins to climb and jump on.
- **Five spells**, each with its own effect:

  | Spell | Effect |
  | --- | --- |
  | 🔥 Fire | Burns for 5 damage a second for 3s |
  | ❄️ Ice | Slows the target by 70% for 3s |
  | ⚡ Lightning | Silences the target (no casting) for 2s |
  | 💨 Air | Knocks the target back |
  | 🪨 Earth | Grounds the target (no jumping) for 3s |

- **Bots** fill the lobby to three combatants: 1 human gets 2 bots, 2 humans get 1 bot, and 3 or more humans get none. The lowest-numbered human runs the bots and everyone else mirrors them.
- **Coins and skins**: every kill earns a coin and daily quests pay more. Spend coins on skins.
- **Accounts**: sign in with Google to keep coins and lifetime stats across devices.
- **Scoreboard, kill feed and chat.**

![Wand Ops lobby](docs/lobby.png)

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look around |
| Left click | Cast your spell |
| Right click (hold) | Aim down the scope |
| Space | Jump |
| Tab (hold) | Scoreboard |
| Esc | Back to the menu |

## Getting started

Requires Node.js and npm.

```bash
npm install
cp .env.example .env.local
# fill in the values in .env.local (see below)
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

### Environment variables

Set these in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `VITE_PHOTON_APP_ID` | Photon Realtime app ID for multiplayer |
| `VITE_FIREBASE_API_KEY` | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_APP_ID` | Firebase web config |

Get the Photon app ID from the Photon dashboard. The Firebase values come from your Firebase project settings, which also needs Google sign-in enabled.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Serve the production build locally |

## Project structure

```
index.html            Lobby UI and game container
public/styles.css     Styles
src/
  main.js             Game loop, match logic, bots, quests and shop
  scene.js            Arena, lighting and colliders
  player.js           Wizard model, movement state and effects
  controls.js         Keyboard and pointer-lock mouse input
  fireball.js         Spell projectiles and collisions
  bot.js              Bot AI
  network.js          Photon networking
  ui.js               HUD, kill feed and scoreboard
  lib/
    firebase.js       Firebase and Google auth setup
    lifetime-stats.js Persistent stats and coins
```

## Deployment

The project is configured for Vercel (`vercel.json`): it runs `npm run build` and serves `dist/`. Add the same `VITE_*` environment variables in your Vercel project settings.
