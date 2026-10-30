/* StudentHub demo app
   - Vanilla JavaScript + localStorage
   - Not intended for secure multi-user/production use.
*/
"use strict";

const STORAGE_KEYS = {
  students: "studentHub_students_v1",
  attendance: "studentHub_attendance_v1",
  leaves: "studentHub_leaves_v1"
};

const $ = (id) => document.getElementById(id);
const todayISO = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const uid = () => (window.crypto && typeof window.crypto.randomUUID === "function")
  ? window.crypto.randomUUID()
  : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
}
function formatDate(iso) {
  if (!iso) return "Not set";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return iso;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric"
  });
}
function loadArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function saveAll() {
  try {
    localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(state.students));
    localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(state.attendance));
    localStorage.setItem(STORAGE_KEYS.leaves, JSON.stringify(state.leaves));
  } catch (error) {
    showToast("Your browser could not save the data. Check available storage and try again.", "error");
    console.error("Could not save app data:", error);
    return false;
  }
  localRevision += 1;
  if (backendConnected) {
    const snapshot = JSON.stringify(state);
    backendSyncQueue = backendSyncQueue.then(async () => {
      if (!backendConnected) return;
      const response = await fetch("/api/v1/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: snapshot
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || `Backend returned ${response.status}.`);
      }
    }).catch(error => {
      setBackendStatus(false);
      showToast("Saved in this browser, but the backend could not sync this change.", "error");
      console.error("Could not sync app data:", error);
    });
  }
  return true;
}

function makeSampleData() {
  const students = [
    { id: "sample-student-1", name: "Asha Kumar", roll: "CSE-001", studentClass: "CSE 2A", email: "asha@example.com" },
    { id: "sample-student-2", name: "Rahul Sharma", roll: "CSE-002", studentClass: "CSE 2A", email: "rahul@example.com" },
    { id: "sample-student-3", name: "Meera Patel", roll: "CSE-003", studentClass: "CSE 2A", email: "meera@example.com" },
    { id: "sample-student-4", name: "Arjun Rao", roll: "CSE-004", studentClass: "CSE 2A", email: "arjun@example.com" }
  ];
  const today = todayISO();
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  const yesterday = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
  const attendance = [
    { id: "sample-att-1", studentId: students[0].id, date: today, status: "Present" },
    { id: "sample-att-2", studentId: students[1].id, date: today, status: "Present" },
    { id: "sample-att-3", studentId: students[2].id, date: today, status: "Absent" },
    { id: "sample-att-4", studentId: students[3].id, date: today, status: "Present" },
    { id: "sample-att-5", studentId: students[0].id, date: yesterday, status: "Present" },
    { id: "sample-att-6", studentId: students[1].id, date: yesterday, status: "Absent" },
    { id: "sample-att-7", studentId: students[2].id, date: yesterday, status: "Present" },
    { id: "sample-att-8", studentId: students[3].id, date: yesterday, status: "Present" }
  ];
  const leaves = [
    { id: "sample-leave-1", studentId: students[1].id, start: today, end: today, reason: "Family appointment", status: "Pending", createdAt: new Date().toISOString() },
    { id: "sample-leave-2", studentId: students[2].id, start: today, end: today, reason: "Medical appointment", status: "Approved", createdAt: new Date().toISOString() }
  ];
  return { students, attendance, leaves };
}
function initialState() {
  const sample = makeSampleData();
  const storedStudents = loadArray(STORAGE_KEYS.students);
  const storedAttendance = loadArray(STORAGE_KEYS.attendance);
  const storedLeaves = loadArray(STORAGE_KEYS.leaves);
  const hasSavedData = storedStudents !== null && storedAttendance !== null && storedLeaves !== null;
  if (hasSavedData) {
    return { students: storedStudents, attendance: storedAttendance, leaves: storedLeaves };
  }
  const newState = sample;
  try {
    localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(newState.students));
    localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(newState.attendance));
    localStorage.setItem(STORAGE_KEYS.leaves, JSON.stringify(newState.leaves));
  } catch (error) {
    console.warn("Browser storage unavailable; changes may not persist.", error);
  }
  return newState;
}
let state = initialState();
let toastTimer = null;
let reportRange = { start: "", end: "" };
let confirmAction = null;
let backendConnected = false;
let backendSyncQueue = Promise.resolve();
let localRevision = 0;

function setBackendStatus(connected) {
  backendConnected = connected;
  const status = $("backendStatus");
  const dot = $("backendStatusDot");
  if (status) status.textContent = connected ? "Database connected" : "Local demo mode";
  if (dot) {
    dot.classList.toggle("is-connected", connected);
    dot.classList.toggle("is-local", !connected);
  }
}

async function loadBackendState() {
  const startingRevision = localRevision;
  const localState = state;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch("/api/v1/state", { signal: controller.signal });
    if (!response.ok) throw new Error(`Backend returned ${response.status}.`);
    let remoteState = await response.json();
    if (!Array.isArray(remoteState.students) || !Array.isArray(remoteState.attendance) || !Array.isArray(remoteState.leaves)) {
      throw new Error("Backend returned an invalid state payload.");
    }
    if (localRevision !== startingRevision) {
      setBackendStatus(true);
      return true;
    }
    const backendHasData = remoteState.students.length || remoteState.attendance.length || remoteState.leaves.length;
    const localHasData = localState.students.length || localState.attendance.length || localState.leaves.length;
    if (!backendHasData && localHasData) {
      const importResponse = await fetch("/api/v1/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(localState)
      });
      if (!importResponse.ok) throw new Error(`Could not import local records (${importResponse.status}).`);
      remoteState = await importResponse.json();
    }
    state = remoteState;
    try {
      localStorage.setItem(STORAGE_KEYS.students, JSON.stringify(state.students));
      localStorage.setItem(STORAGE_KEYS.attendance, JSON.stringify(state.attendance));
      localStorage.setItem(STORAGE_KEYS.leaves, JSON.stringify(state.leaves));
    } catch (error) {
      console.warn("Backend data loaded, but could not be cached locally.", error);
    }
    setBackendStatus(true);
    return true;
  } catch (error) {
    setBackendStatus(false);
    if (error.name !== "AbortError") console.info("Using local demo data; Flask API is unavailable.");
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

function showToast(message, type = "success") {
  const toast = $("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}
function askConfirmation(title, message, action) {
  const dialog = $("confirmDialog");
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  confirmAction = action;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else if (window.confirm(message)) {
    action();
  }
}
$("confirmDialog").addEventListener("close", () => {
  if ($("confirmDialog").returnValue === "confirm" && typeof confirmAction === "function") {
    confirmAction();
  }
  confirmAction = null;
});

function goToPage(pageName) {
  document.querySelectorAll(".page").forEach(page => {
    const active = page.id === `page-${pageName}`;
    page.classList.toggle("active", active);
    page.hidden = !active;
  });
  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageName);
    if (button.dataset.page === pageName) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  renderAll();
}
function closeMobileNavigation() {
  document.body.classList.remove("nav-open");
  $("mainNavigation").classList.remove("is-open");
  $("mobileMenuToggle").setAttribute("aria-expanded", "false");
  $("mobileMenuToggle").setAttribute("aria-label", "Open navigation");
}
function toggleDropdown(button, panel) {
  const opening = panel.hidden;
  document.querySelectorAll(".header-dropdown").forEach(item => { item.hidden = true; });
  document.querySelectorAll(".header-menu-wrap > button").forEach(item => item.setAttribute("aria-expanded", "false"));
  panel.hidden = !opening;
  button.setAttribute("aria-expanded", String(opening));
}
function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-theme", isDark);
  $("themeToggle").setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
  $("themeToggle").innerHTML = `<span aria-hidden="true">${isDark ? "☀" : "☾"}</span>`;
  try { localStorage.setItem("studentHub_theme", isDark ? "dark" : "light"); } catch {}
}
$("mobileMenuToggle").addEventListener("click", () => {
  const opening = !$("mainNavigation").classList.contains("is-open");
  $("mainNavigation").classList.toggle("is-open", opening);
  document.body.classList.toggle("nav-open", opening);
  $("mobileMenuToggle").setAttribute("aria-expanded", String(opening));
  $("mobileMenuToggle").setAttribute("aria-label", opening ? "Close navigation" : "Open navigation");
});
document.querySelectorAll(".nav-link").forEach(button => button.addEventListener("click", () => {
  goToPage(button.dataset.page);
  closeMobileNavigation();
}));
document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => goToPage(button.dataset.go)));
$("notificationsButton").addEventListener("click", () => toggleDropdown($("notificationsButton"), $("notificationsPanel")));
$("profileButton").addEventListener("click", () => toggleDropdown($("profileButton"), $("profilePanel")));
$("themeToggle").addEventListener("click", () => applyTheme(document.body.classList.contains("dark-theme") ? "light" : "dark"));
try { applyTheme(localStorage.getItem("studentHub_theme") || "light"); } catch { applyTheme("light"); }
$("globalSearch").addEventListener("input", event => {
  const query = event.target.value.trim().toLowerCase();
  const results = $("globalSearchResults");
  if (!query) { results.hidden = true; results.innerHTML = ""; return; }
  const matches = state.students.filter(student =>
    [student.name, student.roll, student.studentClass, student.email].some(value => String(value || "").toLowerCase().includes(query))
  ).slice(0, 6);
  results.innerHTML = matches.length ? matches.map(student => `
    <button class="search-result" type="button" role="option" data-search-student="${escapeHTML(student.id)}">
      <span class="avatar">${escapeHTML(initials(student.name))}</span><span><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.roll)} · ${escapeHTML(student.studentClass)}</small></span><span class="search-result-arrow">↗</span>
    </button>`).join("") : `<p class="search-empty">No matching students</p>`;
  results.hidden = false;
});
$("globalSearchResults").addEventListener("click", event => {
  const result = event.target.closest("[data-search-student]");
  if (!result) return;
  goToPage("students");
  $("studentSearch").value = result.querySelector("strong").textContent;
  renderStudents();
  $("globalSearchResults").hidden = true;
  $("globalSearch").value = "";
});
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    $("globalSearch").focus();
  }
  if (event.key === "Escape") {
    $("globalSearchResults").hidden = true;
    $("notificationsPanel").hidden = true;
    $("profilePanel").hidden = true;
    closeMobileNavigation();
  }
});
document.addEventListener("click", event => {
  if (!event.target.closest(".header-search")) $("globalSearchResults").hidden = true;
  if (!event.target.closest(".header-menu-wrap")) {
    document.querySelectorAll(".header-dropdown").forEach(item => { item.hidden = true; });
    document.querySelectorAll(".header-menu-wrap > button").forEach(item => item.setAttribute("aria-expanded", "false"));
  }
  if (document.body.classList.contains("nav-open") && !event.target.closest("#mainNavigation, #mobileMenuToggle")) {
    closeMobileNavigation();
  }
});

function findStudent(id) {
  return state.students.find(student => student.id === id);
}
function statusBadge(status) {
  const safeStatus = ["Present", "Absent", "Late", "Pending", "Approved", "Rejected"].includes(status) ? status : "Pending";
  const className = safeStatus.toLowerCase();
  return `<span class="badge badge-${className}">${escapeHTML(safeStatus)}</span>`;
}

// Student management
function resetStudentForm() {
  $("studentForm").reset();
  $("studentId").value = "";
  $("studentFormTitle").textContent = "Add a student";
  $("saveStudentBtn").textContent = "Save student";
  $("cancelStudentEditBtn").hidden = true;
}
function renderStudents() {
  const query = $("studentSearch").value.trim().toLowerCase();
  const filtered = state.students.filter(student =>
    [student.name, student.roll, student.studentClass, student.email].some(value => String(value || "").toLowerCase().includes(query))
  );
  $("studentCountLabel").textContent = `${state.students.length} student${state.students.length === 1 ? "" : "s"} registered`;
  $("studentsTableBody").innerHTML = filtered.length ? filtered.map(student => `
    <tr>
      <td><div class="student-cell"><span class="avatar">${escapeHTML(initials(student.name))}</span><span><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.email || "No email provided")}</small></span></div></td>
      <td>${escapeHTML(student.roll)}</td>
      <td>${escapeHTML(student.studentClass)}</td>
      <td>${escapeHTML(student.email || "—")}</td>
      <td><div class="row-actions">
        <button class="small-button" type="button" data-edit-student="${escapeHTML(student.id)}">Edit</button>
        <button class="small-button delete" type="button" data-delete-student="${escapeHTML(student.id)}">Delete</button>
      </div></td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty-state">${query ? "No students match your search." : "No students yet. Use “Add student” to create your first record."}</td></tr>`;
  const leaveSelect = $("leaveStudent");
  const previousValue = leaveSelect.value;
  leaveSelect.innerHTML = `<option value="">Select a student</option>` + state.students
    .slice().sort((a, b) => a.name.localeCompare(b.name))
    .map(student => `<option value="${escapeHTML(student.id)}">${escapeHTML(student.roll)} — ${escapeHTML(student.name)}</option>`).join("");
  if (state.students.some(student => student.id === previousValue)) leaveSelect.value = previousValue;
  $("submitLeaveBtn").disabled = state.students.length === 0;
}
function editStudent(id) {
  const student = findStudent(id);
  if (!student) return;
  $("studentId").value = student.id;
  $("studentName").value = student.name;
  $("studentRoll").value = student.roll;
  $("studentClass").value = student.studentClass;
  $("studentEmail").value = student.email || "";
  $("studentFormTitle").textContent = "Edit student";
  $("saveStudentBtn").textContent = "Update student";
  $("cancelStudentEditBtn").hidden = false;
  $("studentForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("studentName").focus();
}
$("studentForm").addEventListener("submit", event => {
  event.preventDefault();
  const id = $("studentId").value;
  const name = $("studentName").value.trim();
  const roll = $("studentRoll").value.trim();
  const studentClass = $("studentClass").value.trim();
  const email = $("studentEmail").value.trim();
  if (!name || !roll || !studentClass) {
    showToast("Please enter the student's name, roll number, and class.", "error");
    return;
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Enter a valid email address or leave the email field empty.", "error");
    $("studentEmail").focus();
    return;
  }
  const duplicate = state.students.some(student => student.roll.toLowerCase() === roll.toLowerCase() && student.id !== id);
  if (duplicate) {
    showToast("That roll number is already registered. Roll numbers must be unique.", "error");
    $("studentRoll").focus();
    return;
  }
  const oldStudents = structuredCloneSafe(state.students);
  if (id) {
    const index = state.students.findIndex(student => student.id === id);
    if (index < 0) { showToast("Student not found. Refresh the page and try again.", "error"); return; }
    state.students[index] = { ...state.students[index], name, roll, studentClass, email };
  } else {
    state.students.push({ id: uid(), name, roll, studentClass, email });
  }
  if (!saveAll()) { state.students = oldStudents; return; }
  resetStudentForm();
  renderAll();
  showToast(id ? "Student details updated successfully." : "Student added successfully.");
});
function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
$("studentsTableBody").addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit-student]");
  const deleteButton = event.target.closest("[data-delete-student]");
  if (editButton) editStudent(editButton.dataset.editStudent);
  if (deleteButton) {
    const student = findStudent(deleteButton.dataset.deleteStudent);
    if (!student) return;
    askConfirmation("Delete student?", `Delete ${student.name} and all of their attendance and leave records? This cannot be undone.`, () => {
      const backup = structuredCloneSafe(state);
      state.students = state.students.filter(item => item.id !== student.id);
      state.attendance = state.attendance.filter(item => item.studentId !== student.id);
      state.leaves = state.leaves.filter(item => item.studentId !== student.id);
      if (!saveAll()) { state = backup; return; }
      if ($("studentId").value === student.id) resetStudentForm();
      renderAll();
      showToast("Student and related demo records deleted.");
    });
  }
});
$("studentSearch").addEventListener("input", renderStudents);
$("addStudentTopBtn").addEventListener("click", () => {
  resetStudentForm();
  $("studentForm").scrollIntoView({ behavior: "smooth", block: "center" });
  $("studentName").focus();
});
$("clearStudentBtn").addEventListener("click", resetStudentForm);
$("cancelStudentEditBtn").addEventListener("click", resetStudentForm);

// Attendance
$("attendanceDate").value = todayISO();
$("dashboardDate").value = todayISO();
function renderAttendance() {
  const date = $("attendanceDate").value || todayISO();
  const records = state.attendance.filter(item => item.date === date);
  $("attendanceTableBody").innerHTML = state.students.length ? state.students
    .slice().sort((a, b) => a.roll.localeCompare(b.roll))
    .map(student => {
      const record = records.find(item => item.studentId === student.id);
      const value = record ? record.status : "";
      return `<tr>
        <td><div class="student-cell"><span class="avatar">${escapeHTML(initials(student.name))}</span><span><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.studentClass)}</small></span></div></td>
        <td>${escapeHTML(student.roll)}</td>
        <td><select class="attendance-status" aria-label="Attendance status for ${escapeHTML(student.name)}" data-attendance-id="${escapeHTML(student.id)}">
          <option value="" ${value === "" ? "selected" : ""}>Unmarked</option>
          <option value="Present" ${value === "Present" ? "selected" : ""}>Present</option>
          <option value="Absent" ${value === "Absent" ? "selected" : ""}>Absent</option>
          <option value="Late" ${value === "Late" ? "selected" : ""}>Late</option>
        </select></td>
      </tr>`;
    }).join("") : `<tr><td colspan="3" class="empty-state">Add students before marking attendance.</td></tr>`;
  $("attendanceNote").textContent = records.length
    ? `${records.length} of ${state.students.length} students have saved records for ${formatDate(date)}. You can change the selections and save again.`
    : `No saved attendance for ${formatDate(date)} yet. Select a status for each student, then save.`;
  updateAttendanceSummary();
}
function updateAttendanceSummary() {
  const controls = [...document.querySelectorAll("[data-attendance-id]")];
  const present = controls.filter(control => control.value === "Present").length;
  const absent = controls.filter(control => control.value === "Absent").length;
  const late = controls.filter(control => control.value === "Late").length;
  const unmarked = controls.length - present - absent - late;
  $("attendanceSummary").textContent = `${present} present · ${absent} absent · ${late} late · ${unmarked} unmarked`;
}
$("attendanceTableBody").addEventListener("change", event => {
  if (event.target.matches("[data-attendance-id]")) updateAttendanceSummary();
});
$("attendanceDate").addEventListener("change", renderAttendance);
$("markAllPresentBtn").addEventListener("click", () => {
  document.querySelectorAll("[data-attendance-id]").forEach(control => { control.value = "Present"; });
  updateAttendanceSummary();
});
$("markAllAbsentBtn").addEventListener("click", () => {
  document.querySelectorAll("[data-attendance-id]").forEach(control => { control.value = "Absent"; });
  updateAttendanceSummary();
});
$("markAllUnmarkedBtn").addEventListener("click", () => {
  document.querySelectorAll("[data-attendance-id]").forEach(control => { control.value = ""; });
  updateAttendanceSummary();
});
$("saveAttendanceBtn").addEventListener("click", () => {
  const date = $("attendanceDate").value;
  if (!date) { showToast("Select a date before saving attendance.", "error"); return; }
  if (date > todayISO()) { showToast("Attendance cannot be recorded for a future date.", "error"); return; }
  const controls = [...document.querySelectorAll("[data-attendance-id]")];
  if (!state.students.length) { showToast("Add at least one student before recording attendance.", "error"); return; }
  if (controls.some(control => !["", "Present", "Absent", "Late"].includes(control.value))) {
    showToast("Choose Present, Absent, Late, or Unmarked for every student.", "error");
    return;
  }
  const backup = structuredCloneSafe(state.attendance);
  controls.forEach(control => {
    const studentId = control.dataset.attendanceId;
    const existing = state.attendance.find(item => item.studentId === studentId && item.date === date);
    if (!control.value) {
      state.attendance = state.attendance.filter(item => item.studentId !== studentId || item.date !== date);
      return;
    }
    if (existing) existing.status = control.value;
    else state.attendance.push({ id: uid(), studentId, date, status: control.value });
  });
  // Ensure one record per student and date even if old data was duplicated.
  const unique = new Map();
  state.attendance.forEach(record => unique.set(`${record.studentId}|${record.date}`, record));
  state.attendance = [...unique.values()];
  if (!saveAll()) { state.attendance = backup; return; }
  renderAll();
  showToast(`Attendance saved for ${formatDate(date)}. Unmarked records were cleared.`);
});

// Leave requests
$("leaveStart").min = todayISO();
$("leaveEnd").min = todayISO();
$("leaveStart").addEventListener("change", () => {
  $("leaveEnd").min = $("leaveStart").value || todayISO();
  if ($("leaveEnd").value && $("leaveStart").value && $("leaveEnd").value < $("leaveStart").value) {
    $("leaveEnd").value = $("leaveStart").value;
  }
});
$("leaveForm").addEventListener("submit", event => {
  event.preventDefault();
  const studentId = $("leaveStudent").value;
  const start = $("leaveStart").value;
  const end = $("leaveEnd").value;
  const reason = $("leaveReason").value.trim();
  if (!findStudent(studentId)) { showToast("Select a registered student.", "error"); return; }
  if (!start || !end) { showToast("Select both leave start and end dates.", "error"); return; }
  if (start < todayISO()) { showToast("Leave start date cannot be in the past in this demo.", "error"); return; }
  if (end < start) { showToast("End date cannot be earlier than the start date.", "error"); $("leaveEnd").focus(); return; }
  if (!reason) { showToast("Enter a reason for the leave request.", "error"); $("leaveReason").focus(); return; }
  state.leaves.push({ id: uid(), studentId, start, end, reason, status: "Pending", createdAt: new Date().toISOString() });
  if (!saveAll()) { state.leaves.pop(); return; }
  $("leaveForm").reset();
  $("leaveStart").min = todayISO();
  $("leaveEnd").min = todayISO();
  renderAll();
  showToast("Leave request submitted and marked Pending.");
});
$("clearLeaveBtn").addEventListener("click", () => {
  $("leaveForm").reset();
  $("leaveStart").min = todayISO();
  $("leaveEnd").min = todayISO();
});
$("leaveStatusFilter").addEventListener("change", renderLeaves);
function renderLeaves() {
  const filter = $("leaveStatusFilter").value;
  const list = state.leaves.filter(leave => filter === "All" || leave.status === filter)
    .slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  $("leaveRequestsList").innerHTML = list.length ? list.map(leave => {
    const student = findStudent(leave.studentId);
    const actions = leave.status === "Pending" ? `
      <div class="leave-actions">
        <button class="button button-primary" type="button" data-leave-action="Approved" data-leave-id="${escapeHTML(leave.id)}">Approve</button>
        <button class="button button-secondary" type="button" data-leave-action="Rejected" data-leave-id="${escapeHTML(leave.id)}">Reject</button>
      </div>` : "";
    return `<article class="leave-card">
      <div class="leave-card-head"><div><h4>${escapeHTML(student ? student.name : "Unknown student")} <span class="muted">· ${escapeHTML(student ? student.roll : "—")}</span></h4><div class="leave-meta">${escapeHTML(formatDate(leave.start))} – ${escapeHTML(formatDate(leave.end))}</div></div>${statusBadge(leave.status)}</div>
      <p class="leave-reason">${escapeHTML(leave.reason)}</p>${actions}
    </article>`;
  }).join("") : `<div class="empty-state">${filter === "All" ? "No leave requests yet. Submit a request using the form above." : `No ${escapeHTML(filter.toLowerCase())} leave requests found.`}</div>`;
}
$("leaveRequestsList").addEventListener("click", event => {
  const button = event.target.closest("[data-leave-action]");
  if (!button) return;
  const leave = state.leaves.find(item => item.id === button.dataset.leaveId);
  const nextStatus = button.dataset.leaveAction;
  if (!leave || leave.status !== "Pending" || !["Approved", "Rejected"].includes(nextStatus)) {
    showToast("This request has already been reviewed or could not be found.", "error");
    return;
  }
  const previous = leave.status;
  leave.status = nextStatus;
  if (!saveAll()) { leave.status = previous; return; }
  renderAll();
  showToast(`Leave request ${nextStatus.toLowerCase()}.`);
});

// Dashboard
function animateCounter(element, value) {
  if (!element) return;
  const target = Number(value) || 0;
  const current = Number(element.dataset.counterValue || 0);
  element.dataset.counterValue = String(target);
  if (current === target || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = target;
    return;
  }
  const startedAt = performance.now();
  const duration = 520;
  const draw = now => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) window.requestAnimationFrame(draw);
  };
  window.requestAnimationFrame(draw);
}

function renderDistribution() {
  const date = $("distributionDate").value || $("dashboardDate").value || todayISO();
  const records = state.attendance.filter(item => item.date === date);
  const counts = {
    present: records.filter(item => item.status === "Present").length,
    absent: records.filter(item => item.status === "Absent").length,
    late: records.filter(item => item.status === "Late").length
  };
  const total = state.students.length;
  const marked = counts.present + counts.absent + counts.late;
  const unmarked = Math.max(0, total - marked);
  const attended = counts.present + counts.late;
  const rate = total ? Math.round(attended / total * 100) : 0;
  const segments = [
    ["var(--chart-present)", counts.present],
    ["var(--chart-absent)", counts.absent],
    ["var(--chart-late)", counts.late],
    ["var(--chart-unmarked)", unmarked]
  ];
  let position = 0;
  const stops = segments.map(([color, count]) => {
    const end = position + (total ? count / total * 100 : 0);
    const stop = `${color} ${position}% ${end}%`;
    position = end;
    return stop;
  });
  if (!total) stops.push("var(--chart-unmarked) 0% 100%");
  $("attendanceDonut").style.background = `conic-gradient(${stops.join(", ")})`;
  $("attendanceDonut").setAttribute("aria-label", `${rate}% attended: ${counts.present} present, ${counts.absent} absent, ${counts.late} late, ${unmarked} unmarked`);
  animateCounter($("attendancePercentCenter"), rate);
  $("distributionLegend").innerHTML = [
    ["present", "Present", counts.present],
    ["absent", "Absent", counts.absent],
    ["late", "Late", counts.late],
    ["unmarked", "Unmarked", unmarked]
  ].map(([type, label, count]) => `<div class="distribution-item"><span class="distribution-key key-${type}"></span><span>${label}</span><strong>${count}</strong></div>`).join("");
}

function renderNotifications() {
  const pending = state.leaves.filter(leave => leave.status === "Pending")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const count = $("notificationCount");
  count.textContent = pending.length;
  count.hidden = pending.length === 0;
  $("notificationSummary").textContent = pending.length
    ? `${pending.length} request${pending.length === 1 ? "" : "s"} need review`
    : "Up to date";
  $("notificationItems").innerHTML = pending.length ? pending.slice(0, 4).map(leave => {
    const student = findStudent(leave.studentId);
    return `<button class="notification-item" type="button" data-open-leaves><span class="notification-dot"></span><span><strong>${escapeHTML(student ? student.name : "Unknown student")}</strong><small>${escapeHTML(leave.reason)} · ${escapeHTML(formatDate(leave.createdAt ? leave.createdAt.slice(0, 10) : leave.start))}</small></span></button>`;
  }).join("") : `<p class="notification-empty">You’re all caught up.</p>`;
}
$("notificationItems").addEventListener("click", event => {
  if (!event.target.closest("[data-open-leaves]")) return;
  goToPage("leaves");
  $("notificationsPanel").hidden = true;
  $("notificationsButton").setAttribute("aria-expanded", "false");
});

function renderDashboard() {
  const selectedDate = $("dashboardDate").value || todayISO();
  const todayRecords = state.attendance.filter(item => item.date === selectedDate);
  $("todayLabel").textContent = formatDate(todayISO());
  $("welcomeGreeting").firstChild.textContent = "GOOD MORNING ";
  const present = todayRecords.filter(item => item.status === "Present").length;
  const absent = todayRecords.filter(item => item.status === "Absent").length;
  const late = todayRecords.filter(item => item.status === "Late").length;
  const pending = state.leaves.filter(item => item.status === "Pending").length;
  const selectedDateLabel = selectedDate === todayISO() ? "today" : "selected day";
  const rate = state.students.length ? Math.round((present + late) / state.students.length * 100) : 0;
  animateCounter($("statStudents"), state.students.length);
  animateCounter($("statPresent"), present);
  animateCounter($("statAbsent"), absent);
  animateCounter($("statRate"), rate);
  animateCounter($("statPending"), pending);
  animateCounter($("quickStatStudents"), state.students.length);
  animateCounter($("quickStatPresent"), present);
  animateCounter($("quickStatAbsent"), absent);
  animateCounter($("quickStatPending"), pending);
  $("quickStatPresent").parentElement.querySelector("small").textContent = `Present ${selectedDateLabel}`;
  $("quickStatAbsent").parentElement.querySelector("small").textContent = `Absent ${selectedDateLabel}`;
  $("presentFoot").textContent = `On ${formatDate(selectedDate)}`;
  $("absentFoot").textContent = `On ${formatDate(selectedDate)}`;
  $("rateFoot").textContent = state.students.length
    ? `${present + late} of ${state.students.length} students attended`
    : "Add students to calculate";
  $("distributionDate").value = selectedDate;
  renderDistribution();

  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const records = state.attendance.filter(item => item.date === iso);
    const dayPresent = records.filter(item => item.status === "Present").length;
    const dayAbsent = records.filter(item => item.status === "Absent").length;
    const dayLate = records.filter(item => item.status === "Late").length;
    const dayMarked = dayPresent + dayAbsent + dayLate;
    const dayRate = state.students.length ? Math.round((dayPresent + dayLate) / state.students.length * 100) : 0;
    return {
      iso,
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      dateLabel: formatDate(iso),
      present: dayPresent,
      absent: dayAbsent,
      late: dayLate,
      marked: dayMarked,
      markedRate: state.students.length ? dayMarked / state.students.length * 100 : 0,
      rate: dayRate
    };
  });
  $("dashboardTrend").innerHTML = trend.map(day => `
    <div class="trend-day" title="${day.dateLabel}: ${day.present} present, ${day.absent} absent, ${day.late} late" aria-label="${day.dateLabel}: ${day.present} present, ${day.absent} absent, ${day.late} late; ${day.rate}% attended">
      <span class="trend-value">${day.rate}%</span>
      <div class="trend-bar-track"><div class="trend-bar" style="--bar-height: ${day.markedRate}%"><span class="trend-segment trend-present" style="height: ${day.marked ? day.present / day.marked * 100 : 0}%"></span><span class="trend-segment trend-absent" style="height: ${day.marked ? day.absent / day.marked * 100 : 0}%"></span><span class="trend-segment trend-late" style="height: ${day.marked ? day.late / day.marked * 100 : 0}%"></span></div></div>
      <span class="trend-label">${day.label}</span>
    </div>`).join("");
  const recordedDays = trend.filter(day => day.marked > 0);
  const averageRate = recordedDays.length
    ? Math.round(recordedDays.reduce((sum, day) => sum + day.rate, 0) / recordedDays.length)
    : 0;
  $("trendSummary").textContent = recordedDays.length
    ? `${averageRate}% average attendance across ${recordedDays.length} recorded day${recordedDays.length === 1 ? "" : "s"}.`
    : "No attendance records from the last seven days.";
  $("dashboardTrend").setAttribute("aria-label", `Attendance over the last seven days; average ${averageRate} percent`);

  const recent = state.leaves.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 4);
  $("dashboardLeaves").innerHTML = recent.length ? recent.map(leave => {
    const student = findStudent(leave.studentId);
    const requestedOn = leave.createdAt ? leave.createdAt.slice(0, 10) : leave.start;
    return `<div class="stack-item leave-feed-row"><span class="avatar">${escapeHTML(initials(student ? student.name : "?"))}</span><div class="leave-feed-copy"><strong>${escapeHTML(student ? student.name : "Unknown student")}</strong><small>${escapeHTML(formatDate(requestedOn))} · ${escapeHTML(leave.reason)}</small></div>${statusBadge(leave.status)}<button class="leave-row-open" type="button" data-open-leave="${escapeHTML(leave.id)}" aria-label="Open ${escapeHTML(student ? student.name : "student")}'s leave request">→</button></div>`;
  }).join("") : `<div class="empty-state">No leave requests to show.</div>`;
}
$("dashboardDate").addEventListener("change", renderDashboard);
$("distributionDate").addEventListener("change", renderDistribution);
$("dashboardLeaves").addEventListener("click", event => {
  const button = event.target.closest("[data-open-leave]");
  if (!button) return;
  const leave = state.leaves.find(item => item.id === button.dataset.openLeave);
  if (!leave) return;
  $("leaveStatusFilter").value = leave.status;
  goToPage("leaves");
});

// Reports
function getReportRecords() {
  const start = reportRange.start;
  const end = reportRange.end;
  return state.attendance.filter(record => (!start || record.date >= start) && (!end || record.date <= end));
}
function renderReports() {
  const records = getReportRecords();
  const body = state.students.slice().sort((a, b) => a.roll.localeCompare(b.roll)).map(student => {
    const studentRecords = records.filter(record => record.studentId === student.id && ["Present", "Absent", "Late"].includes(record.status));
    const present = studentRecords.filter(record => record.status === "Present").length;
    const absent = studentRecords.filter(record => record.status === "Absent").length;
    const late = studentRecords.filter(record => record.status === "Late").length;
    const total = present + absent + late;
    const percentage = total ? ((present + late) / total * 100) : 0;
    return `<tr>
      <td><div class="student-cell"><span class="avatar">${escapeHTML(initials(student.name))}</span><span><strong>${escapeHTML(student.name)}</strong><small>${escapeHTML(student.studentClass)}</small></span></div></td>
      <td>${escapeHTML(student.roll)}</td><td>${total}</td><td>${present}</td><td>${absent}</td><td>${late}</td><td><strong>${percentage.toFixed(1)}%</strong></td>
    </tr>`;
  }).join("");
  $("reportsTableBody").innerHTML = body || `<tr><td colspan="7" class="empty-state">No students to report. Add students to get started.</td></tr>`;
  const totalPresent = records.filter(record => record.status === "Present").length;
  const totalAbsent = records.filter(record => record.status === "Absent").length;
  const totalLate = records.filter(record => record.status === "Late").length;
  $("reportSummary").innerHTML = `
    <span class="summary-pill">Attendance records <strong>${totalPresent + totalAbsent + totalLate}</strong></span>
    <span class="summary-pill">Present <strong>${totalPresent}</strong></span>
    <span class="summary-pill">Absent <strong>${totalAbsent}</strong></span>
    <span class="summary-pill">Late <strong>${totalLate}</strong></span>
    <span class="summary-pill">Date range <strong>${reportRange.start ? escapeHTML(formatDate(reportRange.start)) : "All time"}${reportRange.end ? ` – ${escapeHTML(formatDate(reportRange.end))}` : ""}</strong></span>`;
}
$("applyReportFilterBtn").addEventListener("click", () => {
  const start = $("reportStart").value;
  const end = $("reportEnd").value;
  if (start && end && start > end) {
    showToast("The report start date must be on or before the end date.", "error");
    return;
  }
  reportRange = { start, end };
  renderReports();
  showToast("Report filters applied.", "info");
});
$("clearReportFilterBtn").addEventListener("click", () => {
  $("reportStart").value = "";
  $("reportEnd").value = "";
  reportRange = { start: "", end: "" };
  renderReports();
  showToast("Showing all attendance records.", "info");
});
function csvCell(value) {
  const safe = String(value ?? "");
  return `"${safe.replace(/"/g, '""')}"`;
}
$("exportReportBtn").addEventListener("click", () => {
  const records = getReportRecords();
  const rows = [["Name", "Roll number", "Class", "Total records", "Present", "Absent", "Late", "Attendance percentage"]];
  state.students.slice().sort((a, b) => a.roll.localeCompare(b.roll)).forEach(student => {
    const own = records.filter(record => record.studentId === student.id && ["Present", "Absent", "Late"].includes(record.status));
    const present = own.filter(record => record.status === "Present").length;
    const absent = own.filter(record => record.status === "Absent").length;
    const late = own.filter(record => record.status === "Late").length;
    const total = present + absent + late;
    rows.push([student.name, student.roll, student.studentClass, total, present, absent, late, `${total ? ((present + late) / total * 100).toFixed(1) : "0.0"}%`]);
  });
  const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-report-${todayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Attendance report exported as CSV.");
});

// Reset demo
$("resetDemoBtn").addEventListener("click", () => {
  askConfirmation("Reset demo data?", "This replaces all saved students, attendance, and leave requests with the original sample data. Your changes will be lost.", () => {
    state = makeSampleData();
    reportRange = { start: "", end: "" };
    $("reportStart").value = "";
    $("reportEnd").value = "";
    $("studentSearch").value = "";
    $("leaveStatusFilter").value = "All";
    resetStudentForm();
    $("attendanceDate").value = todayISO();
    $("dashboardDate").value = todayISO();
    if (!saveAll()) return;
    renderAll();
    showToast("Demo data has been reset to the original sample records.");
  });
});

function renderAll() {
  renderStudents();
  renderAttendance();
  renderLeaves();
  renderDashboard();
  renderReports();
  renderNotifications();
}
$("loginContinueBtn").addEventListener("click", () => {
  $("loginScreen").hidden = true;
  $("appFrame").hidden = false;
  $("appFrame").inert = false;
  document.title = "StudentHub | Online Student Attendance Management";
  $("dashboardTitle").focus();
});
function init() {
  $("todayLabel").textContent = formatDate(todayISO());
  $("attendanceDate").max = todayISO();
  $("attendanceDate").value = todayISO();
  $("dashboardDate").value = todayISO();
  $("distributionDate").value = todayISO();
  $("leaveStart").min = todayISO();
  $("leaveEnd").min = todayISO();
  renderAll();
  initLogo();
  window.initEducationArt();
  window.initEducationArt("loginEducationArt", "loginEducationArtCanvas");
}

function initLogo() {
  const mark = document.querySelector(".brand-mark");
  const THREE = window.THREE;
  if (!mark || !THREE) return;

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 10);
    camera.position.z = 5;

    const logoGroup = new THREE.Group();

    const pageMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74, side: THREE.DoubleSide });
    const coverMaterial = new THREE.MeshStandardMaterial({ color: 0x102a56, metalness: 0.18, roughness: 0.42 });
    const createPage = isLeft => {
      const page = new THREE.Shape();
      if (isLeft) {
        page.moveTo(-0.77, -0.5);
        page.lineTo(-0.77, 0.04);
        page.quadraticCurveTo(-0.4, 0.13, -0.05, -0.02);
        page.lineTo(-0.05, -0.58);
      } else {
        page.moveTo(0.77, -0.5);
        page.lineTo(0.77, 0.04);
        page.quadraticCurveTo(0.4, 0.13, 0.05, -0.02);
        page.lineTo(0.05, -0.58);
      }
      page.closePath();
      const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(page, { depth: 0.055, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.018, bevelThickness: 0.018 }), pageMaterial);
      mesh.position.z = 0.09;
      return mesh;
    };
    const bookCover = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.75, 0.09), coverMaterial);
    bookCover.position.set(0, -0.3, 0.02);
    logoGroup.add(bookCover, createPage(true), createPage(false));

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.66, 0.1), coverMaterial);
    spine.position.set(0, -0.27, 0.14);
    logoGroup.add(spine);

    const capTop = new THREE.Shape();
    capTop.moveTo(-0.82, 0.48);
    capTop.lineTo(0, 0.84);
    capTop.lineTo(0.82, 0.48);
    capTop.lineTo(0, 0.13);
    capTop.closePath();
    const cap = new THREE.Mesh(
      new THREE.ExtrudeGeometry(capTop, { depth: 0.09, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.025, bevelThickness: 0.025 }),
      new THREE.MeshStandardMaterial({ color: 0x1769ff, metalness: 0.28, roughness: 0.36 })
    );
    cap.position.z = 0.25;
    logoGroup.add(cap);

    const capBand = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.09, 0.11), coverMaterial);
    capBand.position.set(0, 0.25, 0.3);
    logoGroup.add(capBand);

    const tasselGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.62, 0.56, 0.38),
      new THREE.Vector3(0.76, 0.31, 0.4),
      new THREE.Vector3(0.7, 0.16, 0.4)
    ]);
    const tassel = new THREE.Line(tasselGeometry, new THREE.LineBasicMaterial({ color: 0xf59e0b }));
    const tasselEnd = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf59e0b }));
    tasselEnd.position.set(0.7, 0.15, 0.4);
    logoGroup.add(tassel, tasselEnd);

    const lettering = document.createElement("canvas");
    lettering.width = 128;
    lettering.height = 64;
    const context = lettering.getContext("2d");
    if (!context) return;
    context.fillStyle = "#102a56";
    context.font = "800 37px Manrope, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("SH", 64, 32);
    const letteringMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.17),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lettering), transparent: true, depthWrite: false })
    );
    letteringMesh.position.set(0, -0.31, 0.21);
    logoGroup.add(letteringMesh);
    scene.add(logoGroup);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(-2, 3, 5);
    scene.add(keyLight);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mark.clientWidth, mark.clientHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "brand-mark-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    mark.appendChild(renderer.domElement);
    mark.classList.add("is-rendered");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = (time = 0) => {
      logoGroup.rotation.y = reducedMotion ? -0.12 : Math.sin(time * 0.0007) * 0.24;
      logoGroup.rotation.x = reducedMotion ? 0.04 : 0.04 + Math.sin(time * 0.0009) * 0.06;
      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      render();
    } else {
      const animate = time => {
        render(time);
        window.requestAnimationFrame(animate);
      };
      window.requestAnimationFrame(animate);
    }
  } catch (error) {
    console.warn("The animated logo could not be rendered; using the static monogram instead.", error);
  }
}

function initCampusScene() {
  const stage = $("sidebarCampusStage");
  const card = document.querySelector(".sidebar-campus");
  const THREE = window.THREE;
  if (!stage || !card || !THREE) return;

  try {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-2.45, 2.45, 1.45, -1.45, 0.1, 20);
    camera.position.set(4.4, 3.1, 6.4);
    camera.lookAt(0, 0.08, 0);

    const campus = new THREE.Group();
    const building = new THREE.Group();
    const blueMaterial = new THREE.MeshStandardMaterial({ color: 0x1769ff, roughness: 0.4, metalness: 0.12 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x123a70, roughness: 0.48 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xb9e1ff, roughness: 0.72 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0b6b9d, emissiveIntensity: 0.06, roughness: 0.25, metalness: 0.08 });
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1c578d, roughness: 0.65 });

    const addBox = (parent, size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };

    const platform = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.9, 0.16, 6), groundMaterial);
    platform.scale.set(1.12, 1, 0.7);
    platform.position.y = -0.55;
    campus.add(platform);

    addBox(building, [2.15, 0.96, 1.14], [0, -0.02, 0], wallMaterial);
    const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(1.48, 0.67, 4), blueMaterial);
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.position.set(0, 0.79, 0);
    building.add(mainRoof);

    [-1.35, 1.35].forEach((x, index) => {
      addBox(building, [0.8, 0.68, 0.86], [x, -0.16, 0], wallMaterial);
      const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(0.63, 0.34, 4), index ? roofMaterial : blueMaterial);
      wingRoof.rotation.y = Math.PI / 4;
      wingRoof.position.set(x, 0.35, 0);
      building.add(wingRoof);
    });

    [-0.72, -0.36, 0.36, 0.72].forEach(x => {
      addBox(building, [0.2, 0.23, 0.055], [x, 0.08, 0.59], glassMaterial);
    });
    [-1.52, -1.18, 1.18, 1.52].forEach(x => {
      addBox(building, [0.14, 0.19, 0.05], [x, -0.11, 0.46], glassMaterial);
    });

    addBox(building, [0.32, 0.52, 0.09], [0, -0.27, 0.62], blueMaterial);
    [-0.48, 0.48].forEach(x => addBox(building, [0.075, 0.74, 0.09], [x, -0.1, 0.67], wallMaterial));
    addBox(building, [1.15, 0.1, 0.34], [0, 0.29, 0.69], blueMaterial);
    addBox(building, [0.88, 0.09, 0.65], [0, -0.49, 0.77], wallMaterial);
    addBox(building, [1.12, 0.08, 0.83], [0, -0.59, 0.79], blueMaterial);

    [-2.05, 2.05].forEach((x, index) => {
      const tree = new THREE.Group();
      addBox(tree, [0.09, 0.35, 0.09], [0, -0.29, 0], roofMaterial);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.75, 6), new THREE.MeshStandardMaterial({ color: index ? 0x38bdf8 : 0x20a9a8, roughness: 0.7 }));
      crown.position.y = 0.15;
      tree.add(crown);
      tree.position.set(x, -0.05, 0.35);
      campus.add(tree);
    });

    const flagpole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.9, 6), wallMaterial);
    flagpole.position.set(0.76, 1.05, 0);
    building.add(flagpole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.17, 0.025), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.42 }));
    flag.position.set(0.91, 1.34, 0);
    building.add(flag);

    campus.add(building);
    scene.add(campus);
    scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x183d6d, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(-3, 5, 6);
    scene.add(keyLight);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.className = "sidebar-campus-canvas";
    renderer.domElement.setAttribute("aria-hidden", "true");
    stage.appendChild(renderer.domElement);
    card.classList.add("is-rendered");

    const resizeObserver = new ResizeObserver(() => {
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    });
    resizeObserver.observe(stage);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const render = (time = 0) => {
      campus.rotation.y = reducedMotion ? -0.12 : Math.sin(time * 0.00045) * 0.12;
      campus.position.y = reducedMotion ? 0 : Math.sin(time * 0.0012) * 0.035;
      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      render();
    } else {
      const animate = time => {
        if (!document.hidden) render(time);
        window.requestAnimationFrame(animate);
      };
      window.requestAnimationFrame(animate);
    }
  } catch (error) {
    console.warn("The campus scene could not be rendered; using its static illustration instead.", error);
  }
}

init();
const startingRevision = localRevision;
loadBackendState().then(connected => {
  if (!connected) return;
  if (localRevision === startingRevision) {
    renderAll();
  } else {
    saveAll();
  }
});
