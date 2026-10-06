# Always-on Mac

Turn a spare Mac into a machine that never sleeps, that you can reach from anywhere, and that runs Claude for you: your own sessions through **Remote Control** (from your phone or claude.ai), and the **agent loop** working your tickets around the clock.

Work through the sections in order. Commands run in Terminal on the always-on Mac unless said otherwise.

## 1. Keep it awake

**Power settings** (the Mac must stay on its charger):

```bash
sudo pmset -c sleep 0 disksleep 0 displaysleep 10 powernap 0 womp 1 tcpkeepalive 1 autorestart 1
pmset -g    # check: sleep 0, autorestart 1
```

- `sleep 0` never sleeps on the charger; `displaysleep 10` still turns the screen off.
- `womp 1` wakes it for network access; `autorestart 1` boots it again after a power cut.

Also, in **System Settings**:

- **Lock Screen**: "Turn display off when inactive" is fine; **"Require password after screen saver begins"** can stay on, it doesn't stop the Mac.
- **General → Software Update → Automatic updates**: turn off "Install macOS updates" so it doesn't reboot on its own; update by hand.

**The lid**: keep it **open** (screen off is fine). Closed-lid mode needs an external display, keyboard and power, otherwise the Mac sleeps.

**The battery**: an old MacBook that's always plugged in should limit its charge. Turn on **Battery → Optimized Battery Charging** (Intel: **Battery Health → Manage battery longevity**), keep it ventilated, and check the battery now and then for swelling.

**After a power cut**: with FileVault on, the Mac boots to a password prompt and nothing runs until someone types it. Either accept that (most secure; you'll need to be there), or turn FileVault off and turn on **automatic login** for this Mac's user (**Users & Groups → Automatically log in as**), so everything restarts by itself. Decide knowingly: automatic login means anyone with the Mac in hand is logged in.

## 2. Reach it from anywhere

1. **Tailscale** gives the Mac a private address you can reach from your laptop and phone, at home or not, without opening your router. Install it from https://tailscale.com/download on the Mac and on your laptop/phone, sign in with the same account, and turn on **Run at login** on the Mac. Note the Mac's Tailscale name (e.g. `old-mbp`).
2. **SSH**: **System Settings → General → Sharing → Remote Login: on**. From your laptop: `ssh <you>@old-mbp`.
3. **Screen Sharing** (optional, for clicking around): **Sharing → Screen Sharing: on**, then connect from your laptop's Finder with `vnc://old-mbp`.
4. **tmux** keeps terminal sessions alive when you disconnect: `brew install tmux`.

## 3. Claude on the Mac

**Install** Claude Code and log in **as yourself** with `/login` (the browser flow). Remote Control needs this full login; the long-lived token from `claude setup-token` can't do Remote Control.

```bash
curl -fsSL https://claude.ai/install.sh | bash
claude    # then /login, and quit
```

**Remote Control** lets you drive a Claude session *on this Mac* from the Claude mobile app or claude.ai/code (Code tab), while the code and files stay on the Mac. Start it inside tmux so it survives your SSH session ending:

```bash
tmux new -s claude -d 'cd ~/Development && claude remote-control'
tmux attach -t claude     # to look at it (detach with Ctrl-b d)
```

Open the Claude app on your phone → **Code**: the Mac's session is listed. Requirements: a Pro, Max, Team or Enterprise plan, the Mac awake and online, and the `claude` process running. After a reboot, start it again (or make it a login item, as in section 4).

## 4. The agent loop

The loop runs per project (see [Agent loop](../README.md#agent-loop)). On this Mac it runs as a background service that restarts on its own.

**A bot account, so the Mac can't touch more than it should:**

1. Create a GitHub account for the Mac (e.g. `imick-bot`) and invite it as a **collaborator** on each project the Mac works on, nothing else.
2. On the Mac, log `gh` in **as the bot**: `gh auth login`. The loop pushes branches and opens PRs with this login, so its work is clearly the bot's.
3. Each project's `.sandcastle/.env` gets the **bot's** fine-grained `GH_TOKEN` (that repo only: Issues read/write, Metadata read) and a Claude token made for this Mac (`claude setup-token`, run in a regular terminal, stored with the clipboard commands from the README).

**Docker Desktop**: install it, then **Settings → General → Start Docker Desktop when you sign in: on**. Give it enough memory for parallel agents (**Resources**: 8 GB or more if the Mac has it).

**Each project**: clone it (e.g. into `~/Projects/`), run `npm install`, set up the loop (`/setup-imick-skills`, Section F), fill `.sandcastle/.env`, and test one pass: `npm run agents -- --once`.

**Run it as a service**: one launchd agent per project, restarted if it stops. Save as `~/Library/LaunchAgents/io.imick.agents.<project>.plist`, replacing `<project>`, `<you>` and the path:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>io.imick.agents.<project></string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-lc</string><string>cd /Users/<you>/Projects/<project> && npm run agents</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>300</integer>
  <key>StandardOutPath</key><string>/Users/<you>/Library/Logs/agents-<project>.log</string>
  <key>StandardErrorPath</key><string>/Users/<you>/Library/Logs/agents-<project>.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/io.imick.agents.<project>.plist     # start (and at every login)
tail -f ~/Library/Logs/agents-<project>.log                               # watch it
launchctl unload ~/Library/LaunchAgents/io.imick.agents.<project>.plist   # stop
```

`ThrottleInterval` waits 5 minutes before restarting a loop that crashed, so a broken setup doesn't spin. Launch agents run while you're logged in, which is why automatic login (section 1) matters if you want everything back after a power cut. To make Remote Control a service too, copy the plist with the label `io.imick.claude-remote` and the command `cd ~/Development && claude remote-control`.

## 5. Checklist

- [ ] `pmset -g` shows `sleep 0` and `autorestart 1`; lid open; charger in.
- [ ] Tailscale running; `ssh <you>@old-mbp` works from your laptop.
- [ ] Your phone's Claude app lists the Mac's Remote Control session.
- [ ] Docker Desktop starts at login.
- [ ] `gh auth status` shows the bot account.
- [ ] For each project: `npm run agents -- --once` passes, then its launch agent is loaded and its log shows "nothing ready; sleeping" or work.

## Verifying epics

Nothing extra to install: when an epic's tickets are all done, the agent loop on this Mac opens its PR and runs `verify-epic` in the same Docker sandboxes, with the headless browser from the loop's image. Give each project's `GH_TOKEN` the extra permissions listed in its `.sandcastle/.env.example` (Commit statuses, Deployments, Pull requests), and set its preview source in `docs/agents/preview.md`.
