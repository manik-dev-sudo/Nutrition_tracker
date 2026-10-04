import { parseFoodInput, getAllFoods, calculateNutrients, detectMealType } from './parser.js';
import { createCalorieRing, renderMacroDonut, renderMonthlyTrendChart } from './charts.js';
import { FOOD_DATABASE } from './nutritionData.js';

// --- STATE MANAGEMENT ---
const STORAGE_KEYS = {
  LOGS: 'health_diary_logs',
  WATER: 'health_diary_water',
  GOALS: 'health_diary_goals',
  CUSTOM_FOODS: 'health_diary_custom_foods'
};

const DEFAULT_GOALS = {
  calories: 2000,
  protein: 130,
  carbs: 220,
  fat: 65,
  fiber: 30,
  water: 2500
};

// Helper: Format Date to YYYY-MM-DD
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

let currentDate = formatDate(new Date());
let selectedAnalysisDate = formatDate(new Date());
let selectedMonth = currentDate.slice(0, 7); // 'YYYY-MM'

let userGoals = loadGoals();
let customFoods = loadCustomFoods();
let parsedReviewItems = [];
let parsedReviewMeal = 'breakfast';

// --- DATA ACCESSORS ---
function loadGoals() {
  const saved = localStorage.getItem(STORAGE_KEYS.GOALS) || localStorage.getItem('nutripulse_goals');
  return saved ? { ...DEFAULT_GOALS, ...JSON.parse(saved) } : { ...DEFAULT_GOALS };
}

function saveGoals(goals) {
  userGoals = goals;
  localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
}

function loadCustomFoods() {
  const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_FOODS) || localStorage.getItem('nutripulse_custom_foods');
  return saved ? JSON.parse(saved) : [];
}

function saveCustomFood(food) {
  customFoods.push(food);
  localStorage.setItem(STORAGE_KEYS.CUSTOM_FOODS, JSON.stringify(customFoods));
}

function getAllLogs() {
  const saved = localStorage.getItem(STORAGE_KEYS.LOGS) || localStorage.getItem('nutripulse_logs');
  return saved ? JSON.parse(saved) : {};
}

function getLogsForDate(dateStr) {
  const logs = getAllLogs();
  return logs[dateStr] || [];
}

function saveLogsForDate(dateStr, items) {
  const logs = getAllLogs();
  logs[dateStr] = items;
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
}

function getWaterForDate(dateStr) {
  const water = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATER) || localStorage.getItem('nutripulse_water') || '{}');
  return water[dateStr] || 0;
}

function setWaterForDate(dateStr, ml) {
  const water = JSON.parse(localStorage.getItem(STORAGE_KEYS.WATER) || '{}');
  water[dateStr] = Math.max(0, ml);
  localStorage.setItem(STORAGE_KEYS.WATER, JSON.stringify(water));
}

// Toast notification helper
function showToast(message, icon = '✨') {
  const toast = document.getElementById('toastNotification');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');
  if (!toast) return;

  msgEl.textContent = message;
  iconEl.textContent = icon;
  toast.classList.remove('opacity-0', 'translate-y-20', 'pointer-events-none');

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-20', 'pointer-events-none');
  }, 2800);
}

// --- SPEECH RECOGNITION SETUP ---
let recognition = null;
let isRecording = false;

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const micBtn = document.getElementById('voiceMicBtn');
  const statusText = document.getElementById('micStatusText');
  const foodInput = document.getElementById('foodInputText');

  if (!SpeechRecognition) {
    if (statusText) statusText.textContent = "Speech not supported in browser";
    if (micBtn) {
      micBtn.classList.add('opacity-50', 'cursor-not-allowed');
      micBtn.onclick = () => {
        alert("Speech Recognition API is not supported in this browser. You can type your food directly in the text area!");
      };
    }
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add('recording');
    statusText.textContent = "Listening... Speak now!";
    statusText.classList.add('text-red-600');
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    foodInput.value = transcript;
    document.getElementById('clearInputBtn').classList.remove('hidden');
  };

  recognition.onerror = (event) => {
    console.warn('Speech error:', event.error);
    isRecording = false;
    micBtn.classList.remove('recording');
    statusText.textContent = "Tap to Speak";
    statusText.classList.remove('text-red-600');
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.classList.remove('recording');
    statusText.textContent = "Tap to Speak";
    statusText.classList.remove('text-red-600');

    // If text was recognized, auto-trigger preview
    if (foodInput.value.trim()) {
      handleParseInput();
    }
  };

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      recognition.stop();
    } else {
      foodInput.value = '';
      try {
        recognition.start();
      } catch (err) {
        console.error("Mic start error:", err);
      }
    }
  });
}

// --- PARSING & FOOD LOGGING ---
function handleParseInput() {
  const input = document.getElementById('foodInputText').value.trim();
  if (!input) {
    showToast("Please enter or speak what you ate!", "⚠️");
    return;
  }

  const selectedMeal = document.getElementById('mealTypeSelect').value;
  const result = parseFoodInput(input, customFoods);
  
  parsedReviewMeal = (selectedMeal === 'auto') ? result.mealType : selectedMeal;
  parsedReviewItems = result.items;

  if (parsedReviewItems.length === 0) {
    showToast("Could not recognize foods. Try typing simply like '2 eggs and 1 banana'", "❓");
    return;
  }

  renderParsedReviewBox();
}

function renderParsedReviewBox() {
  const container = document.getElementById('parsedReviewContainer');
  const list = document.getElementById('parsedItemsList');
  const mealBadge = document.getElementById('parsedMealBadge');
  const totalCalsEl = document.getElementById('parsedTotalCalories');

  if (!container || !list) return;

  mealBadge.textContent = parsedReviewMeal.toUpperCase();
  list.innerHTML = '';

  let totalCals = 0;

  parsedReviewItems.forEach((item, index) => {
    totalCals += item.nutrients.calories;

    const row = document.createElement('div');
    row.className = 'bg-white p-3.5 rounded-xl border border-emerald-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';
    row.innerHTML = `
      <div class="flex-1">
        <div class="flex items-center gap-2">
          <span class="font-bold text-sm text-slate-800">${item.foodName}</span>
          ${item.success ? '' : '<span class="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Estimated</span>'}
        </div>
        <div class="flex flex-wrap gap-2 text-xs text-slate-500 mt-1">
          <span class="font-semibold text-slate-700">${item.nutrients.calories} kcal</span>
          <span>•</span>
          <span class="text-blue-600 font-medium">P: ${item.nutrients.protein}g</span>
          <span>•</span>
          <span class="text-amber-600 font-medium">C: ${item.nutrients.carbs}g</span>
          <span>•</span>
          <span class="text-pink-600 font-medium">F: ${item.nutrients.fat}g</span>
          <span>•</span>
          <span class="text-emerald-600 font-medium">Fiber: ${item.nutrients.fiber}g</span>
        </div>
      </div>

      <!-- Quantity Stepper & Delete -->
      <div class="flex items-center gap-2 self-end sm:self-auto">
        <div class="flex items-center border border-slate-200 rounded-lg bg-slate-50">
          <button class="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs font-bold dec-qty-btn" data-index="${index}">-</button>
          <span class="px-2 text-xs font-bold text-slate-800">${item.quantity} ${item.unit}</span>
          <button class="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs font-bold inc-qty-btn" data-index="${index}">+</button>
        </div>
        <button class="text-red-400 hover:text-red-600 p-1 delete-parsed-btn" data-index="${index}" title="Remove item">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;
    list.appendChild(row);
  });

  totalCalsEl.textContent = Math.round(totalCals);
  container.classList.remove('hidden');

  // Bind adjuster buttons
  list.querySelectorAll('.dec-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      if (parsedReviewItems[idx].quantity > 0.5) {
        parsedReviewItems[idx].quantity = Math.round((parsedReviewItems[idx].quantity - 0.5) * 10) / 10;
        recalculateParsedItem(idx);
      }
    });
  });

  list.querySelectorAll('.inc-qty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      parsedReviewItems[idx].quantity = Math.round((parsedReviewItems[idx].quantity + 0.5) * 10) / 10;
      recalculateParsedItem(idx);
    });
  });

  list.querySelectorAll('.delete-parsed-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'));
      parsedReviewItems.splice(idx, 1);
      if (parsedReviewItems.length === 0) {
        container.classList.add('hidden');
      } else {
        renderParsedReviewBox();
      }
    });
  });
}

function recalculateParsedItem(idx) {
  const item = parsedReviewItems[idx];
  const allFoods = getAllFoods(customFoods);
  const matchedFood = allFoods.find(f => f.id === item.foodId);
  if (matchedFood) {
    item.nutrients = calculateNutrients(matchedFood, item.quantity, item.unit);
  } else {
    item.nutrients.calories = Math.round(item.quantity * 150);
    item.nutrients.protein = Math.round(item.quantity * 5);
    item.nutrients.carbs = Math.round(item.quantity * 20);
    item.nutrients.fat = Math.round(item.quantity * 5);
  }
  renderParsedReviewBox();
}

function confirmAddParsedLogs() {
  if (parsedReviewItems.length === 0) return;

  const currentLogs = getLogsForDate(currentDate);
  parsedReviewItems.forEach(item => {
    currentLogs.push({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      foodName: item.foodName,
      meal: parsedReviewMeal,
      quantity: item.quantity,
      unit: item.unit,
      nutrients: item.nutrients,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  saveLogsForDate(currentDate, currentLogs);

  // Clear inputs & preview
  document.getElementById('foodInputText').value = '';
  document.getElementById('clearInputBtn').classList.add('hidden');
  document.getElementById('parsedReviewContainer').classList.add('hidden');
  parsedReviewItems = [];

  showToast(`Added ${parsedReviewMeal} items to today's log!`, '🥗');
  updateAllViews();
}

// --- RENDER SECTION 1: HOME DASHBOARD ---
function renderHomeDashboard() {
  const logs = getLogsForDate(currentDate);
  const water = getWaterForDate(currentDate);

  // Calculate totals
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0, totalFiber = 0;

  const mealTotals = {
    breakfast: { cal: 0, items: [] },
    lunch: { cal: 0, items: [] },
    dinner: { cal: 0, items: [] },
    snack: { cal: 0, items: [] }
  };

  logs.forEach(log => {
    totalCal += log.nutrients.calories || 0;
    totalP += log.nutrients.protein || 0;
    totalC += log.nutrients.carbs || 0;
    totalF += log.nutrients.fat || 0;
    totalFiber += log.nutrients.fiber || 0;

    const mealKey = mealTotals[log.meal] ? log.meal : 'snack';
    mealTotals[mealKey].cal += log.nutrients.calories || 0;
    mealTotals[mealKey].items.push(log);
  });

  // Date badge
  const dateObj = new Date();
  const dateFormatted = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  document.getElementById('todayDateLabel').textContent = dateFormatted;

  // Render Calorie Ring
  createCalorieRing('homeCalorieRingContainer', totalCal, userGoals.calories);
  document.getElementById('homeCalorieGoalText').textContent = `${userGoals.calories} kcal`;

  const deficit = userGoals.calories - totalCal;
  const deficitEl = document.getElementById('homeDeficitText');
  if (deficit >= 0) {
    deficitEl.textContent = `${Math.round(deficit)} kcal left`;
    deficitEl.className = 'text-sm font-bold text-emerald-600';
  } else {
    deficitEl.textContent = `+${Math.round(Math.abs(deficit))} kcal over`;
    deficitEl.className = 'text-sm font-bold text-red-600';
  }

  // Render Macro Progress Bars
  const pPct = Math.min(Math.round((totalP / userGoals.protein) * 100), 100);
  const cPct = Math.min(Math.round((totalC / userGoals.carbs) * 100), 100);
  const fPct = Math.min(Math.round((totalF / userGoals.fat) * 100), 100);
  const fibPct = Math.min(Math.round((totalFiber / userGoals.fiber) * 100), 100);

  document.getElementById('homeProteinText').textContent = `${totalP.toFixed(1)}g / ${userGoals.protein}g`;
  document.getElementById('homeProteinBar').style.width = `${pPct}%`;

  document.getElementById('homeCarbsText').textContent = `${totalC.toFixed(1)}g / ${userGoals.carbs}g`;
  document.getElementById('homeCarbsBar').style.width = `${cPct}%`;

  document.getElementById('homeFatText').textContent = `${totalF.toFixed(1)}g / ${userGoals.fat}g`;
  document.getElementById('homeFatBar').style.width = `${fPct}%`;

  document.getElementById('homeFiberText').textContent = `${totalFiber.toFixed(1)}g / ${userGoals.fiber}g`;
  document.getElementById('homeFiberBar').style.width = `${fibPct}%`;

  // Macro ratio text
  const macroCalTotal = (totalP * 4) + (totalC * 4) + (totalF * 9);
  if (macroCalTotal > 0) {
    const pRatio = Math.round(((totalP * 4) / macroCalTotal) * 100);
    const cRatio = Math.round(((totalC * 4) / macroCalTotal) * 100);
    const fRatio = Math.max(0, 100 - pRatio - cRatio);
    document.getElementById('homeMacroRatio').textContent = `${pRatio}% P / ${cRatio}% C / ${fRatio}% F`;
  } else {
    document.getElementById('homeMacroRatio').textContent = `0% P / 0% C / 0% F`;
  }

  // Hydration
  document.getElementById('waterCountText').textContent = `${water} / ${userGoals.water} ml`;
  const waterPct = Math.min(Math.round((water / userGoals.water) * 100), 100);
  document.getElementById('waterProgressBar').style.width = `${waterPct}%`;

  // Render Meal Cards
  ['breakfast', 'lunch', 'dinner', 'snack'].forEach(mealKey => {
    const meal = mealTotals[mealKey];
    document.getElementById(`mealCal-${mealKey}`).textContent = `${Math.round(meal.cal)} kcal`;
    const container = document.getElementById(`mealItems-${mealKey}`);

    if (meal.items.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 italic">No food logged for ${mealKey}</p>`;
    } else {
      container.innerHTML = '';
      meal.items.forEach(log => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flex items-center justify-between p-2 rounded-xl bg-white border border-slate-100 shadow-xs';
        itemEl.innerHTML = `
          <div class="flex-1 pr-2">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-slate-800">${log.foodName}</span>
              <span class="text-[10px] text-slate-400">(${log.quantity} ${log.unit})</span>
            </div>
            <div class="text-[11px] text-slate-500 flex gap-2 mt-0.5">
              <span class="font-semibold text-emerald-600">${log.nutrients.calories} kcal</span>
              <span>P: ${log.nutrients.protein}g</span>
              <span>C: ${log.nutrients.carbs}g</span>
              <span>F: ${log.nutrients.fat}g</span>
            </div>
          </div>
          <button class="delete-log-btn text-slate-300 hover:text-red-500 p-1" data-id="${log.id}" title="Delete log">
            ✕
          </button>
        `;
        container.appendChild(itemEl);
      });
    }
  });

  // Bind delete buttons on meal cards
  document.querySelectorAll('.delete-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const updated = getLogsForDate(currentDate).filter(l => l.id !== id);
      saveLogsForDate(currentDate, updated);
      showToast("Item removed", "🗑️");
      updateAllViews();
    });
  });
}

// --- RENDER SECTION 2: DAILY ANALYSIS ---
function renderDailyAnalysis() {
  const dateStr = selectedAnalysisDate;
  const inputEl = document.getElementById('analysisDateInput');
  if (inputEl) inputEl.value = dateStr;

  const logs = getLogsForDate(dateStr);

  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0, totalFiber = 0;
  let totalSugar = 0, totalSodium = 0, totalPotassium = 0, totalCalcium = 0, totalIron = 0;
  let totalVitA = 0, totalVitC = 0, totalWeight = 0;

  const mealCals = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };

  logs.forEach(log => {
    const n = log.nutrients || {};
    totalCal += n.calories || 0;
    totalP += n.protein || 0;
    totalC += n.carbs || 0;
    totalF += n.fat || 0;
    totalFiber += n.fiber || 0;
    totalSugar += n.sugar || 0;
    totalSodium += n.sodium || 0;
    totalPotassium += n.potassium || 0;
    totalCalcium += n.calcium || 0;
    totalIron += n.iron || 0;
    totalVitA += n.vitaminA || 0;
    totalVitC += n.vitaminC || 0;
    totalWeight += n.servingWeightG || 100;

    const mk = mealCals[log.meal] !== undefined ? log.meal : 'snack';
    mealCals[mk] += n.calories || 0;
  });

  // Macro Donut
  renderMacroDonut('analysisMacroDonutContainer', totalP, totalC, totalF);

  // Totals & Calories summary
  document.getElementById('analysisTotalCal').textContent = Math.round(totalCal);
  document.getElementById('analysisGoalCal').textContent = userGoals.calories;

  const diff = totalCal - userGoals.calories;
  const balanceEl = document.getElementById('analysisBalanceText');
  if (Math.abs(diff) <= 100 && totalCal > 0) {
    balanceEl.textContent = "Exact Target (±100 kcal)";
    balanceEl.className = "text-sm font-bold text-emerald-600";
  } else if (diff < 0) {
    balanceEl.textContent = `${Math.round(Math.abs(diff))} kcal Deficit`;
    balanceEl.className = "text-sm font-bold text-emerald-600";
  } else {
    balanceEl.textContent = `+${Math.round(diff)} kcal Surplus`;
    balanceEl.className = "text-sm font-bold text-red-600";
  }

  // Macro Calories & Pct
  const pCal = totalP * 4;
  const cCal = totalC * 4;
  const fCal = totalF * 9;
  const macroTotal = pCal + cCal + fCal;

  document.getElementById('proteinCalText').textContent = `${Math.round(pCal)} kcal`;
  document.getElementById('proteinPctText').textContent = macroTotal > 0 ? `${Math.round((pCal / macroTotal) * 100)}% of macros` : '0%';

  document.getElementById('carbsCalText').textContent = `${Math.round(cCal)} kcal`;
  document.getElementById('carbsPctText').textContent = macroTotal > 0 ? `${Math.round((cCal / macroTotal) * 100)}% of macros` : '0%';

  document.getElementById('fatCalText').textContent = `${Math.round(fCal)} kcal`;
  document.getElementById('fatPctText').textContent = macroTotal > 0 ? `${Math.round((fCal / macroTotal) * 100)}% of macros` : '0%';

  document.getElementById('totalItemsLoggedCount').textContent = `${logs.length} items`;

  // Meal Proportion Bars
  const setMealBar = (key, barId, textId) => {
    const cal = mealCals[key];
    const pct = totalCal > 0 ? Math.round((cal / totalCal) * 100) : 0;
    document.getElementById(textId).textContent = `${Math.round(cal)} kcal (${pct}%)`;
    document.getElementById(barId).style.width = `${pct}%`;
  };
  setMealBar('breakfast', 'analysisBreakBar', 'analysisBreakCal');
  setMealBar('lunch', 'analysisLunchBar', 'analysisLunchCal');
  setMealBar('dinner', 'analysisDinnerBar', 'analysisDinnerCal');
  setMealBar('snack', 'analysisSnackBar', 'analysisSnackCal');

  // Deep Components Progress Meters
  const updateMeter = (valId, barId, val, target, unit, isCap = false) => {
    const valEl = document.getElementById(valId);
    const barEl = document.getElementById(barId);
    if (!valEl || !barEl) return;

    valEl.textContent = `${typeof val === 'number' ? val.toFixed(val % 1 !== 0 ? 1 : 0) : val}${unit} / ${target}${unit}${isCap ? ' cap' : ''}`;
    const pct = Math.min(Math.round((val / target) * 100), 100);
    barEl.style.width = `${pct}%`;
  };

  updateMeter('compFiberVal', 'compFiberBar', totalFiber, userGoals.fiber, 'g');
  updateMeter('compSugarVal', 'compSugarBar', totalSugar, 50, 'g', true);
  updateMeter('compSodiumVal', 'compSodiumBar', totalSodium, 2300, 'mg', true);
  updateMeter('compPotassiumVal', 'compPotassiumBar', totalPotassium, 3400, 'mg');
  updateMeter('compCalciumVal', 'compCalciumBar', totalCalcium, 1000, 'mg');
  updateMeter('compIronVal', 'compIronBar', totalIron, 18, 'mg');
  updateMeter('compVitCVal', 'compVitCBar', totalVitC, 90, 'mg');
  updateMeter('compVitAVal', 'compVitABar', totalVitA, 3000, ' IU');
  document.getElementById('compWeightVal').textContent = `${Math.round(totalWeight)} g`;

  // Calculate Diet Quality Score
  let score = 70;
  if (totalCal > 0) {
    if (totalP >= userGoals.protein * 0.8) score += 10;
    if (totalFiber >= userGoals.fiber * 0.7) score += 10;
    if (totalSodium <= 2300) score += 5;
    if (totalSugar <= 50) score += 5;
    if (Math.abs(totalCal - userGoals.calories) < 250) score += 10;
  } else {
    score = 0;
  }
  score = Math.min(100, Math.max(0, score));

  let grade = 'A';
  let gradeColor = 'text-emerald-700 bg-emerald-100';
  let gradeLabel = `Optimal Nutrition (${score}/100)`;
  if (score === 0) {
    grade = '-';
    gradeColor = 'text-slate-400 bg-slate-100';
    gradeLabel = 'No logs for this date';
  } else if (score < 60) {
    grade = 'C';
    gradeColor = 'text-amber-700 bg-amber-100';
    gradeLabel = `Needs Improvement (${score}/100)`;
  } else if (score < 80) {
    grade = 'B';
    gradeColor = 'text-blue-700 bg-blue-100';
    gradeLabel = `Good Balance (${score}/100)`;
  }

  const badgeEl = document.getElementById('nutritionQualityBadge');
  badgeEl.className = `w-11 h-11 rounded-2xl font-extrabold text-lg flex items-center justify-center ${gradeColor}`;
  badgeEl.textContent = grade;
  document.getElementById('nutritionQualityLabel').textContent = gradeLabel;

  // Render Table
  const tableBody = document.getElementById('analysisTableBody');
  if (logs.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">No food items logged for this date.</td></tr>`;
  } else {
    tableBody.innerHTML = '';
    logs.forEach(log => {
      const n = log.nutrients;
      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50 transition-colors';
      row.innerHTML = `
        <td class="py-2.5 px-3">
          <span class="font-bold text-slate-900 block">${log.foodName}</span>
          <span class="text-[11px] text-slate-400">${log.quantity} ${log.unit} • ${log.timestamp || ''}</span>
        </td>
        <td class="py-2.5 px-3">
          <span class="badge-pill bg-slate-100 text-slate-700 capitalize font-semibold">${log.meal}</span>
        </td>
        <td class="py-2.5 px-3 text-right font-bold text-emerald-600">${n.calories} kcal</td>
        <td class="py-2.5 px-3 text-right text-blue-600 font-semibold">${n.protein}g</td>
        <td class="py-2.5 px-3 text-right text-amber-600 font-semibold">${n.carbs}g</td>
        <td class="py-2.5 px-3 text-right text-pink-600 font-semibold">${n.fat}g</td>
        <td class="py-2.5 px-3 text-right text-slate-600">${n.fiber}g</td>
        <td class="py-2.5 px-3 text-right text-slate-600">${n.sodium}mg</td>
      `;
      tableBody.appendChild(row);
    });
  }
}

// --- RENDER SECTION 3: MONTHLY REPORT & CALENDAR ---
function renderMonthlyReport() {
  const monthInput = document.getElementById('monthlyPickerInput');
  if (monthInput) monthInput.value = selectedMonth;

  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr); // 1-12

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

  const allLogs = getAllLogs();
  const monthDaysData = [];

  let trackedDaysCount = 0;
  let totalMonthCal = 0;
  let totalMonthProtein = 0;
  let targetHits = 0;
  const foodCounts = {};

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const dateKey = `${yearStr}-${monthStr}-${dStr}`;
    const dayLogs = allLogs[dateKey] || [];

    let dayCal = 0;
    let dayProt = 0;

    dayLogs.forEach(l => {
      dayCal += l.nutrients.calories || 0;
      dayProt += l.nutrients.protein || 0;
      foodCounts[l.foodName] = (foodCounts[l.foodName] || 0) + 1;
    });

    if (dayLogs.length > 0) {
      trackedDaysCount++;
      totalMonthCal += dayCal;
      totalMonthProtein += dayProt;
      if (Math.abs(dayCal - userGoals.calories) <= userGoals.calories * 0.15) {
        targetHits++;
      }
    }

    monthDaysData.push({
      date: dateKey,
      dayNumber: d,
      calories: dayCal,
      protein: dayProt,
      itemsCount: dayLogs.length
    });
  }

  // Monthly KPIs
  const avgCal = trackedDaysCount > 0 ? Math.round(totalMonthCal / trackedDaysCount) : 0;
  const avgProt = trackedDaysCount > 0 ? Math.round(totalMonthProtein / trackedDaysCount) : 0;
  const hitPct = trackedDaysCount > 0 ? Math.round((targetHits / trackedDaysCount) * 100) : 0;
  const adherence = Math.round((trackedDaysCount / daysInMonth) * 100);

  document.getElementById('monthAvgCal').textContent = `${avgCal} kcal`;
  document.getElementById('monthDaysTracked').textContent = `${trackedDaysCount} / ${daysInMonth} days`;
  document.getElementById('monthAdherence').textContent = `${adherence}% month tracked`;
  document.getElementById('monthAvgProtein').textContent = `${avgProt}g`;
  document.getElementById('monthGoalHitPct').textContent = `${hitPct}%`;

  const delta = avgCal - userGoals.calories;
  const deltaEl = document.getElementById('monthCalDelta');
  if (trackedDaysCount === 0) {
    deltaEl.textContent = 'No logs this month';
    deltaEl.className = 'text-xs font-medium text-slate-400 mt-1 block';
  } else if (Math.abs(delta) < 100) {
    deltaEl.textContent = `On target (±${Math.abs(delta)} kcal)`;
    deltaEl.className = 'text-xs font-medium text-emerald-600 mt-1 block';
  } else if (delta < 0) {
    deltaEl.textContent = `${Math.abs(delta)} kcal under target avg`;
    deltaEl.className = 'text-xs font-medium text-emerald-600 mt-1 block';
  } else {
    deltaEl.textContent = `+${delta} kcal over target avg`;
    deltaEl.className = 'text-xs font-medium text-red-500 mt-1 block';
  }

  // Render Monthly Trend Chart
  renderMonthlyTrendChart('monthlyTrendChartContainer', monthDaysData, userGoals.calories, (clickedDate) => {
    jumpToDateAnalysis(clickedDate);
  });

  // Render Calendar Grid
  const grid = document.getElementById('monthlyCalendarGrid');
  grid.innerHTML = '';

  // Empty slots for previous month padding
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day-cell opacity-25 pointer-events-none bg-slate-50';
    grid.appendChild(emptyCell);
  }

  // Actual day cells
  monthDaysData.forEach(day => {
    const cell = document.createElement('div');
    const isToday = day.date === currentDate;
    const isSelected = day.date === selectedAnalysisDate;
    const hasLogs = day.itemsCount > 0;
    const isOver = day.calories > userGoals.calories;

    let calBadge = '';
    if (hasLogs) {
      const badgeClass = isOver ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700';
      calBadge = `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badgeClass}">${Math.round(day.calories)} kcal</span>`;
    } else {
      calBadge = `<span class="text-[10px] text-slate-300">-</span>`;
    }

    cell.className = `calendar-day-cell ${hasLogs ? 'has-data' : ''} ${isSelected ? 'active-day' : ''}`;
    cell.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold ${isToday ? 'w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center' : 'text-slate-700'}">${day.dayNumber}</span>
        ${hasLogs ? `<span class="w-1.5 h-1.5 rounded-full ${isOver ? 'bg-red-500' : 'bg-emerald-500'}"></span>` : ''}
      </div>
      <div class="mt-1">
        ${calBadge}
      </div>
    `;

    cell.addEventListener('click', () => {
      jumpToDateAnalysis(day.date);
    });

    grid.appendChild(cell);
  });

  // Top Consumed Foods List
  const topList = document.getElementById('monthTopFoodsList');
  const sortedFoods = Object.entries(foodCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (sortedFoods.length === 0) {
    topList.innerHTML = `<div class="text-xs text-slate-400 col-span-3 py-3">No foods recorded this month yet.</div>`;
  } else {
    topList.innerHTML = '';
    sortedFoods.forEach(([name, count], rank) => {
      const el = document.createElement('div');
      el.className = 'flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200';
      el.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-extrabold flex items-center justify-center">#${rank + 1}</span>
          <span class="text-xs font-bold text-slate-800">${name}</span>
        </div>
        <span class="text-xs font-semibold text-slate-500">${count}x logged</span>
      `;
      topList.appendChild(el);
    });
  }
}

function jumpToDateAnalysis(dateStr) {
  selectedAnalysisDate = dateStr;
  switchTab('analysisTab');
  renderDailyAnalysis();
  showToast(`Viewing analysis for ${dateStr}`, '📅');
}

// --- TAB SWITCHING ---
function switchTab(tabId) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));

  const activePane = document.getElementById(tabId);
  const activeBtn = document.querySelector(`[data-tab="${tabId}"]`);

  if (activePane) activePane.classList.remove('hidden');
  if (activeBtn) activeBtn.classList.add('active');

  if (tabId === 'homeTab') renderHomeDashboard();
  if (tabId === 'analysisTab') renderDailyAnalysis();
  if (tabId === 'monthlyTab') renderMonthlyReport();
}

function updateAllViews() {
  renderHomeDashboard();
  renderDailyAnalysis();
  renderMonthlyReport();
}

// --- FOOD LIBRARY MODAL ---
function setupLibraryModal() {
  const modal = document.getElementById('libraryModal');
  const openBtn = document.getElementById('openLibraryBtn');
  const closeBtn = document.getElementById('closeLibraryModalBtn');
  const searchInput = document.getElementById('librarySearchInput');
  const container = document.getElementById('libraryItemsContainer');
  let selectedCategory = 'all';

  const renderList = () => {
    const q = searchInput.value.toLowerCase().trim();
    const all = getAllFoods(customFoods);
    const filtered = all.filter(f => {
      const matchCat = selectedCategory === 'all' || f.category === selectedCategory;
      const matchQ = !q || f.names.some(n => n.toLowerCase().includes(q));
      return matchCat && matchQ;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-slate-400 text-sm">No matching foods found.</div>`;
      return;
    }

    container.innerHTML = '';
    filtered.forEach(food => {
      const el = document.createElement('div');
      el.className = 'p-3 rounded-xl border border-slate-100 hover:border-emerald-200 bg-slate-50/70 hover:bg-emerald-50/30 flex items-center justify-between gap-3 transition-colors';
      el.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold text-slate-800">${food.names[0].replace(/\b\w/g, l => l.toUpperCase())}</span>
            <span class="badge-pill bg-slate-200 text-slate-700 capitalize text-[10px]">${food.category}</span>
          </div>
          <div class="text-xs text-slate-500 mt-0.5">
            1 ${food.defaultUnit} (${food.servingWeightG}g) • <span class="font-bold text-slate-700">${food.calories} kcal</span> • P: ${food.protein}g • C: ${food.carbs}g • F: ${food.fat}g
          </div>
        </div>
        <button class="btn-primary text-xs !py-1.5 !px-3 quick-log-lib-btn" data-food-id="${food.id}">
          + Add to Log
        </button>
      `;
      container.appendChild(el);
    });

    // Quick add button listener
    container.querySelectorAll('.quick-log-lib-btn').forEach(b => {
      b.addEventListener('click', (e) => {
        const id = b.getAttribute('data-food-id');
        const targetFood = all.find(f => f.id === id);
        if (targetFood) {
          const nutrients = calculateNutrients(targetFood, 1, targetFood.defaultUnit);
          const currentLogs = getLogsForDate(currentDate);
          const mealType = detectMealType('');
          currentLogs.push({
            id: 'log_' + Date.now(),
            foodName: targetFood.names[0].replace(/\b\w/g, l => l.toUpperCase()),
            meal: mealType,
            quantity: 1,
            unit: targetFood.defaultUnit,
            nutrients,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
          saveLogsForDate(currentDate, currentLogs);
          showToast(`Logged 1 ${targetFood.defaultUnit} of ${targetFood.names[0]}!`, '🥑');
          modal.classList.remove('open');
          updateAllViews();
        }
      });
    });
  };

  openBtn.addEventListener('click', () => {
    modal.classList.add('open');
    renderList();
  });

  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  searchInput.addEventListener('input', renderList);

  document.querySelectorAll('#libraryCategoryPills .chip').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#libraryCategoryPills .chip').forEach(p => p.classList.remove('active', 'bg-emerald-100', 'text-emerald-800'));
      pill.classList.add('active', 'bg-emerald-100', 'text-emerald-800');
      selectedCategory = pill.getAttribute('data-cat');
      renderList();
    });
  });
}

// --- CUSTOM FOOD CREATOR MODAL ---
function setupCustomFoodModal() {
  const modal = document.getElementById('customFoodModal');
  const openBtn = document.getElementById('quickAddCustomFoodBtn');
  const closeBtn = document.getElementById('closeCustomFoodModalBtn');
  const cancelBtn = document.getElementById('cancelCustomFoodBtn');
  const form = document.getElementById('customFoodForm');

  const open = () => modal.classList.add('open');
  const close = () => {
    modal.classList.remove('open');
    form.reset();
  };

  if (openBtn) openBtn.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (cancelBtn) cancelBtn.addEventListener('click', close);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('customNameInput').value.trim();
    const unit = document.getElementById('customUnitInput').value.trim() || 'serving';
    const cal = parseFloat(document.getElementById('customCalInput').value) || 0;
    const protein = parseFloat(document.getElementById('customProteinInput').value) || 0;
    const carbs = parseFloat(document.getElementById('customCarbsInput').value) || 0;
    const fat = parseFloat(document.getElementById('customFatInput').value) || 0;
    const fiber = parseFloat(document.getElementById('customFiberInput').value) || 0;
    const sodium = parseFloat(document.getElementById('customSodiumInput').value) || 0;

    const newFood = {
      id: 'custom_' + Date.now(),
      names: [name.toLowerCase(), name.toLowerCase() + 's'],
      category: 'custom',
      defaultUnit: unit,
      servingWeightG: 100,
      calories: cal,
      protein,
      carbs,
      fat,
      fiber,
      sugar: 0,
      sodium,
      potassium: 100,
      calcium: 20,
      iron: 1,
      vitaminA: 0,
      vitaminC: 0
    };

    saveCustomFood(newFood);
    showToast(`Added "${name}" to your nutrition database!`, '✨');
    close();
  });
}

// --- GOALS MODAL ---
function setupGoalsModal() {
  const modal = document.getElementById('goalsModal');
  const openBtn = document.getElementById('openGoalsBtn');
  const closeBtn = document.getElementById('closeGoalsModalBtn');
  const cancelBtn = document.getElementById('cancelGoalsBtn');
  const form = document.getElementById('goalsForm');

  const open = () => {
    document.getElementById('goalCaloriesInput').value = userGoals.calories;
    document.getElementById('goalProteinInput').value = userGoals.protein;
    document.getElementById('goalCarbsInput').value = userGoals.carbs;
    document.getElementById('goalFatInput').value = userGoals.fat;
    document.getElementById('goalFiberInput').value = userGoals.fiber;
    document.getElementById('goalWaterInput').value = userGoals.water;
    modal.classList.add('open');
  };

  const close = () => modal.classList.remove('open');

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const updated = {
      calories: parseInt(document.getElementById('goalCaloriesInput').value),
      protein: parseInt(document.getElementById('goalProteinInput').value),
      carbs: parseInt(document.getElementById('goalCarbsInput').value),
      fat: parseInt(document.getElementById('goalFatInput').value),
      fiber: parseInt(document.getElementById('goalFiberInput').value),
      water: parseInt(document.getElementById('goalWaterInput').value)
    };
    saveGoals(updated);
    showToast("Daily goals updated!", "🎯");
    close();
    updateAllViews();
  });
}

// --- DEMO SAMPLE MONTH DATA PRELOADER ---
function preloadSampleMonthData() {
  const allLogs = getAllLogs();
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  const sampleFoods = [
    { name: "Boiled Eggs", unit: "egg", qty: 2, meal: "breakfast", n: { calories: 156, protein: 12.6, carbs: 1.2, fat: 10.6, fiber: 0, sugar: 1.2, sodium: 124, potassium: 126, calcium: 50, iron: 1.2, vitaminA: 520, vitaminC: 0 } },
    { name: "Whole Wheat Bread", unit: "slice", qty: 2, meal: "breakfast", n: { calories: 164, protein: 8, carbs: 28, fat: 2.2, fiber: 4, sugar: 3, sodium: 280, potassium: 150, calcium: 60, iron: 1.8, vitaminA: 0, vitaminC: 0 } },
    { name: "Black Coffee", unit: "cup", qty: 1, meal: "breakfast", n: { calories: 2, protein: 0.3, carbs: 0.2, fat: 0, fiber: 0, sugar: 0, sodium: 5, potassium: 116, calcium: 5, iron: 0.1, vitaminA: 0, vitaminC: 0 } },
    { name: "Grilled Chicken Breast", unit: "g", qty: 150, meal: "lunch", n: { calories: 247, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, sugar: 0, sodium: 111, potassium: 384, calcium: 22, iron: 1.5, vitaminA: 52, vitaminC: 0 } },
    { name: "Steamed White Rice", unit: "cup", qty: 1.5, meal: "lunch", n: { calories: 309, protein: 6.4, carbs: 67.5, fat: 0.6, fiber: 0.9, sugar: 0.1, sodium: 3, potassium: 82, calcium: 24, iron: 2.8, vitaminA: 0, vitaminC: 0 } },
    { name: "Mixed Green Salad", unit: "bowl", qty: 1, meal: "lunch", n: { calories: 45, protein: 1.8, carbs: 8.5, fat: 0.5, fiber: 3.2, sugar: 3.8, sodium: 40, potassium: 320, calcium: 42, iron: 1.2, vitaminA: 1200, vitaminC: 24 } },
    { name: "Handful Almonds", unit: "handful", qty: 1, meal: "snack", n: { calories: 164, protein: 6, carbs: 6.1, fat: 14.2, fiber: 3.5, sugar: 1.2, sodium: 1, potassium: 208, calcium: 76, iron: 1, vitaminA: 0, vitaminC: 0 } },
    { name: "Banana", unit: "medium", qty: 1, meal: "snack", n: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sugar: 14.4, sodium: 1, potassium: 422, calcium: 6, iron: 0.3, vitaminA: 75, vitaminC: 10.3 } },
    { name: "Yellow Dal", unit: "bowl", qty: 1, meal: "dinner", n: { calories: 180, protein: 12, carbs: 28, fat: 3.5, fiber: 7.8, sugar: 1.8, sodium: 320, potassium: 365, calcium: 38, iron: 3.3, vitaminA: 40, vitaminC: 2 } },
    { name: "Roti", unit: "piece", qty: 2, meal: "dinner", n: { calories: 208, protein: 6.2, carbs: 40, fat: 3, fiber: 5, sugar: 1, sodium: 170, potassium: 180, calcium: 30, iron: 2.4, vitaminA: 0, vitaminC: 0 } },
    { name: "Paneer Cubes", unit: "g", qty: 100, meal: "dinner", n: { calories: 265, protein: 18.3, carbs: 3.5, fat: 20.8, fiber: 0, sugar: 2.5, sodium: 22, potassium: 110, calcium: 480, iron: 0.4, vitaminA: 180, vitaminC: 0 } }
  ];

  for (let d = 1; d <= daysInMonth; d++) {
    // Generate realistic logs for 85% of days
    if (Math.random() > 0.15) {
      const dStr = String(d).padStart(2, '0');
      const dateKey = `${yearStr}-${monthStr}-${dStr}`;
      
      // Randomly pick subset of sample foods
      const count = Math.floor(Math.random() * 4) + 6;
      const dayItems = [];
      for (let i = 0; i < count; i++) {
        const item = sampleFoods[Math.floor(Math.random() * sampleFoods.length)];
        dayItems.push({
          id: 'demo_' + dateKey + '_' + i,
          foodName: item.name,
          meal: item.meal,
          quantity: item.qty,
          unit: item.unit,
          nutrients: { ...item.n },
          timestamp: '12:00 PM'
        });
      }
      allLogs[dateKey] = dayItems;
    }
  }

  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(allLogs));
  showToast(`Sample nutrition logs preloaded for ${selectedMonth}!`, '🚀');
  updateAllViews();
}

// --- EXPORT TO CSV ---
function exportMonthToCSV() {
  const allLogs = getAllLogs();
  const [yearStr, monthStr] = selectedMonth.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const daysInMonth = new Date(year, month, 0).getDate();

  let csv = 'Date,Food Item,Meal,Portion,Calories (kcal),Protein (g),Carbs (g),Fat (g),Fiber (g),Sodium (mg)\n';

  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = String(d).padStart(2, '0');
    const dateKey = `${yearStr}-${monthStr}-${dStr}`;
    const dayLogs = allLogs[dateKey] || [];

    dayLogs.forEach(l => {
      const n = l.nutrients;
      csv += `"${dateKey}","${l.foodName}","${l.meal}","${l.quantity} ${l.unit}",${n.calories},${n.protein},${n.carbs},${n.fat},${n.fiber},${n.sodium}\n`;
    });
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `health_diary_report_${selectedMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Monthly CSV report downloaded!", "📥");
}

// --- EVENT LISTENERS & BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  document.getElementById('brandHomeBtn').addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('homeTab');
  });

  document.getElementById('goToAnalysisFromHomeBtn').addEventListener('click', () => {
    selectedAnalysisDate = currentDate;
    switchTab('analysisTab');
  });

  document.getElementById('changeDateFromHomeBtn').addEventListener('click', () => {
    selectedAnalysisDate = currentDate;
    switchTab('analysisTab');
  });

  // Food Parse Input & Actions
  const parseBtn = document.getElementById('parseFoodBtn');
  const foodInput = document.getElementById('foodInputText');
  const clearBtn = document.getElementById('clearInputBtn');

  parseBtn.addEventListener('click', handleParseInput);

  foodInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleParseInput();
    }
  });

  foodInput.addEventListener('input', () => {
    if (foodInput.value.trim()) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  });

  clearBtn.addEventListener('click', () => {
    foodInput.value = '';
    clearBtn.classList.add('hidden');
  });

  // Example Chips
  document.querySelectorAll('.example-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      foodInput.value = chip.getAttribute('data-sample');
      clearBtn.classList.remove('hidden');
      handleParseInput();
    });
  });

  // Parsed Items Action Buttons
  document.getElementById('confirmAddLogBtn').addEventListener('click', confirmAddParsedLogs);
  document.getElementById('cancelParsedBtn').addEventListener('click', () => {
    document.getElementById('parsedReviewContainer').classList.add('hidden');
    parsedReviewItems = [];
  });

  // Water Actions
  document.getElementById('addWaterGlassBtn').addEventListener('click', () => {
    const cur = getWaterForDate(currentDate);
    setWaterForDate(currentDate, cur + 250);
    renderHomeDashboard();
    showToast("+250ml water added", "💧");
  });

  document.getElementById('addWaterBottleBtn').addEventListener('click', () => {
    const cur = getWaterForDate(currentDate);
    setWaterForDate(currentDate, cur + 500);
    renderHomeDashboard();
    showToast("+500ml water added", "💧");
  });

  document.getElementById('resetWaterBtn').addEventListener('click', () => {
    setWaterForDate(currentDate, 0);
    renderHomeDashboard();
    showToast("Water counter reset", "↺");
  });

  // Clear Today Logs
  document.getElementById('clearTodayLogsBtn').addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all logs for today?")) {
      saveLogsForDate(currentDate, []);
      showToast("Today's food logs cleared", "🗑️");
      updateAllViews();
    }
  });

  // Analysis Date Navigator
  document.getElementById('analysisDateInput').addEventListener('change', (e) => {
    if (e.target.value) {
      selectedAnalysisDate = e.target.value;
      renderDailyAnalysis();
    }
  });

  document.getElementById('prevDayBtn').addEventListener('click', () => {
    const d = new Date(selectedAnalysisDate);
    d.setDate(d.getDate() - 1);
    selectedAnalysisDate = formatDate(d);
    renderDailyAnalysis();
  });

  document.getElementById('nextDayBtn').addEventListener('click', () => {
    const d = new Date(selectedAnalysisDate);
    d.setDate(d.getDate() + 1);
    selectedAnalysisDate = formatDate(d);
    renderDailyAnalysis();
  });

  document.getElementById('todayJumpBtn').addEventListener('click', () => {
    selectedAnalysisDate = currentDate;
    renderDailyAnalysis();
  });

  // Monthly Report Controls
  const monthPicker = document.getElementById('monthlyPickerInput');
  monthPicker.addEventListener('change', (e) => {
    if (e.target.value) {
      selectedMonth = e.target.value;
      renderMonthlyReport();
    }
  });

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderMonthlyReport();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    selectedMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    renderMonthlyReport();
  });

  // Specific Date Direct Explorer in Monthly Tab
  document.getElementById('specificDateDirectPicker').addEventListener('change', (e) => {
    if (e.target.value) {
      jumpToDateAnalysis(e.target.value);
    }
  });

  document.getElementById('preloadDemoDataBtn').addEventListener('click', preloadSampleMonthData);
  document.getElementById('exportCsvBtn').addEventListener('click', exportMonthToCSV);

  // Setup Modals & Voice
  setupSpeechRecognition();
  setupLibraryModal();
  setupCustomFoodModal();
  setupGoalsModal();

  // Initialize initial seed data if empty
  const logs = getAllLogs();
  if (Object.keys(logs).length === 0) {
    // Seed today with a wholesome breakfast & lunch so app looks gorgeous on first load!
    const initialSeed = [
      {
        id: 'seed_1',
        foodName: 'Boiled Eggs',
        meal: 'breakfast',
        quantity: 2,
        unit: 'egg',
        nutrients: { calories: 156, protein: 12.6, carbs: 1.2, fat: 10.6, fiber: 0, sugar: 1.2, sodium: 124, potassium: 126, calcium: 50, iron: 1.2, vitaminA: 520, vitaminC: 0, servingWeightG: 100 },
        timestamp: '08:30 AM'
      },
      {
        id: 'seed_2',
        foodName: 'Whole Wheat Bread',
        meal: 'breakfast',
        quantity: 2,
        unit: 'slice',
        nutrients: { calories: 164, protein: 8, carbs: 28, fat: 2.2, fiber: 4, sugar: 3, sodium: 280, potassium: 150, calcium: 60, iron: 1.8, vitaminA: 0, vitaminC: 0, servingWeightG: 70 },
        timestamp: '08:30 AM'
      },
      {
        id: 'seed_3',
        foodName: 'Grilled Chicken Breast',
        meal: 'lunch',
        quantity: 150,
        unit: 'g',
        nutrients: { calories: 247, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, sugar: 0, sodium: 111, potassium: 384, calcium: 22, iron: 1.5, vitaminA: 52, vitaminC: 0, servingWeightG: 150 },
        timestamp: '01:15 PM'
      },
      {
        id: 'seed_4',
        foodName: 'White Rice',
        meal: 'lunch',
        quantity: 1,
        unit: 'cup',
        nutrients: { calories: 206, protein: 4.3, carbs: 45, fat: 0.4, fiber: 0.6, sugar: 0.1, sodium: 2, potassium: 55, calcium: 16, iron: 1.9, vitaminA: 0, vitaminC: 0, servingWeightG: 158 },
        timestamp: '01:15 PM'
      }
    ];
    saveLogsForDate(currentDate, initialSeed);
    setWaterForDate(currentDate, 1250);
  }

  // Initial Render
  updateAllViews();
});
