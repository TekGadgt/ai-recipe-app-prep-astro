/**
 * Storage utility module for Pantry Party
 * Handles localStorage persistence for session data, ingredients, recipes, and votes
 * Designed to be easily replaceable with other storage backends (Redis, Supabase, etc.)
 */

// Storage keys
const STORAGE_KEYS = {
  SESSION: "pantry_party_session",
  USER: "pantry_party_user",
  OPENAI_KEY: "pantry_party_openai_key",
  INGREDIENTS: "pantry_party_ingredients",
  RECIPES: "pantry_party_recipes",
  VOTES: "pantry_party_votes",
  CONTEXT: "pantry_party_context",
  BLACKLIST: "pantry_party_blacklist",
};

// Session expires after 4 hours of inactivity
const SESSION_TIMEOUT = 4 * 60 * 60 * 1000;

/**
 * Generate a unique ID for users and sessions
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Check if localStorage is available
 */
function isStorageAvailable() {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.warn("localStorage not available, using in-memory storage");
    return false;
  }
}

/**
 * Storage adapter that can be easily swapped out
 */
class StorageAdapter {
  constructor() {
    this.available = isStorageAvailable();
    this.memoryStore = new Map(); // Fallback for when localStorage isn't available
  }

  get(key) {
    if (this.available) {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    }
    return this.memoryStore.get(key) || null;
  }

  set(key, value) {
    if (this.available) {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      this.memoryStore.set(key, value);
    }
  }

  remove(key) {
    if (this.available) {
      localStorage.removeItem(key);
    } else {
      this.memoryStore.delete(key);
    }
  }

  clear() {
    if (this.available) {
      // Only clear Pantry Party keys
      Object.values(STORAGE_KEYS).forEach((key) =>
        localStorage.removeItem(key)
      );
    } else {
      this.memoryStore.clear();
    }
  }
}

const storage = new StorageAdapter();

/**
 * Session Management
 */
export const SessionStorage = {
  create(sessionId, hostId, hostName) {
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
        },
      ],
    };
    storage.set(STORAGE_KEYS.SESSION, session);
    return session;
  },

  get() {
    const session = storage.get(STORAGE_KEYS.SESSION);
    if (!session) return null;

    // Check if session has expired
    if (Date.now() - session.lastActivity > SESSION_TIMEOUT) {
      this.clear();
      return null;
    }

    return session;
  },

  update(updates) {
    const session = this.get();
    if (!session) return null;

    const updatedSession = {
      ...session,
      ...updates,
      lastActivity: Date.now(),
    };
    storage.set(STORAGE_KEYS.SESSION, updatedSession);
    return updatedSession;
  },

  addParticipant(userId, userName) {
    const session = this.get();
    if (!session) return null;

    const participant = { id: userId, name: userName, joinedAt: Date.now() };
    session.participants.push(participant);
    return this.update({ participants: session.participants });
  },

  removeParticipant(userId) {
    const session = this.get();
    if (!session) return null;

    session.participants = session.participants.filter((p) => p.id !== userId);
    return this.update({ participants: session.participants });
  },

  clear() {
    storage.remove(STORAGE_KEYS.SESSION);
  },
};

/**
 * User Management
 */
export const UserStorage = {
  create(name) {
    const user = {
      id: generateId(),
      name,
      createdAt: Date.now(),
    };
    storage.set(STORAGE_KEYS.USER, user);
    return user;
  },

  get() {
    return storage.get(STORAGE_KEYS.USER);
  },

  update(updates) {
    const user = this.get();
    if (!user) return null;

    const updatedUser = { ...user, ...updates };
    storage.set(STORAGE_KEYS.USER, updatedUser);
    return updatedUser;
  },

  clear() {
    storage.remove(STORAGE_KEYS.USER);
  },
};

/**
 * OpenAI API Key Management
 */
export const OpenAIStorage = {
  set(apiKey) {
    storage.set(STORAGE_KEYS.OPENAI_KEY, apiKey);
  },

  get() {
    return storage.get(STORAGE_KEYS.OPENAI_KEY);
  },

  clear() {
    storage.remove(STORAGE_KEYS.OPENAI_KEY);
  },
};

/**
 * Ingredients Management
 */
export const IngredientsStorage = {
  get() {
    return storage.get(STORAGE_KEYS.INGREDIENTS) || [];
  },

  set(ingredients) {
    storage.set(STORAGE_KEYS.INGREDIENTS, ingredients);
  },

  add(ingredient) {
    const ingredients = this.get();

    console.log(
      "IngredientsStorage.add called with:",
      ingredient,
      "Type:",
      typeof ingredient
    );
    // Debug: Force browser cache refresh v2

    // Handle both string and object parameters
    let name, addedBy;
    if (typeof ingredient === "string") {
      name = ingredient.trim().toLowerCase();
      addedBy = "unknown";
    } else if (ingredient && typeof ingredient === "object") {
      if (ingredient.name && typeof ingredient.name === "string") {
        name = ingredient.name.trim().toLowerCase();
        addedBy = ingredient.addedBy || "unknown";
      } else {
        console.error(
          "Invalid ingredient object - missing or invalid name property:",
          ingredient
        );
        return null;
      }
    } else {
      console.error(
        "Invalid ingredient parameter - must be string or object:",
        ingredient
      );
      return null;
    }

    if (!name || name.length === 0) {
      console.error("Empty ingredient name after processing:", ingredient);
      return null;
    }

    // Check for duplicates by name
    const exists = ingredients.some(
      (ing) => ing.name.toLowerCase() === name.toLowerCase()
    );

    if (exists) {
      console.log("Ingredient already exists locally, skipping:", name);
      return null;
    }

    const newIngredient = {
      id: generateId(),
      name: name,
      addedBy: addedBy,
      addedAt: Date.now(),
    };
    ingredients.push(newIngredient);
    this.set(ingredients);
    return newIngredient;
  },

  // Add ingredient with server-provided ID (for WebSocket sync)
  addWithId(ingredient) {
    const ingredients = this.get();

    // Validate ingredient data
    if (!ingredient || !ingredient.id || !ingredient.name) {
      console.error("Invalid ingredient data for addWithId:", ingredient);
      return null;
    }

    // Check if ingredient already exists (by ID or name only)
    const exists = ingredients.some(
      (ing) =>
        ing.id === ingredient.id ||
        ing.name.toLowerCase() === ingredient.name.toLowerCase()
    );

    if (exists) {
      console.log("Ingredient already exists, skipping:", ingredient.name);
      return null;
    }

    const newIngredient = {
      id: ingredient.id,
      name: ingredient.name.toLowerCase(),
      addedBy: ingredient.addedBy,
      addedAt: ingredient.addedAt || Date.now(),
    };

    ingredients.push(newIngredient);
    this.set(ingredients);
    console.log("Added ingredient with server ID:", newIngredient);
    return newIngredient;
  },

  remove(ingredientId) {
    const ingredients = this.get();
    const filtered = ingredients.filter((ing) => ing.id !== ingredientId);
    this.set(filtered);
    return filtered;
  },

  clear() {
    storage.remove(STORAGE_KEYS.INGREDIENTS);
  },
};

/**
 * Blacklist Management
 */
export const BlacklistStorage = {
  get() {
    return storage.get(STORAGE_KEYS.BLACKLIST) || [];
  },

  set(blacklist) {
    storage.set(STORAGE_KEYS.BLACKLIST, blacklist);
  },

  add(ingredient) {
    const blacklist = this.get();
    if (!blacklist.includes(ingredient.toLowerCase())) {
      blacklist.push(ingredient.toLowerCase());
      this.set(blacklist);
    }
  },

  remove(ingredient) {
    const blacklist = this.get();
    const filtered = blacklist.filter(
      (item) => item !== ingredient.toLowerCase()
    );
    this.set(filtered);
  },

  clear() {
    storage.remove(STORAGE_KEYS.BLACKLIST);
  },
};

/**
 * Context Management
 */
export const ContextStorage = {
  get() {
    return storage.get(STORAGE_KEYS.CONTEXT) || "";
  },

  set(context) {
    storage.set(STORAGE_KEYS.CONTEXT, context);
  },

  clear() {
    storage.remove(STORAGE_KEYS.CONTEXT);
  },
};

/**
 * Recipe Management
 */
export const RecipeStorage = {
  get() {
    return storage.get(STORAGE_KEYS.RECIPES) || [];
  },

  set(recipes) {
    storage.set(STORAGE_KEYS.RECIPES, recipes);
  },

  add(recipe) {
    const recipes = this.get();
    const newRecipe = {
      id: generateId(),
      ...recipe,
      createdAt: Date.now(),
      votes: 0,
      votersIds: [],
      isValid: true,
    };
    recipes.push(newRecipe);
    this.set(recipes);
    return newRecipe;
  },

  update(recipeId, updates) {
    const recipes = this.get();
    const index = recipes.findIndex((r) => r.id === recipeId);
    if (index === -1) return null;

    recipes[index] = { ...recipes[index], ...updates };
    this.set(recipes);
    return recipes[index];
  },

  remove(recipeId) {
    const recipes = this.get();
    const filtered = recipes.filter((r) => r.id !== recipeId);
    this.set(filtered);
    return filtered;
  },

  // Mark recipes as invalid when ingredients change significantly
  markInvalidRecipes(currentIngredients) {
    const recipes = this.get();
    const ingredientNames = currentIngredients.map((ing) =>
      ing.name.toLowerCase()
    );

    recipes.forEach((recipe) => {
      if (recipe.ingredients) {
        const missingIngredients = recipe.ingredients.filter(
          (ing) => !ingredientNames.includes(ing.toLowerCase())
        );

        // Mark as invalid if more than 30% of ingredients are missing
        recipe.isValid =
          missingIngredients.length / recipe.ingredients.length < 0.3;
      }
    });

    this.set(recipes);
    return recipes;
  },

  clear() {
    storage.remove(STORAGE_KEYS.RECIPES);
  },
};

/**
 * Vote Management
 */
export const VoteStorage = {
  get() {
    return storage.get(STORAGE_KEYS.VOTES) || {};
  },

  vote(recipeId, userId, voteType) {
    const votes = this.get();
    const userVotes = votes[userId] || {};

    // Remove previous vote for this recipe if it exists
    delete userVotes[recipeId];

    // Add new vote if it's not neutral
    if (voteType !== "neutral") {
      userVotes[recipeId] = voteType;
    }

    votes[userId] = userVotes;
    storage.set(STORAGE_KEYS.VOTES, votes);

    // Update recipe vote count
    this.updateRecipeVoteCounts();

    return votes;
  },

  updateRecipeVoteCounts() {
    const votes = this.get();
    const recipes = RecipeStorage.get();

    recipes.forEach((recipe) => {
      let upvotes = 0;
      let downvotes = 0;
      const voterIds = [];

      Object.entries(votes).forEach(([userId, userVotes]) => {
        if (userVotes[recipe.id]) {
          voterIds.push(userId);
          if (userVotes[recipe.id] === "up") upvotes++;
          else if (userVotes[recipe.id] === "down") downvotes++;
        }
      });

      recipe.votes = upvotes - downvotes;
      recipe.voterIds = voterIds;
    });

    RecipeStorage.set(recipes);
  },

  getUserVote(recipeId, userId) {
    const votes = this.get();
    const userVotes = votes[userId] || {};
    return userVotes[recipeId] || "neutral";
  },

  clear() {
    storage.remove(STORAGE_KEYS.VOTES);
  },
};

/**
 * Clear all app data
 */
export function clearAllData() {
  storage.clear();
}
