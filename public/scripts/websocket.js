/**
 * WebSocket Client Utilities for Pantry Party Real-time Collaboration
 * Client-side connection management, event handling, and session synchronization
 */

/**
 * WebSocket Connection Manager
 */
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    this.connectionId = null;
    this.userId = null;
    this.sessionId = null;
    this.username = null;

    // Event listeners
    this.eventListeners = new Map();

    // Message queue for when disconnected
    this.messageQueue = [];

    // Auto-reconnect interval
    this.reconnectInterval = null;

    this.init();
  }

  /**
   * Initialize WebSocket connection
   */
  init() {
    const wsUrl = this.getWebSocketUrl();
    console.log(`Connecting to WebSocket server: ${wsUrl}`);

    this.isConnecting = true;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  /**
   * Get WebSocket URL based on current environment
   */
  getWebSocketUrl() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    const port = window.location.hostname === "localhost" ? ":8080" : "";
    return `${protocol}//${hostname}${port}`;
  }

  /**
   * Handle WebSocket connection open
   */
  handleOpen() {
    console.log("WebSocket connected");
    this.isConnected = true;
    this.isConnecting = false;
    this.reconnectAttempts = 0;

    // Clear reconnect interval
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    // Process queued messages
    this.processMessageQueue();

    // Emit connection event
    this.emit("connection:open");
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log("WebSocket message received:", message.type, message);

      // Handle connection establishment
      if (message.type === "connection:established") {
        this.connectionId = message.connectionId;
        this.emit("connection:established", message);
        return;
      }

      // Special debugging for ingredient removal
      if (message.type === "ingredients:removed") {
        console.log(
          "DEBUGGING: About to emit ingredients:removed event",
          message
        );
      }

      // Emit message to listeners
      this.emit(message.type, message);
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  }

  /**
   * Handle WebSocket connection close
   */
  handleClose(event) {
    console.log("WebSocket disconnected:", event.code, event.reason);
    this.isConnected = false;
    this.isConnecting = false;

    // Emit disconnection event
    this.emit("connection:close", { code: event.code, reason: event.reason });

    // Attempt reconnection if not a clean close
    if (
      event.code !== 1000 &&
      this.reconnectAttempts < this.maxReconnectAttempts
    ) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket errors
   */
  handleError(error) {
    console.error("WebSocket error:", error);
    this.emit("connection:error", error);
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectInterval) return;

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      if (!this.isConnected && !this.isConnecting) {
        this.init();
      }
    }, delay);
  }

  /**
   * Send message to server
   */
  send(type, data = {}) {
    const message = { type, data };

    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      console.log("WebSocket message sent:", type);
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      console.log("WebSocket message queued:", type);
    }
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      this.ws.send(JSON.stringify(message));
      console.log("WebSocket queued message sent:", message.type);
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    console.log(
      `Event listener registered for: ${event} (total: ${this.eventListeners.get(event).length})`
    );
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (!this.eventListeners.has(event)) return;

    const listeners = this.eventListeners.get(event);
    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data = null) {
    if (!this.eventListeners.has(event)) {
      console.log(`No listeners registered for event: ${event}`);
      return;
    }

    const listeners = this.eventListeners.get(event);
    console.log(`Emitting event ${event} to ${listeners.length} listeners`);

    listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });
  }

  /**
   * Create a new session
   */
  createSession(sessionId, userId, username) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.username = username;

    this.send("session:create", {
      sessionId,
      userId,
      username,
    });
  }

  /**
   * Join an existing session
   */
  joinSession(sessionId, userId, username) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.username = username;

    this.send("session:join", {
      sessionId,
      userId,
      username,
    });
  }

  /**
   * Add ingredient to session
   */
  addIngredient(ingredient) {
    this.send("ingredients:add", { ingredient });
  }

  /**
   * Remove ingredient from session
   */
  removeIngredient(ingredientId) {
    this.send("ingredients:remove", { ingredientId });
  }

  /**
   * Blacklist ingredient
   */
  blacklistIngredient(ingredientName, fromIngredients = false) {
    this.send("ingredients:blacklist", {
      ingredientName,
      fromIngredients,
    });
  }

  /**
   * Add recipe to session
   */
  addRecipe(recipe) {
    this.send("recipes:add", { recipe });
  }

  /**
   * Vote on recipe
   */
  voteRecipe(recipeId, voteType) {
    this.send("recipes:vote", { recipeId, voteType });
  }

  /**
   * Remove recipe from session
   */
  removeRecipe(recipeId) {
    this.send("recipes:remove", { recipeId });
  }

  /**
   * Update session context
   */
  updateContext(context) {
    this.send("context:update", { context });
  }

  /**
   * Transfer host privileges
   */
  transferHost(newHostId) {
    this.send("host:transfer", { newHostId });
  }

  /**
   * Update host permissions
   */
  updateHostPermissions(allowRecipeGeneration) {
    this.send("host:permissions", { allowRecipeGeneration });
  }

  /**
   * End session (host only)
   */
  endSession() {
    this.send("session:end", {});
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      connectionId: this.connectionId,
      userId: this.userId,
      sessionId: this.sessionId,
      username: this.username,
    };
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
  }
}

/**
 * Session Synchronization Manager
 * Handles bidirectional sync between localStorage and WebSocket session
 */
class SessionSyncManager {
  constructor(wsManager, storage) {
    this.ws = wsManager;
    this.storage = storage;
    this.isHost = false;
    this.allowRecipeGeneration = true;
    this.participants = [];

    this.setupEventListeners();
  }

  /**
   * Setup WebSocket event listeners for session sync
   */
  setupEventListeners() {
    // Session events
    this.ws.on("session:created", this.handleSessionCreated.bind(this));
    this.ws.on("session:joined", this.handleSessionJoined.bind(this));
    this.ws.on("session:error", this.handleSessionError.bind(this));
    this.ws.on("session:expired", this.handleSessionExpired.bind(this));

    // Participant events
    this.ws.on(
      "session:participant:joined",
      this.handleParticipantJoined.bind(this)
    );
    this.ws.on(
      "session:participant:disconnected",
      this.handleParticipantDisconnected.bind(this)
    );

    // Ingredient events
    this.ws.on("ingredients:added", this.handleIngredientAdded.bind(this));
    this.ws.on("ingredients:removed", this.handleIngredientRemoved.bind(this));
    this.ws.on(
      "ingredients:blacklisted",
      this.handleIngredientBlacklisted.bind(this)
    );

    // Recipe events
    this.ws.on("recipes:added", this.handleRecipeAdded.bind(this));
    this.ws.on("recipes:voted", this.handleRecipeVoted.bind(this));
    this.ws.on("recipes:removed", this.handleRecipeRemoved.bind(this));

    // Context events
    this.ws.on("context:updated", this.handleContextUpdated.bind(this));

    // Host events
    this.ws.on("host:transferred", this.handleHostTransferred.bind(this));
    this.ws.on(
      "host:permissions:updated",
      this.handleHostPermissionsUpdated.bind(this)
    );

    // Session end events
    this.ws.on("session:ended", this.handleSessionEnded.bind(this));
  }

  /**
   * Handle session creation success
   */
  handleSessionCreated(message) {
    const { session } = message;
    this.syncSessionToLocal(session);
    this.isHost = true;
    this.showNotification("Session created successfully!", "success");
  }

  /**
   * Handle session join success
   */
  handleSessionJoined(message) {
    const { session } = message;
    this.syncSessionToLocal(session);
    this.isHost = session.hostId === this.ws.userId;
    this.showNotification(`Joined session "${session.id}"!`, "success");
  }

  /**
   * Handle session errors
   */
  handleSessionError(message) {
    console.error("Session error:", message.message);
    this.showNotification(message.message, "error");
  }

  /**
   * Handle session expiration
   */
  handleSessionExpired(message) {
    this.showNotification("Session has expired", "warning");
    // Clear local session data
    this.storage.clearSession();
    // Redirect to home page
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
  }

  /**
   * Handle session ended by host
   */
  handleSessionEnded(message) {
    this.showNotification("Session ended by host", "warning");
    // Clear local session data
    this.storage.clearSession();
    // Redirect to home page
    setTimeout(() => {
      window.location.href = "/";
    }, 2000);
  }

  /**
   * Handle participant joined
   */
  handleParticipantJoined(message) {
    const { participant } = message;

    // Update local participants list
    const existingIndex = this.participants.findIndex(
      (p) => p.id === participant.id
    );
    if (existingIndex !== -1) {
      this.participants[existingIndex] = {
        ...this.participants[existingIndex],
        ...participant,
        isConnected: true,
      };
    } else {
      this.participants.push({ ...participant, isConnected: true });
    }

    this.showNotification(`${participant.name} joined the session`, "info");
    this.updateParticipantsList();
  }

  /**
   * Handle participant disconnected
   */
  handleParticipantDisconnected(message) {
    const { userId, username } = message;

    // Update local participants list
    const participantIndex = this.participants.findIndex(
      (p) => p.id === userId
    );
    if (participantIndex !== -1) {
      this.participants[participantIndex].isConnected = false;
      this.participants[participantIndex].disconnectedAt = Date.now();
    }

    this.showNotification(`${username} left the session`, "info");
    this.updateParticipantsList();
  }

  /**
   * Handle ingredient added
   */
  handleIngredientAdded(message) {
    const { ingredient } = message;

    // Set syncing flag to prevent race conditions
    if (window.syncState) {
      window.syncState.syncing = true;
    }

    try {
      // Add the ingredient with server-provided ID (storage will handle duplicates)
      const result = this.storage.addIngredient(
        ingredient.name,
        ingredient.addedBy,
        ingredient.id
      );

      if (result) {
        console.log(
          "Successfully added ingredient from WebSocket:",
          result.name,
          "by",
          result.addedBy
        );
        this.refreshIngredientsDisplay();
      } else {
        console.log("Ingredient was duplicate, not added:", ingredient.name);
      }
    } finally {
      // Clear syncing flag
      if (window.syncState) {
        window.syncState.syncing = false;
      }
    }
  }

  /**
   * Handle ingredient removed
   */
  handleIngredientRemoved(message) {
    console.log("DEBUGGING: handleIngredientRemoved called with:", message);
    const { ingredientId, ingredient } = message;

    console.log(
      "WebSocket received ingredient removal:",
      ingredient?.name || "unknown",
      "ID:",
      ingredientId
    );

    // Set syncing flag to prevent race conditions
    if (window.syncState) {
      window.syncState.syncing = true;
    }

    try {
      // Verify the ingredient exists before removing
      const existingIngredients = this.storage.getIngredients();
      const exists = existingIngredients.find((ing) => ing.id === ingredientId);

      if (exists) {
        console.log("Removing ingredient from local storage:", exists.name);
        this.storage.removeIngredient(ingredientId);
        this.refreshIngredientsDisplay();

        // Mark recipes as invalid
        if (typeof window.markRecipesInvalid === "function") {
          window.markRecipesInvalid();
        }
      } else {
        console.log(
          "Ingredient not found in local storage for removal:",
          ingredientId
        );
      }
    } finally {
      // Clear syncing flag
      if (window.syncState) {
        window.syncState.syncing = false;
      }
    }
  }

  /**
   * Handle ingredient blacklisted
   */
  handleIngredientBlacklisted(message) {
    const { ingredientName, blacklist, ingredients } = message;

    // Set syncing flag to prevent race conditions
    if (window.syncState) {
      window.syncState.syncing = true;
    }

    try {
      // Update both blacklist and ingredients from server
      this.storage.clearIngredients();
      this.storage.clearBlacklist();

      ingredients.forEach((ing) =>
        this.storage.addIngredient(ing.name, ing.addedBy, ing.id)
      );
      blacklist.forEach((item) => this.storage.addToBlacklist(item));

      this.refreshIngredientsDisplay();
    } finally {
      // Clear syncing flag
      if (window.syncState) {
        window.syncState.syncing = false;
      }
    }
  }

  /**
   * Handle recipe added
   */
  handleRecipeAdded(message) {
    const { recipe } = message;
    console.log(
      "DEBUGGING: handleRecipeAdded called with recipe:",
      recipe.title,
      "ID:",
      recipe.id
    );

    // Set syncing flag to prevent race conditions
    if (window.syncState) {
      window.syncState.syncing = true;
    }

    try {
      // Add recipe with server ID preserved
      const result = this.storage.addRecipe(recipe, true);
      if (result) {
        console.log("Successfully added recipe from WebSocket:", result.title);
        this.refreshRecipesDisplay();
      } else {
        console.log(
          "Recipe was duplicate or invalid, not added:",
          recipe.title
        );
      }
    } finally {
      // Clear syncing flag
      if (window.syncState) {
        window.syncState.syncing = false;
      }
    }
  }

  /**
   * Handle recipe voted
   */
  handleRecipeVoted(message) {
    console.log("DEBUGGING: handleRecipeVoted called with:", message);
    const { recipes } = message;
    console.log(
      "DEBUGGING: Updating recipes with vote counts:",
      recipes.length,
      "recipes"
    );

    // Replace all recipes with server data (preserving vote counts)
    recipes.forEach((recipe) => {
      console.log(
        "DEBUGGING: Recipe from server:",
        recipe.title,
        "votes:",
        recipe.votes
      );
    });

    // Set recipes directly to preserve server vote counts
    this.storage.setRecipes(recipes);

    console.log("DEBUGGING: Calling refreshRecipesDisplay");
    this.refreshRecipesDisplay();
  }

  /**
   * Handle recipe removed
   */
  handleRecipeRemoved(message) {
    const { recipeId } = message;
    const recipes = this.storage.getRecipes();
    const recipe = recipes.find((r) => r.id === recipeId);
    if (recipe) {
      this.storage.removeRecipe(recipe.id);
      this.refreshRecipesDisplay();
    }
  }

  /**
   * Handle context updated
   */
  handleContextUpdated(message) {
    const { context } = message;
    this.storage.setContext(context);
    this.refreshContextDisplay();
  }

  /**
   * Handle host transfer
   */
  handleHostTransferred(message) {
    const { newHostId, newHostName } = message;
    this.isHost = newHostId === this.ws.userId;
    this.showNotification(`${newHostName} is now the session host`, "info");
    this.refreshHostControls();
  }

  /**
   * Handle host permissions update
   */
  handleHostPermissionsUpdated(message) {
    const { allowRecipeGeneration } = message;
    this.allowRecipeGeneration = allowRecipeGeneration;
    this.refreshHostControls();

    const status = allowRecipeGeneration ? "enabled" : "disabled";
    this.showNotification(`Recipe generation ${status} by host`, "info");
  }

  /**
   * Sync server session data to localStorage
   */
  syncSessionToLocal(session) {
    console.log("Starting full session sync with:", session);

    // Set syncing flag to prevent race conditions during full sync
    if (window.syncState) {
      window.syncState.syncing = true;
    }

    try {
      // Update session info
      this.storage.setSessionInfo(session.id, session.hostId, session.hostName);

      // Update participants
      this.participants = session.participants;

      // Update ingredients with server IDs to maintain consistency
      this.storage.clearIngredients();
      session.ingredients.forEach((ing) => {
        this.storage.addIngredient(ing.name, ing.addedBy, ing.id);
      });
      console.log("Synced ingredients:", session.ingredients.length);

      // Update blacklist
      this.storage.clearBlacklist();
      session.blacklist.forEach((item) => {
        this.storage.addToBlacklist(item);
      });

      // Update context
      this.storage.setContext(session.context);

      // Update recipes
      this.storage.clearRecipes();
      session.recipes.forEach((recipe) => {
        this.storage.addRecipe(recipe);
      });

      // Update permissions
      this.allowRecipeGeneration = session.allowRecipeGeneration;

      // Refresh UI
      this.refreshAllDisplays();
    } finally {
      // Clear syncing flag
      if (window.syncState) {
        window.syncState.syncing = false;
      }
    }

    console.log("Completed full session sync");
  }

  /**
   * Show notification to user
   */
  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);

    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  /**
   * Refresh all UI displays
   */
  refreshAllDisplays() {
    this.refreshIngredientsDisplay();
    this.refreshRecipesDisplay();
    this.refreshContextDisplay();
    this.refreshHostControls();
    this.updateParticipantsList();
  }

  /**
   * Refresh ingredients display (if function exists)
   */
  refreshIngredientsDisplay() {
    if (typeof window.updateIngredientsDisplay === "function") {
      window.updateIngredientsDisplay();
    }
  }

  /**
   * Refresh recipes display (if function exists)
   */
  refreshRecipesDisplay() {
    console.log("DEBUGGING: refreshRecipesDisplay called");
    if (typeof window.updateRecipesDisplay === "function") {
      console.log("DEBUGGING: Calling window.updateRecipesDisplay()");
      window.updateRecipesDisplay();
    } else {
      console.log("DEBUGGING: window.updateRecipesDisplay function not found");
    }
  }

  /**
   * Refresh context display (if function exists)
   */
  refreshContextDisplay() {
    if (typeof window.updateContextDisplay === "function") {
      window.updateContextDisplay();
    }
  }

  /**
   * Refresh host controls (if function exists)
   */
  refreshHostControls() {
    if (typeof window.updateHostControls === "function") {
      window.updateHostControls(this.isHost, this.allowRecipeGeneration);
    }
  }

  /**
   * Update participants list (if function exists)
   */
  updateParticipantsList() {
    if (typeof window.updateParticipantsList === "function") {
      window.updateParticipantsList(this.participants);
    }
  }
}

// Export classes for use in other scripts or make globally available
if (typeof window !== "undefined") {
  window.WebSocketManager = WebSocketManager;
  window.SessionSyncManager = SessionSyncManager;
}

export { WebSocketManager, SessionSyncManager };
