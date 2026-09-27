/* ============================================================
   script.js
   ------------------------------------------------------------
   Shared UI logic for every page of Deadline.
   Each HTML page has a <body id="page-xxx"> — we use that id
   to decide which page-specific init function to run.
   All data access goes through storage.js.
   ============================================================ */

const SUBJECT_LIST = ["DSA", "COA", "STLD", "Mathematics", "Software Engineering", "Life Skill", "Other"];
const TYPE_LIST = ["Assignment", "Notes", "Record", "Lab Work", "Project", "Seminar", "Exam", "Other"];

const PRIORITY_COLOR = { High: "red", Medium: "orange", Low: "green" };
const PRIORITY_EMOJI = { High: "🔴", Medium: "🟠", Low: "🟢" };

/* ------------------------------------------------------------
   BOOTSTRAP — runs on every page
   ------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  renderNav();
  renderNotificationBell();
  checkDeadlines();

  const page = document.body.id;
  if (page === "page-dashboard") initDashboard();
  if (page === "page-add-task") initAddTaskPage();
  if (page === "page-tasks") initTasksPage();
  if (page === "page-calendar") initCalendarPage();
  if (page === "page-settings") initSettingsPage();
});

/* ------------------------------------------------------------
   THEME
   ------------------------------------------------------------ */
function applyTheme() {
  const settings = getSettings();
  document.documentElement.setAttribute("data-theme", settings.theme || "light");
}

/* ------------------------------------------------------------
   NAVIGATION (sidebar on desktop, bottom bar on mobile)
   Injected into any element with id="app-nav"
   ------------------------------------------------------------ */
function renderNav() {
  const mount = document.getElementById("app-nav");
  if (!mount) return;

  const current = document.body.dataset.navKey || "";

  const items = [
    { key: "dashboard", href: "index.html", icon: "🏠", label: "Dashboard" },
    { key: "add-task", href: "add-task.html", icon: "➕", label: "Add Task" },
    { key: "tasks", href: "tasks.html", icon: "📋", label: "All Tasks" },
    { key: "calendar", href: "calendar.html", icon: "📅", label: "Calendar" },
    { key: "settings", href: "settings.html", icon: "⚙️", label: "Settings" }
  ];

  const linkHTML = (item) =>
    `<a class="nav-link ${item.key === current ? "active" : ""}" href="${item.href}">
       <span class="nav-icon" aria-hidden="true">${item.icon}</span>
       <span class="nav-label">${item.label}</span>
     </a>`;

  mount.innerHTML = `
    <div class="sidebar">
      <div class="brand">
        <span class="brand-mark">⏳</span>
        <span class="brand-name">Deadline</span>
      </div>
      <nav class="sidebar-links">
        ${items.map(linkHTML).join("")}
      </nav>
      <p class="sidebar-foot">Never miss a submission again.</p>
    </div>
    <nav class="bottom-nav">
      ${items.map(linkHTML).join("")}
    </nav>
  `;
}

/* ------------------------------------------------------------
   TOPBAR GREETING (used on dashboard-style headers)
   ------------------------------------------------------------ */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/* ------------------------------------------------------------
   NOTIFICATION BELL — shared header widget
   ------------------------------------------------------------ */
function renderNotificationBell() {
  const mount = document.getElementById("notif-bell");
  if (!mount) return;

  mount.innerHTML = `
    <button class="bell-btn" id="bellToggle" aria-label="Notifications">
      🔔<span class="bell-dot" id="bellDot" hidden></span>
    </button>
    <div class="bell-panel" id="bellPanel" hidden>
      <div class="bell-panel-head">
        <span>Notifications</span>
        <button class="link-btn" id="markAllReadBtn">Mark all read</button>
      </div>
      <div class="bell-panel-list" id="bellList"></div>
    </div>
  `;

  refreshNotificationPanel();

  document.getElementById("bellToggle").addEventListener("click", () => {
    const panel = document.getElementById("bellPanel");
    panel.hidden = !panel.hidden;
  });

  document.getElementById("markAllReadBtn").addEventListener("click", () => {
    markAllNotificationsRead();
    refreshNotificationPanel();
  });

  // Close the panel when clicking outside it.
  document.addEventListener("click", (e) => {
    const panel = document.getElementById("bellPanel");
    const toggle = document.getElementById("bellToggle");
    if (!panel || panel.hidden) return;
    if (!panel.contains(e.target) && !toggle.contains(e.target)) panel.hidden = true;
  });
}

function refreshNotificationPanel() {
  const list = getNotifications();
  const listEl = document.getElementById("bellList");
  const dotEl = document.getElementById("bellDot");
  if (!listEl) return;

  const unread = list.filter((n) => !n.read).length;
  if (dotEl) dotEl.hidden = unread === 0;

  if (list.length === 0) {
    listEl.innerHTML = `<p class="bell-empty">You're all caught up! No notifications yet.</p>`;
    return;
  }

  listEl.innerHTML = list
    .map(
      (n) => `
      <button class="bell-item ${n.read ? "" : "unread"}" data-id="${n.id}">
        <span class="bell-item-emoji">${n.emoji}</span>
        <span class="bell-item-text">${escapeHTML(n.message)}</span>
      </button>`
    )
    .join("");

  listEl.querySelectorAll(".bell-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      markNotificationRead(btn.dataset.id);
      refreshNotificationPanel();
    });
  });
}

/* ------------------------------------------------------------
   REMINDER SYSTEM
   Runs every time a page loads. Looks at every non-completed
   task and creates an in-app notification if it is due in
   3 days, 1 day, today, or already overdue.
   ------------------------------------------------------------ */
function checkDeadlines() {
  const settings = getSettings();
  if (!settings.notificationsEnabled) return;

  const tasks = getTasks().filter((t) => t.status !== "Completed");

  tasks.forEach((task) => {
    const days = getDaysRemaining(task);
    const label = `${task.subject} — ${task.title}`;

    if (days === 3) {
      addNotification({
        taskId: task.id,
        reason: "3-day",
        emoji: "📢",
        message: `Upcoming submission: ${label} is due in 3 days.`
      });
    } else if (days === 1) {
      addNotification({
        taskId: task.id,
        reason: "1-day",
        emoji: "⚠️",
        message: `Deadline tomorrow: don't forget your ${task.subject} ${task.type.toLowerCase()}.`
      });
    } else if (days === 0) {
      addNotification({
        taskId: task.id,
        reason: "today",
        emoji: "🔴",
        message: `Due today: ${label} is due today.`
      });
    } else if (days < 0) {
      addNotification({
        taskId: task.id,
        reason: "overdue",
        emoji: "⚠️",
        message: `Overdue: your ${task.subject} deadline has passed.`
      });
    }
  });

  maybeShowToast(tasks);
}

// Show a single toast for the most urgent thing, once per page load,
// as a fallback since browser notifications need explicit permission.
function maybeShowToast(activeTasks) {
  const dueToday = activeTasks.find((t) => getDaysRemaining(t) === 0);
  const overdue = activeTasks.find((t) => getDaysRemaining(t) < 0);
  const target = dueToday || overdue;
  if (!target) return;

  const status = getDeadlineStatus(target);
  showToast(`${status.emoji} ${target.subject} — ${target.title} · ${status.label.toLowerCase()}`);
}

function showToast(message) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

/* ------------------------------------------------------------
   TASK CARD (reused on Dashboard, Tasks, Calendar)
   ------------------------------------------------------------ */
function createTaskCardHTML(task, options = {}) {
  const status = getDeadlineStatus(task);
  const remaining = getRemainingTimeLabel(task);
  const dateLabel = formatDateLong(task.deadlineDate);

  return `
    <article class="task-card status-${status.key}" data-id="${task.id}">
      <div class="task-card-main">
        <p class="task-subject">${escapeHTML(task.subject)}</p>
        <h3 class="task-title">${escapeHTML(task.title)}</h3>
        <p class="task-meta">${escapeHTML(task.type)}</p>
        <div class="task-tags">
          <span class="tag tag-date">📅 ${dateLabel}</span>
          <span class="tag tag-status status-${status.key}">${status.emoji} ${status.label}</span>
          <span class="tag tag-priority priority-${PRIORITY_COLOR[task.priority]}">${PRIORITY_EMOJI[task.priority]} ${task.priority} Priority</span>
        </div>
        ${task.status !== "Completed" ? `<p class="task-remaining">⏳ ${remaining}</p>` : ""}
      </div>
      <div class="task-card-actions">
        ${
          task.status !== "Completed"
            ? `<button class="btn btn-small btn-primary" data-action="complete">Mark Complete</button>`
            : `<span class="done-pill">✅ Completed</span>`
        }
        ${options.showManage !== false ? `
          <button class="btn btn-small btn-ghost" data-action="edit">Edit</button>
          <button class="btn btn-small btn-danger-ghost" data-action="delete">Delete</button>
        ` : ""}
      </div>
    </article>
  `;
}

// Attach click handlers for complete/edit/delete to any container
// of .task-card elements. Call this after inserting card HTML.
function bindTaskCardActions(container, onChange) {
  container.querySelectorAll(".task-card").forEach((card) => {
    const id = card.dataset.id;

    const completeBtn = card.querySelector('[data-action="complete"]');
    if (completeBtn) {
      completeBtn.addEventListener("click", () => {
        markTaskComplete(id);
        onChange && onChange();
      });
    }

    const editBtn = card.querySelector('[data-action="edit"]');
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        window.location.href = `add-task.html?edit=${id}`;
      });
    }

    const deleteBtn = card.querySelector('[data-action="delete"]');
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        openConfirmDialog(
          `Delete "${card.querySelector(".task-title").textContent}"? This can't be undone.`,
          () => {
            deleteTask(id);
            onChange && onChange();
          }
        );
      });
    }
  });
}

/* ------------------------------------------------------------
   EMPTY STATE HELPER
   ------------------------------------------------------------ */
function emptyStateHTML({ emoji = "📚", title = "You're all caught up!", message = "", showAddButton = true }) {
  return `
    <div class="empty-state">
      <p class="empty-emoji">${emoji}</p>
      <p class="empty-title">${title}</p>
      ${message ? `<p class="empty-message">${message}</p>` : ""}
      ${showAddButton ? `<a class="btn btn-primary" href="add-task.html">+ Add Task</a>` : ""}
    </div>
  `;
}

/* ------------------------------------------------------------
   CONFIRM DIALOG (used before delete / clear actions)
   ------------------------------------------------------------ */
function openConfirmDialog(message, onConfirm) {
  let dialog = document.getElementById("confirmDialog");
  if (!dialog) {
    dialog = document.createElement("div");
    dialog.id = "confirmDialog";
    dialog.className = "dialog-overlay";
    dialog.innerHTML = `
      <div class="dialog-box">
        <p class="dialog-message" id="dialogMessage"></p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" id="dialogCancel">Cancel</button>
          <button class="btn btn-danger" id="dialogConfirm">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
  }

  document.getElementById("dialogMessage").textContent = message;
  dialog.hidden = false;

  const cancelBtn = document.getElementById("dialogCancel");
  const confirmBtn = document.getElementById("dialogConfirm");

  const cleanup = () => {
    dialog.hidden = true;
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));
  };

  document.getElementById("dialogCancel").addEventListener("click", cleanup);
  document.getElementById("dialogConfirm").addEventListener("click", () => {
    cleanup();
    onConfirm();
  });
}

/* ------------------------------------------------------------
   SMALL UTILITIES
   ------------------------------------------------------------ */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function formatDateLong(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

/* ============================================================
   PAGE: DASHBOARD (index.html)
   ============================================================ */
function initDashboard() {
  renderDashboard();
}

function renderDashboard() {
  const tasks = getTasks();
  const active = tasks.filter((t) => t.status !== "Completed");
  const dueToday = active.filter((t) => getDaysRemaining(t) === 0);
  const dueSoon = active.filter((t) => {
    const d = getDaysRemaining(t);
    return d >= 0 && d <= 7;
  });
  const completed = tasks.filter((t) => t.status === "Completed");

  // Greeting
  const greetEl = document.getElementById("greeting");
  if (greetEl) greetEl.textContent = `${getGreeting()}, Student 👋`;

  // Summary cards
  setText("statActive", active.length);
  setText("statToday", dueToday.length);
  setText("statSoon", dueSoon.length);
  setText("statCompleted", completed.length);

  // Today's Focus — top 3 most urgent active tasks
  const focusTasks = sortTasks(active, "deadline-asc").slice(0, 3);
  const focusMount = document.getElementById("focusList");
  if (focusMount) {
    focusMount.innerHTML = focusTasks.length
      ? focusTasks.map((t) => createTaskCardHTML(t, { showManage: false })).join("")
      : emptyStateHTML({ title: "Nothing urgent right now", message: "You're all caught up for today." , showAddButton:false});
    bindTaskCardActions(focusMount, renderDashboard);
  }

  // Upcoming Deadlines — next 5 by nearest deadline
  const upcoming = sortTasks(active, "deadline-asc").slice(0, 5);
  const upcomingMount = document.getElementById("upcomingList");
  if (upcomingMount) {
    upcomingMount.innerHTML = upcoming.length
      ? upcoming.map((t) => createTaskCardHTML(t)).join("")
      : emptyStateHTML({ message: "No upcoming submissions." });
    bindTaskCardActions(upcomingMount, renderDashboard);
  }

  // What should I do today? — ranked by deadline, then priority
  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  const todo = [...active]
    .sort((a, b) => getDaysRemaining(a) - getDaysRemaining(b) || priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 5);
  const todoMount = document.getElementById("todoTodayList");
  if (todoMount) {
    todoMount.innerHTML = todo.length
      ? `<ol class="todo-list">${todo
          .map((t) => `<li>${PRIORITY_EMOJI[t.priority]} ${escapeHTML(t.subject)} — ${escapeHTML(t.title)} — <span class="todo-remaining">${getRemainingTimeLabel(t)}</span></li>`)
          .join("")}</ol>`
      : `<p class="empty-message">No tasks need attention today.</p>`;
  }

  // Progress section
  const total = tasks.length;
  const completedCount = completed.length;
  const inProgressCount = tasks.filter((t) => t.status === "In Progress").length;
  const notStartedCount = tasks.filter((t) => t.status === "Not Started").length;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  setText("progressCompleted", completedCount);
  setText("progressInProgress", inProgressCount);
  setText("progressNotStarted", notStartedCount);
  setText("progressPercent", `${percent}%`);
  const bar = document.getElementById("progressBarFill");
  if (bar) bar.style.width = `${percent}%`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ============================================================
   PAGE: ADD / EDIT TASK (add-task.html)
   ============================================================ */
function initAddTaskPage() {
  populateDropdown("subjectSelect", SUBJECT_LIST);
  populateDropdown("typeSelect", TYPE_LIST);

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  const form = document.getElementById("taskForm");
  const heading = document.getElementById("formHeading");
  const submitBtn = document.getElementById("submitBtn");

  let editingTask = null;
  if (editId) {
    editingTask = getTaskById(editId);
    if (editingTask) {
      heading.textContent = "Edit Task";
      submitBtn.textContent = "Save Changes";
      fillFormWithTask(editingTask);
    }
  }

  // "Other" subject reveals a custom text field
  document.getElementById("subjectSelect").addEventListener("change", (e) => {
    toggleCustomField(e.target.value === "Other", "customSubjectWrap");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearFormErrors();

    const values = readFormValues();
    const errors = validateTaskForm(values);

    if (errors.length > 0) {
      showFormErrors(errors);
      return;
    }

    if (editingTask) {
      updateTask(editingTask.id, values);
    } else {
      addTask(values);
    }
    window.location.href = "index.html";
  });

  document.getElementById("cancelBtn").addEventListener("click", () => {
    window.location.href = editingTask ? "tasks.html" : "index.html";
  });
}

function populateDropdown(id, options) {
  const select = document.getElementById(id);
  if (!select) return;
  select.innerHTML = options.map((opt) => `<option value="${opt}">${opt}</option>`).join("");
}

function toggleCustomField(show, wrapId) {
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.hidden = !show;
}

function fillFormWithTask(task) {
  const subjectSelect = document.getElementById("subjectSelect");
  if (![...subjectSelect.options].some((o) => o.value === task.subject)) {
    subjectSelect.value = "Other";
    toggleCustomField(true, "customSubjectWrap");
    document.getElementById("customSubject").value = task.subject;
  } else {
    subjectSelect.value = task.subject;
  }

  document.getElementById("typeSelect").value = task.type;
  document.getElementById("titleInput").value = task.title;
  document.getElementById("descriptionInput").value = task.description || "";
  document.getElementById("dateInput").value = task.deadlineDate;
  document.getElementById("timeInput").value = task.deadlineTime || "23:59";
  document.getElementById("prioritySelect").value = task.priority;
  document.getElementById("statusSelect").value = task.status;
}

function readFormValues() {
  const subjectSelect = document.getElementById("subjectSelect");
  const subject =
    subjectSelect.value === "Other" ? document.getElementById("customSubject").value.trim() : subjectSelect.value;

  return {
    subject,
    type: document.getElementById("typeSelect").value,
    title: document.getElementById("titleInput").value.trim(),
    description: document.getElementById("descriptionInput").value.trim(),
    deadlineDate: document.getElementById("dateInput").value,
    deadlineTime: document.getElementById("timeInput").value || "23:59",
    priority: document.getElementById("prioritySelect").value,
    status: document.getElementById("statusSelect").value
  };
}

function validateTaskForm(values) {
  const errors = [];
  if (!values.subject) errors.push("Please enter a subject.");
  if (!values.title) errors.push("Please enter a topic or title.");
  if (!values.deadlineDate) errors.push("Please select a deadline date.");
  if (values.deadlineDate && isNaN(new Date(values.deadlineDate))) errors.push("That deadline date isn't valid.");
  return errors;
}

function showFormErrors(errors) {
  const box = document.getElementById("formErrors");
  box.hidden = false;
  box.innerHTML = errors.map((e) => `<p>❌ ${escapeHTML(e)}</p>`).join("");
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearFormErrors() {
  const box = document.getElementById("formErrors");
  box.hidden = true;
  box.innerHTML = "";
}

/* ============================================================
   PAGE: ALL TASKS (tasks.html)
   ============================================================ */
function initTasksPage() {
  populateDropdown("filterSubject", ["All", ...SUBJECT_LIST]);
  populateDropdown("filterType", ["All", ...TYPE_LIST]);

  const controls = ["searchInput", "filterSubject", "filterType", "filterPriority", "filterStatus", "sortSelect"];
  controls.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", renderTasksList);
  });

  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("filterSubject").value = "All";
    document.getElementById("filterType").value = "All";
    document.getElementById("filterPriority").value = "All";
    document.getElementById("filterStatus").value = "All";
    document.getElementById("sortSelect").value = "deadline-asc";
    renderTasksList();
  });

  renderTasksList();
}

function renderTasksList() {
  const filters = {
    search: document.getElementById("searchInput").value,
    subject: document.getElementById("filterSubject").value,
    type: document.getElementById("filterType").value,
    priority: document.getElementById("filterPriority").value,
    status: document.getElementById("filterStatus").value
  };
  const sortMode = document.getElementById("sortSelect").value;

  const all = getTasks();
  const filtered = filterTasks(all, filters);
  const sorted = sortTasks(filtered, sortMode);

  const mount = document.getElementById("allTasksList");
  setText("resultsCount", `${sorted.length} task${sorted.length === 1 ? "" : "s"}`);

  mount.innerHTML = sorted.length
    ? sorted.map((t) => createTaskCardHTML(t)).join("")
    : emptyStateHTML({
        emoji: "🔍",
        title: "No matching tasks",
        message: "Try adjusting your search or filters.",
        showAddButton: false
      });

  bindTaskCardActions(mount, renderTasksList);
}

/* ============================================================
   PAGE: CALENDAR (calendar.html)
   ============================================================ */
let calendarViewDate = new Date();

function initCalendarPage() {
  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderCalendar();
  });
  document.getElementById("todayBtn").addEventListener("click", () => {
    calendarViewDate = new Date();
    renderCalendar();
  });
  renderCalendar();
}

function renderCalendar() {
  const tasks = getTasks();
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();

  const monthLabel = calendarViewDate.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  setText("calendarMonthLabel", monthLabel);

  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map date string -> tasks due that day
  const tasksByDate = {};
  tasks.forEach((t) => {
    if (!tasksByDate[t.deadlineDate]) tasksByDate[t.deadlineDate] = [];
    tasksByDate[t.deadlineDate].push(t);
  });

  const todayStr = formatISODate(new Date());
  const cells = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push(`<div class="cal-cell cal-cell-empty"></div>`);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const dateStr = formatISODate(dateObj);
    const dayTasks = tasksByDate[dateStr] || [];
    const isToday = dateStr === todayStr;

    const dots = dayTasks
      .slice(0, 3)
      .map((t) => {
        if (t.status === "Completed") return `<span class="cal-dot dot-green"></span>`;
        if (t.priority === "High") return `<span class="cal-dot dot-red"></span>`;
        if (t.priority === "Medium") return `<span class="cal-dot dot-orange"></span>`;
        return `<span class="cal-dot dot-grey"></span>`;
      })
      .join("");

    cells.push(`
      <button class="cal-cell ${isToday ? "cal-today" : ""} ${dayTasks.length ? "has-tasks" : ""}" data-date="${dateStr}">
        <span class="cal-daynum">${day}</span>
        <span class="cal-dots">${dots}</span>
      </button>
    `);
  }

  document.getElementById("calendarGrid").innerHTML = cells.join("");

  document.querySelectorAll(".cal-cell[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => showTasksForDate(cell.dataset.date, tasksByDate[cell.dataset.date] || []));
  });

  // Auto-select today (or first of month) on render
  const preselect = tasksByDate[todayStr] ? todayStr : null;
  if (preselect) {
    showTasksForDate(todayStr, tasksByDate[todayStr]);
  } else {
    document.getElementById("calDayHeading").textContent = "Select a date";
    document.getElementById("calDayList").innerHTML = emptyStateHTML({
      title: "No date selected",
      message: "Click a day on the calendar to see its tasks.",
      showAddButton: false
    });
  }
}

function showTasksForDate(dateStr, tasks) {
  document.getElementById("calDayHeading").textContent = formatDateLong(dateStr);
  const mount = document.getElementById("calDayList");
  mount.innerHTML = tasks.length
    ? tasks.map((t) => createTaskCardHTML(t)).join("")
    : emptyStateHTML({ message: "No submissions due on this day.", showAddButton: false });
  bindTaskCardActions(mount, () => renderCalendar());
}

function formatISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ============================================================
   PAGE: SETTINGS (settings.html)
   ============================================================ */
function initSettingsPage() {
  const settings = getSettings();
  document.getElementById("notifToggle").checked = settings.notificationsEnabled;
  document.getElementById("themeSelect").value = settings.theme;

  document.getElementById("notifToggle").addEventListener("change", (e) => {
    const s = getSettings();
    s.notificationsEnabled = e.target.checked;
    saveSettings(s);
  });

  document.getElementById("themeSelect").addEventListener("change", (e) => {
    const s = getSettings();
    s.theme = e.target.value;
    saveSettings(s);
    applyTheme();
  });

  document.getElementById("clearCompletedBtn").addEventListener("click", () => {
    openConfirmDialog("Clear all completed tasks? This can't be undone.", () => {
      clearCompletedTasks();
      showToast("Completed tasks cleared.");
    });
  });

  document.getElementById("clearAllBtn").addEventListener("click", () => {
    openConfirmDialog("Clear ALL tasks? This will permanently delete everything.", () => {
      clearAllTasks();
      showToast("All tasks cleared.");
    });
  });
}
