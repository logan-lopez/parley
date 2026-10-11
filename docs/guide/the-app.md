# The app

Parley is a menu bar app with one floating window. It stays out of the way: a new question
announces itself, and you open the window when you're ready.

**Covers:** [The desktop shell](../architecture/desktop-shell.md), [Asks and history](../architecture/asks-and-history.md), [The card](../architecture/card-ui.md)

## Starting it

Open `~/Applications/Parley.app`, or don't: the first time an agent asks something, its server
launches the app for you. It runs once, however many agents are asking; a second copy sees the
first and quits. To start it at login, add it under System Settings → General → Login Items.

## The tray

Parley's icon sits in the menu bar, with a number beside it while questions are waiting. Click it
to show or hide the window. Its menu has **Show Parley** and **Quit**, and Quit is the only way to
stop the app: the window's close button only hides it.

## Notifications

A new question sends a system notification titled with who's asking (`claude-code · parley`: the
client and the project folder), with the form's title as the body. The window doesn't open on its
own, and nothing takes your focus. There's no notification if the window is already up and in
front, or for a question that's also showing inline in Claude Desktop's chat.

Clicking a notification doesn't open the window; use the hotkey or the tray. The first launch asks
for notification permission.

## The window

**Cmd+Ctrl+P** shows or hides the window from anywhere. It opens on the oldest waiting question,
on top of other windows, where you last left it and at the size you last gave it.

On macOS the window is a panel that takes your typing without making Parley the active app. The
app you were in stays active, so under AeroSpace the window shows on the workspace you're on
instead of pulling you back to wherever it was last. While it's up it floats over every workspace
as you switch. Esc hides it, and your typing goes straight back to the app you were in.

Parley has no Dock icon and isn't in Cmd+Tab: the hotkey and the tray are the ways in.

With nothing waiting, the window says so, with a button for [history](history.md).

## Zoom

**Cmd+=** and **Cmd+-** zoom the window between 80% and 150%. The control in the card's top row
does the same, and clicking its percentage resets it to the default, 110%. Parley remembers the
zoom across launches. (Cmd+0 is AeroSpace's, so there's no reset key.)

## What it doesn't do yet

- Only macOS.
- No way in from a notification click.
- Agents on another machine or in the cloud can't reach it: the server has to run on this Mac.
