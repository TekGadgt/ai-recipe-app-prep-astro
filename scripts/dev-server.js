/**
 * Development Server Coordinator
 * Runs both Astro dev server and WebSocket server concurrently
 */

import { spawn } from "child_process";
import { startWebSocketServer } from "../server/websocket-server.js";

const ASTRO_PORT = 4321;
const WS_PORT = 8080;

let astroProcess = null;
let wsServer = null;

/**
 * Start Astro development server
 */
function startAstroServer() {
  console.log("🚀 Starting Astro development server...");

  astroProcess = spawn("npm", ["run", "dev:astro"], {
    stdio: "pipe",
    shell: true,
  });

  astroProcess.stdout.on("data", (data) => {
    const output = data.toString();
    console.log(`[Astro] ${output.trim()}`);
  });

  astroProcess.stderr.on("data", (data) => {
    const output = data.toString();
    if (!output.includes("ExperimentalWarning")) {
      console.error(`[Astro Error] ${output.trim()}`);
    }
  });

  astroProcess.on("close", (code) => {
    console.log(`[Astro] Process exited with code ${code}`);
    if (code !== 0 && code !== null) {
      console.error("[Astro] Server crashed. Restarting...");
      setTimeout(startAstroServer, 2000);
    }
  });

  astroProcess.on("error", (error) => {
    console.error("[Astro] Failed to start process:", error.message);
  });
}

/**
 * Start WebSocket server
 */
function startWsServer() {
  console.log("🔌 Starting WebSocket server...");

  try {
    wsServer = startWebSocketServer();
  } catch (error) {
    console.error("[WebSocket] Failed to start server:", error.message);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
function handleShutdown() {
  console.log("\n🛑 Shutting down development servers...");

  // Close WebSocket server
  if (wsServer) {
    wsServer.close((err) => {
      if (err) {
        console.error("[WebSocket] Error closing server:", err.message);
      } else {
        console.log("[WebSocket] Server closed");
      }
    });
  }

  // Kill Astro process
  if (astroProcess) {
    astroProcess.kill("SIGTERM");
    console.log("[Astro] Process terminated");
  }

  console.log("👋 Development servers stopped");
  process.exit(0);
}

/**
 * Display startup information
 */
function displayStartupInfo() {
  console.log("");
  console.log("🎉 Pantry Party Development Environment");
  console.log("=====================================");
  console.log("");
  console.log(`📱 Web App:      http://localhost:${ASTRO_PORT}`);
  console.log(`🔌 WebSocket:    ws://localhost:${WS_PORT}`);
  console.log("");
  console.log("Press Ctrl+C to stop both servers");
  console.log("");
}

/**
 * Main startup function
 */
function main() {
  // Handle process termination
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);

  // Display startup information
  displayStartupInfo();

  // Start servers
  startWsServer();

  // Wait a moment before starting Astro to ensure WebSocket server is ready
  setTimeout(startAstroServer, 1000);

  // Keep process alive
  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });
}

// Start the development environment
main();
