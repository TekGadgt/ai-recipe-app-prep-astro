/**
 * WebSocket Server for Pantry Party Real-time Collaboration
 * Handles session management, user connections, and real-time synchronization
 */

import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

const WS_PORT = 8080;
const SESSION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

/**
 * In-memory session storage
 * Structure: sessionId -> { session data, participants, lastActivity }
 */
const sessions = new Map();

/**
 * Connected clients tracking
 * Structure: websocket -> { userId, sessionId, username }
 */
const clients = new Map();

/**
 * User ID to WebSocket mapping for reconnection validation
 * Structure: userId -> websocket
 */
const userConnections = new Map();

/**
 * Create a new session
 */
function createSession(sessionId, hostId, hostName) {
  const session = {
    id: sessionId,
    hostId,
    hostName,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    allowRecipeGeneration: true,
    participants: [
      {
        id: hostId,
        name: hostName,
        joinedAt: Date.now(),
        isConnected: true,
      },
    ],
    ingredients: [],
    blacklist: [],
    context: "",
    recipes: [],
    votes: {},
  };

  sessions.set(sessionId, session);
  console.log(`Session created: ${sessionId} by ${hostName}`);
  return session;
}

/**
 * Get session by ID, checking for expiration
 */
function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check if session has expired
  if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
    console.log(`Session expired: ${sessionId}`);
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Update session activity timestamp
 */
function updateSessionActivity(sessionId) {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastActivity = Date.now();
  }
}

/**
 * Add participant to session
 */
function addParticipant(sessionId, userId, username) {
  const session = getSession(sessionId);
  if (!session) return null;

  // Check if user is already in session
  const existingParticipant = session.participants.find((p) => p.id === userId);
  if (existingParticipant) {
    existingParticipant.isConnected = true;
    existingParticipant.reconnectedAt = Date.now();
  } else {
    session.participants.push({
      id: userId,
      name: username,
      joinedAt: Date.now(),
      isConnected: true,
    });
  }

  updateSessionActivity(sessionId);
  return session;
}

/**
 * Remove participant from session
 */
function removeParticipant(sessionId, userId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const participant = session.participants.find((p) => p.id === userId);
  if (participant) {
    participant.isConnected = false;
    participant.disconnectedAt = Date.now();
  }

  // If no participants are connected, the session will eventually expire
  const connectedCount = session.participants.filter(
    (p) => p.isConnected
  ).length;
  console.log(
    `Participant ${userId} disconnected from ${sessionId}. Connected: ${connectedCount}`
  );

  return session;
}

/**
 * Broadcast message to all participants in a session
 */
function broadcastToSession(sessionId, message, excludeUserId = null) {
  const session = getSession(sessionId);
  if (!session) return;

  let broadcastCount = 0;
  for (const [ws, clientInfo] of clients.entries()) {
    if (
      clientInfo.sessionId === sessionId &&
      clientInfo.userId !== excludeUserId &&
      ws.readyState === ws.OPEN
    ) {
      ws.send(JSON.stringify(message));
      broadcastCount++;
    }
  }

  console.log(
    `Broadcasted ${message.type} to ${broadcastCount} clients in session ${sessionId}`
  );
}

/**
 * Send message to specific user
 */
function sendToUser(userId, message) {
  const ws = userConnections.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
    return true;
  }
  return false;
}

/**
 * Handle client connection
 */
function handleConnection(ws) {
  const connectionId = uuidv4();
  console.log(`New WebSocket connection: ${connectionId}`);

  ws.on("message", async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleMessage(ws, message);
    } catch (error) {
      console.error("Error handling message:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        })
      );
    }
  });

  ws.on("close", () => {
    handleDisconnection(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    handleDisconnection(ws);
  });

  // Send connection established message
  ws.send(
    JSON.stringify({
      type: "connection:established",
      connectionId,
    })
  );
}

/**
 * Handle incoming messages from clients
 */
async function handleMessage(ws, message) {
  const { type, data } = message;

  switch (type) {
    case "session:create":
      await handleSessionCreate(ws, data);
      break;

    case "session:join":
      await handleSessionJoin(ws, data);
      break;

    case "ingredients:add":
      await handleIngredientsAdd(ws, data);
      break;

    case "ingredients:remove":
      await handleIngredientsRemove(ws, data);
      break;

    case "ingredients:blacklist":
      await handleIngredientsBlacklist(ws, data);
      break;

    case "recipes:add":
      await handleRecipesAdd(ws, data);
      break;

    case "recipes:vote":
      await handleRecipesVote(ws, data);
      break;

    case "recipes:remove":
      await handleRecipesRemove(ws, data);
      break;

    case "context:update":
      await handleContextUpdate(ws, data);
      break;

    case "host:transfer":
      await handleHostTransfer(ws, data);
      break;

    case "host:permissions":
      await handleHostPermissions(ws, data);
      break;

    case "session:end":
      await handleSessionEnd(ws, data);
      break;

    default:
      ws.send(
        JSON.stringify({
          type: "error",
          message: `Unknown message type: ${type}`,
        })
      );
  }
}

/**
 * Handle session creation
 */
async function handleSessionCreate(ws, data) {
  const { sessionId, userId, username } = data;

  // Check if session already exists
  const existingSession = getSession(sessionId);
  if (existingSession) {
    // If the user is the original host, allow them to rejoin their session
    if (existingSession.hostId === userId) {
      console.log(`Host ${username} rejoining existing session ${sessionId}`);

      // Update participant status to connected
      addParticipant(sessionId, userId, username);

      // Register client
      clients.set(ws, { userId, sessionId, username });
      userConnections.set(userId, ws);

      // Send success response with existing session data
      ws.send(
        JSON.stringify({
          type: "session:created",
          session: existingSession,
        })
      );

      // Notify other participants that host reconnected
      broadcastToSession(
        sessionId,
        {
          type: "session:participant:joined",
          participant: {
            id: userId,
            name: username,
            reconnectedAt: Date.now(),
          },
        },
        userId
      );

      return;
    }

    // If someone else is trying to create a session with the same ID
    ws.send(
      JSON.stringify({
        type: "session:error",
        message: "Session already exists",
      })
    );
    return;
  }

  // Create new session
  const session = createSession(sessionId, userId, username);

  // Register client
  clients.set(ws, { userId, sessionId, username });
  userConnections.set(userId, ws);

  // Send success response
  ws.send(
    JSON.stringify({
      type: "session:created",
      session,
    })
  );
}

/**
 * Handle session joining
 */
async function handleSessionJoin(ws, data) {
  const { sessionId, userId, username } = data;

  const session = getSession(sessionId);
  if (!session) {
    ws.send(
      JSON.stringify({
        type: "session:error",
        message: "Session not found or expired",
      })
    );
    return;
  }

  // Check if user can reconnect (must have same userId if reconnecting)
  const existingConnection = userConnections.get(userId);
  if (existingConnection && existingConnection !== ws) {
    ws.send(
      JSON.stringify({
        type: "session:error",
        message: "User already connected from another client",
      })
    );
    return;
  }

  // Add participant to session
  const updatedSession = addParticipant(sessionId, userId, username);

  // Register client
  clients.set(ws, { userId, sessionId, username });
  userConnections.set(userId, ws);

  // Send success response to joining user
  ws.send(
    JSON.stringify({
      type: "session:joined",
      session: updatedSession,
    })
  );

  // Broadcast participant joined to others
  broadcastToSession(
    sessionId,
    {
      type: "session:participant:joined",
      participant: {
        id: userId,
        name: username,
        joinedAt: Date.now(),
      },
    },
    userId
  );
}

/**
 * Handle ingredient addition
 */
async function handleIngredientsAdd(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  const { ingredient } = data;
  const ingredientName = ingredient.name.toLowerCase();

  console.log(
    "Server received ingredient add request:",
    ingredientName,
    "by:",
    ingredient.addedBy,
    "session:",
    clientInfo.sessionId
  );

  // Check if ingredient already exists to prevent duplicates (by name only)
  const exists = session.ingredients.some(
    (ing) => ing.name.toLowerCase() === ingredientName
  );

  if (exists) {
    console.log(
      "Ingredient already exists in session, skipping:",
      ingredientName,
      "requested by:",
      ingredient.addedBy
    );
    return;
  }

  const newIngredient = {
    id: uuidv4(),
    name: ingredientName,
    addedBy: ingredient.addedBy,
    addedAt: Date.now(),
  };

  session.ingredients.push(newIngredient);
  updateSessionActivity(clientInfo.sessionId);

  console.log(
    "Server added ingredient:",
    newIngredient.name,
    "ID:",
    newIngredient.id,
    "by:",
    newIngredient.addedBy,
    "total ingredients:",
    session.ingredients.length
  );

  // Broadcast to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "ingredients:added",
    ingredient: newIngredient,
  });
}

/**
 * Handle ingredient removal
 */
async function handleIngredientsRemove(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  const { ingredientId } = data;

  console.log("Server looking for ingredient ID:", ingredientId);
  console.log(
    "Server has ingredients:",
    session.ingredients.map((ing) => ({ id: ing.id, name: ing.name }))
  );

  const index = session.ingredients.findIndex((ing) => ing.id === ingredientId);

  if (index !== -1) {
    const removedIngredient = session.ingredients.splice(index, 1)[0];
    console.log(
      "Server removed ingredient:",
      removedIngredient.name,
      "ID:",
      ingredientId
    );
    updateSessionActivity(clientInfo.sessionId);

    // Broadcast to all participants
    broadcastToSession(clientInfo.sessionId, {
      type: "ingredients:removed",
      ingredientId,
      ingredient: removedIngredient,
    });
  } else {
    console.log("Ingredient not found for removal, ID:", ingredientId);
    console.log(
      "Available ingredient IDs:",
      session.ingredients.map((ing) => ing.id)
    );
  }
}

/**
 * Handle ingredient blacklisting
 */
async function handleIngredientsBlacklist(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  const { ingredientName, fromIngredients } = data;

  // Add to blacklist if not already there
  if (!session.blacklist.includes(ingredientName.toLowerCase())) {
    session.blacklist.push(ingredientName.toLowerCase());
  }

  // Remove from ingredients if it was moved from ingredients
  if (fromIngredients) {
    const index = session.ingredients.findIndex(
      (ing) => ing.name.toLowerCase() === ingredientName.toLowerCase()
    );
    if (index !== -1) {
      session.ingredients.splice(index, 1);
    }
  }

  updateSessionActivity(clientInfo.sessionId);

  // Broadcast to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "ingredients:blacklisted",
    ingredientName: ingredientName.toLowerCase(),
    blacklist: session.blacklist,
    ingredients: session.ingredients,
  });
}

/**
 * Handle recipe addition
 */
async function handleRecipesAdd(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  const { recipe } = data;
  const newRecipe = {
    ...recipe,
    id: uuidv4(),
    createdAt: Date.now(),
    votes: 0,
    voterIds: [],
  };

  session.recipes.push(newRecipe);
  updateSessionActivity(clientInfo.sessionId);

  // Broadcast to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "recipes:added",
    recipe: newRecipe,
  });
}

/**
 * Handle recipe voting
 */
async function handleRecipesVote(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  const { recipeId, voteType } = data;
  const userId = clientInfo.userId;

  // Initialize user votes if not exists
  if (!session.votes[userId]) {
    session.votes[userId] = {};
  }

  // Remove previous vote for this recipe
  delete session.votes[userId][recipeId];

  // Add new vote if not neutral
  if (voteType !== "neutral") {
    session.votes[userId][recipeId] = voteType;
  }

  // Calculate vote counts for all recipes
  session.recipes.forEach((recipe) => {
    let upvotes = 0;
    let downvotes = 0;
    const voterIds = [];

    Object.entries(session.votes).forEach(([voterId, userVotes]) => {
      if (userVotes[recipe.id]) {
        voterIds.push(voterId);
        if (userVotes[recipe.id] === "up") upvotes++;
        else if (userVotes[recipe.id] === "down") downvotes++;
      }
    });

    recipe.votes = upvotes - downvotes;
    recipe.voterIds = voterIds;
  });

  updateSessionActivity(clientInfo.sessionId);

  console.log("Server broadcasting vote update:", {
    recipeId,
    voteType,
    userId,
    recipeCount: session.recipes.length,
    recipesWithVotes: session.recipes.map((r) => ({
      id: r.id,
      title: r.title,
      votes: r.votes,
    })),
  });

  // Broadcast to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "recipes:voted",
    recipeId,
    voteType,
    userId,
    recipes: session.recipes,
  });
}

/**
 * Handle recipe removal
 */
async function handleRecipesRemove(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  const { recipeId } = data;
  const index = session.recipes.findIndex((recipe) => recipe.id === recipeId);

  if (index !== -1) {
    const removedRecipe = session.recipes.splice(index, 1)[0];
    updateSessionActivity(clientInfo.sessionId);

    // Broadcast to all participants
    broadcastToSession(clientInfo.sessionId, {
      type: "recipes:removed",
      recipeId,
      recipe: removedRecipe,
    });
  }
}

/**
 * Handle context update
 */
async function handleContextUpdate(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  // Only allow host to update context
  if (clientInfo.userId !== session.hostId) {
    console.log(
      `Non-host ${clientInfo.username} attempted to update context, ignoring`
    );
    return;
  }

  const { context } = data;
  session.context = context;
  updateSessionActivity(clientInfo.sessionId);

  console.log(`Host ${clientInfo.username} updated context:`, context);

  // Broadcast to all participants (excluding host)
  broadcastToSession(
    clientInfo.sessionId,
    {
      type: "context:updated",
      context,
    },
    clientInfo.userId
  );
}

/**
 * Handle host transfer
 */
async function handleHostTransfer(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  // Only current host can transfer
  if (session.hostId !== clientInfo.userId) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Only host can transfer privileges",
      })
    );
    return;
  }

  const { newHostId } = data;
  const newHost = session.participants.find((p) => p.id === newHostId);

  if (!newHost) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "New host not found in session",
      })
    );
    return;
  }

  session.hostId = newHostId;
  session.hostName = newHost.name;
  updateSessionActivity(clientInfo.sessionId);

  // Broadcast to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "host:transferred",
    newHostId,
    newHostName: newHost.name,
    session,
  });
}

/**
 * Handle host permissions update
 */
async function handleHostPermissions(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  // Only host can change permissions
  if (session.hostId !== clientInfo.userId) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Only host can change permissions",
      })
    );
    return;
  }

  const { allowRecipeGeneration } = data;
  session.allowRecipeGeneration = allowRecipeGeneration;
  updateSessionActivity(clientInfo.sessionId);

  // Broadcast to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "host:permissions:updated",
    allowRecipeGeneration,
    session,
  });
}

/**
 * Handle session end
 */
async function handleSessionEnd(ws, data) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const session = getSession(clientInfo.sessionId);
  if (!session) return;

  // Only host can end session
  if (session.hostId !== clientInfo.userId) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Only host can end session",
      })
    );
    return;
  }

  console.log(
    `Host ${clientInfo.username} ending session ${clientInfo.sessionId}`
  );

  // Broadcast session end to all participants
  broadcastToSession(clientInfo.sessionId, {
    type: "session:ended",
    message: "Session has been ended by the host",
  });

  // Remove session from memory
  sessions.delete(clientInfo.sessionId);

  // Disconnect all clients in this session
  for (const [ws, client] of clients.entries()) {
    if (client.sessionId === clientInfo.sessionId) {
      userConnections.delete(client.userId);
      clients.delete(ws);
      if (ws.readyState === ws.OPEN) {
        ws.close(1000, "Session ended by host");
      }
    }
  }
}

/**
 * Handle client disconnection
 */
function handleDisconnection(ws) {
  const clientInfo = clients.get(ws);
  if (clientInfo) {
    const { userId, sessionId, username } = clientInfo;
    console.log(
      `Client disconnected: ${username} (${userId}) from session ${sessionId}`
    );

    // Remove from active connections
    clients.delete(ws);
    userConnections.delete(userId);

    // Update session participant status
    removeParticipant(sessionId, userId);

    // Broadcast disconnection to other participants
    broadcastToSession(
      sessionId,
      {
        type: "session:participant:disconnected",
        userId,
        username,
      },
      userId
    );
  }
}

/**
 * Clean up expired sessions periodically
 */
function cleanupExpiredSessions() {
  const now = Date.now();
  const expiredSessions = [];

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TIMEOUT) {
      expiredSessions.push(sessionId);
    }
  }

  expiredSessions.forEach((sessionId) => {
    console.log(`Cleaning up expired session: ${sessionId}`);
    sessions.delete(sessionId);

    // Notify any remaining connected clients
    broadcastToSession(sessionId, {
      type: "session:expired",
      sessionId,
    });
  });

  if (expiredSessions.length > 0) {
    console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
  }
}

/**
 * Start WebSocket Server
 */
export function startWebSocketServer() {
  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("connection", handleConnection);

  // Clean up expired sessions every 30 minutes
  setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

  console.log(`🔌 WebSocket server running on ws://localhost:${WS_PORT}`);
  console.log(`📊 Session cleanup runs every 30 minutes`);
  console.log(
    `⏰ Sessions expire after ${SESSION_TIMEOUT / (60 * 60 * 1000)} hours of inactivity`
  );

  return wss;
}

// Start server if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startWebSocketServer();
}
