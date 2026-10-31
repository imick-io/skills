// An isolated Docker sandbox provider, for AGENTS_SANDBOX=isolated.
//
// Nothing of the checkout is bind-mounted: Sandcastle copies the repo in as a
// git bundle and brings the agent's commits back as patches, applied to the
// branch's host worktree. So dependencies install onto the container's own
// disk. On Docker Desktop for Mac, writing node_modules across a bind mount
// can take over 10 minutes; here it takes seconds. And a sandbox can never
// touch the host checkout.
//
// The package caches (corepack, the pnpm store, npm's and yarn's caches) live
// in one Docker volume shared by every sandbox, at the same path the
// bind-mount provider uses, so installs stay warm and nothing else changes.
//
// Patches can't carry a merge commit: a job that merges branches (resolving
// main into an epic branch) stays on the bind-mount provider.
import { createIsolatedSandboxProvider, type IsolatedSandboxHandle } from "@ai-hero/sandcastle";
import { defaultImageName } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync, spawn } from "node:child_process";
import { basename } from "node:path";

type ExecResult = { stdout: string; stderr: string; exitCode: number };

const docker = (args: string[]) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
const project = basename(process.cwd()); // as Sandcastle names the image
const image = defaultImageName(process.cwd());

export const WORKSPACE = "/home/agent/workspace";

// The shared cache volume, created once and owned by the sandbox's user (a new
// volume is root's); ownership is checked on every start, which also repairs a
// volume Docker created by itself.
const cacheVolume = () => {
  const name = `sandcastle-${project}-cache`;
  try {
    docker(["volume", "inspect", name]);
  } catch {
    try {
      docker(["volume", "create", "--label", `sandcastle.project=${project}`, name]);
    } catch {
      // Another sandbox created it at the same moment.
    }
  }
  docker(["run", "--rm", "--user", "0:0", "--entrypoint", "chown", "-v", `${name}:/v`, image, user, "/v"]);
  return name;
};

// Containers carry this label, so a sweep can find the ones a crashed or
// failed run left behind: Sandcastle doesn't close a sandbox whose setup
// failed, so "closed" and "in use" can't be told apart by close() alone.
// `activity` tracks this process's containers instead: commands running now,
// and when the last one ran. An agent's run is one long command, so a
// container in use is never idle.
const LABEL = `sandcastle.isolated=${project}`;
type Activity = { running: number; last: number };
const activity = new Map<string, Activity>();
export const ABANDONED_MS = 10 * 60 * 1000;

export const isolatedDocker = (opts: { cachePath: string; env: Record<string, string> }) =>
  createIsolatedSandboxProvider({
    name: "docker-isolated",
    env: opts.env,
    create: async ({ env }): Promise<IsolatedSandboxHandle> => {
      const id = docker([
        "run", "-d", "--label", LABEL, "--user", user,
        ...Object.entries({ HOME: "/home/agent", ...env }).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
        "-v", `${cacheVolume()}:${opts.cachePath}`,
        "--entrypoint", "sleep", image, "infinity",
      ]);
      activity.set(id, { running: 0, last: Date.now() });
      docker(["exec", id, "mkdir", "-p", WORKSPACE]); // Sandcastle's first commands run there

      const exec = (command: string, o: { onLine?: (line: string) => void; cwd?: string; stdin?: string } = {}) =>
        new Promise<ExecResult>((resolve, reject) => {
          const seen = activity.get(id);
          if (seen) seen.running++;
          const done = () => {
            if (seen) {
              seen.running--;
              seen.last = Date.now();
            }
          };
          const piped = o.stdin !== undefined;
          const p = spawn("docker", ["exec", ...(piped ? ["-i"] : []), "-w", o.cwd ?? WORKSPACE, id, "sh", "-c", command],
            { stdio: [piped ? "pipe" : "ignore", "pipe", "pipe"] });
          let stdout = "";
          let stderr = "";
          let partial = "";
          p.stdout?.on("data", (chunk: Buffer) => {
            stdout += chunk;
            partial += chunk;
            const lines = partial.split("\n");
            partial = lines.pop() ?? "";
            for (const line of lines) o.onLine?.(line); // streamed: Sandcastle's idle timeout relies on it
          });
          p.stderr?.on("data", (chunk: Buffer) => {
            stderr += chunk;
          });
          if (piped) p.stdin?.end(o.stdin);
          p.on("error", (error) => {
            done();
            reject(error);
          });
          p.on("close", (code) => {
            done();
            if (partial) o.onLine?.(partial);
            resolve({ stdout, stderr, exitCode: code ?? 0 });
          });
        });

      return {
        worktreePath: WORKSPACE,
        exec,
        copyIn: async (hostPath: string, sandboxPath: string) => {
          await exec(`mkdir -p "$(dirname '${sandboxPath}')"`, { cwd: "/" });
          docker(["cp", hostPath, `${id}:${sandboxPath}`]);
        },
        copyFileOut: async (sandboxPath: string, hostPath: string) => {
          docker(["cp", `${id}:${sandboxPath}`, hostPath]);
        },
        close: async () => {
          activity.delete(id);
          try {
            docker(["rm", "-f", id]);
          } catch {}
        },
      };
    },
  });

// Which containers to remove: another process's (a loop that crashed or was
// stopped), or this one's that ran nothing for ABANDONED_MS (a failed setup).
export const abandoned = (ids: string[], seen: ReadonlyMap<string, Activity>, now: number) =>
  ids.filter((id) => {
    const a = seen.get(id);
    return !a || (a.running === 0 && now - a.last >= ABANDONED_MS);
  });

// Removes this project's abandoned isolated containers and returns how many.
// Run by the loop (one loop per checkout) at each pass.
export const sweepContainers = (): number => {
  const ids = docker(["ps", "-aq", "--no-trunc", "--filter", `label=${LABEL}`]).split("\n").filter(Boolean);
  let removed = 0;
  for (const id of abandoned(ids, activity, Date.now())) {
    activity.delete(id);
    try {
      docker(["rm", "-f", id]);
      removed++;
    } catch {}
  }
  return removed;
};
