/**
 * OpenAI API integration for Pantry Party
 * Handles client-side recipe generation using user-provided API keys
 * All API calls are made from the client to protect API keys
 */

// Import storage utilities
import {
  OpenAIStorage,
  ContextStorage,
  IngredientsStorage,
  BlacklistStorage,
} from "./storage.js";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Validate OpenAI API key format
 */
export function isValidApiKey(apiKey) {
  return (
    apiKey &&
    typeof apiKey === "string" &&
    apiKey.startsWith("sk-") &&
    apiKey.length > 20
  );
}

/**
 * Test API key by making a simple request
 */
export async function testApiKey(apiKey) {
  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: 'Say "API key test successful"' }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      return { success: true, message: "API key is valid" };
    } else {
      const error = await response.json();
      return {
        success: false,
        message: error.error?.message || "Invalid API key",
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "Network error. Please check your connection.",
    };
  }
}

/**
 * Build a comprehensive prompt for recipe generation
 */
function buildRecipePrompt(ingredients, context, blacklist) {
  const ingredientList = ingredients.map((ing) => ing.name).join(", ");
  const blacklistText =
    blacklist.length > 0
      ? `\n\nDO NOT use these ingredients: ${blacklist.join(", ")}`
      : "";
  const contextText = context.trim() ? `\n\nContext: ${context}` : "";

  return `Generate a creative recipe using some or all of these available ingredients: ${ingredientList}${contextText}${blacklistText}

Please provide the response in the following JSON format:
{
  "title": "Recipe Name",
  "description": "Brief description of the dish",
  "difficulty": "Easy|Medium|Hard",
  "prepTime": "15 minutes",
  "cookTime": "30 minutes",
  "servings": 4,
  "ingredients": [
    "1 cup flour",
    "2 eggs",
    "etc..."
  ],
  "instructions": [
    "Step 1: Do this",
    "Step 2: Do that",
    "etc..."
  ],
  "tips": "Optional cooking tips",
  "category": "Main Dish|Appetizer|Dessert|Beverage|Snack"
}

Make the recipe practical and delicious. Only use ingredients from the provided list or common pantry staples (salt, pepper, oil, water, etc.). Ensure the recipe makes sense given the context provided.`;
}

/**
 * Validate recipe against context to prevent illogical combinations
 */
function validateRecipeContext(recipe, context, ingredients) {
  const contextLower = context.toLowerCase();
  const recipeLower = JSON.stringify(recipe).toLowerCase();

  const warnings = [];

  // Check for context mismatches
  if (
    contextLower.includes("dessert") &&
    (recipeLower.includes("chicken") ||
      recipeLower.includes("beef") ||
      recipeLower.includes("pork"))
  ) {
    warnings.push(
      "This recipe contains meat ingredients but the context suggests a dessert"
    );
  }

  if (
    contextLower.includes("vegetarian") &&
    (recipeLower.includes("meat") ||
      recipeLower.includes("chicken") ||
      recipeLower.includes("beef"))
  ) {
    warnings.push(
      "This recipe contains meat but the context suggests vegetarian"
    );
  }

  if (contextLower.includes("drink") && recipe.category !== "Beverage") {
    warnings.push(
      "The context suggests a drink but this recipe is not categorized as a beverage"
    );
  }

  // Check if recipe uses ingredients not in our list
  const availableIngredients = ingredients.map((ing) => ing.name.toLowerCase());
  const commonPantryItems = [
    "salt",
    "pepper",
    "oil",
    "water",
    "butter",
    "flour",
    "sugar",
  ];

  const missingIngredients = recipe.ingredients.filter((recipeIng) => {
    const ingLower = recipeIng.toLowerCase();
    return (
      !availableIngredients.some((available) => ingLower.includes(available)) &&
      !commonPantryItems.some((common) => ingLower.includes(common))
    );
  });

  if (missingIngredients.length > 0) {
    warnings.push(
      `Recipe uses ingredients not in your pantry: ${missingIngredients.join(", ")}`
    );
  }

  return warnings;
}

/**
 * Generate a recipe using OpenAI API
 */
export async function generateRecipe(options = {}) {
  const {
    ingredients = null,
    context = null,
    blacklist = null,
    model = "gpt-3.5-turbo",
  } = options;

  // Get API key
  const apiKey = OpenAIStorage.get();
  if (!isValidApiKey(apiKey)) {
    throw new Error(
      "No valid OpenAI API key found. Please set your API key first."
    );
  }

  // Get data from storage if not provided
  const recipeIngredients = ingredients || IngredientsStorage.get();
  const recipeContext = context !== null ? context : ContextStorage.get();
  const recipeBlacklist = blacklist || BlacklistStorage.get();

  if (recipeIngredients.length === 0) {
    throw new Error(
      "No ingredients available. Please add some ingredients first."
    );
  }

  // Build the prompt
  const prompt = buildRecipePrompt(
    recipeIngredients,
    recipeContext,
    recipeBlacklist
  );

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a professional chef assistant. Always respond with valid JSON format for recipes.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(
        error.error?.message || `API request failed: ${response.status}`
      );
    }

    const data = await response.json();
    const recipeText = data.choices[0]?.message?.content;

    if (!recipeText) {
      throw new Error("No recipe generated. Please try again.");
    }

    // Parse the JSON response
    let recipe;
    try {
      // Clean up the response (remove markdown code blocks if present)
      const cleanedText = recipeText
        .replace(/```json\n?/, "")
        .replace(/```\n?$/, "");
      recipe = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse recipe JSON:", parseError);
      throw new Error("Failed to parse recipe. The AI response was malformed.");
    }

    // Validate required fields
    const requiredFields = ["title", "ingredients", "instructions"];
    for (const field of requiredFields) {
      if (!recipe[field]) {
        throw new Error(`Recipe is missing required field: ${field}`);
      }
    }

    // Set default values for missing optional fields
    recipe.difficulty = recipe.difficulty || "Medium";
    recipe.prepTime = recipe.prepTime || "30 minutes";
    recipe.cookTime = recipe.cookTime || "30 minutes";
    recipe.servings = recipe.servings || 4;
    recipe.category = recipe.category || "Main Dish";
    recipe.description = recipe.description || "";
    recipe.tips = recipe.tips || "";

    // Validate against context
    const warnings = validateRecipeContext(
      recipe,
      recipeContext,
      recipeIngredients
    );
    if (warnings.length > 0) {
      recipe.warnings = warnings;
    }

    // Add metadata
    recipe.generatedAt = Date.now();
    recipe.model = model;
    recipe.usedIngredients = recipeIngredients.map((ing) => ing.name);
    recipe.context = recipeContext;

    return recipe;
  } catch (error) {
    console.error("Recipe generation error:", error);

    // Provide user-friendly error messages
    if (error.message.includes("API key")) {
      throw new Error("Invalid API key. Please check your OpenAI API key.");
    } else if (error.message.includes("quota")) {
      throw new Error(
        "OpenAI API quota exceeded. Please check your OpenAI account."
      );
    } else if (error.message.includes("rate limit")) {
      throw new Error(
        "Rate limit exceeded. Please wait a moment and try again."
      );
    } else {
      throw error;
    }
  }
}

/**
 * Generate multiple recipe variations
 */
export async function generateRecipeVariations(count = 3, options = {}) {
  const recipes = [];
  const errors = [];

  for (let i = 0; i < count; i++) {
    try {
      // Add slight variation to the prompt for each generation
      const variedOptions = {
        ...options,
        context: options.context
          ? `${options.context} (Variation ${i + 1})`
          : `Recipe variation ${i + 1}`,
      };

      const recipe = await generateRecipe(variedOptions);
      recipes.push(recipe);

      // Small delay to avoid hitting rate limits
      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      errors.push({ variation: i + 1, error: error.message });
    }
  }

  return { recipes, errors };
}

/**
 * Estimate recipe generation cost (approximate)
 */
export function estimateApiCost(model = "gpt-3.5-turbo") {
  const costs = {
    "gpt-3.5-turbo": 0.002, // per 1K tokens
    "gpt-4": 0.03,
    "gpt-4-turbo": 0.01,
  };

  const estimatedTokens = 1500; // Conservative estimate for recipe generation
  const costPer1K = costs[model] || costs["gpt-3.5-turbo"];

  return (estimatedTokens / 1000) * costPer1K;
}

/**
 * Get supported models
 */
export function getSupportedModels() {
  return [
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo (Recommended)", cost: "Low" },
    { id: "gpt-4", name: "GPT-4 (High Quality)", cost: "High" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", cost: "Medium" },
  ];
}
