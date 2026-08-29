# Coup

A browser implementation of the card game Coup, for private lobbies of 2–6 players.
The server is authoritative: it holds every hand, validates every move, and never
sends a player's hidden cards to anyone else.

## Layout

```
shared/   types and rules shared by both sides (cards, actions, legality, protocol)
server/   Colyseus game server — rules engine plus the room
client/   React + Vite frontend
```

`shared/` is the single source of truth for the wire contract. Action legality lives
there too, so the buttons a player sees are computed by the same code that validates
what they click.

## Running locally

```bash
npm install
npm run dev:server     # ws://localhost:2567
npm run dev:client     # http://localhost:5173
```

The client reads its backend URL from `VITE_SERVER_URL` and falls back to
`ws://localhost:2567`. See `client/.env.example`.

## Tests

```bash
npm test         # engine, room, and UI — all of it
npm run typecheck
```

The suite covers the rules engine exhaustively, the Colyseus room against a real
server, and the React UI driven end-to-end against a live backend. Two tests exist
specifically to prove hidden cards never leak: one inspects the projected state
directly, the other checks what a second client actually receives over the wire.

## House rules

The official rules are encoded as written. Where they are ambiguous or silent, these
choices were made deliberately:

- Turn order is **randomised** at the start of each game.
- A failed challenge does **not** refund coins already paid (e.g. a bluffed Assassinate still costs 3).
- Response order is **challenge first, then block** — the action's claim is settled before the target may block.
- A player holding **0 coins is not a valid Steal target**.
- Eliminated players stay and watch; nobody may join a game already in progress.
- Block and challenge windows have **no timer by default**. The host may set 15s, 30s, or 60s in the lobby; with no timer, a window stays open until every eligible player passes.
- A disconnected player is **auto-passed** out of response windows, **skipped** when their turn comes round, and has any card choice taken for them. They keep their seat and cards, and resume play on reconnecting.
- A game needs two connected players. Once only one is left, it ends and is awarded to them — so in a two-player game, one person dropping ends it.
- The host can still forfeit a disconnected player (surrendering both influence) to remove them from a larger game.

## Abuse limits

The server is open to the internet with no accounts, so a few caps stop one client
exhausting the host. None of them protect hidden information — that is enforced by
the rules engine and the state projection, not by these.

- **10 room creations per address per minute.**
- **60 connections per address per minute** — a household shares one address and
  reconnects on every refresh, so this sits well above real play.
- **100 open rooms** across the server at once.

Addresses come from `AuthContext.ip`, which resolves proxy headers, so these work
behind Render's load balancer rather than seeing a single upstream address.

## Deploying

Two separate deployments.

**Backend → Render.** `render.yaml` is checked in; point Render at this repo and it
builds `npm run build:server` and starts `npm run start`. The free tier sleeps after
15 minutes of inactivity, so the first player to connect after a quiet spell waits
roughly 30–60s for it to wake.

**Frontend → Vercel.** `vercel.json` is checked in at the repo root; leave the Root
Directory as the repo root so the shared package builds too. Set `VITE_SERVER_URL` to
the Render service's URL with a `wss://` scheme — it is baked in at build time, so
changing it needs a redeploy.
