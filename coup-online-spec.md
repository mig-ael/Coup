# Online Coup — Build Spec

Purpose of this document: a complete technical + design spec for a browser-based, private-lobby
implementation of the card game **Coup**. It is written to be pasted directly to a coding
assistant/model as the brief for building the project. It covers the lobby system, the exact game
rules to encode, the backend/frontend split, data contracts, hosting, and a phased build order.

---

## 1. Project Overview

A website where:

1. A player opens the site, enters a display name, and either **hosts** a new private lobby
   (gets a short room code) or **joins** an existing one by entering that code.
2. Once 2–6 players are in the lobby, the host starts the game.
3. The server deals hidden character cards and runs a full, rules-accurate game of Coup:
   income/tax/aid/steal/assassinate/coup/exchange actions, bluffing, challenges, and blocking —
   exactly as the physical card game works, turn by turn, until one player remains.
4. UI does not need to be visually polished — clear, unambiguous state (whose turn, what's
   happening, what I can do right now) matters more than styling.

Player count: support 2–6 (3–6 is the "standard" experience; 2-player has a couple of edge cases
noted in section 5.7 — flag these as a decision point rather than guessing house rules).

---

## 2. Recommended Tech Stack

**Backend / real-time game server:** Node.js + [Colyseus](https://docs.colyseus.io/). Colyseus is
a room-based multiplayer framework that gives you, out of the box: authoritative rooms with
server-held state, automatic state-diff sync to clients over WebSockets, a `private` flag on
rooms (rooms not listed publicly, joined only by ID/code — exactly the lobby-code pattern this
project needs), and reconnection support. This avoids hand-rolling state sync and room bookkeeping
on top of raw `socket.io`.

**Frontend:** Plain React (Vite) is a good default — no need for anything heavier. A single-page
app with a small number of screens (see section 8). Any styling approach is fine; this project
does not need a design system, just clear layout.

**Hosting (free tier reality, current as of writing):**
- Frontend (static React build) → Vercel, Netlify, or Cloudflare Pages. Free and effectively
  unlimited for a project like this.
- Backend (Colyseus/Node WebSocket server) → Render's free Web Service tier. It supports
  WebSockets, but note two real constraints: it **spins down after 15 minutes of inactivity**
  (first player to connect after a nap waits ~30–60s for it to wake up), and it's capped around
  **750 instance-hours/month** (plenty for a project used intermittently by a friend group).
  Railway's free tier is credit-based (~$1/month) and won't sustain always-on hosting. Fly.io no
  longer offers a free tier to new accounts. If the sleep delay becomes annoying, a $5–7/mo paid
  tier on Render removes it — no code changes required.
- These are two separate deployments (frontend static host + backend Node host) talking to each
  other over HTTPS/WSS; the frontend needs the backend's public URL set as an environment
  variable at build time.

---

## 3. High-Level Architecture

```
Browser (React)  <--WebSocket-->  Colyseus server (Node)
     |                                    |
     |  join lobby / send action intents  |  authoritative game state,
     |  render state pushed from server   |  validates every move,
     |                                    |  broadcasts state diffs
```

Golden rule: **the server is the only source of truth.** The client never decides whether a move
is legal, never reveals another player's cards, and never resolves a challenge locally. Clients
send *intents* ("I choose Tax", "I challenge Player B's claim", "I block with Contessa"); the
server validates, resolves, mutates state, and broadcasts the result. This matters even for a
casual game — otherwise players can trivially cheat via browser devtools, and desyncs are
inevitable.

---

## 4. Lobby System

### 4.1 Flow

1. **Landing screen**: text field for display name, two buttons — "Host Game" and "Join Game".
2. **Host Game**: server creates a new private Colyseus room, generates a short human-friendly
   code (e.g. 5 characters, uppercase letters + digits, excluding ambiguous characters like `0/O`,
   `1/I`), returns it to the host. Host is placed in the room's waiting state.
3. **Join Game**: player enters the code (plus their name), client calls `joinById(roomId)` (or a
   custom matchmaking method that maps code → room id) against the server. Reject with a clear
   error if the code doesn't exist, the room is full, or the game has already started.
4. **Waiting room**: shows the room code prominently (for sharing), the list of connected players
   in join order, and a "Start Game" button visible only to the host, disabled until 2+ players
   have joined. Players can leave and rejoin (same code) before the game starts.
5. **Start Game**: host triggers it; server validates player count (2–6), shuffles the deck,
   deals 2 cards + 2 coins to each player, sets the turn order (e.g. join order, or randomized —
   pick one and note it), and transitions the room from `lobby` phase to `playing` phase.

### 4.2 Naming & identity

- Names are per-session, not accounts — no login system needed for v1.
- Enforce a max name length and basic sanitization (strip empty/whitespace-only names, cap length,
  strip anything that would break the UI). Two players with the same display name is fine — the
  server distinguishes players by a generated session/player ID, not by name.
- Store a reconnection token (e.g. in the client, tied to a server-issued player ID) so someone
  who refreshes the page or briefly loses connection can rejoin the same seat mid-game rather than
  being treated as a new player. Colyseus has built-in reconnection support (`allowReconnection`)
  — use it.

### 4.3 Room codes vs Colyseus room IDs

Colyseus rooms already have an internal room ID; you can either (a) use that ID directly as the
"lobby code" shown to players (make it short by configuring room ID generation), or (b) generate
your own short code server-side and keep a lookup table (code → Colyseus room ID) in the lobby/
matchmaking logic. Approach (b) gives you full control over code format (e.g. always 5 characters)
and is the more common pattern — recommend it.

---

## 5. Game Rules to Encode (Coup — verified against official rules)

This section is the authoritative rules reference for the server-side game logic. Encode it
exactly; do not "improve" or house-rule any of it without flagging the change to the user first.

### 5.1 Components

- 15 character cards: 3 each of **Duke**, **Assassin**, **Captain**, **Ambassador**, **Contessa**.
- A treasury of coins (effectively unlimited for a digital version — just track an integer).

### 5.2 Setup

- Shuffle all 15 character cards into a face-down **Court deck**.
- Deal 2 cards to each player, face-down and secret to that player only (this is their
  "influence" — server-side state must never send another player's face-down cards to a client).
- Remaining cards stay in the Court deck, used later for Exchange and card replacement.
- Each player starts with **2 coins**.
- Determine turn order (see 4.1) and begin with the first player's turn.

### 5.3 Actions (one per turn, in turn order)

**General actions** (always available, no character claim needed, cannot be challenged):
- **Income** — take 1 coin from the treasury. Cannot be blocked.
- **Foreign Aid** — take 2 coins from the treasury. **Can be blocked by a Duke claim.**
- **Coup** — pay 7 coins, name a target player, that player immediately loses one influence
  (chooses which card to reveal/lose). Always succeeds — cannot be blocked or challenged. **If a
  player has 10 or more coins at the start of their turn, they must Coup** (no other action is
  legal that turn).

**Character actions** (require claiming the character; any player may challenge the claim):
- **Tax (Duke)** — take 3 coins from the treasury.
- **Assassinate (Assassin)** — pay 3 coins, name a target; if unblocked/unchallenged-successfully,
  target loses one influence. **Can be blocked by a Contessa claim** (from the target only).
- **Steal (Captain)** — take 2 coins from a target player (or all of their coins if they have only
  1). **Can be blocked by an Ambassador or Captain claim** (from the target only).
- **Exchange (Ambassador)** — draw 2 cards from the Court deck, look at them together with your
  current face-down card(s), choose which to keep (same number you had before the exchange),
  return the rest to the Court deck, then shuffle the Court deck.

### 5.4 Challenges

Any character claim — an action *or* a block — can be challenged by any other player (typically
only relevant players bother, but rules-as-written allow anyone to challenge). Resolution:

1. Challenged player must immediately reveal one of their face-down cards.
2. **If the revealed card matches the claimed character:** the challenger loses one influence
   (their choice which card). The revealed card is then shuffled back into the Court deck and the
   challenged player draws a random replacement card from the deck (so they don't lose the
   character they proved they had). The original action/block then proceeds as claimed.
3. **If the revealed card does not match:** the claim was a bluff. The challenged player loses
   that influence permanently (the revealed card is discarded/out of the game — the exact rules
   text says "loses influence"; the standard implementation removes the revealed card from play).
   The action/block fails: if it was an action, it does not happen (but note: costs already paid,
   e.g. the 3 coins for an Assassinate attempt, are typically NOT refunded — confirm this against
   the rules text you're implementing, as some summaries differ; the safer default matching most
   rules text is costs are not refunded on a failed challenge of the *actor's* claim, but a
   successfully-challenged *block* simply lets the original action proceed).

### 5.5 Losing influence

- Whenever a player must lose an influence (from Coup, a successful Assassinate, or losing a
  challenge), they choose which of their face-down cards to reveal (if they have more than one).
- Revealed/lost cards are placed face-up in front of the player — visible to everyone from then
  on — and no longer count as that player's active influence.
- A player who has lost both influence cards is **eliminated** — out of the game, out of turn
  order, their remaining coins irrelevant.

### 5.6 Win condition

Last player with at least one influence card remaining wins.

### 5.7 Player-count edge cases to decide before launch

- **2-player games**: some published rulesets note the Ambassador and Duke are weaker/stronger
  balance-wise with only 2 players and occasionally suggest variant coin counts; the base rules
  above work as written for 2 players, but flag this as something to playtest rather than assume
  a house rule.
- Decide and document: is turn order fixed at join order, or randomized at game start? (Either is
  fine — just be consistent and tell players.)

### 5.8 Turn resolution order (state machine)

This is the sequence the server should run for every action, and is the core of the backend game
loop:

1. **Declare** — active player picks an action (and a target, if the action needs one). Server
   validates it's legal (enough coins, valid target, must-Coup rule if ≥10 coins, etc.).
2. **Block window** (only for blockable actions: Foreign Aid, Assassinate, Steal) — the
   relevant player(s) (for Assassinate/Steal, only the target; for Foreign Aid, any player) may
   claim a blocking character within a time limit. If nobody blocks, skip to step 4.
3. **Challenge window** — after a declare (for character actions) or after a block is claimed, any
   other player may challenge that specific claim within a time limit. Resolve per section 5.4.
   A challenge can itself only target the most recent claim (the action's claim, or the block's
   claim) — resolve one challenge at a time before allowing another.
4. **Resolve** — apply the net effect: action succeeds, is blocked, or is negated by a lost
   challenge, per the rules above.
5. **Advance turn** — move to the next non-eliminated player in turn order. Check win condition
   after every influence loss, not just at end of turn.

Use short server-enforced timers (e.g. 10–15 seconds) for block/challenge windows so the game
doesn't stall forever waiting on an AFK player — auto-pass if the timer expires.

---

## 6. Server-Side Data Model

Suggested shape (adapt to Colyseus Schema types):

```
Room (lobby + game state)
  code: string                 // short join code
  phase: "lobby" | "playing" | "gameover"
  players: Player[]
  turnOrder: string[]          // player IDs
  currentTurnIndex: number
  courtDeck: Card[]            // server-only, never sent to clients directly
  treasuryIsUnlimited: true    // or track if you want a finite pool
  pendingAction: PendingAction | null   // the action currently in block/challenge windows
  actionLog: LogEntry[]        // public history: "Alice claimed Duke to Tax", "Bob challenged", ...
  winnerId: string | null

Player
  id: string
  name: string
  connected: boolean
  coins: number
  influence: Card[]            // PRIVATE — only sent to that player's own client
  revealedCards: Card[]        // PUBLIC — visible to everyone
  eliminated: boolean

Card = "Duke" | "Assassin" | "Captain" | "Ambassador" | "Contessa"

PendingAction
  actorId: string
  action: ActionType
  targetId: string | null
  claimedCharacter: Card | null
  blockedBy: { playerId, claimedCharacter } | null
  challenge: { challengerId, resolved: bool } | null
  deadlineTimestamp: number
```

**Critical privacy rule:** a player's `influence` array must only ever be serialized/sent to that
player's own client connection. Every other client should see only that player's influence
*count* (2, 1, or 0/eliminated), never the actual cards, until they're revealed. If using Colyseus
Schema, this typically means either per-client filtered views or a custom `onStateChange` that
strips hidden data — check current Colyseus docs for the recommended pattern (filtered schema /
`@filter` or manual per-client messages), since this is easy to get wrong and leak information.

---

## 7. Client ↔ Server Message Contract

Client → server (intents):
- `createRoom({ name })` → returns `{ roomId, code }`
- `joinRoom({ code, name })` → joins existing lobby
- `startGame()` (host only)
- `declareAction({ action, targetId? })`
- `declareBlock({ claimedCharacter })`
- `declareChallenge()`
- `chooseCardsToLose({ cardIndex })` (when resolving lost influence)
- `chooseExchangeCards({ keepIndices })` (resolving Ambassador exchange)
- `passWindow()` (explicitly decline to block/challenge, or let the timer do it)

Server → clients (broadcasts / state sync):
- Full room state on join (filtered per-player as above).
- Incremental state updates as Colyseus handles automatically via Schema.
- `actionLog` entries for every public event (for the game log / activity feed in the UI).
- Explicit prompts to a specific client when it's their turn to respond: "you have 15s to block
  or challenge Bob's Foreign Aid", "choose which card to lose", "choose which 2 cards to return to
  the deck".

---

## 8. Frontend Screens

1. **Landing** — name entry, Host / Join buttons.
2. **Join** — code entry field, error state for invalid/full/started room.
3. **Lobby / Waiting Room** — room code (large, copyable), player list, Start button (host only).
4. **Game Board** — the main screen, needs to clearly show at all times:
   - Every player: name, coin count, number of remaining influence (face-down count) + any
     face-up revealed cards, whose turn it is, connection status.
   - Your own two (or fewer) face-down cards, visible only to you.
   - The current action/prompt: either "it's your turn, choose an action" (with legal actions as
     buttons, disabled ones explained, e.g. "Coup — need 7 coins"), or "waiting on Alice's turn",
     or an active prompt like "Bob claimed Duke to block your Foreign Aid — Challenge or Accept?"
     with a visible countdown timer.
   - A scrolling action log/history panel.
5. **Influence-loss modal** — when you must choose which card to reveal, and when resolving an
   Ambassador exchange (choose which cards to keep from the 2 drawn + your current hand).
6. **Game Over** — winner announcement, final reveal of eliminated players' last cards (optional),
   "Return to lobby" / "Play again" option.

No requirement for animations, avatars, or custom art — clear labeling and unambiguous state is
the actual requirement.

---

## 9. Non-Functional Requirements

- **Reconnection**: a page refresh or brief network drop mid-game should not eliminate a player.
  Use Colyseus's reconnection token flow; on reconnect, resend that client's filtered state
  (their own cards, current public state, any prompt awaiting their response).
- **Disconnect/AFK handling**: decide a policy (e.g. auto-pass their block/challenge windows while
  disconnected; if disconnected during their own turn past some grace period, auto-Income or skip
  their turn) and document it — don't leave the game silently stuck.
- **Server-side validation on everything**: never trust a client-declared action, target, or card
  choice without checking it's legal given current state.
- **No plaintext secrets in client-visible state**: covered in section 6, worth re-stating as a
  test case — write a test/manual check that inspects what a browser's network tab actually
  receives and confirms opponents' hidden cards never appear.

---

## 10. Suggested Repo Structure

```
/server
  /src
    rooms/GameRoom.ts        // Colyseus room: lobby + game logic
    state/schema.ts          // Player, Room, Card schema definitions
    game/rules.ts            // pure functions: legal actions, resolve challenge, etc.
    game/turnMachine.ts       // the declare/block/challenge/resolve state machine
    index.ts                 // Colyseus server bootstrap
  package.json
/client
  /src
    screens/Landing.tsx
    screens/Lobby.tsx
    screens/GameBoard.tsx
    screens/GameOver.tsx
    components/PlayerCard.tsx
    components/ActionLog.tsx
    components/InfluenceModal.tsx
    net/colyseusClient.ts
  package.json
```

Keep pure game-rule logic (`game/rules.ts`) separate from Colyseus-specific room code — makes it
independently testable (this is the highest-value place for unit tests: legal-action checks,
challenge resolution, win condition).

---

## 11. Build Order / Milestones

1. **Lobby only** — host/join by code, waiting room, player list, name entry. No game logic yet.
   Deploy this first end-to-end (frontend + backend on their real hosts) to prove the
   infrastructure works before building game complexity on top of it.
2. **Deal + basic turn loop** — deal cards, coins, turn order; implement Income, Foreign Aid
   (unblockable version), Coup — the actions with no challenge/block complexity — to get a
   playable-if-simplified loop working.
3. **Character actions + blocking** — add Tax, Assassinate, Steal, Exchange, and the block windows
   (still no challenges — blocks just work if claimed).
4. **Challenges** — the full declare → block → challenge → resolve state machine from section 5.8,
   including card replacement on a failed challenge.
5. **Reconnection, disconnect handling, timers, polish** — sections 9's non-functional list, plus
   the action log and game-over screen.
6. **Deploy for real use** — confirm Render free-tier backend + static frontend host both work
   together over WSS in production (not just localhost), fix any CORS/WebSocket config issues.

---

## 12. Open Decisions for the User (fill in before/while prompting a coding model)

- Turn order: join order, or randomized at start?
- Exact block/challenge timer length.
- What happens on a failed-challenge action's paid cost (see the note in 5.4) — confirm against
  whichever rules text you want to be authoritative.
- Max players (recommend 6, matching physical box) and minimum (recommend 2, with 5.7's caveat).
- Whether spectators (people who join after a game has started, or after being eliminated) can
  watch, or should just be disconnected from the room.
