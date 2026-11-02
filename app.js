const STORAGE_KEY = "hours-accounted-for-v1";
const THEME_STORAGE_KEY = "monthly-hours-theme-v1";
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STEP_LABELS = {
  month: "Choose a month",
  capacity: "Set your hours budget",
  "worker-name": "Add a worker",
  "standard-hours": "Set usual hours",
  days: "Choose work days",
  differences: "Check daily hours",
  adjustments: "Adjust hours",
  review: "Worker summary",
  "add-worker": "Review your team",
  summary: "Monthly summary",
};
const STEP_ORDER = [
  "month", "capacity", "worker-name", "standard-hours", "days",
  "differences", "adjustments", "review", "add-worker", "summary",
];

const today = new Date();
const initialState = {
  year: today.getFullYear(),
  month: today.getMonth(),
  availableHours: "",
  workers: [],
  workerIndex: 0,
  editingWorkerIndex: null,
  step: "month",
};

function isValidState(value) {
  return value
    && Number.isInteger(value.year)
    && Number.isInteger(value.month)
    && value.month >= 0
    && value.month <= 11
    && typeof value.availableHours === "string"
    && Array.isArray(value.workers)
    && Number.isInteger(value.workerIndex)
    && (value.editingWorkerIndex === undefined
      || value.editingWorkerIndex === null
      || (Number.isInteger(value.editingWorkerIndex)
        && value.editingWorkerIndex >= 0
        && value.editingWorkerIndex < value.workers.length))
    && STEP_ORDER.includes(value.step)
    && value.workers.every((worker) => (
      worker
      && typeof worker.name === "string"
      && typeof worker.standardHours === "string"
      && Array.isArray(worker.days)
      && worker.hoursByDay
      && typeof worker.hoursByDay === "object"
      && typeof worker.hasDifferences === "boolean"
    ));
}

let storageNotice = "";
let state = { ...initialState };
let isDarkMode = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    if (isValidState(parsed)) {
      state = parsed;
    } else {
      storageNotice = "Saved planner data could not be read. A fresh plan is ready.";
      console.error("Saved planner data has an unexpected format.");
    }
  }
} catch (error) {
  storageNotice = "Saved planner data could not be loaded. A fresh plan is ready.";
  console.error("Unable to load saved planner data.", error);
}

try {
  isDarkMode = localStorage.getItem(THEME_STORAGE_KEY) === "dark";
} catch (error) {
  console.error("Unable to load the saved color theme.", error);
}

function applyTheme() {
  document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  const toggle = document.querySelector("#theme-toggle");
  toggle.setAttribute("aria-label", `Switch to ${isDarkMode ? "light" : "dark"} mode`);
  toggle.innerHTML = `<span class="theme-toggle-icon" aria-hidden="true">${isDarkMode ? "☀" : "☾"}</span><span>${isDarkMode ? "Light" : "Dark"} mode</span>`;
  document.querySelector('meta[name="theme-color"]').content = isDarkMode ? "#201c23" : "#f7f5f8";
}

applyTheme();

const app = document.querySelector("#app");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function currentWorker() {
  return state.workers[state.workerIndex];
}

function createWorker() {
  return {
    name: "",
    standardHours: "",
    days: [],
    hoursByDay: {},
    hasDifferences: false,
  };
}

function isCompletedWorker(worker) {
  return Boolean(worker?.name && worker.standardHours && worker.days.length > 0);
}

function monthLabel() {
  return `${MONTH_NAMES[state.month]} ${state.year}`;
}

function formatHours(hours) {
  const rounded = Math.round(Number(hours) * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : Number(rounded.toFixed(2))} hrs`;
}

function formatCompactHours(hours) {
  const totalMinutes = Math.round(Number(hours) * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours}h${minutes ? `${minutes}m` : ""}`;
}

function dateKey(day) {
  return `${state.year}-${String(state.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function hoursForDay(worker, day) {
  const key = dateKey(day);
  return Object.prototype.hasOwnProperty.call(worker.hoursByDay, key)
    ? Number(worker.hoursByDay[key])
    : Number(worker.standardHours);
}

function workerTotal(worker) {
  return worker.days.reduce((total, key) => {
    if (Object.prototype.hasOwnProperty.call(worker.hoursByDay, key)) {
      return total + Number(worker.hoursByDay[key]);
    }
    return total + Number(worker.standardHours);
  }, 0);
}

function formatScheduleDate(key) {
  const [, month, day] = key.split("-").map(Number);
  const weekday = scheduleWeekday(key);
  return `${weekday} ${MONTH_NAMES[month - 1]} ${day}`;
}

function scheduleWeekday(key, style = "long") {
  const [, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: style })
    .format(new Date(state.year, month - 1, day));
}

function unscheduledDays() {
  const scheduledDays = new Set(state.workers.flatMap((worker) => worker.days));
  const dayCount = new Date(state.year, state.month + 1, 0).getDate();
  return Array.from({ length: dayCount }, (_, index) => dateKey(index + 1))
    .filter((key) => !scheduledDays.has(key));
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageNotice = "";
  } catch (error) {
    storageNotice = "Your plan is open, but this browser could not save it.";
    console.error("Unable to save planner data.", error);
  }
}

function calendarMarkup({ selectable = false, adjustments = false, allWorkers = false } = {}) {
  const worker = allWorkers ? null : currentWorker();
  const firstDay = new Date(state.year, state.month, 1).getDay();
  const dayCount = new Date(state.year, state.month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push('<div class="calendar-day is-empty" aria-hidden="true"></div>');
  }
  for (let day = 1; day <= dayCount; day += 1) {
    const key = dateKey(day);
    if (allWorkers) {
      const shifts = state.workers.flatMap((person, workerIndex) => {
        if (!person.days.includes(key)) return [];
        const adjusted = Object.prototype.hasOwnProperty.call(person.hoursByDay, key);
        const hours = adjusted ? Number(person.hoursByDay[key]) : Number(person.standardHours);
        return [`<span class="team-shift worker-color-${workerIndex % 6}${adjusted ? " is-adjusted" : ""}"><span class="team-shift-name">${escapeHtml(person.name)}</span><strong>${formatCompactHours(hours)}</strong></span>`];
      });
      const dayLabel = `${MONTH_NAMES[state.month]} ${day}${shifts.length ? `: ${state.workers.filter((person) => person.days.includes(key)).map((person) => `${person.name}, ${formatCompactHours(Object.prototype.hasOwnProperty.call(person.hoursByDay, key) ? person.hoursByDay[key] : person.standardHours)}`).join("; ")}` : ", no workers scheduled"}`;
      cells.push(`<div class="calendar-day team-calendar-day${shifts.length ? " has-shifts" : ""}" aria-label="${escapeHtml(dayLabel)}"><span class="day-number">${day}</span>${shifts.length ? `<div class="team-shifts">${shifts.join("")}</div>` : '<span class="team-empty">—</span>'}</div>`);
      continue;
    }
    const selected = worker?.days.includes(key);
    const adjusted = selected && Object.prototype.hasOwnProperty.call(worker.hoursByDay, key);
    const classes = [
      "calendar-day",
      selected ? "is-selected" : "",
      adjusted ? "is-adjusted" : "",
    ].filter(Boolean).join(" ");
    const hoursText = selected && !selectable
      ? `<span class="day-hours">${formatCompactHours(hoursForDay(worker, day))}</span>`
      : "";
    const dayLabel = `${MONTH_NAMES[state.month]} ${day}${selected ? `, ${formatCompactHours(hoursForDay(worker, day))}` : ""}`;
    if (selectable) {
      cells.push(`<button type="button" class="${classes}" data-day="${day}" aria-pressed="${Boolean(selected)}" aria-label="${escapeHtml(dayLabel)}"><span class="day-number">${day}</span>${hoursText}</button>`);
    } else if (adjustments && selected) {
      cells.push(`<button type="button" class="${classes}" data-adjust-day="${day}" aria-label="Adjust hours for ${escapeHtml(dayLabel)}"><span class="day-number">${day}</span><span class="day-hours">${formatCompactHours(hoursForDay(worker, day))}</span></button>`);
    } else {
      cells.push(`<div class="${classes}" aria-label="${escapeHtml(dayLabel)}"><span class="day-number">${day}</span>${hoursText}</div>`);
    }
  }

  return `
    <div class="calendar-wrap${allWorkers ? " team-calendar" : ""}">
      <div class="calendar-caption">
        <h3 class="calendar-month">${allWorkers ? "Combined schedule" : monthLabel()}</h3>
        <div class="calendar-legend">
          ${allWorkers
            ? `${state.workers.map((person, index) => `<span class="legend-item"><span class="legend-swatch worker-color-${index % 6}"></span>${escapeHtml(person.name)}</span>`).join("")}<span class="legend-item"><span class="legend-swatch adjusted"></span> Adjusted hours</span>`
            : '<span class="legend-item"><span class="legend-swatch"></span> Scheduled</span>'}
          ${adjustments ? '<span class="legend-item"><span class="legend-swatch adjusted"></span> Adjusted</span>' : ""}
        </div>
      </div>
      <div class="${allWorkers ? "calendar-grid-scroll" : ""}">
        <div class="calendar-grid" role="group" aria-label="${escapeHtml(monthLabel())} calendar">
          ${WEEKDAYS.map((day) => `<div class="weekday" aria-hidden="true">${day}</div>`).join("")}
          ${cells.join("")}
        </div>
      </div>
    </div>`;
}

function progressMarkup() {
  const index = STEP_ORDER.indexOf(state.step);
  const percent = Math.max(8, ((index + 1) / STEP_ORDER.length) * 100);
  return `
    <div class="progress-area">
      <div class="progress-topline">
        <span>Monthly planner</span>
        <strong>${state.step === "worker-name" && state.editingWorkerIndex != null
    ? "Edit a worker"
    : `${STEP_LABELS[state.step]}${state.step === "worker-name" && state.workers.length > 1 ? ` · Worker ${state.workerIndex + 1}` : ""}`}</strong>
      </div>
      <div class="progress-track" role="progressbar" aria-valuenow="${Math.round(percent)}" aria-valuemin="0" aria-valuemax="100" aria-label="Planner progress">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>
    </div>`;
}

function fieldStep({ heading, copy, field, value, type, unit, hint, nextLabel }) {
  const unitMarkup = unit
    ? `<div class="input-with-unit"><input class="number-input" id="answer" name="answer" type="${type}" min="0" step="0.5" value="${escapeHtml(value)}" required><span class="input-unit">${unit}</span></div>`
    : `<input class="text-input" id="answer" name="answer" type="${type}" value="${escapeHtml(value)}" required>`;
  return `
    <form id="answer-form" class="form-panel">
      <h2 class="step-heading">${heading}</h2>
      <p class="step-copy">${copy}</p>
      <label class="field-label" for="answer">${field}</label>
      ${unitMarkup}
      ${hint ? `<p class="field-hint">${hint}</p>` : ""}
      <div class="wizard-actions">
        ${backButton()}
        <button class="button button-primary" type="submit">${nextLabel} <span aria-hidden="true">→</span></button>
      </div>
    </form>`;
}

function backButton() {
  return '<button class="button button-quiet" type="button" data-action="back"><span aria-hidden="true">←</span> Back</button>';
}

function actionButton(label, action, style = "primary") {
  return `<button class="button button-${style}" type="button" data-action="${action}">${label}</button>`;
}

function summaryStats(worker) {
  return `
    <div class="summary-strip">
      <div class="summary-stat"><span>Days scheduled</span><strong>${worker.days.length}</strong></div>
      <div class="summary-stat"><span>Total hours</span><strong>${formatHours(workerTotal(worker))}</strong></div>
      <div class="summary-stat"><span>Usual day</span><strong>${formatHours(worker.standardHours)}</strong></div>
    </div>`;
}

function renderStep() {
  const worker = currentWorker();
  switch (state.step) {
    case "month":
      return `
        <form id="answer-form" class="form-panel">
          <h2 class="step-heading">Which month are we planning?</h2>
          <p class="step-copy">Start with a month. You can come back and change it later.</p>
          <label class="field-label" for="answer">Month and year</label>
          <input class="month-input" id="answer" name="answer" type="month" value="${state.year}-${String(state.month + 1).padStart(2, "0")}" required>
          <div class="wizard-actions">
            <span></span>
            <button class="button button-primary" type="submit">Continue <span aria-hidden="true">→</span></button>
          </div>
        </form>`;
    case "capacity":
      return fieldStep({
        heading: "How many hours are available?",
        copy: `Set the total hours you have to schedule for ${monthLabel()}. We'll compare the team total against this.`,
        field: "Available hours",
        value: state.availableHours,
        type: "number",
        unit: "hours",
        hint: "You can use half-hour increments.",
        nextLabel: "Add a worker",
      });
    case "worker-name":
      return fieldStep({
        heading: state.editingWorkerIndex != null
          ? `Update ${worker.name}'s details`
          : state.workerIndex === 0 ? "Who are we scheduling?" : "Who else is on the team?",
        copy: state.editingWorkerIndex != null
          ? `Update this worker's details for ${monthLabel()}.`
          : `Add a name for ${monthLabel()}. You can add another person after this worker's schedule.`,
        field: "Worker name",
        value: worker.name,
        type: "text",
        hint: "",
        nextLabel: "Set usual hours",
      });
    case "standard-hours":
      return fieldStep({
        heading: `What is ${worker.name || "their"} usual shift?`,
        copy: "This is the default number of hours for each selected day. You can change individual days next.",
        field: "Usual hours per day",
        value: worker.standardHours,
        type: "number",
        unit: "hours",
        hint: "You can use half-hour increments.",
        nextLabel: "Choose work days",
      });
    case "days":
      return `
        <h2 class="step-heading">Which days did ${escapeHtml(worker.name)} work?</h2>
        <p class="step-copy">Select every work day on the calendar. Select a day again to remove it.</p>
        ${calendarMarkup({ selectable: true })}
        <p class="calendar-help">${worker.days.length} ${worker.days.length === 1 ? "day" : "days"} selected · ${formatHours(worker.days.length * Number(worker.standardHours))} at usual hours</p>
        <div class="wizard-actions">
          ${backButton()}
          <button class="button button-primary" type="button" data-action="continue-to-differences" ${worker.days.length === 0 ? "disabled" : ""}>Continue →</button>
        </div>`;
    case "differences":
      return `
        <h2 class="step-heading">Any days with different hours?</h2>
        <p class="step-copy">You selected ${worker.days.length} ${worker.days.length === 1 ? "work day" : "work days"} for ${escapeHtml(worker.name)}. Most days are ${formatHours(worker.standardHours)} each.</p>
        ${calendarMarkup()}
        <div class="wizard-actions">
          ${backButton()}
          <div class="actions-right">
            ${actionButton("No, all the same", "no-differences", "secondary")}
            ${actionButton("Yes, adjust days →", "yes-differences")}
          </div>
        </div>`;
    case "adjustments":
      return `
        <h2 class="step-heading">Adjust any different days</h2>
        <p class="step-copy">Click a scheduled day to change its hours. Days with a peach tint have already been adjusted.</p>
        ${calendarMarkup({ adjustments: true })}
        <div class="wizard-actions">
          ${backButton()}
          ${actionButton("Done adjusting →", "finish-adjustments")}
        </div>
        <dialog class="dialog-backdrop" id="hours-dialog" aria-labelledby="dialog-title">
          <form method="dialog" id="hours-form">
            <h2 class="dialog-title" id="dialog-title">Adjust hours</h2>
            <p class="dialog-copy" id="dialog-copy"></p>
            <div class="hours-adjuster">
              <button class="adjust-button" type="button" data-action="decrease-hour" aria-label="Subtract one hour">−</button>
              <input class="number-input" id="adjusted-hours" type="number" min="0" max="24" step="0.5" required aria-label="Hours worked">
              <button class="adjust-button" type="button" data-action="increase-hour" aria-label="Add one hour">+</button>
            </div>
            <div class="dialog-actions">
              <button class="button button-secondary" type="button" data-action="close-dialog">Cancel</button>
              <button class="button button-primary" type="submit">Save hours</button>
            </div>
          </form>
        </dialog>`;
    case "review":
      return `
        <h2 class="step-heading">${escapeHtml(worker.name)}'s schedule</h2>
        <p class="step-copy">Here is the month at a glance. Scheduled days are highlighted on the calendar.</p>
        ${calendarMarkup()}
        ${summaryStats(worker)}
        <div class="wizard-actions">
          ${backButton()}
          ${actionButton("Continue →", "worker-reviewed")}
        </div>`;
    case "add-worker":
      return `
        <h2 class="step-heading">Anyone else to add?</h2>
        <p class="step-copy">Edit a worker's schedule, add someone else to ${monthLabel()}, or check the monthly total.</p>
        <div class="worker-list">
          ${state.workers.map((person, index) => isCompletedWorker(person) ? `
            <div class="worker-row worker-row-editable">
              <div class="worker-details"><span class="worker-name">${escapeHtml(person.name)}</span><span class="worker-meta">${person.days.length} ${person.days.length === 1 ? "day" : "days"} scheduled</span></div>
              <div class="worker-row-actions">
                <span class="worker-hours">${formatHours(workerTotal(person))}</span>
                <button class="button button-secondary worker-edit-button" type="button" data-action="edit-worker" data-worker-index="${index}" aria-label="Edit ${escapeHtml(person.name)}'s schedule">Edit schedule</button>
              </div>
            </div>` : "").join("")}
        </div>
        <div class="wizard-actions">
          ${backButton()}
          <div class="actions-right">
            ${actionButton("No, see monthly total", "finish-team", "secondary")}
            ${actionButton("Yes, add a worker →", "add-worker")}
          </div>
        </div>`;
    case "summary": {
      const totalHours = state.workers.reduce((sum, person) => sum + workerTotal(person), 0);
      const available = Number(state.availableHours);
      const difference = available - totalHours;
      const under = difference >= 0;
      const emptyDays = unscheduledDays();
      return `
        <h2 class="step-heading">${monthLabel()} at a glance</h2>
        <p class="step-copy">Your team schedule compared with the hours available this month.</p>
        ${calendarMarkup({ allWorkers: true })}
        <div class="summary-strip">
          <div class="summary-stat"><span>Available</span><strong>${formatHours(available)}</strong></div>
          <div class="summary-stat"><span>Scheduled</span><strong>${formatHours(totalHours)}</strong></div>
          <div class="summary-stat"><span>${under ? "Hours remaining" : "Over budget"}</span><strong>${formatHours(Math.abs(difference))}</strong></div>
        </div>
        <div class="capacity-status ${under ? "" : "over"}">
          <span class="status-icon" aria-hidden="true">${under ? "✓" : "!"}</span>
          <div>
            <strong>${under ? "You're within your monthly hours." : "Your schedule is over the available hours."}</strong>
            <p>${under
              ? `${formatHours(difference)} remain available after scheduling ${state.workers.length} ${state.workers.length === 1 ? "worker" : "workers"}.`
              : `The team is ${formatHours(Math.abs(difference))} over the ${formatHours(available)} available for this month.`}</p>
          </div>
        </div>
        <details class="summary-details" open>
          <summary>Detailed schedule and additional information</summary>
          <div class="summary-details-content">
            <section class="worker-breakdowns" aria-label="Worker schedules">
              ${state.workers.map((person, index) => `
                <details class="worker-breakdown" open>
                  <summary>
                    <span class="worker-breakdown-name worker-color-${index % 6}">${escapeHtml(person.name)}</span>
                    <span class="worker-breakdown-meta">${person.days.length} ${person.days.length === 1 ? "day" : "days"} · ${formatCompactHours(workerTotal(person))}</span>
                  </summary>
                  <ul class="worker-day-list">
                    ${person.days
                      .slice()
                      .sort()
                      .map((key) => {
                        const day = Number(key.slice(-2));
                        return `<li><time datetime="${escapeHtml(key)}" aria-label="${escapeHtml(formatScheduleDate(key))}"><span class="worker-day-number worker-color-${index % 6}">${day}</span><span class="worker-day-weekday">${escapeHtml(scheduleWeekday(key, "short"))}</span></time><strong class="worker-day-hours">${formatCompactHours(hoursForDay(person, day))}</strong></li>`;
                      }).join("")}
                  </ul>
                </details>`).join("")}
            </section>
            <section class="unscheduled-section" aria-labelledby="unscheduled-heading">
              <h3 id="unscheduled-heading">
                ${emptyDays.length ? '<span class="unscheduled-alert-icon" aria-hidden="true">!</span>' : ""}
                Days with no one scheduled <span class="unscheduled-count">(${emptyDays.length})</span>
              </h3>
              ${emptyDays.length
                ? `<ul class="unscheduled-days">${emptyDays.map((key) => {
                  const day = Number(key.slice(-2));
                  const date = new Date(state.year, state.month, day);
                  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
                  return `<li><time datetime="${escapeHtml(key)}" aria-label="${escapeHtml(formatScheduleDate(key))}"><span class="unscheduled-day-number">${day}</span><span class="unscheduled-day-weekday">${weekday}</span></time></li>`;
                }).join("")}</ul>`
                : '<p class="detail-note">Every day this month has at least one person scheduled.</p>'}
            </section>
          </div>
        </details>
        <div class="wizard-actions">
          ${backButton()}
          ${actionButton("Print / export", "print-summary", "secondary")}
          ${actionButton("Start a new month", "new-month", "secondary")}
        </div>`;
    }
    default:
      return "";
  }
}

function render() {
  const notice = storageNotice ? `<div class="notice" role="status">${escapeHtml(storageNotice)}</div>` : "";
  app.innerHTML = `
    <section class="intro">
      <p class="eyebrow">Work schedule</p>
      <h1>Plan your team's hours</h1>
      <p class="intro-copy">Schedule staff and track hours by month.</p>
    </section>
    ${notice}
    <section class="wizard-card" aria-label="Monthly hours planner">
      ${progressMarkup()}
      <div class="wizard-body">${renderStep()}</div>
    </section>`;
}

function goBack() {
  const worker = currentWorker();
  switch (state.step) {
    case "capacity":
      state.step = "month";
      break;
    case "worker-name":
      if (state.editingWorkerIndex != null) {
        state.workerIndex = state.editingWorkerIndex;
        state.editingWorkerIndex = null;
        state.step = "add-worker";
      } else if (state.workerIndex > 0) {
        state.workerIndex -= 1;
        state.step = "add-worker";
      } else {
        state.step = "capacity";
      }
      break;
    case "standard-hours":
      state.step = "worker-name";
      break;
    case "days":
      state.step = "standard-hours";
      break;
    case "differences":
      state.step = "days";
      break;
    case "adjustments":
      state.step = "differences";
      break;
    case "review":
      state.step = worker.hasDifferences ? "adjustments" : "differences";
      break;
    case "add-worker":
      state.step = "review";
      break;
    case "summary":
      state.workerIndex = Math.max(0, state.workers.length - 1);
      state.step = "add-worker";
      break;
    default:
      return;
  }
  saveState();
  render();
}

function submitAnswer(form) {
  const input = form.elements.answer;
  if (!input.reportValidity()) return;

  if (state.step === "month") {
    const [year, month] = input.value.split("-").map(Number);
    const monthChanged = state.year !== year || state.month !== month - 1;
    state.year = year;
    state.month = month - 1;
    if (monthChanged) {
      state.workers = [];
      state.workerIndex = 0;
    }
    state.step = "capacity";
  } else if (state.step === "capacity") {
    if (Number(input.value) <= 0) {
      input.setCustomValidity("Enter a number greater than zero.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    state.availableHours = input.value;
    if (state.workers.length === 0) {
      state.workers = [createWorker()];
      state.workerIndex = 0;
    }
    state.step = "worker-name";
  } else if (state.step === "worker-name") {
    currentWorker().name = input.value.trim();
    if (!currentWorker().name) {
      input.setCustomValidity("Enter a worker name.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    state.step = "standard-hours";
  } else if (state.step === "standard-hours") {
    if (Number(input.value) <= 0 || Number(input.value) > 24) {
      input.setCustomValidity("Usual hours must be greater than zero and no more than 24.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    currentWorker().standardHours = input.value;
    state.step = "days";
  }
  saveState();
  render();
}

function toggleDay(day) {
  const worker = currentWorker();
  const key = dateKey(day);
  if (worker.days.includes(key)) {
    worker.days = worker.days.filter((date) => date !== key);
    delete worker.hoursByDay[key];
  } else {
    worker.days.push(key);
  }
  saveState();
  render();
}

function openAdjustment(day) {
  const worker = currentWorker();
  const key = dateKey(day);
  const dialog = document.querySelector("#hours-dialog");
  const input = document.querySelector("#adjusted-hours");
  const currentHours = hoursForDay(worker, day);
  dialog.dataset.dayKey = key;
  document.querySelector("#dialog-title").textContent = `Adjust ${MONTH_NAMES[state.month]} ${day}`;
  document.querySelector("#dialog-copy").textContent = `Usual hours are ${formatHours(worker.standardHours)}. Enter the hours ${worker.name} worked.`;
  input.value = String(currentHours);
  dialog.showModal();
  input.focus();
}

app.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "answer-form") {
    submitAnswer(event.target);
    return;
  }
  if (event.target.id === "hours-form") {
    const input = document.querySelector("#adjusted-hours");
    if (!input.reportValidity()) return;
    const hours = Number(input.value);
    if (hours < 0 || hours > 24) {
      input.setCustomValidity("Enter a value between 0 and 24 hours.");
      input.reportValidity();
      input.setCustomValidity("");
      return;
    }
    const dialog = document.querySelector("#hours-dialog");
    const key = dialog.dataset.dayKey;
    const standardHours = Number(currentWorker().standardHours);
    if (hours === standardHours) {
      delete currentWorker().hoursByDay[key];
    } else {
      currentWorker().hoursByDay[key] = hours;
    }
    document.querySelector("#hours-dialog").close();
    saveState();
    render();
  }
});

document.querySelector("#theme-toggle").addEventListener("click", () => {
  isDarkMode = !isDarkMode;
  applyTheme();
  try {
    localStorage.setItem(THEME_STORAGE_KEY, isDarkMode ? "dark" : "light");
  } catch (error) {
    console.error("Unable to save the selected color theme.", error);
  }
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.day) {
    toggleDay(Number(button.dataset.day));
    return;
  }
  if (button.dataset.adjustDay) {
    openAdjustment(Number(button.dataset.adjustDay));
    return;
  }

  switch (button.dataset.action) {
    case "back":
      goBack();
      break;
    case "continue-to-differences":
      if (currentWorker().days.length === 0) {
        window.alert("Select at least one work day to continue.");
        return;
      }
      state.step = "differences";
      saveState();
      render();
      break;
    case "no-differences":
      currentWorker().hoursByDay = {};
      currentWorker().hasDifferences = false;
      state.step = "review";
      saveState();
      render();
      break;
    case "yes-differences":
      currentWorker().hasDifferences = true;
      state.step = "adjustments";
      saveState();
      render();
      break;
    case "finish-adjustments":
      state.step = "review";
      saveState();
      render();
      break;
    case "worker-reviewed":
      state.editingWorkerIndex = null;
      state.step = "add-worker";
      saveState();
      render();
      break;
    case "edit-worker": {
      const workerIndex = Number(button.dataset.workerIndex);
      if (!Number.isInteger(workerIndex) || !isCompletedWorker(state.workers[workerIndex])) {
        console.error("Unable to edit the selected worker because the schedule is incomplete.");
        return;
      }
      state.workerIndex = workerIndex;
      state.editingWorkerIndex = workerIndex;
      state.step = "worker-name";
      saveState();
      render();
      break;
    }
    case "add-worker":
      state.workers = state.workers.filter(isCompletedWorker);
      state.workerIndex = state.workers.length;
      state.workers.push(createWorker());
      state.step = "worker-name";
      saveState();
      render();
      break;
    case "finish-team":
      state.workers = state.workers.filter(isCompletedWorker);
      state.workerIndex = state.workers.length - 1;
      state.editingWorkerIndex = null;
      state.step = "summary";
      saveState();
      render();
      break;
    case "new-month":
      state = { ...initialState, year: today.getFullYear(), month: today.getMonth() };
      saveState();
      render();
      break;
    case "print-summary":
      window.print();
      break;
    case "decrease-hour":
    case "increase-hour": {
      const input = document.querySelector("#adjusted-hours");
      const increment = button.dataset.action === "increase-hour" ? 1 : -1;
      input.value = String(Math.min(24, Math.max(0, Number(input.value) + increment)));
      break;
    }
    case "close-dialog":
      document.querySelector("#hours-dialog").close();
      break;
    default:
      break;
  }
});

render();
