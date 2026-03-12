import killPort from "kill-port";
import net from "node:net";
import { execSync } from "node:child_process";

const port = Number(process.env.PORT) || 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getWindowsListeningPids = (targetPort) => {
  try {
    const output = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${targetPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );

    return [...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((pid) => Number(pid))
        .filter((pid) => Number.isInteger(pid) && pid > 0)
    )];
  } catch {
    return [];
  }
};

const isPortInUse = (targetPort) => {
  if (process.platform === "win32") {
    return Promise.resolve(getWindowsListeningPids(targetPort).length > 0);
  }

  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (error) => {
      resolve(error?.code === "EADDRINUSE");
    });

    server.once("listening", () => {
      server.close(() => resolve(false));
    });

    server.listen(targetPort, "0.0.0.0");
  });
};

const forceKillPortOnWindows = (targetPort) => {
  const pids = getWindowsListeningPids(targetPort);
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    } catch {
      // ignore non-killable pids here; retry loop handles remaining ones
    }
  }
};

const ensurePortFreed = async (targetPort) => {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const busy = await isPortInUse(targetPort);
    if (!busy) return;

    try {
      await killPort(targetPort, "tcp");
    } catch {
      // try additional fallback below
    }

    if (process.platform === "win32") {
      forceKillPortOnWindows(targetPort);
    }

    await sleep(350);
  }

  if (await isPortInUse(targetPort)) {
    console.error(`Port ${targetPort} is still in use after retries.`);
    process.exit(1);
  }
};

const bootstrap = async () => {
  try {
    await ensurePortFreed(port);
    await import("./index.js");
  } catch (error) {
    console.error("Failed to start dev server:", error?.message || error);
    process.exit(1);
  }
};

bootstrap();
