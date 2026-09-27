/* ============================================================
   storage.js
   ------------------------------------------------------------
   This file is the ONLY place that talks to LocalStorage.
   Every other file (script.js, page scripts) should use these
   functions instead of touching localStorage directly. That
   way, if we ever change how data is stored, we only edit
   this one file.
   ============================================================ */

// The key we use to store everything in LocalStorage
const STORAGE_KEY = "deadline_tasks";
const SETTINGS_KEY = "deadline_settings";
const NOTIFICATIONS_KEY = "deadline_notifications";

/* ------------------------------------------------------------
   SAMPLE DATA
   Used only the very first time the app runs (when there is
   nothing in LocalStorage yet), so new users have something
   to look at.
   ------------------------------------------------------------ */
function getSampleTasks() {
  return [
    {
      id: "sample-1",
      subject: "DSA",
      type: "Assignment",
      title: "Binary Search Tree",
      description: "Implement insert, delete and traversal for a BST.",
      deadlineDate: "2026-09-30",
      deadlineTime: "23:59",
      priority: "High",
      status: "Not Started",
      createdAt: new Date().toISOString(),
      isSample: true
    },
    {
      id: "sample-2",
      subject: "COA",
      type: "Notes",
      title: "Memory Organization",
      description: "Write notes covering cache and memory hierarchy.",
      deadlineDate: "2026-10-02",
      deadlineTime: "23:59",
      priority: "Medium",
      status: "In Progress",
      createdAt: new Date().toISOString(),
      isSample: true
    },
    {
      id: "sample-3",
      subject: "STLD",
      type: "Record",
      title: "Boolean Algebra",
      description: "Complete the lab record for Boolean algebra simplification.",
      deadlineDate: "2026-10-05",
      deadlineTime: "23:59",
      priority: "Low",
      status: "Not Started",
      createdAt: new Date().toISOString(),
      isSample: true
    }
  ];
}

/* ------------------------------------------------------------
   CORE TASK FUNCTIONS
   ------------------------------------------------------------ */

// Get every task from LocalStorage. If nothing is saved yet,
// seed it with sample data so the app isn't empty on first run.
function getTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    const samples = getSampleTasks();
    saveTasks(samples);
    return samples;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("Deadline: could not parse saved tasks, resetting.", err);
    saveTasks([]);
    return [];
  }
}

// Save the full array of tasks back to LocalStorage.
function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

// Create a simple unique id (good enough for a client-only app).
function generateId() {
  return "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

// Add a new task object to storage. Returns the saved task (with id).
function addTask(taskData) {
  const tasks = getTasks();
  const newTask = {
    id: generateId(),
    subject: taskData.subject,
    type: taskData.type,
    title: taskData.title,
    description: taskData.description || "",
    deadlineDate: taskData.deadlineDate,
    deadlineTime: taskData.deadlineTime || "23:59",
    priority: taskData.priority,
    status: taskData.status || "Not Started",
    createdAt: new Date().toISOString(),
    isSample: false
  };
  tasks.push(newTask);
  saveTasks(tasks);
  return newTask;
}

// Update an existing task by id with new field values.
function updateTask(id, updatedFields) {
  const tasks = getTasks();
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;
  tasks[index] = { ...tasks[index], ...updatedFields };
  saveTasks(tasks);
  return tasks[index];
}

// Remove a task by id.
function deleteTask(id) {
  const tasks = getTasks().filter((t) => t.id !== id);
  saveTasks(tasks);
}

// Shortcut for marking a task complete.
function markTaskComplete(id) {
  return updateTask(id, { status: "Completed" });
}

// Find a single task by id.
function getTaskById(id) {
  return getTasks().find((t) => t.id === id) || null;
}

/* ------------------------------------------------------------
   FILTERING + SORTING
   ------------------------------------------------------------ */

// Filter tasks by any combination of subject/type/priority/status/search text.
function filterTasks(tasks, filters) {
  return tasks.filter((task) => {
    if (filters.subject && filters.subject !== "All" && task.subject !== filters.subject) return false;
    if (filters.type && filters.type !== "All" && task.type !== filters.type) return false;
    if (filters.priority && filters.priority !== "All" && task.priority !== filters.priority) return false;
    if (filters.status && filters.status !== "All" && task.status !== filters.status) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const haystack = (task.subject + " " + task.title + " " + task.type).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Sort tasks. mode is one of:
// "deadline-asc", "deadline-desc", "priority", "recent"
function sortTasks(tasks, mode) {
  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  const copy = [...tasks];

  switch (mode) {
    case "deadline-desc":
      copy.sort((a, b) => getDeadlineDate(b) - getDeadlineDate(a));
      break;
    case "priority":
      copy.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
      break;
    case "recent":
      copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      break;
    case "deadline-asc":
    default:
      copy.sort((a, b) => getDeadlineDate(a) - getDeadlineDate(b));
      break;
  }
  return copy;
}

/* ------------------------------------------------------------
   DEADLINE / TIME HELPERS
   ------------------------------------------------------------ */

// Build a real JS Date object from a task's date + time fields.
// Uses the browser's local time, as required.
function getDeadlineDate(task) {
  const time = task.deadlineTime || "23:59";
  return new Date(`${task.deadlineDate}T${time}`);
}

// Returns the number of whole days between now and the deadline.
// Negative numbers mean the deadline has passed.
function getDaysRemaining(task) {
  const now = new Date();
  const deadline = getDeadlineDate(task);
  const msPerDay = 1000 * 60 * 60 * 24;
  // Compare calendar days, not exact hours, so "today" reads correctly.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDeadline = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  return Math.round((startOfDeadline - startOfToday) / msPerDay);
}

// Returns a status object: { key, label, emoji } describing where
// this task stands relative to now.
function getDeadlineStatus(task) {
  if (task.status === "Completed") {
    return { key: "completed", label: "Completed", emoji: "🟢" };
  }
  const days = getDaysRemaining(task);
  if (days < 0) return { key: "overdue", label: "Overdue", emoji: "⚠️" };
  if (days === 0) return { key: "today", label: "Due today", emoji: "🔴" };
  if (days === 1) return { key: "tomorrow", label: "Due tomorrow", emoji: "🟠" };
  if (days <= 7) return { key: "soon", label: `Due in ${days} days`, emoji: "🟡" };
  return { key: "later", label: `Due in ${days} days`, emoji: "⚪" };
}

// Human friendly "remaining time" string for a task card.
function getRemainingTimeLabel(task) {
  if (task.status === "Completed") return "Completed";
  const days = getDaysRemaining(task);
  if (days < 0) return `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due in 1 day";
  return `Due in ${days} days`;
}

/* ------------------------------------------------------------
   SETTINGS
   ------------------------------------------------------------ */

function getSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    const defaults = { theme: "light", notificationsEnabled: true };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(defaults));
    return defaults;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { theme: "light", notificationsEnabled: true };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/* ------------------------------------------------------------
   NOTIFICATIONS
   A lightweight list of "reminder" entries, generated by
   checkDeadlines() in script.js and stored so the bell icon
   can show them and mark them read.
   ------------------------------------------------------------ */

function getNotifications() {
  const raw = localStorage.getItem(NOTIFICATIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

function saveNotifications(list) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
}

function addNotification(notification) {
  const list = getNotifications();
  // Avoid duplicate notifications for the same task + reason on the same day.
  const today = new Date().toDateString();
  const exists = list.some(
    (n) => n.taskId === notification.taskId && n.reason === notification.reason && n.day === today
  );
  if (exists) return;
  list.unshift({
    id: "n_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    day: today,
    read: false,
    ...notification
  });
  saveNotifications(list.slice(0, 30)); // keep the list from growing forever
}

function markNotificationRead(id) {
  const list = getNotifications();
  const item = list.find((n) => n.id === id);
  if (item) item.read = true;
  saveNotifications(list);
}

function markAllNotificationsRead() {
  const list = getNotifications().map((n) => ({ ...n, read: true }));
  saveNotifications(list);
}

/* ------------------------------------------------------------
   BULK ACTIONS (used by Settings page)
   ------------------------------------------------------------ */

function clearCompletedTasks() {
  const tasks = getTasks().filter((t) => t.status !== "Completed");
  saveTasks(tasks);
}

function clearAllTasks() {
  saveTasks([]);
}
