// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import appServer from "@coup/server/src/index.js";
import { App } from "../src/App.js";

// Must match VITE_SERVER_URL in vitest.config.ts, which is what the app reads.
const PORT = 2596;

beforeAll(async () => await appServer.listen(PORT));
afterAll(async () => await appServer.gracefullyShutdown(false));
afterEach(() => cleanup());

/** Renders the whole app as a player would see it, in its own DOM container. */
function open() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = render(<App />, { container });
  return { ...view, ui: within(container), user: userEvent.setup({ document }) };
}

async function hostGame(name: string) {
  const app = open();
  await app.user.type(app.ui.getByLabelText("Your name"), name);
  await app.user.click(app.ui.getByRole("button", { name: "Host a game" }));

  const chip = await app.ui.findByText(/^[A-Z2-9]{5}$/, {}, { timeout: 5000 });
  return { app, code: chip.textContent! };
}

async function joinGame(code: string, name: string) {
  const app = open();
  await app.user.type(app.ui.getByLabelText("Your name"), name);
  await app.user.type(app.ui.getByLabelText("Or join with a code"), code);
  await app.user.click(app.ui.getByRole("button", { name: "Join" }));
  return app;
}

describe("the app against a live backend", () => {
  test("the landing screen asks for a name before doing anything", () => {
    const app = open();

    expect(app.ui.getByRole("heading", { name: "Coup" })).toBeTruthy();
    expect(app.ui.getByRole("button", { name: "Host a game" })).toHaveProperty("disabled", true);
  });

  test("hosting reaches the waiting room and shows a shareable code", async () => {
    const { app, code } = await hostGame("Alice");

    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(app.ui.getByRole("heading", { name: "Waiting room" })).toBeTruthy();
    expect(app.ui.getByText("Alice")).toBeTruthy();
  });

  test("a wrong code shows a readable error instead of failing silently", async () => {
    const app = await joinGame("ZZZZZ", "Bob");

    expect(await app.ui.findByText("No game with that code.", {}, { timeout: 5000 })).toBeTruthy();
  });

  test("a second player joining appears in the host's waiting room", async () => {
    const { app: host, code } = await hostGame("Alice");

    const guest = await joinGame(code, "Bob");

    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    expect(await guest.ui.findByRole("heading", { name: "Waiting room" })).toBeTruthy();
    // Only the host may start.
    expect(guest.ui.getByRole("button", { name: "Waiting for host" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  test("the host starts the game and both players reach the board", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });

    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));

    // The board shows each player's coins, and each client sees its own two cards.
    for (const app of [host, guest]) {
      await waitFor(() => expect(app.ui.getAllByText("2 coins")).toHaveLength(2), { timeout: 5000 });
      expect(app.ui.getByText("Your influence")).toBeTruthy();
      expect(app.ui.getByText("Log")).toBeTruthy();
    }
  });

  test("only the player on turn is offered actions", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });

    const onTurn = host.ui.queryByText("Your turn — choose an action") ? host : guest;
    const waiting = onTurn === host ? guest : host;

    expect(onTurn.ui.getByRole("button", { name: /Income/ })).toBeTruthy();
    expect(waiting.ui.queryByRole("button", { name: /Income/ })).toBeNull();
    expect(waiting.ui.getByText(/Waiting for/)).toBeTruthy();
  });

  test("taking income updates coins and the log for both players", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });

    const onTurn = host.ui.queryByText("Your turn — choose an action") ? host : guest;
    await onTurn.user.click(onTurn.ui.getByRole("button", { name: /Income/ }));

    await waitFor(() => expect(host.ui.getByText("3 coins")).toBeTruthy(), { timeout: 5000 });
    // The log records both the declaration and its resolution.
    expect(host.ui.getAllByText(/Income/).length).toBeGreaterThan(0);
    await waitFor(() => expect(guest.ui.getByText("3 coins")).toBeTruthy(), { timeout: 5000 });
  });

  test("a character action opens a challenge window for the other player", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });

    const onTurn = host.ui.queryByText("Your turn — choose an action") ? host : guest;
    const other = onTurn === host ? guest : host;
    await onTurn.user.click(onTurn.ui.getByRole("button", { name: /^Tax/ }));

    expect(
      await other.ui.findByRole("button", { name: "Challenge" }, { timeout: 5000 }),
    ).toBeTruthy();
    expect(other.ui.getByText(/claims Duke to Tax/)).toBeTruthy();

    await other.user.click(other.ui.getByRole("button", { name: "Pass" }));
    await waitFor(() => expect(onTurn.ui.getByText("5 coins")).toBeTruthy(), { timeout: 5000 });
  });
});

describe("the cards and the reference", () => {
  const startedGame = async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });
    return { host, guest };
  };

  test("your own influence is shown as named character cards", async () => {
    const { host } = await startedGame();

    const cards = host.ui.getAllByRole("button", { name: /What it does/ });

    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.textContent).toMatch(/Duke|Assassin|Captain|Ambassador|Contessa/);
    }
  });

  test("each card is tinted by its character", async () => {
    const { host } = await startedGame();

    const cards = host.ui.getAllByRole("button", { name: /What it does/ });

    for (const card of cards) {
      expect(card.className).toMatch(/card-(duke|assassin|captain|ambassador|contessa)/);
    }
  });

  test("tapping one of your cards opens the actions reference", async () => {
    const { host } = await startedGame();

    await host.user.click(host.ui.getAllByRole("button", { name: /What it does/ })[0]!);

    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dialog).getByRole("heading", { name: "Actions" })).toBeTruthy();
  });

  test("the reference is a grid of every action, not a list of characters", async () => {
    const { host } = await startedGame();

    await host.user.click(host.ui.getByRole("button", { name: "Actions" }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });

    for (const heading of ["Action", "Effect", "Cost", "Blocked by"]) {
      expect(within(dialog).getByText(heading)).toBeTruthy();
    }
    for (const action of ["Income", "Foreign Aid", "Coup", "Tax", "Assassinate", "Steal", "Exchange"]) {
      expect(within(dialog).getAllByText(action).length).toBeGreaterThan(0);
    }
  });

  test("each row carries its cost and what blocks it, from the rules table", async () => {
    const { host } = await startedGame();

    await host.user.click(host.ui.getByRole("button", { name: "Actions" }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });

    expect(within(dialog).getByText("7 coins")).toBeTruthy();
    expect(within(dialog).getByText("3 coins")).toBeTruthy();
    expect(within(dialog).getByText("Take 3 coins")).toBeTruthy();
    expect(within(dialog).getByText("Ambassador, Captain")).toBeTruthy();
  });

  test("counteractions are listed per character", async () => {
    const { host } = await startedGame();

    await host.user.click(host.ui.getByRole("button", { name: "Actions" }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });

    expect(within(dialog).getByText("Counteractions")).toBeTruthy();
    // Contessa appears twice: as what blocks Assassinate, and as a counteraction.
    expect(within(dialog).getAllByText("Contessa").length).toBeGreaterThanOrEqual(2);
    // The four blocking characters, and only those, get a counteraction row.
    for (const card of ["Duke", "Captain", "Ambassador", "Contessa"]) {
      expect(within(dialog).getAllByText(card).length).toBeGreaterThan(0);
    }
  });

  test("the reference is reachable from the lobby too", async () => {
    const { app } = await hostGame("Alice");

    await app.user.click(app.ui.getByRole("button", { name: "Actions" }));

    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dialog).getByRole("heading", { name: "Actions" })).toBeTruthy();
  });

  test("the reference closes again", async () => {
    const { app } = await hostGame("Alice");
    await app.user.click(app.ui.getByRole("button", { name: "Actions" }));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });

    await app.user.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 3000 });
  });
});

describe("whose turn it is", () => {
  test("is shown by highlighting the seat, with no label", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });

    expect(host.ui.queryByText("Their turn")).toBeNull();
    expect(host.container.querySelectorAll(".seat.active")).toHaveLength(1);
    void guest;
  });
});

describe("the lobby timer setting", () => {
  test("None is shown as selected by default", async () => {
    const { app } = await hostGame("Alice");

    const none = app.ui.getByRole("button", { name: "None" });

    expect(none.className).toContain("primary");
  });

  test("choosing a length moves the highlight, and back again", async () => {
    const { app } = await hostGame("Alice");

    await app.user.click(app.ui.getByRole("button", { name: "30s" }));
    await waitFor(
      () => expect(app.ui.getByRole("button", { name: "30s" }).className).toContain("primary"),
      { timeout: 3000 },
    );
    expect(app.ui.getByRole("button", { name: "None" }).className).not.toContain("primary");

    await app.user.click(app.ui.getByRole("button", { name: "None" }));

    await waitFor(
      () => expect(app.ui.getByRole("button", { name: "None" }).className).toContain("primary"),
      { timeout: 3000 },
    );
    expect(app.ui.getByRole("button", { name: "30s" }).className).not.toContain("primary");
  });
});

describe("navigation buttons", () => {
  test("Back is styled apart from the player names beside it", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });

    const onTurn = host.ui.queryByText("Your turn — choose an action") ? host : guest;
    await onTurn.user.click(onTurn.ui.getByRole("button", { name: /^Steal/ }));

    const back = await onTurn.ui.findByRole("button", { name: "Back" }, { timeout: 3000 });
    const name = onTurn.ui.getByRole("button", { name: onTurn === host ? "Bob" : "Alice" });

    expect(back.className).toContain("secondary");
    expect(name.className).not.toContain("secondary");
  });

  test("Pass is styled apart from Challenge", async () => {
    const { app: host, code } = await hostGame("Alice");
    const guest = await joinGame(code, "Bob");
    await waitFor(() => expect(host.ui.getByText("Bob")).toBeTruthy(), { timeout: 5000 });
    await host.user.click(host.ui.getByRole("button", { name: "Start game" }));
    await waitFor(() => expect(host.ui.getByText("Your influence")).toBeTruthy(), { timeout: 5000 });

    const onTurn = host.ui.queryByText("Your turn — choose an action") ? host : guest;
    const other = onTurn === host ? guest : host;
    await onTurn.user.click(onTurn.ui.getByRole("button", { name: /^Tax/ }));

    const pass = await other.ui.findByRole("button", { name: "Pass" }, { timeout: 3000 });
    expect(pass.className).toContain("secondary");
    expect(other.ui.getByRole("button", { name: "Challenge" }).className).not.toContain("secondary");
  });
});
