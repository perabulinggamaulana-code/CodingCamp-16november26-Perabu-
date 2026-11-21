/**
 * Todo List Dashboard — js/app.js
 *
 * Zero-dependency, single-page productivity dashboard.
 * All widget modules live inside this top-level IIFE.
 * Persistence is handled exclusively via localStorage with the `tld_` key prefix.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pure helper functions — no DOM, no storage, no side effects
  // ---------------------------------------------------------------------------

  /**
   * Format a Date object as a zero-padded HH:MM string (24-hour clock).
   * @param {Date} date
   * @returns {string} e.g. "09:05" or "23:47"
   */
  function formatClockTime(date) {
    const hours   = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
  }

  /**
   * Return a greeting string for the given hour of day (0–23).
   * - "Good Morning"   → 5–11  (inclusive)
   * - "Good Afternoon" → 12–16 (inclusive)
   * - "Good Evening"   → 17–20 (inclusive)
   * - "Good Night"     → 0–4 and 21–23 (inclusive)
   * @param {number} hour — integer in [0, 23]
   * @returns {string}
   */
  function getGreeting(hour) {
    if (hour >= 5  && hour <= 11) return 'Good Morning';
    if (hour >= 12 && hour <= 16) return 'Good Afternoon';
    if (hour >= 17 && hour <= 20) return 'Good Evening';
    return 'Good Night';
  }

  /**
   * Format a duration in seconds as a zero-padded MM:SS string.
   * MM is always at least 2 digits; SS is always exactly 2 digits.
   * - formatTimerDisplay(0)    → "00:00"
   * - formatTimerDisplay(90)   → "01:30"
   * - formatTimerDisplay(1500) → "25:00"
   * - formatTimerDisplay(7200) → "120:00"
   * @param {number} seconds — integer in [0, 7200]
   * @returns {string}
   */
  function formatTimerDisplay(seconds) {
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  }

  // ---------------------------------------------------------------------------
  // StorageModule — central gateway to localStorage
  // ---------------------------------------------------------------------------
  function StorageModule() {
    // Cached result of the availability probe: null = not yet checked.
    let _available = null;

    /**
     * Probe localStorage with a write/read/delete cycle.
     * Result is cached after the first call.
     * If unavailable, inserts a non-blocking warning banner into <header>.
     * @returns {boolean}
     */
    function isAvailable() {
      if (_available !== null) return _available;

      const TEST_KEY = '__tld_storage_test__';
      try {
        localStorage.setItem(TEST_KEY, '1');
        const val = localStorage.getItem(TEST_KEY);
        localStorage.removeItem(TEST_KEY);
        _available = val === '1';
      } catch (e) {
        _available = false;
      }

      if (!_available) {
        _showUnavailableBanner();
      }

      return _available;
    }

    /**
     * Insert a non-blocking warning banner inside the <header> element.
     * Only inserted once; subsequent calls are no-ops.
     */
    function _showUnavailableBanner() {
      const header = document.querySelector('header');
      if (!header) return;
      // Avoid duplicate banners
      if (header.querySelector('.tld-storage-warning')) return;

      const banner = document.createElement('div');
      banner.className = 'tld-storage-warning';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.textContent =
        'Your browser does not support localStorage. Changes will not be saved.';
      header.appendChild(banner);
    }

    /**
     * Retrieve and JSON-parse a value from localStorage.
     * On SyntaxError the corrupted key is removed and null is returned.
     * @param {string} key
     * @returns {*} parsed value, or null if absent/corrupt
     */
    function get(key) {
      if (!isAvailable()) return null;
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        return JSON.parse(raw);
      } catch (e) {
        if (e instanceof SyntaxError) {
          remove(key);
        }
        return null;
      }
    }

    /**
     * JSON-serialize value and write it to localStorage.
     * On QuotaExceededError a non-blocking near-widget warning is shown
     * and false is returned. Returns true on success.
     * @param {string} key
     * @param {*} value
     * @returns {boolean}
     */
    function set(key, value) {
      if (!isAvailable()) return false;
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        const isQuota =
          e instanceof DOMException &&
          (e.name === 'QuotaExceededError' ||
            e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
        if (isQuota) {
          _showQuotaWarning(key);
          return false;
        }
        return false;
      }
    }

    /**
     * Display a non-blocking quota warning near the widget that triggered the
     * save. The warning is attached to the closest ancestor section or the body.
     * @param {string} key
     */
    function _showQuotaWarning(key) {
      // Find the DOM element most closely associated with this key.
      // We look for a [data-storage-key] attribute; fall back to <main> or <body>.
      let anchor =
        document.querySelector('[data-storage-key="' + key + '"]') ||
        document.querySelector('main') ||
        document.body;

      // Avoid duplicate warnings for the same key.
      const existingId = 'tld-quota-warn-' + key.replace(/[^a-z0-9]/gi, '-');
      if (document.getElementById(existingId)) return;

      const warning = document.createElement('div');
      warning.id = existingId;
      warning.className = 'tld-quota-warning';
      warning.setAttribute('role', 'status');
      warning.setAttribute('aria-live', 'polite');
      warning.textContent =
        'Storage quota exceeded. This change could not be saved.';
      anchor.appendChild(warning);

      // Auto-remove after 5 seconds so it doesn't clutter the UI permanently.
      setTimeout(function () {
        if (warning.parentNode) warning.parentNode.removeChild(warning);
      }, 5000);
    }

    /**
     * Remove a key from localStorage.
     * @param {string} key
     */
    function remove(key) {
      if (!isAvailable()) return;
      try {
        localStorage.removeItem(key);
      } catch (e) {
        // Nothing actionable if removal fails.
      }
    }

    /**
     * Public method that checks availability and shows the banner if needed.
     * Called from init() after ThemeWidget.
     */
    function checkAvailability() {
      isAvailable(); // side-effect: shows banner when unavailable
    }

    return {
      KEYS: {
        NAME: 'tld_name',
        THEME: 'tld_theme',
        TASKS: 'tld_tasks',
        LINKS: 'tld_links',
        POMODORO_DURATION: 'tld_pomodoro_duration',
      },
      isAvailable,
      get,
      set,
      remove,
      checkAvailability,
    };
  }

  // ---------------------------------------------------------------------------
  // ThemeWidget — applies and persists light/dark theme
  // ---------------------------------------------------------------------------
  function ThemeWidget() {
    /**
     * Set the data-theme attribute on <html> immediately.
     * Called before any other widget renders to prevent FOUC.
     * @param {string} theme — "light" or "dark"
     */
    function apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
    }

    /**
     * Read the current data-theme from <html>, flip it, persist it, then apply.
     */
    function toggle() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      apply(next);
      storage.set(storage.KEYS.THEME, next);
    }

    /**
     * Load the saved theme and wire the toggle button.
     * Runs first in init() to prevent flash of unstyled content.
     */
    function init() {
      const saved = storage.get(storage.KEYS.THEME);
      apply(saved === 'dark' ? 'dark' : 'light');

      const btn = document.getElementById('theme-toggle');
      if (btn) {
        btn.addEventListener('click', toggle);
      }
    }

    return {
      init,
      toggle,
      apply,
    };
  }

  // ---------------------------------------------------------------------------
  // GreetingWidget — time, date, greeting, name input
  // ---------------------------------------------------------------------------
  function GreetingWidget() {
    /**
     * Read the current time/date, build greeting + name string, update DOM.
     * Wrapped in try/catch — on any failure shows a fallback message.
     */
    function updateClock() {
      try {
        const now = new Date();

        const timeStr = formatClockTime(now);

        const dateStr = now.toLocaleDateString('en-GB', {
          weekday: 'long',
          day:     '2-digit',
          month:   'long',
          year:    'numeric',
        });

        const greeting = getGreeting(now.getHours());

        const savedName = storage.get(storage.KEYS.NAME);
        const greetingText =
          savedName && savedName.trim()
            ? greeting + ', ' + savedName.trim() + '!'
            : greeting + '!';

        const timeEl    = document.getElementById('greeting-time');
        const dateEl    = document.getElementById('greeting-date');
        const textEl    = document.getElementById('greeting-text');

        if (timeEl) timeEl.textContent = timeStr;
        if (dateEl) dateEl.textContent = dateStr;
        if (textEl) textEl.textContent = greetingText;
      } catch (e) {
        const textEl = document.getElementById('greeting-text');
        if (textEl) textEl.textContent = 'Time information unavailable';
      }
    }

    /**
     * Read name from #name-input, validate, persist, and re-render.
     * - Empty / whitespace-only: remove saved name, clear input.
     * - Length > 50: slice to 50 and show inline truncation notice.
     * - Otherwise: persist and update greeting.
     */
    function saveName() {
      const input = document.getElementById('name-input');
      const feedback = document.getElementById('name-feedback');

      if (!input) return;

      let value = input.value.trim();

      // Clear any prior feedback
      if (feedback) feedback.textContent = '';

      if (!value) {
        // Empty or whitespace — remove persisted name and clear input
        storage.remove(storage.KEYS.NAME);
        input.value = '';
        updateClock();
        return;
      }

      if (value.length > 50) {
        value = value.slice(0, 50);
        input.value = value;
        if (feedback) {
          feedback.textContent = 'Name was truncated to 50 characters.';
        }
      }

      storage.set(storage.KEYS.NAME, value);
      updateClock();
    }

    /**
     * Load saved name, start the 60-second clock tick, wire Save button.
     */
    function init() {
      // Pre-fill input if a name was previously saved
      const savedName = storage.get(storage.KEYS.NAME);
      const input = document.getElementById('name-input');
      if (input && savedName && savedName.trim()) {
        input.value = savedName.trim();
      }

      // Render immediately so the user sees the time right away
      updateClock();

      // Tick every 60 seconds
      setInterval(updateClock, 60000);

      // Wire Save button
      const saveBtn = document.getElementById('save-name-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', saveName);
      }
    }

    return {
      init,
      updateClock,
      saveName,
    };
  }

  // ---------------------------------------------------------------------------
  // TimerWidget — Pomodoro countdown with Start / Stop / Reset
  // ---------------------------------------------------------------------------
  function TimerWidget() {
    // ── Internal state ────────────────────────────────────────────────────────
    let state            = 'stopped'; // 'stopped' | 'running' | 'paused'
    let remainingSeconds = 0;
    let intervalId       = null;
    let pomodoroMinutes  = 25;

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Write the current remainingSeconds into the #timer-display element.
     */
    function _updateDisplay() {
      const el = document.getElementById('timer-display');
      if (el) el.textContent = formatTimerDisplay(remainingSeconds);
    }

    /**
     * Enforce Start / Stop / Reset enabled-state rules based on current state.
     *
     * | State   | Start   | Stop    | Reset   |
     * |---------|---------|---------|---------|
     * | stopped | enabled | disabled| enabled |
     * | running | disabled| enabled | enabled |
     * | paused  | enabled | disabled| enabled |
     */
    function _updateButtons() {
      const startBtn = document.getElementById('timer-start-btn');
      const stopBtn  = document.getElementById('timer-stop-btn');
      const resetBtn = document.getElementById('timer-reset-btn');

      if (startBtn) startBtn.disabled = (state === 'running');
      if (stopBtn)  stopBtn.disabled  = (state !== 'running');
      if (resetBtn) resetBtn.disabled = false; // always enabled
    }

    /**
     * Called when the countdown reaches 00:00.
     * Stops the ticker, sets state to stopped, shows the #timer-alert overlay
     * for a minimum of 3 s (then leaves it visible until reset), retains "00:00".
     */
    function _complete() {
      clearInterval(intervalId);
      intervalId = null;
      state = 'stopped';

      // Keep display at "00:00"
      remainingSeconds = 0;
      _updateDisplay();
      _updateButtons();

      // Show the in-page alert element
      const alertEl = document.getElementById('timer-alert');
      if (alertEl) {
        alertEl.removeAttribute('hidden');
        // The spec says show for a minimum of 3 s; we leave it visible until
        // the user clicks Reset (which calls _hideAlert()), but after 3 s the
        // alert has met its minimum-display requirement automatically.
      }
    }

    /**
     * Hide the completion alert, used by reset().
     */
    function _hideAlert() {
      const alertEl = document.getElementById('timer-alert');
      if (alertEl) alertEl.setAttribute('hidden', '');
    }

    // ── Public interface ──────────────────────────────────────────────────────

    /**
     * Start the countdown.
     * Only callable in 'stopped' or 'paused'; no-op otherwise.
     */
    function start() {
      if (state !== 'stopped' && state !== 'paused') return;

      state = 'running';
      _updateButtons();

      intervalId = setInterval(function () {
        if (remainingSeconds > 0) {
          remainingSeconds -= 1;
          _updateDisplay();
        }

        if (remainingSeconds <= 0) {
          _complete();
        }
      }, 1000);
    }

    /**
     * Pause the countdown (the task spec calls this "stop" to mean pause).
     * Only callable in 'running'; no-op otherwise.
     * Clears the interval but retains remainingSeconds.
     */
    function stop() {
      if (state !== 'running') return;

      clearInterval(intervalId);
      intervalId = null;
      state = 'paused';
      _updateButtons();
    }

    /**
     * Reset the timer to its full duration.
     * Callable in any state.
     * Clears the interval, restores remainingSeconds, sets state to 'stopped',
     * updates the display, and hides the completion alert.
     */
    function reset() {
      clearInterval(intervalId);
      intervalId = null;
      state = 'stopped';
      remainingSeconds = pomodoroMinutes * 60;
      _updateDisplay();
      _updateButtons();
      _hideAlert();
    }

    /**
     * Change the Pomodoro duration.
     * If the timer is currently running, stops it first.
     * Sets pomodoroMinutes and resets everything.
     * @param {number} minutes — integer in [1, 120]
     */
    function setDuration(minutes) {
      if (state === 'running') {
        stop();
      }
      pomodoroMinutes = minutes;
      remainingSeconds = minutes * 60;
      reset(); // also updates display, buttons, and hides alert
    }

    /**
     * Return the current state string.
     * @returns {'stopped'|'running'|'paused'}
     */
    function getState() {
      return state;
    }

    /**
     * Load saved duration, render initial display, and wire the three buttons.
     */
    function init() {
      // Read saved duration (default 25 if absent or not a valid number)
      const saved = storage.get(storage.KEYS.POMODORO_DURATION);
      const parsedDuration = parseInt(saved, 10);
      pomodoroMinutes = (Number.isInteger(parsedDuration) && parsedDuration >= 1 && parsedDuration <= 120)
        ? parsedDuration
        : 25;

      remainingSeconds = pomodoroMinutes * 60;

      // Render initial display
      _updateDisplay();
      _updateButtons();

      // Wire buttons
      const startBtn = document.getElementById('timer-start-btn');
      const stopBtn  = document.getElementById('timer-stop-btn');
      const resetBtn = document.getElementById('timer-reset-btn');

      if (startBtn) startBtn.addEventListener('click', start);
      if (stopBtn)  stopBtn.addEventListener('click', stop);
      if (resetBtn) resetBtn.addEventListener('click', reset);
    }

    return {
      init,
      start,
      stop,
      reset,
      setDuration,
      getState,
      _updateButtons, // exposed for testing
      _complete,      // exposed for testing
    };
  }

  // ---------------------------------------------------------------------------
  // DurationWidget — numeric input + Save for Pomodoro duration
  // ---------------------------------------------------------------------------
  function DurationWidget() {

    // -----------------------------------------------------------------------
    // validateDuration(value)
    // Returns { valid: true } for integers in [1, 120].
    // Returns { valid: false, message: '...' } for everything else.
    // -----------------------------------------------------------------------
    function validateDuration(value) {
      // Must be a finite number (rejects NaN, strings, etc.)
      if (typeof value !== 'number' || !isFinite(value)) {
        return { valid: false, message: 'Please enter a whole number between 1 and 120.' };
      }
      // Must be an integer (rejects decimals like 1.5)
      if (!Number.isInteger(value)) {
        return { valid: false, message: 'Duration must be a whole number (no decimals).' };
      }
      if (value < 1) {
        return { valid: false, message: 'Duration must be at least 1 minute.' };
      }
      if (value > 120) {
        return { valid: false, message: 'Duration cannot exceed 120 minutes.' };
      }
      return { valid: true };
    }

    // -----------------------------------------------------------------------
    // Save button handler
    // -----------------------------------------------------------------------
    function handleSave() {
      const input    = document.getElementById('duration-input');
      const feedback = document.getElementById('duration-feedback');

      if (!input || !feedback) return;

      const value  = parseInt(input.value, 10);
      const result = validateDuration(value);

      if (!result.valid) {
        feedback.textContent = result.message;
        return;
      }

      // Valid — apply, persist, clear error
      timer.setDuration(value);
      storage.set(storage.KEYS.POMODORO_DURATION, value);
      feedback.textContent = '';
    }

    // -----------------------------------------------------------------------
    // init
    // -----------------------------------------------------------------------
    function init() {
      const input   = document.getElementById('duration-input');
      const saveBtn = document.getElementById('duration-save-btn');

      // Populate input with the saved duration (default 25)
      const saved  = storage.get(storage.KEYS.POMODORO_DURATION);
      const parsed = parseInt(saved, 10);
      const current = (Number.isInteger(parsed) && parsed >= 1 && parsed <= 120) ? parsed : 25;

      if (input) input.value = current;

      if (saveBtn) saveBtn.addEventListener('click', handleSave);
    }

    return {
      init,
      validateDuration,
    };
  }

  // ---------------------------------------------------------------------------
  // TaskWidget — add, edit, complete, delete, sort tasks
  // ---------------------------------------------------------------------------
  function TaskWidget() {
    // ── Internal state ────────────────────────────────────────────────────────
    let tasks = [];
    let sortOrder = 'created'; // 'created' | 'alpha' | 'completed-last'
    let editingId = null;      // id of the task currently in edit mode, or null

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Write the current tasks array to localStorage.
     */
    function _persist() {
      storage.set(storage.KEYS.TASKS, tasks);
    }

    /**
     * Show an inline message in #task-feedback.
     * @param {string} message
     */
    function _setFeedback(message) {
      const el = document.getElementById('task-feedback');
      if (el) el.textContent = message;
    }

    /**
     * Clear any existing feedback message.
     */
    function _clearFeedback() {
      const el = document.getElementById('task-feedback');
      if (el) el.textContent = '';
    }

    // ── Public interface ──────────────────────────────────────────────────────

    /**
     * Add a new task.
     * - Trims title; rejects if empty/whitespace.
     * - Rejects duplicates (case-insensitive match against all existing titles).
     * - Creates { id, title, completed: false, createdAt } and appends it.
     * - Persists, renders, clears the input on success.
     * @param {string} title
     */
    function addTask(title) {
      const trimmed = (title || '').trim();

      if (!trimmed) {
        _setFeedback('Task title cannot be empty.');
        return;
      }

      const lowerTrimmed = trimmed.toLowerCase();
      const isDuplicate = tasks.some(function (t) {
        return t.title.toLowerCase() === lowerTrimmed;
      });

      if (isDuplicate) {
        _setFeedback('A task with that title already exists.');
        return;
      }

      const task = {
        id: crypto.randomUUID(),
        title: trimmed,
        completed: false,
        createdAt: Date.now(),
      };

      tasks.push(task);
      _persist();
      render();

      // Clear the input on success
      const input = document.getElementById('task-input');
      if (input) input.value = '';
      _clearFeedback();
    }

    /**
     * Remove a task by id. Persists and re-renders.
     * If the deleted task was in edit mode, clear the editingId first.
     * @param {string} id
     */
    function deleteTask(id) {
      if (editingId === id) editingId = null;
      tasks = tasks.filter(function (t) { return t.id !== id; });
      _persist();
      render();
    }

    /**
     * Flip the completed boolean for a task by id. Persists and re-renders.
     * If a non-default sort order is active, reapplies it so the sorted
     * view stays correct after the completion state changes.
     * @param {string} id
     */
    function toggleComplete(id) {
      var task = tasks.find(function (t) { return t.id === id; });
      if (task) {
        task.completed = !task.completed;
        _persist();
        if (sortOrder !== 'created') {
          setSortOrder(sortOrder);
        } else {
          render();
        }
      }
    }

    /**
     * Commit an edit to a task's title.
     *
     * - Trims newTitle.
     * - Rejects if empty/whitespace: shows an inline error inside the edit row
     *   and keeps edit mode open (returns false).
     * - Updates the in-memory title, persists, clears editingId, and re-renders.
     *
     * @param {string} id
     * @param {string} newTitle
     * @returns {boolean} true if the edit was accepted, false if rejected
     */
    function editTask(id, newTitle) {
      const trimmed = (newTitle || '').trim();

      if (!trimmed) {
        // Show the inline error inside the edit row that is currently open.
        const errorEl = document.getElementById('task-edit-error-' + id);
        if (errorEl) {
          errorEl.textContent = 'Title cannot be empty.';
        }
        // Keep the input focused.
        const inputEl = document.getElementById('task-edit-input-' + id);
        if (inputEl) inputEl.focus();
        return false;
      }

      var task = tasks.find(function (t) { return t.id === id; });
      if (task) {
        task.title = trimmed;
        _persist();
      }

      editingId = null;
      render();
      return true;
    }

    /**
     * Store the active sort order and re-render with the new ordering.
     * Does NOT mutate the persisted `tasks` array — only the display copy.
     * @param {string} order — 'created' | 'alpha' | 'completed-last'
     */
    function setSortOrder(order) {
      sortOrder = order;
      render();
    }

    /**
     * Render the task list.
     * When a task's id matches the module-scoped `editingId`, its row is rendered
     * in edit mode (text input + save icon) instead of the normal view.
     *
     * Sort behaviour (never mutates the persisted `tasks` array):
     *   'created'        — render in insertion order (tasks as-is)
     *   'alpha'          — shallow copy sorted by title, case-insensitive localeCompare
     *   'completed-last' — shallow copy with incomplete tasks first, completed last;
     *                      order within each group is stable (insertion order)
     */
    function render() {
      const list = document.getElementById('task-list');
      if (!list) return;

      // Build the display array — a shallow copy when sorting is needed so the
      // persisted `tasks` array is never mutated.
      let displayTasks;
      if (sortOrder === 'alpha') {
        displayTasks = [...tasks].sort(function (a, b) {
          return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
        });
      } else if (sortOrder === 'completed-last') {
        displayTasks = [...tasks].sort(function (a, b) {
          // false (0) < true (1), so incomplete tasks (false) sort before completed (true)
          if (a.completed === b.completed) return 0;
          return a.completed ? 1 : -1;
        });
      } else {
        // 'created' — insertion order; no copy needed (read-only iteration)
        displayTasks = tasks;
      }

      // Clear existing items
      list.innerHTML = '';

      if (displayTasks.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'task-empty-state';
        empty.textContent = 'No tasks yet. Add one above!';
        list.appendChild(empty);
        return;
      }

      displayTasks.forEach(function (task) {
        const li = document.createElement('li');
        li.className = 'task-item' + (task.completed ? ' task-item--completed' : '');
        li.dataset.id = task.id;

        // ── Checkbox (toggle completion) ──────────────────────────────────────
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.setAttribute('aria-label', 'Mark "' + task.title + '" as ' + (task.completed ? 'incomplete' : 'complete'));
        checkbox.addEventListener('change', function () {
          toggleComplete(task.id);
        });

        li.appendChild(checkbox);

        if (task.id === editingId) {
          // ── Edit-mode view ─────────────────────────────────────────────────

          // Text input pre-filled with current title
          const editInput = document.createElement('input');
          editInput.type = 'text';
          editInput.className = 'task-edit-input';
          editInput.id = 'task-edit-input-' + task.id;
          editInput.value = task.title;
          editInput.setAttribute('aria-label', 'Edit title for task "' + task.title + '"');

          // Inline error element (shown when editTask rejects empty input)
          const errorSpan = document.createElement('span');
          errorSpan.className = 'task-edit-error';
          errorSpan.id = 'task-edit-error-' + task.id;
          errorSpan.setAttribute('role', 'alert');
          errorSpan.setAttribute('aria-live', 'polite');

          // Save icon button
          const saveBtn = document.createElement('button');
          saveBtn.type = 'button';
          saveBtn.className = 'task-save-btn';
          saveBtn.setAttribute('aria-label', 'Save edit for task "' + task.title + '"');
          saveBtn.textContent = '💾';

          // Keyboard handler on the input
          editInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              editTask(task.id, editInput.value);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              editingId = null;
              render();
            }
          });

          // Save button click
          saveBtn.addEventListener('click', function () {
            editTask(task.id, editInput.value);
          });

          li.appendChild(editInput);
          li.appendChild(errorSpan);
          li.appendChild(saveBtn);

          // Delete button (keep available even in edit mode)
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'task-delete-btn';
          deleteBtn.setAttribute('aria-label', 'Delete task "' + task.title + '"');
          deleteBtn.textContent = '🗑️';
          deleteBtn.addEventListener('click', function () {
            deleteTask(task.id);
          });
          li.appendChild(deleteBtn);

        } else {
          // ── Normal view ────────────────────────────────────────────────────

          // Title span
          const titleSpan = document.createElement('span');
          titleSpan.className = 'task-title' + (task.completed ? ' completed' : '');
          titleSpan.textContent = task.title;

          // Edit button — clicking enters edit mode for this task
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'task-edit-btn';
          editBtn.setAttribute('aria-label', 'Edit task "' + task.title + '"');
          editBtn.textContent = '✏️';
          editBtn.addEventListener('click', function () {
            editingId = task.id;
            render();
            // Focus the newly-created input after re-render
            const inputEl = document.getElementById('task-edit-input-' + task.id);
            if (inputEl) {
              inputEl.focus();
              // Place cursor at end of text
              const len = inputEl.value.length;
              inputEl.setSelectionRange(len, len);
            }
          });

          // Delete button
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'task-delete-btn';
          deleteBtn.setAttribute('aria-label', 'Delete task "' + task.title + '"');
          deleteBtn.textContent = '🗑️';
          deleteBtn.addEventListener('click', function () {
            deleteTask(task.id);
          });

          li.appendChild(titleSpan);
          li.appendChild(editBtn);
          li.appendChild(deleteBtn);
        }

        list.appendChild(li);
      });

      // If we're in edit mode, focus the input (handles initial render after editingId is set)
      if (editingId) {
        const inputEl = document.getElementById('task-edit-input-' + editingId);
        if (inputEl && document.activeElement !== inputEl) {
          inputEl.focus();
          const len = inputEl.value.length;
          inputEl.setSelectionRange(len, len);
        }
      }
    }

    /**
     * Load persisted tasks, render, and wire the Add button + Enter key.
     */
    function init() {
      const saved = storage.get(storage.KEYS.TASKS);
      tasks = Array.isArray(saved) ? saved : [];

      render();

      // Wire Add button
      const addBtn = document.getElementById('add-task-btn');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          const input = document.getElementById('task-input');
          addTask(input ? input.value : '');
        });
      }

      // Wire Enter key on the task input
      const taskInput = document.getElementById('task-input');
      if (taskInput) {
        taskInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            addTask(taskInput.value);
          }
        });
      }

      // Wire sort control (full sort implementation deferred to Task 8.7)
      const sortSelect = document.getElementById('task-sort-select');
      if (sortSelect) {
        sortSelect.addEventListener('change', function () {
          setSortOrder(sortSelect.value);
        });
      }
    }

    return {
      init,
      addTask,
      editTask,
      toggleComplete,
      deleteTask,
      setSortOrder,
      render,
    };
  }

  // ---------------------------------------------------------------------------
  // QuickLinksWidget — saved URL shortcuts
  // ---------------------------------------------------------------------------
  function QuickLinksWidget() {
    // ── Internal state ────────────────────────────────────────────────────────
    let links = [];

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Write the current links array to localStorage.
     */
    function _persist() {
      storage.set(storage.KEYS.LINKS, links);
    }

    /**
     * Show an inline validation message in #links-feedback.
     * @param {string} message
     */
    function _setFeedback(message) {
      const el = document.getElementById('links-feedback');
      if (el) el.textContent = message;
    }

    /**
     * Clear the feedback message in #links-feedback.
     */
    function _clearFeedback() {
      const el = document.getElementById('links-feedback');
      if (el) el.textContent = '';
    }

    // ── Public interface ──────────────────────────────────────────────────────

    /**
     * Add a new quick link.
     *
     * Validation order:
     *  1. Label: 1–50 chars (after trim)
     *  2. URL: 1–2048 chars (after trim)
     *  3. URL scheme: must start with http:// or https://
     *  4. Duplicate URL: case-insensitive match against existing entries
     *  5. 20-link cap
     *
     * On success: creates the entry, appends to the array, persists,
     * calls render(), and clears the input fields.
     *
     * @param {string} label
     * @param {string} url
     */
    function addLink(label, url) {
      const trimmedLabel = (label || '').trim();
      const trimmedUrl   = (url   || '').trim();

      // Validate label length (1–50 chars)
      if (trimmedLabel.length === 0 || trimmedLabel.length > 50) {
        _setFeedback('Label must be between 1 and 50 characters.');
        return;
      }

      // Validate URL length (1–2048 chars)
      if (trimmedUrl.length === 0 || trimmedUrl.length > 2048) {
        _setFeedback('URL must be between 1 and 2048 characters.');
        return;
      }

      // Validate URL scheme (must start with http:// or https://)
      const lowerUrl = trimmedUrl.toLowerCase();
      if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
        _setFeedback('URL must start with http:// or https://.');
        return;
      }

      // Validate no duplicate URL (case-insensitive)
      const isDuplicate = links.some(function (link) {
        return link.url.toLowerCase() === lowerUrl;
      });
      if (isDuplicate) {
        _setFeedback('That URL is already in your links list.');
        return;
      }

      // Validate 20-link cap
      if (links.length >= 20) {
        _setFeedback('You can save a maximum of 20 links.');
        return;
      }

      // All valid — create the entry
      const entry = {
        id:        crypto.randomUUID(),
        label:     trimmedLabel,
        url:       trimmedUrl,
        createdAt: Date.now(),
      };

      links.push(entry);
      _persist();
      render();

      // Clear inputs on success
      const labelInput = document.getElementById('link-label-input');
      const urlInput   = document.getElementById('link-url-input');
      if (labelInput) labelInput.value = '';
      if (urlInput)   urlInput.value   = '';
      _clearFeedback();
    }

    /**
     * Remove a link by id. Persists and re-renders.
     * @param {string} id
     */
    function deleteLink(id) {
      links = links.filter(function (link) { return link.id !== id; });
      _persist();
      render();
    }

    /**
     * Render the links list into #links-list.
     * Each link gets:
     *   - A <button> with the label text; clicking opens the URL in a new tab.
     *   - A delete <button> that calls deleteLink(id).
     * If the list is empty an empty-state message is shown.
     */
    function render() {
      const list = document.getElementById('links-list');
      if (!list) return;

      list.innerHTML = '';

      if (links.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'links-empty-state';
        empty.textContent = 'No links saved yet. Add one above!';
        list.appendChild(empty);
        return;
      }

      links.forEach(function (link) {
        const li = document.createElement('li');
        li.className = 'link-item';
        li.dataset.id = link.id;

        // Open-link button
        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'link-open-btn';
        openBtn.setAttribute('aria-label', 'Open link: ' + link.label);
        openBtn.textContent = link.label;
        openBtn.addEventListener('click', function () {
          window.open(link.url, '_blank', 'noopener,noreferrer');
        });

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'link-delete-btn';
        deleteBtn.setAttribute('aria-label', 'Delete link "' + link.label + '"');
        deleteBtn.textContent = '🗑️';
        deleteBtn.addEventListener('click', function () {
          deleteLink(link.id);
        });

        li.appendChild(openBtn);
        li.appendChild(deleteBtn);
        list.appendChild(li);
      });
    }

    /**
     * Load persisted links, render, and wire the Add button.
     */
    function init() {
      const saved = storage.get(storage.KEYS.LINKS);
      links = Array.isArray(saved) ? saved : [];

      render();

      // Wire Add button
      const addBtn = document.getElementById('add-link-btn');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          const labelInput = document.getElementById('link-label-input');
          const urlInput   = document.getElementById('link-url-input');
          addLink(
            labelInput ? labelInput.value : '',
            urlInput   ? urlInput.value   : ''
          );
        });
      }
    }

    return {
      init,
      addLink,
      deleteLink,
      render,
    };
  }

  // ---------------------------------------------------------------------------
  // Module singletons — instantiated before init() is called
  // ---------------------------------------------------------------------------
  const storage  = StorageModule();
  const theme    = ThemeWidget();
  const greeting = GreetingWidget();
  const timer    = TimerWidget();
  const duration = DurationWidget();
  const tasks    = TaskWidget();
  const links    = QuickLinksWidget();

  // ---------------------------------------------------------------------------
  // init — called on DOMContentLoaded; runs widgets in the required order
  // ---------------------------------------------------------------------------
  function init() {
    // Initialization order (must not be changed):
    //   1. ThemeWidget.init()               — apply saved theme before any render (prevents FOUC)
    //   2. StorageModule.checkAvailability() — detect localStorage blockage, show banner if needed
    //   3. GreetingWidget.init()            — render time, date, greeting, name
    //   4. TimerWidget.init()               — restore saved duration, render controls
    //   5. DurationWidget.init()            — populate duration input
    //   6. TaskWidget.init()                — load and render task list
    //   7. QuickLinksWidget.init()          — load and render link list
    theme.init();
    storage.checkAvailability();
    greeting.init();
    timer.init();
    duration.init();
    tasks.init();
    links.init();
  }

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);
})();
