import { FOOD_DATABASE, UNIT_MULTIPLIERS } from './nutritionData.js';

// Number words mapping
const WORD_NUMBERS = {
  'a': 1,
  'an': 1,
  'one': 1,
  'two': 2,
  'three': 3,
  'four': 4,
  'five': 5,
  'six': 6,
  'seven': 7,
  'eight': 8,
  'nine': 9,
  'ten': 10,
  'half': 0.5,
  'quarter': 0.25,
  'couple': 2,
  'few': 3
};

// Meal types keywords
const MEAL_KEYWORDS = {
  breakfast: ['breakfast', 'morning', 'brunch'],
  lunch: ['lunch', 'afternoon', 'noon'],
  dinner: ['dinner', 'supper', 'night'],
  snack: ['snack', 'snacks', 'evening', 'tea time']
};

/**
 * Clean and normalize text
 */
function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/[.,;:]/g, ' , ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect meal type from input sentence if present
 */
export function detectMealType(rawText) {
  const text = rawText.toLowerCase();
  for (const [meal, keywords] of Object.entries(MEAL_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(`for ${kw}`) || text.includes(`in ${kw}`) || text.includes(`as ${kw}`) || text.includes(kw)) {
        return meal;
      }
    }
  }
  // Default based on current time
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  if (hour < 20) return 'snack';
  return 'dinner';
}

/**
 * Parse fraction string or numeric word to float
 */
function parseQuantityValue(valStr) {
  if (!valStr) return 1;
  const s = valStr.trim();
  if (WORD_NUMBERS[s] !== undefined) return WORD_NUMBERS[s];
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
    }
  }
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 1 : parsed;
}

/**
 * Get all available foods including custom user-added foods
 */
export function getAllFoods(customFoods = []) {
  return [...customFoods, ...FOOD_DATABASE];
}

/**
 * Find matching food item in database
 */
export function findFoodMatch(query, foodsList) {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  // 1. Exact alias match
  for (const food of foodsList) {
    for (const name of food.names) {
      if (name.toLowerCase() === q) {
        return food;
      }
    }
  }

  // 2. Query contains full alias name
  let bestMatch = null;
  let maxMatchLength = 0;
  for (const food of foodsList) {
    for (const name of food.names) {
      const nameL = name.toLowerCase();
      if (q.includes(nameL) || nameL.includes(q)) {
        if (nameL.length > maxMatchLength) {
          bestMatch = food;
          maxMatchLength = nameL.length;
        }
      }
    }
  }
  if (bestMatch) return bestMatch;

  // 3. Word-by-word token overlap match
  const qWords = q.split(/\s+/).filter(w => w.length > 2);
  let bestScore = 0;
  for (const food of foodsList) {
    let score = 0;
    for (const name of food.names) {
      const nameWords = name.toLowerCase().split(/\s+/);
      for (const qw of qWords) {
        if (nameWords.includes(qw)) score += 2;
        else if (nameWords.some(nw => nw.includes(qw) || qw.includes(nw))) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = food;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

/**
 * Calculate scaled nutrition values
 */
export function calculateNutrients(food, quantity, unit) {
  let multiplier = 1;
  const qty = parseFloat(quantity) || 1;

  if (food.defaultUnit === 'g') {
    // Database base is for 100g
    if (unit === 'g' || unit === 'grams' || unit === 'gram') {
      multiplier = (qty / 100);
    } else if (unit === 'kg') {
      multiplier = (qty * 1000) / 100;
    } else if (unit === 'oz') {
      multiplier = (qty * 28.35) / 100;
    } else if (unit === 'cup' || unit === 'cups' || unit === 'bowl' || unit === 'bowls') {
      multiplier = (qty * 150) / 100;
    } else {
      multiplier = qty;
    }
  } else {
    // Database base is for 1 defaultUnit
    const unitFactor = UNIT_MULTIPLIERS[unit] || 1;
    multiplier = qty * unitFactor;
  }

  return {
    calories: Math.round(food.calories * multiplier * 10) / 10,
    protein: Math.round(food.protein * multiplier * 10) / 10,
    carbs: Math.round(food.carbs * multiplier * 10) / 10,
    fat: Math.round(food.fat * multiplier * 10) / 10,
    fiber: Math.round((food.fiber || 0) * multiplier * 10) / 10,
    sugar: Math.round((food.sugar || 0) * multiplier * 10) / 10,
    sodium: Math.round((food.sodium || 0) * multiplier),
    potassium: Math.round((food.potassium || 0) * multiplier),
    calcium: Math.round((food.calcium || 0) * multiplier),
    iron: Math.round(((food.iron || 0) * multiplier) * 10) / 10,
    vitaminA: Math.round((food.vitaminA || 0) * multiplier),
    vitaminC: Math.round(((food.vitaminC || 0) * multiplier) * 10) / 10,
    servingWeightG: Math.round((food.servingWeightG || 100) * multiplier)
  };
}

/**
 * Parse an individual segment (e.g., "2 boiled eggs" or "100g chicken breast")
 */
export function parseSingleItem(segment, customFoods = []) {
  const foods = getAllFoods(customFoods);
  const s = segment.trim();
  if (!s) return null;

  // Regex to extract quantity and optional unit at the beginning or end
  // Patterns like:
  // "2.5 cups of oatmeal", "100g grilled chicken", "1 slice whole wheat bread", "2 boiled eggs", "a banana"
  const qtyUnitRegex = /^(\d+\/\d+|\d+\.?\d*|\ba\b|\ban\b|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bhalf\b|\bcouple\b)?\s*(grams?|g|kg|ml|cups?|glasses?|bowls?|plates?|slices?|pieces?|eggs?|tbsp|tablespoons?|tsp|teaspoons?|scoops?|handful|can|medium|large|small)?\s*(?:of\s+)?(.*)$/i;

  const match = s.match(qtyUnitRegex);
  let rawQty = '1';
  let rawUnit = '';
  let foodQuery = s;

  if (match) {
    if (match[1]) rawQty = match[1];
    if (match[2]) rawUnit = match[2].toLowerCase();
    if (match[3] && match[3].trim()) {
      foodQuery = match[3].trim();
    }
  }

  // Strip leading words like "having", "ate", "had", "with", "and"
  foodQuery = foodQuery
    .replace(/^(had|ate|having|consumed|took|drank|eaten|with|and)\s+/i, '')
    .replace(/\s+(for\s+breakfast|for\s+lunch|for\s+dinner|for\s+snack|as\s+a\s+snack|in\s+lunch|in\s+dinner)$/i, '')
    .trim();

  const quantity = parseQuantityValue(rawQty);
  const matchedFood = findFoodMatch(foodQuery, foods);

  if (matchedFood) {
    const finalUnit = rawUnit || matchedFood.defaultUnit;
    const nutrients = calculateNutrients(matchedFood, quantity, finalUnit);
    return {
      success: true,
      originalText: segment,
      foodId: matchedFood.id,
      foodName: matchedFood.names[0].replace(/\b\w/g, l => l.toUpperCase()),
      category: matchedFood.category,
      quantity,
      unit: finalUnit,
      nutrients
    };
  }

  // Fallback if not directly matched: estimate or allow user correction
  return {
    success: false,
    originalText: segment,
    foodName: foodQuery.replace(/\b\w/g, l => l.toUpperCase()),
    quantity,
    unit: rawUnit || 'serving',
    nutrients: {
      calories: Math.round(quantity * 150),
      protein: Math.round(quantity * 5),
      carbs: Math.round(quantity * 20),
      fat: Math.round(quantity * 5),
      fiber: 2,
      sugar: 2,
      sodium: 100,
      potassium: 100,
      calcium: 20,
      iron: 1,
      vitaminA: 0,
      vitaminC: 0,
      servingWeightG: 100 * quantity
    }
  };
}

/**
 * Natural language parser for full voice transcript or multi-item text
 */
export function parseFoodInput(rawInput, customFoods = []) {
  if (!rawInput || !rawInput.trim()) return { mealType: 'snack', items: [] };

  const mealType = detectMealType(rawInput);

  // Clean sentence structure
  let cleaned = rawInput
    .replace(/(for|in|as)\s+(breakfast|lunch|dinner|snack|supper|brunch)/gi, '')
    .replace(/\bi (had|ate|consumed|took|drank|eaten|am having|want to log)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Split by commas, 'and', '+', '&', 'with', newlines
  const rawSegments = cleaned
    .split(/,|\band\b|\bwith\b|\+|\&|\n/gi)
    .map(s => s.trim())
    .filter(s => s.length > 1);

  const items = [];
  for (const seg of rawSegments) {
    const parsed = parseSingleItem(seg, customFoods);
    if (parsed) {
      items.push(parsed);
    }
  }

  return {
    mealType,
    items
  };
}
