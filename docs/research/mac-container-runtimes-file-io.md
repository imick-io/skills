# Fast file I/O for agent sandboxes on macOS container runtimes


> **Context.** Written in October 2026 for one project using these skills (EveryShelf), while its agent loop on Docker Desktop for Mac took over 10 minutes per sandbox install. It first fixed that with `.sandcastle/volumes.mts` there: `node_modules` and the pnpm store in Docker volumes, through a patch to Sandcastle. The template ships the follow-up instead, `isolated-docker.mts` (`AGENTS_SANDBOX=isolated`): the same install speed with no patch, no per-branch volumes, and no way for a sandbox to touch the host checkout. The runtime comparisons below hold either way.

Research for the imick-io/skills agent loop (Sandcastle sandboxes on developers' Macs). Date: 2026-10-30.

**Question.** A sandbox bind-mounts a git worktree from the Mac and runs `pnpm install` (~335,000 small files into `node_modules`). On Docker Desktop with VirtioFS that took 10 min 35 s, against 12 s natively and ~15 s with `node_modules` in a Docker named volume (`.sandcastle/volumes.mts`). Which runtime fixes this, and does the fix need every developer to change runtimes?

**Short answer.** No runtime makes a VirtioFS bind mount as fast as a VM-local disk. Keeping `node_modules` and the pnpm store in named volumes works on every runtime that speaks the Docker CLI, and needs no per-developer setup. Keep that as the template's fix. OrbStack and Docker's paid Synchronized file shares are the only options whose bind mounts get close to native speed, and both cost money for commercial use.

## Sources and how far to trust them

- `DD-SFS` = Docker docs, [Synchronized file shares](https://docs.docker.com/desktop/features/synchronized-file-sharing/), and the launch post [Improve file operation speeds by 2-10x](https://www.docker.com/blog/announcing-synchronized-file-shares/) (2024-02-06). High trust for features and limits. The "2-10x" is a vendor claim with no published method.
- `DD-SET` = Docker docs, [Docker Desktop settings](https://docs.docker.com/desktop/settings-and-maintenance/settings/). High.
- `DD-PRICE` = [docker.com/pricing](https://www.docker.com/pricing/) and [Docker Desktop license](https://docs.docker.com/subscription/desktop-license/). High.
- `DD-618` = [docker/desktop-feedback#618](https://github.com/docker/desktop-feedback/issues/618): a named volume nested inside a VirtioFS bind mount got shadowed, in Docker Desktop 4.87 to 4.90, fixed in 4.91.0 (2026-09-16). High: it is the vendor's tracker, and the fix is confirmed there.
- `DD-SBX` = Docker docs, [Docker Sandboxes architecture](https://docs.docker.com/ai/sandboxes/architecture/). High.
- `ORB-FS` = OrbStack blog, [Truly fast container filesystems on macOS](https://orbstack.dev/blog/fast-filesystem) (2024-05-22). Medium: the vendor's own numbers, compared with native only, not with Docker Desktop.
- `ORB-DOC` = OrbStack docs: [Volumes & mounts](https://docs.orbstack.dev/docker/file-sharing), [Docker](https://docs.orbstack.dev/docker/), [vs Docker Desktop](https://docs.orbstack.dev/compare/docker-desktop), [pricing](https://orbstack.dev/pricing). High for features and price.
- `PM` = Paolo Mainardi, [Docker on macOS is still slow?](https://www.paolomainardi.com/posts/docker-performance-macos-2025/) (2025-01-04). An independent benchmark that runs `npm install` of a React app on an M4 Pro, with every runtime set to 8 vCPU and 16 GB. Medium-high: one engineer, a method you can repeat, and a small workload (seconds, not minutes).
- `LIMA` = [Lima mount docs](https://lima-vm.io/docs/config/mount/); `COL` = [Colima README](https://github.com/abiosoft/colima), [FAQ](https://github.com/abiosoft/colima/blob/main/docs/FAQ.md) and [PR #1359](https://github.com/abiosoft/colima/pull/1359) (virtiofs became the default for vz in v0.8.3, 2025-08-03). High.
- `POD` = Podman docs: [podman-machine(1)](https://github.com/containers/podman/blob/main/docs/source/markdown/podman-machine.1.md) (the default provider on macOS is libkrun, and applehv is the alternative) and [podman-machine-init(1)](https://docs.podman.io/en/stable/markdown/podman-machine-init.1.html) (`$HOME:$HOME` is mounted by default). High.
- `AC` = [apple/container](https://github.com/apple/container) README, [command reference](https://github.com/apple/container/blob/main/docs/command-reference.md), [releases](https://github.com/apple/container/releases) (1.6.1, 2026-10-23), and [Discussion #1516](https://github.com/apple/container/discussions/1516), answered by Apple maintainer jglogan (2026-05-20). High.
- `PNPM` = [pnpm/pnpm#5803](https://github.com/pnpm/pnpm/issues/5803): pnpm on Docker for Mac with VirtioFS or gRPC FUSE (hard links, `copyfile` ENOENT). Closed as not planned in 2026-09. Medium-high.
- `SC` = `@ai-hero/sandcastle` 0.12.0 in `node_modules` (`dist/sandboxes/`). It ships `docker`, `podman`, `vercel`, `daytona` and `no-sandbox` providers. It has no OrbStack, Colima or Apple `container` provider, and none is needed for the first two, because they serve the Docker API.

Not verified here: no runtime was benchmarked on this machine. Timings are from the sources above.

## Comparison

"Bind-mount writes" means many small writes into a host folder, as in `pnpm install` into the worktree.

| Runtime | Bind-mount writes (many small files) | Named volumes | Docker CLI (`run -v`, `exec`, `cp`, `volume`) | Cost for commercial use | Maturity |
| --- | --- | --- | --- | --- | --- |
| **Docker Desktop, VirtioFS** (default) | Slow. PM: 9.5 s against 5.3 s on Linux. Our pnpm case: 10 min 35 s against 12 s native | Yes, fast. On the VM's ext4 disk. Docker docs recommend volumes for caches and databases (DD-SET) | Reference implementation | Free under 250 employees **and** under $10M revenue, else Pro/Team/Business (DD-PRICE) | GA. Note DD-618: nested volumes broke in 4.87 to 4.90 |
| Docker Desktop, gRPC FUSE | Slower than VirtioFS (DD-SET calls VirtioFS the preferred option). pnpm fails the same way (PNPM) | Same | Same | Same | Legacy |
| Docker Desktop, Docker VMM (beta) | PM: 8.5 s, about the same as VirtioFS (VMM supports only VirtioFS) | Same | Same | Same | Beta |
| **Docker Desktop, Synchronized file shares** | Fast. PM: 3.9 s (−59%). Vendor: "2-10x" (DD-SFS) | Same | Same; bind mounts under a shared path use it automatically | **Pro/Team/Business only** ($9-24/user/mo) | GA since 4.27 (2024-02) |
| **OrbStack** | Fast. PM: 4.2 s. Vendor: pnpm install at 88% of native (12.2 s against 10.9 s, 1,614 packages) (ORB-FS) | Yes, "much faster than bind mounts" (ORB-DOC) | Drop-in: `docker` context `orbstack`, `/var/run/docker.sock` symlink, Compose (ORB-DOC) | Free for personal use only. **$8/user/mo** for commercial use | GA, closed source |
| Colima (Lima, vz + virtiofs) | Like Docker Desktop VirtioFS. PM: plain Lima 9.0 s. 9p and sshfs are slower | Yes, fast (VM disk) | Real dockerd and a Docker context, so the CLI is unchanged (COL) | Free (MIT) | Stable. virtiofs has been the default for vz only since v0.8.3 (2025-08) |
| Podman machine (libkrun default, or applehv) | virtiofs, so expect the VirtioFS class. No credible published benchmark found | Yes (`podman volume`), VM disk | `podman` CLI mirrors docker's. Sandcastle has a built-in `podman()` provider (SC) | Free (Apache-2.0) | Stable. libkrun is now the default on macOS (POD) |
| Apple `container` 1.6 (macOS 26) | Slow. Maintainer: native ≈ 2-3x virtioblk ≈ 3x virtiofs, so a bind mount is ~6-9x slower than native (AC #1516) | Yes. Each volume is an ext4 image over virtioblk: ~3x faster than a bind mount, still 2-3x slower than native | **Not Docker-compatible.** Its own `container run/exec/cp/volume` with Docker-like flags (AC). No Sandcastle provider | Free (Apache-2.0) | Young: 1.x, macOS 26 and Apple silicon only |
| Docker Sandboxes (`sbx`, microVM) | Workspace via virtiofs passthrough with read caching. Built for read-heavy work like `git status` (DD-SBX). No write-speed claim | Each sandbox has its own Docker daemon | A different model: one microVM per agent. It does not replace `docker run` for Sandcastle | Docker product. Per-plan availability not stated on the pricing page | New |

## Notes per option

1. **Docker Desktop.** VirtioFS has been the default since 4.6 and is the only mechanism Docker VMM supports. gRPC FUSE is legacy (DD-SET). Synchronized file shares (Mutagen) keep a **two-way** synced ext4 cache of the chosen host folder inside the VM. Limits (DD-SFS):
   - Setup is per path, in Settings → Resources → File sharing → Create share, and there are no documented CLI or JSON keys for it. Each developer would have to do this by hand.
   - A share holds at most ~2 million files, and files are stored twice (host and VM cache).
   - Docker itself recommends **excluding `node_modules`** via `.syncignore`, because syncing it is the costly part.
   - Conflicts can show as indicators that are "typically" safe to ignore.

   So even with this feature, the advice is still not to write `node_modules` through the share. With a worktree per sandbox, a share must cover the worktrees' parent folder (`.sandcastle/worktrees`). Each new worktree then gets an initial sync before the container sees it, which matters for short-lived agent runs.
2. **OrbStack.** The only runtime whose plain bind mounts get close to native: it tunes VirtioFS and claims up to 10x lower per-call overhead (ORB-FS). PM measured it as fast as Docker's paid sync. It serves the Docker API, so Sandcastle's `docker()` provider works unchanged (`docker run -v`, `exec`, `cp`, `volume`). Its own docs still say named volumes are faster than bind mounts (ORB-DOC). Licensing: free for personal use only, $8/user/mo (or $96/yr) for business use. It is closed source.
3. **Colima.** It runs a real dockerd behind a Docker context, so the CLI is unchanged (COL). virtiofs (vz) is the fast mount type. 9p (QEMU) and reverse-sshfs are slower and older (LIMA). Its speed is the Docker Desktop VirtioFS class, so it costs nothing but does not fix bind-mount writes.
4. **Podman machine.** On macOS it uses libkrun by default, or applehv. QEMU support is gone. It mounts `$HOME:$HOME` into the VM over virtiofs (POD). Expect speed like other plain virtiofs runtimes. No vendor or independent benchmark of many small writes was found. Sandcastle's `podman()` provider handles rootless `--userns=keep-id` and SELinux labels (SC). It mounts host paths only, so our `volume:` patch would need a podman port.
5. **Apple `container`.** Apple's own maintainer says virtiofs bind mounts are "pretty slow for heavy I/O workloads like builds where writes are relatively small", and suggests named volumes (AC #1516). It is not Docker-API compatible: Sandcastle would need a new provider, and the loop's `docker volume`/`docker run` calls in `volumes.mts` would all change. It needs macOS 26. The latest release is 1.6.1 (2026-10-23), and the 1.5 and 1.6 releases focused on networking and Kubernetes. Not a fit today.
6. **Others.** Docker Sandboxes (`sbx`) is a microVM per agent with a virtiofs workspace and **read** caching (DD-SBX). It is an alternative to Sandcastle's model, not a faster disk for it. Dev Containers run on whichever runtime is installed and change nothing. **The pnpm angle:** pnpm hard-links from its store, and a hard link fails across mount points (EXDEV), so pnpm falls back to copying (PNPM). Our store and `node_modules` are two separate volumes, so the install copies files instead of linking them. It is still ~15 s on VM disk. Putting both under one volume, or setting `package-import-method=copy`, would make that explicit.

## Gotchas for the named-volume approach

- **Docker Desktop 4.87 to 4.90**: a named volume nested inside a VirtioFS bind mount (the `…/workspace/node_modules` pattern) was **unmounted ~100 ms after start**. Writes then went through to the host worktree (DD-618). It is fixed in 4.91.0. The template should require Docker Desktop ≥ 4.91, or check at sandbox start that `node_modules` is still a separate mount (for example, `stat -c %d` differs from the workspace's).
- In a pnpm monorepo, each package's own `node_modules` (`apps/*/node_modules`, `packages/*/node_modules`) is still written through the bind mount. It holds mostly symlinks, which is cheap, but packages with their own deps add real files there.
- A named volume is empty for the IDE on the host. That is fine for agents, which only run inside the sandbox.

## Ranked recommendation (a template used on many developers' Macs)

1. **Keep `node_modules` and the pnpm store in named volumes (current approach), on whatever Docker-API runtime the developer has.** It works unchanged on Docker Desktop (free tier included), OrbStack and Colima, with no per-developer setup, and gets ~15 s against 10.5 min. Add a Docker Desktop ≥ 4.91 check, or the nested-mount check above. Consider a podman port of the `volume:` patch so `podman()` users get the same.
2. **Optional, per developer: OrbStack.** It is the best drop-in for anyone who wants fast bind mounts everywhere, and it needs no template change. Document it as recommended, not required. It costs $8/user/mo for commercial use.
3. **Optional, per developer: Docker Desktop Synchronized file shares** (Pro/Team/Business). It needs a manual share set up on each Mac, and Docker itself advises excluding `node_modules`. So for this workload it adds little on top of option 1.
4. **Colima or Podman.** Free and compatible: Colima unchanged, Podman via Sandcastle's `podman()` provider. Their bind mounts are no faster than Docker Desktop's, so they still need option 1.
5. **Apple `container` and Docker Sandboxes: not now.** Apple `container` is not Docker-compatible, needs macOS 26, and its bind mounts are slow. Docker Sandboxes is a different execution model.
