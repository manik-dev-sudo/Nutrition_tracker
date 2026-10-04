/**
 * Clean & Crisp SVG/Canvas Charts Engine for Nutrition & Calorie Tracking
 */

/**
 * Render animated Circular Ring for Calories / Target
 */
export function createCalorieRing(containerId, consumed, target) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const pct = Math.min(Math.round((consumed / target) * 100), 100);
  const isOver = consumed > target;
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const strokeColor = isOver ? '#ef4444' : '#10b981';

  const html = `
    <div class="relative flex items-center justify-center">
      <svg class="w-44 h-44 -rotate-90" viewBox="0 0 160 160">
        <!-- Background Track -->
        <circle
          cx="80"
          cy="80"
          r="${radius}"
          fill="none"
          stroke="#e2e8f0"
          stroke-width="12"
          stroke-linecap="round"
        />
        <!-- Progress Arc -->
        <circle
          cx="80"
          cy="80"
          r="${radius}"
          fill="none"
          stroke="${strokeColor}"
          stroke-width="12"
          stroke-linecap="round"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
          class="transition-all duration-1000 ease-out"
        />
      </svg>
      <div class="absolute flex flex-col items-center justify-center text-center">
        <span class="text-3xl font-extrabold tracking-tight text-slate-900">${Math.round(consumed)}</span>
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">/ ${target} kcal</span>
        <span class="mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${isOver ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}">
          ${isOver ? `+${Math.round(consumed - target)} over` : `${Math.round(target - consumed)} left`}
        </span>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

/**
 * Render Macronutrients Donut Chart with interactive legend
 */
export function renderMacroDonut(containerId, protein, carbs, fat) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const pCals = protein * 4;
  const cCals = carbs * 4;
  const fCals = fat * 9;
  const totalCals = pCals + cCals + fCals;

  if (totalCals === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-48 text-slate-400">
        <svg class="w-10 h-10 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
        <span class="text-sm font-medium">No meals logged yet</span>
      </div>
    `;
    return;
  }

  const pPct = Math.round((pCals / totalCals) * 100);
  const cPct = Math.round((cCals / totalCals) * 100);
  const fPct = Math.max(0, 100 - pPct - cPct);

  const radius = 50;
  const circumference = 2 * Math.PI * radius;

  const pOffset = circumference - (pPct / 100) * circumference;
  const cOffset = circumference - (cPct / 100) * circumference;
  const fOffset = circumference - (fPct / 100) * circumference;

  // Rotation angles for sequential slices
  const pRotation = -90;
  const cRotation = -90 + (pPct / 100) * 360;
  const fRotation = -90 + ((pPct + cPct) / 100) * 360;

  const html = `
    <div class="flex flex-col sm:flex-row items-center gap-6 justify-center">
      <div class="relative flex items-center justify-center w-36 h-36">
        <svg class="w-36 h-36" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#f1f5f9" stroke-width="16" />
          <!-- Protein Segment -->
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#3b82f6" stroke-width="16"
            stroke-dasharray="${circumference}" stroke-dashoffset="${pOffset}"
            transform="rotate(${pRotation} 70 70)" stroke-linecap="round" class="transition-all duration-700" />
          <!-- Carbs Segment -->
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#f59e0b" stroke-width="16"
            stroke-dasharray="${circumference}" stroke-dashoffset="${cOffset}"
            transform="rotate(${cRotation} 70 70)" stroke-linecap="round" class="transition-all duration-700" />
          <!-- Fat Segment -->
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="#ec4899" stroke-width="16"
            stroke-dasharray="${circumference}" stroke-dashoffset="${fOffset}"
            transform="rotate(${fRotation} 70 70)" stroke-linecap="round" class="transition-all duration-700" />
        </svg>
        <div class="absolute flex flex-col items-center">
          <span class="text-xs font-semibold text-slate-400">Total</span>
          <span class="text-sm font-bold text-slate-800">${Math.round(totalCals)} kcal</span>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-2.5 w-full max-w-[200px]">
        <div class="flex items-center justify-between p-2 rounded-xl bg-blue-50/70 border border-blue-100">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-500"></span>
            <span class="text-xs font-semibold text-slate-700">Protein</span>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-slate-900">${protein.toFixed(1)}g</span>
            <span class="text-[10px] text-blue-600 block">(${pPct}%)</span>
          </div>
        </div>

        <div class="flex items-center justify-between p-2 rounded-xl bg-amber-50/70 border border-amber-100">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-amber-500"></span>
            <span class="text-xs font-semibold text-slate-700">Carbs</span>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-slate-900">${carbs.toFixed(1)}g</span>
            <span class="text-[10px] text-amber-600 block">(${cPct}%)</span>
          </div>
        </div>

        <div class="flex items-center justify-between p-2 rounded-xl bg-pink-50/70 border border-pink-100">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-pink-500"></span>
            <span class="text-xs font-semibold text-slate-700">Fats</span>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-slate-900">${fat.toFixed(1)}g</span>
            <span class="text-[10px] text-pink-600 block">(${fPct}%)</span>
          </div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

/**
 * Render Monthly Calorie & Nutrition Trend Chart (Interactive SVG)
 */
export function renderMonthlyTrendChart(containerId, daysData, targetCalories, onDateSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!daysData || daysData.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">No data available for this month.</div>`;
    return;
  }

  const width = 800;
  const height = 240;
  const padding = { top: 30, right: 30, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxCal = Math.max(targetCalories * 1.3, ...daysData.map(d => d.calories || 0), 2000);
  const barWidth = Math.max(6, Math.min(18, (chartW / daysData.length) - 4));

  // Goal line Y
  const goalY = padding.top + chartH - (targetCalories / maxCal) * chartH;

  // Render SVG
  let barsHtml = '';
  let labelsHtml = '';

  daysData.forEach((day, index) => {
    const x = padding.left + (index * (chartW / daysData.length)) + (chartW / daysData.length - barWidth) / 2;
    const barH = ((day.calories || 0) / maxCal) * chartH;
    const y = padding.top + chartH - barH;
    const isOver = day.calories > targetCalories;
    const hasLogs = day.calories > 0;
    const fillColor = !hasLogs ? '#e2e8f0' : (isOver ? '#f87171' : '#10b981');

    barsHtml += `
      <g class="chart-bar-group cursor-pointer group" data-date="${day.date}">
        <rect
          x="${x}"
          y="${y}"
          width="${barWidth}"
          height="${Math.max(barH, 3)}"
          rx="4"
          fill="${fillColor}"
          class="transition-all duration-300 hover:opacity-80"
        >
          <title>${day.date}: ${Math.round(day.calories || 0)} kcal</title>
        </rect>
      </g>
    `;

    // Show date labels for every 3rd-5th day or first/last
    if (index % Math.ceil(daysData.length / 10) === 0 || index === daysData.length - 1) {
      const dayNum = parseInt(day.date.split('-')[2]);
      labelsHtml += `
        <text x="${x + barWidth / 2}" y="${height - 12}" text-anchor="middle" font-size="11" fill="#64748b" font-weight="500">
          ${dayNum}
        </text>
      `;
    }
  });

  const svg = `
    <div class="w-full overflow-x-auto">
      <svg class="w-full min-w-[600px] h-[240px]" viewBox="0 0 ${width} ${height}">
        <!-- Grid Lines -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="#f1f5f9" stroke-dasharray="3 3" />
        <line x1="${padding.left}" y1="${padding.top + chartH / 2}" x2="${width - padding.right}" y2="${padding.top + chartH / 2}" stroke="#f1f5f9" stroke-dasharray="3 3" />
        <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#e2e8f0" stroke-width="1.5" />

        <!-- Target Calorie Dashline -->
        <line x1="${padding.left}" y1="${goalY}" x2="${width - padding.right}" y2="${goalY}" stroke="#3b82f6" stroke-width="2" stroke-dasharray="5 5" />
        <text x="${width - padding.right - 5}" y="${goalY - 6}" text-anchor="end" font-size="11" fill="#3b82f6" font-weight="600">Goal: ${targetCalories} kcal</text>

        <!-- Y Axis Labels -->
        <text x="${padding.left - 10}" y="${padding.top + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${Math.round(maxCal)}</text>
        <text x="${padding.left - 10}" y="${padding.top + chartH / 2 + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${Math.round(maxCal / 2)}</text>
        <text x="${padding.left - 10}" y="${padding.top + chartH + 4}" text-anchor="end" font-size="11" fill="#94a3b8">0</text>

        <!-- Bars & Labels -->
        ${barsHtml}
        ${labelsHtml}
      </svg>
    </div>
  `;

  container.innerHTML = svg;

  // Add click listeners to bar groups to jump to that day
  if (onDateSelect) {
    container.querySelectorAll('.chart-bar-group').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.getAttribute('data-date');
        if (date) onDateSelect(date);
      });
    });
  }
}
