function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const STORAGE_KEY = "class-contact-students-v1";
const CHECK_CATEGORY_STORAGE_KEY = "class-contact-check-categories-v1";
const EXPORT_HEADERS = [
  "name",
  "className",
  "number",
  "studentPhone",
  "guardian1Name",
  "guardian1Phone",
  "guardian2Name",
  "guardian2Phone",
  "address",
  "note",
  "tags",
  "checks"
];

const DEFAULT_CHECK_CATEGORIES = [
  { id: "late", name: "지각" },
  { id: "missing", name: "미제출" }
];

const SEARCH_SYNONYMS = {
  학부모: ["보호자", "부모님"],
  보호자: ["학부모", "부모님"],
  상담: ["상담필요", "면담"],
  결석: ["출결", "지각"],
  통학: ["등하교"],
  건강: ["알레르기", "보건"]
};

const seedData = [
  {
    id: makeId(),
    name: "김민준",
    className: "2반",
    number: "13",
    studentPhone: "010-2233-1122",
    guardian1Name: "김지연",
    guardian1Phone: "010-1234-5678",
    guardian2Name: "김정우",
    guardian2Phone: "010-9988-7766",
    address: "서울시 강동구 천호동 00-00",
    note: "수학 보충 관심. 방과후 16:00 이후 연락 권장",
    tags: ["방과후", "상담필요"]
  },
  {
    id: makeId(),
    name: "이서윤",
    className: "2반",
    number: "21",
    studentPhone: "010-2121-4545",
    guardian1Name: "이동훈",
    guardian1Phone: "010-8888-1212",
    guardian2Name: "최미경",
    guardian2Phone: "010-7878-3434",
    address: "서울시 송파구 잠실동 00-00",
    note: "알레르기 약 복용",
    tags: ["건강"]
  },
  {
    id: makeId(),
    name: "박도현",
    className: "3반",
    number: "7",
    studentPhone: "010-8881-3000",
    guardian1Name: "박수미",
    guardian1Phone: "010-4545-9898",
    guardian2Name: "박민철",
    guardian2Phone: "010-2020-3030",
    address: "서울시 마포구 상암동 00-00",
    note: "등하교 버스 이용",
    tags: ["통학"]
  }
];

const state = {
  checkCategories: [...DEFAULT_CHECK_CATEGORIES],
  students: [...seedData],
  filtered: [...seedData],
  lastDeleted: null,
  undoTimer: null
};

const searchInput = document.getElementById("searchInput");
const classFilter = document.getElementById("classFilter");
const tagFilter = document.getElementById("tagFilter");
const checkFilter = document.getElementById("checkFilter");
const csvInput = document.getElementById("csvInput");
const exportCsvButton = document.getElementById("exportCsvButton");
const openSettingsButton = document.getElementById("openSettingsButton");
const openAddStudentButton = document.getElementById("openAddStudentButton");
const openDeleteStudentButton = document.getElementById("openDeleteStudentButton");
const openCheckCategoryButton = document.getElementById("openCheckCategoryButton");
const cancelAddStudentButton = document.getElementById("cancelAddStudentButton");
const addStudentModal = document.getElementById("addStudentModal");
const addStudentForm = document.getElementById("addStudentForm");
const addStudentError = document.getElementById("addStudentError");
const deleteStudentModal = document.getElementById("deleteStudentModal");
const deleteStudentList = document.getElementById("deleteStudentList");
const checkCategoryModal = document.getElementById("checkCategoryModal");
const checkCategoryList = document.getElementById("checkCategoryList");
const checkCategoryError = document.getElementById("checkCategoryError");
const newCheckCategoryInput = document.getElementById("newCheckCategoryInput");
const addCheckCategoryButton = document.getElementById("addCheckCategoryButton");
const cardList = document.getElementById("cardList");
const detailModal = document.getElementById("detailModal");
const detailContent = document.getElementById("detailContent");
const cardTemplate = document.getElementById("cardTemplate");
const undoBar = document.getElementById("undoBar");
const undoMessage = document.getElementById("undoMessage");
const undoDeleteButton = document.getElementById("undoDeleteButton");
const settingsModal = document.getElementById("settingsModal");

function escapeHtml(text = "") {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalTag(tag) {
  return String(tag || "").replace(/\s+/g, " ").trim();
}

function tagKey(tag) {
  return canonicalTag(tag).toLowerCase();
}

function normalizeTags(tagsValue) {
  if (!Array.isArray(tagsValue)) return [];

  const unique = new Map();
  tagsValue.forEach((tag) => {
    const normalized = canonicalTag(tag);
    const key = tagKey(normalized);
    if (!normalized || unique.has(key)) return;
    unique.set(key, normalized);
  });

  return [...unique.values()];
}

function normalizeCheckCategories(value) {
  const source = Array.isArray(value) ? value : DEFAULT_CHECK_CATEGORIES;
  const unique = new Map();

  source.forEach((item) => {
    if (!item) return;
    const id = String(item.id || "").trim();
    const name = canonicalTag(item.name || item.label || "");
    if (!id || !name || unique.has(id)) return;
    unique.set(id, { id, name });
  });

  if (!unique.size) {
    DEFAULT_CHECK_CATEGORIES.forEach((item) => unique.set(item.id, { ...item }));
  }

  return [...unique.values()];
}

function normalizeChecks(checks) {
  const normalized = {};

  if (checks && typeof checks === "object" && !Array.isArray(checks)) {
    Object.entries(checks).forEach(([id, value]) => {
      if (!id) return;
      normalized[id] = value === true || value === "true" || value === "1" || value === 1;
    });
  }

  return normalized;
}

function parseChecksCell(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return {};

  try {
    return normalizeChecks(JSON.parse(raw));
  } catch (error) {
    const checks = {};
    raw.split("|").forEach((token) => {
      const [idRaw, valRaw] = token.split(":");
      const id = String(idRaw || "").trim();
      const val = String(valRaw || "").trim().toLowerCase();
      if (!id) return;
      if (["1", "true", "y", "yes"].includes(val)) checks[id] = true;
      if (["0", "false", "n", "no"].includes(val)) checks[id] = false;
    });
    return checks;
  }
}

function hasCheckCategory(student, category) {
  if (category === "all") return true;
  return Boolean(student.checks?.[category]);
}

function normalizeStudent(raw) {
  const guardian1Name = raw.guardian1Name || raw.guardianName || "";
  const guardian1Phone = raw.guardian1Phone || raw.primaryPhone || "";
  const baseChecks = Object.fromEntries(normalizeCheckCategories(state?.checkCategories || DEFAULT_CHECK_CATEGORIES).map((category) => [category.id, false]));
  const normalizedChecks = normalizeChecks(raw?.checks);

  Object.entries(normalizedChecks).forEach(([key, value]) => {
    if (!key) return;
    baseChecks[key] = Boolean(value);
  });

  return {
    id: raw.id || makeId(),
    name: String(raw.name || "").trim(),
    className: String(raw.className || "").trim(),
    number: String(raw.number || "").trim(),
    studentPhone: String(raw.studentPhone || raw.studentPhoneNumber || raw.student_phone || raw.primaryPhone || "").trim(),
    guardian1Name: String(guardian1Name).trim(),
    guardian1Phone: String(guardian1Phone).trim(),
    guardian2Name: String(raw.guardian2Name || "").trim(),
    guardian2Phone: String(raw.guardian2Phone || "").trim(),
    address: String(raw.address || "").trim(),
    note: String(raw.note || ""),
    tags: normalizeTags(raw.tags),
    checks: baseChecks
  };
}

function loadStudentsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(normalizeStudent);
  } catch (error) {
    console.warn("저장된 데이터를 불러오지 못했습니다.", error);
    return null;
  }
}

function saveStudentsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.students));
  } catch (error) {
    console.warn("데이터를 저장하지 못했습니다.", error);
  }
}

function loadCheckCategoriesFromStorage() {
  try {
    const raw = localStorage.getItem(CHECK_CATEGORY_STORAGE_KEY);
    if (!raw) return null;
    return normalizeCheckCategories(JSON.parse(raw));
  } catch (error) {
    console.warn("체크 항목을 불러오지 못했습니다.", error);
    return null;
  }
}

function saveCheckCategoriesToStorage() {
  try {
    localStorage.setItem(CHECK_CATEGORY_STORAGE_KEY, JSON.stringify(state.checkCategories));
  } catch (error) {
    console.warn("체크 항목을 저장하지 못했습니다.", error);
  }
}

function findCheckCategoryById(id) {
  return state.checkCategories.find((category) => category.id === id) || null;
}

function addCheckCategory(name) {
  const normalized = canonicalTag(name);
  const key = tagKey(normalized);
  if (!normalized) {
    return { ok: false, message: "항목 이름을 입력하세요." };
  }

  const exists = state.checkCategories.some((category) => tagKey(category.name) === key);
  if (exists) {
    return { ok: false, message: "같은 이름의 체크 항목이 이미 있습니다." };
  }

  const created = { id: makeId(), name: normalized };
  state.checkCategories.push(created);
  saveCheckCategoriesToStorage();
  return { ok: true, category: created };
}

function renameCheckCategory(id, nextName) {
  const target = findCheckCategoryById(id);
  if (!target) {
    return { ok: false, message: "체크 항목을 찾을 수 없습니다." };
  }

  const normalized = canonicalTag(nextName);
  if (!normalized) {
    return { ok: false, message: "항목 이름을 입력하세요." };
  }

  const duplicated = state.checkCategories.some((category) => category.id !== id && tagKey(category.name) === tagKey(normalized));
  if (duplicated) {
    return { ok: false, message: "같은 이름의 체크 항목이 이미 있습니다." };
  }

  target.name = normalized;
  saveCheckCategoriesToStorage();
  return { ok: true, category: target };
}

function removeCheckCategory(id) {
  const index = state.checkCategories.findIndex((category) => category.id === id);
  if (index < 0) {
    return { ok: false, message: "체크 항목을 찾을 수 없습니다." };
  }

  const [removed] = state.checkCategories.splice(index, 1);
  state.students = state.students.map((student) => {
    const checks = { ...(student.checks || {}) };
    delete checks[id];
    return { ...student, checks };
  });

  saveCheckCategoriesToStorage();
  refreshAndPersist();
  return { ok: true, category: removed };
}

function toTel(phone = "") {
  return phone.replace(/[^\d+]/g, "");
}

function setActionLink(button, scheme, phone) {
  const sanitizedPhone = toTel(phone);
  if (!sanitizedPhone) {
    button.removeAttribute("href");
    button.setAttribute("aria-disabled", "true");
    button.classList.add("disabled");
    return;
  }

  button.href = `${scheme}:${sanitizedPhone}`;
  button.classList.remove("disabled");
  button.removeAttribute("aria-disabled");
}

function copyPhoneButtonHtml(phone, label) {
  const normalized = String(phone || "").trim();
  if (!normalized) return "";

  return `<button type="button" class="copy-phone-button" data-copy-phone="${escapeHtml(encodeURIComponent(normalized))}" aria-label="${escapeHtml(label)} 복사">복사</button>`;
}

function phoneWithCopyHtml(phone, label, tokens = []) {
  const normalized = String(phone || "").trim();
  const valueHtml = tokens.length ? highlightText(normalized || "-", tokens) : escapeHtml(normalized || "-");

  return `
    <span class="phone-inline">
      <span class="phone-value">${valueHtml}</span>
      ${copyPhoneButtonHtml(normalized, label)}
    </span>
  `;
}

function fallbackCopyText(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy failed");
  }
}

function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  fallbackCopyText(text);
  return Promise.resolve();
}

function showCopyFeedback(button, message, isError = false) {
  const originalText = button.dataset.originalText || button.textContent;
  button.dataset.originalText = originalText;
  button.textContent = message;
  button.classList.toggle("copied", !isError);
  button.classList.toggle("copy-error", isError);

  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.textContent = originalText;
    button.classList.remove("copied", "copy-error");
  }, 1200);
}

function handleCopyPhoneClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest(".copy-phone-button");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  let phone = "";
  try {
    phone = decodeURIComponent(button.dataset.copyPhone || "");
  } catch (error) {
    phone = "";
  }
  if (!phone) return;

  copyText(phone)
    .then(() => showCopyFeedback(button, "복사됨"))
    .catch(() => showCopyFeedback(button, "실패", true));
}

function isChoseongQuery(text = "") {
  return /^[ㄱ-ㅎ]+$/.test(text);
}

function toChoseong(text = "") {
  const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  return Array.from(String(text))
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        return CHO[Math.floor((code - 0xac00) / 588)];
      }
      return ch;
    })
    .join("");
}

function expandSearchToken(rawToken) {
  const base = String(rawToken || "").trim().toLowerCase();
  if (!base) return [];

  const variants = new Set([base]);
  Object.entries(SEARCH_SYNONYMS).forEach(([key, aliases]) => {
    const keyLower = key.toLowerCase();
    const aliasLower = aliases.map((v) => v.toLowerCase());
    if (base === keyLower || aliasLower.includes(base)) {
      variants.add(keyLower);
      aliasLower.forEach((v) => variants.add(v));
    }
  });

  return [...variants];
}

function parseSearchTokens(text) {
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({ token, variants: expandSearchToken(token) }));
}

function matchesSearch(student, tokens) {
  if (!tokens.length) return true;

  const numberWithSuffix = student.number ? `${student.number}번` : "";
  const classAndNumber = student.className && student.number ? `${student.className} ${student.number}번` : "";
  const baseHaystack = [
    student.name,
    student.className,
    student.number,
    numberWithSuffix,
    classAndNumber,
    student.note,
    student.guardian1Name,
    student.guardian2Name,
    student.studentPhone,
    toTel(student.studentPhone || ""),
    ...(student.tags || [])
  ]
    .join(" ")
    .toLowerCase();

  const choseongHaystack = toChoseong(baseHaystack);

  return tokens.every(({ variants }) => {
    return variants.some((variant) => {
      if (!variant) return false;
      return isChoseongQuery(variant) ? choseongHaystack.includes(variant) : baseHaystack.includes(variant);
    });
  });
}

function highlightText(value, tokens) {
  const raw = String(value || "");
  if (!tokens.length || !raw) return escapeHtml(raw);

  let highlighted = escapeHtml(raw);
  tokens.forEach(({ variants }) => {
    variants.forEach((variant) => {
      if (!variant || isChoseongQuery(variant)) return;
      const regex = new RegExp(`(${escapeRegExp(variant)})`, "gi");
      highlighted = highlighted.replace(regex, '<mark class="search-highlight">$1</mark>');
    });
  });
  return highlighted;
}

function refreshAndPersist() {
  saveStudentsToStorage();
  populateFilters();
  applyFilters();
}

function populateFilters() {
  const prevClass = classFilter.value;
  const prevTag = tagFilter.value;
  const prevCheck = checkFilter.value;

  const classes = [...new Set(state.students.map((s) => s.className).filter(Boolean))].sort();
  const tagStats = new Map();
  state.students.forEach((student) => {
    normalizeTags(student.tags).forEach((tag) => {
      const key = tagKey(tag);
      const current = tagStats.get(key);
      if (!current) {
        tagStats.set(key, { label: tag, count: 1 });
      } else {
        current.count += 1;
      }
    });
  });

  const tags = [...tagStats.values()].sort((a, b) => a.label.localeCompare(b.label, "ko"));
  const checkOptions = state.checkCategories.map((category) => ({
    id: category.id,
    name: category.name,
    count: state.students.filter((student) => hasCheckCategory(student, category.id)).length
  }));

  classFilter.innerHTML = `<option value="all">전체 반</option>${classes
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("")}`;

  tagFilter.innerHTML = `<option value="all">전체 태그</option>${tags
    .map((tag) => `<option value="${escapeHtml(tag.label)}">${escapeHtml(tag.label)} (${tag.count})</option>`)
    .join("")}`;

  checkFilter.innerHTML = `<option value="all">전체 체크</option>${checkOptions
    .map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)} 체크됨 (${category.count})</option>`)
    .join("")}`;

  classFilter.value = classes.includes(prevClass) ? prevClass : "all";
  tagFilter.value = tags.map((tag) => tag.label).includes(prevTag) ? prevTag : "all";
  const allowedChecks = ["all", ...checkOptions.map((category) => category.id)];
  checkFilter.value = allowedChecks.includes(prevCheck) ? prevCheck : "all";
}

function applyFilters() {
  const tokens = parseSearchTokens(searchInput.value);
  const selectedClass = classFilter.value;
  const selectedTag = tagFilter.value;
  const selectedCheck = checkFilter.value;

  state.filtered = state.students.filter((student) => {
    const classOk = selectedClass === "all" || student.className === selectedClass;
    const tagOk = selectedTag === "all" || (student.tags || []).some((tag) => tagKey(tag) === tagKey(selectedTag));
    const checkOk = selectedCheck === "all" || hasCheckCategory(student, selectedCheck);
    return classOk && tagOk && checkOk && matchesSearch(student, tokens);
  });

  renderCards(tokens);
}

function renderCards(tokens = parseSearchTokens(searchInput.value)) {
  cardList.innerHTML = "";

  if (state.filtered.length === 0) {
    cardList.innerHTML = `<div class="empty">검색 결과가 없습니다.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  state.filtered.forEach((student) => {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".student-name").innerHTML = highlightText(student.name, tokens);
    card.querySelector(".student-class-number").innerHTML = highlightText(`${student.className} ${student.number}번`, tokens);
    card.querySelector(".primary-contact").innerHTML = `연락처: ${phoneWithCopyHtml(student.studentPhone, "학생 전화번호", tokens)}`;

    const callButton = card.querySelector(".call-button");
    const smsButton = card.querySelector(".sms-button");
    const checksContainer = card.querySelector(".card-checks");
    setActionLink(callButton, "tel", student.studentPhone);
    setActionLink(smsButton, "sms", student.studentPhone);

    [callButton, smsButton].forEach((button) => {
      button.addEventListener("click", (event) => {
        if (button.classList.contains("disabled")) {
          event.preventDefault();
        }
        event.stopPropagation();
      });
    });

    state.checkCategories.forEach((category) => {
      const checkItem = document.createElement("label");
      checkItem.className = "card-check-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(student.checks?.[category.id]);
      checkbox.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener("change", (event) => {
        event.stopPropagation();
        student.checks = {
          ...(student.checks || {}),
          [category.id]: event.target.checked
        };
        refreshAndPersist();
      });

      const text = document.createElement("span");
      text.textContent = category.name;

      checkItem.append(checkbox, text);
      checksContainer?.appendChild(checkItem);
    });

    const openDetail = () => showDetail(student);
    card.addEventListener("click", openDetail);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetail();
      }
    });

    fragment.appendChild(card);
  });

  cardList.appendChild(fragment);
}

function guardianActionRow(label, phone) {
  if (!phone) {
    return `
      <div class="guardian-row">
        <p class="guardian-title">${escapeHtml(label)}</p>
        <p class="guardian-empty">등록된 전화번호가 없습니다.</p>
      </div>
    `;
  }

  const tel = toTel(phone);
  return `
    <div class="guardian-row">
      <p class="guardian-title">${escapeHtml(label)}: ${phoneWithCopyHtml(phone, `${label} 전화번호`)}</p>
      <div class="guardian-actions">
        <a class="button call-button" href="tel:${tel}">전화</a>
        <a class="button sms-button" href="sms:${tel}">문자</a>
      </div>
    </div>
  `;
}

function renderEditableTags(student) {
  if (!student.tags.length) {
    return `<p class="guardian-empty">등록된 태그가 없습니다.</p>`;
  }

  return student.tags
    .map((tag) => {
      const token = encodeURIComponent(tag);
      return `
        <span class="editable-tag">
          <span>${escapeHtml(tag)}</span>
          <button type="button" class="tag-rename" data-tag="${token}" aria-label="${escapeHtml(tag)} 이름 변경">✎</button>
          <button type="button" class="tag-remove" data-tag="${token}" aria-label="${escapeHtml(tag)} 삭제">×</button>
        </span>
      `;
    })
    .join("");
}

function renameTagAcrossStudents(currentTag, nextTag) {
  state.students = state.students.map((student) => {
    const tags = (student.tags || []).map((tag) => (tagKey(tag) === tagKey(currentTag) ? nextTag : tag));
    return { ...student, tags: normalizeTags(tags) };
  });

  refreshAndPersist();
}

function validateStudentInput(student, currentId = null) {
  if (!student.name || !student.className || !student.number) {
    return "이름/반/번호는 필수 입력입니다.";
  }

  const duplicated = state.students.some((item) => {
    if (currentId && item.id === currentId) return false;
    return item.className === student.className && String(item.number) === String(student.number);
  });

  if (duplicated) {
    return `이미 ${student.className} ${student.number}번 학생이 등록되어 있습니다.`;
  }

  const hasAnyPhone = student.studentPhone || student.guardian1Phone || student.guardian2Phone;
  if (!hasAnyPhone) {
    return "학생 또는 보호자 전화번호를 최소 1개 이상 입력하세요.";
  }

  return "";
}

function upsertStudentInState(updatedStudent) {
  const index = state.students.findIndex((student) => student.id === updatedStudent.id);
  if (index >= 0) {
    state.students[index] = updatedStudent;
    return;
  }
  state.students.push(updatedStudent);
}

function deleteStudentById(id) {
  const index = state.students.findIndex((student) => student.id === id);
  if (index < 0) return;

  const [removed] = state.students.splice(index, 1);
  state.lastDeleted = { student: removed, index };
  showUndoBar(`${removed.className} ${removed.number}번 ${removed.name} 학생을 삭제했습니다.`);
  refreshAndPersist();
}

function showUndoBar(message) {
  if (!undoBar || !undoMessage) return;
  undoMessage.textContent = message;
  undoBar.hidden = false;

  if (state.undoTimer) {
    clearTimeout(state.undoTimer);
  }

  state.undoTimer = setTimeout(() => {
    undoBar.hidden = true;
    state.lastDeleted = null;
    state.undoTimer = null;
  }, 8000);
}

function undoDelete() {
  if (!state.lastDeleted) return;

  const { student, index } = state.lastDeleted;
  state.students.splice(index, 0, student);
  state.lastDeleted = null;
  if (state.undoTimer) {
    clearTimeout(state.undoTimer);
    state.undoTimer = null;
  }
  if (undoBar) {
    undoBar.hidden = true;
  }
  refreshAndPersist();
}

function renderDeleteStudentList() {
  if (!deleteStudentList) return;

  if (!state.students.length) {
    deleteStudentList.innerHTML = '<p class="guardian-empty">삭제할 학생이 없습니다.</p>';
    return;
  }

  const items = [...state.students]
    .sort((a, b) => {
      const classCompare = a.className.localeCompare(b.className, "ko");
      if (classCompare !== 0) return classCompare;
      return Number(a.number) - Number(b.number);
    })
    .map((student) => {
      const summary = `${student.className} ${student.number}번 · ${student.name}`;
      return `
        <div class="delete-student-item">
          <div class="delete-student-text">
            <strong>${escapeHtml(summary)}</strong>
            <span>${escapeHtml(student.studentPhone || "연락처 없음")}</span>
          </div>
          <button type="button" class="button danger small delete-student-confirm" data-id="${escapeHtml(student.id)}">삭제</button>
        </div>
      `;
    })
    .join("");

  deleteStudentList.innerHTML = items;
}

function openDeleteStudentModal() {
  renderDeleteStudentList();
  if (typeof deleteStudentModal.showModal === "function") {
    deleteStudentModal.showModal();
  } else {
    deleteStudentModal.setAttribute("open", "");
  }
}

function closeDeleteStudentModal() {
  if (typeof deleteStudentModal.close === "function") {
    deleteStudentModal.close();
  } else {
    deleteStudentModal.removeAttribute("open");
  }
}

function openSettingsModal() {
  if (typeof settingsModal?.showModal === "function") {
    settingsModal.showModal();
  } else {
    settingsModal?.setAttribute("open", "");
  }
}

function closeSettingsModal() {
  if (typeof settingsModal?.close === "function") {
    settingsModal.close();
  } else {
    settingsModal?.removeAttribute("open");
  }
}

function clearCheckCategoryError() {
  if (checkCategoryError) {
    checkCategoryError.textContent = "";
  }
}

function renderCheckCategoryList() {
  if (!checkCategoryList) return;

  if (!state.checkCategories.length) {
    checkCategoryList.innerHTML = "<p class=\"guardian-empty\">등록된 체크 항목이 없습니다.</p>";
    return;
  }

  const html = state.checkCategories
    .map((category) => {
      const checkedCount = state.students.filter((student) => Boolean(student.checks?.[category.id])).length;
      return `
        <div class="check-category-item">
          <div class="delete-student-text">
            <strong>${escapeHtml(category.name)}</strong>
            <span>${checkedCount}명 체크됨</span>
          </div>
          <div class="check-category-actions">
            <button type="button" class="button secondary small rename-check-category" data-id="${escapeHtml(category.id)}">이름 변경</button>
            <button type="button" class="button danger small remove-check-category" data-id="${escapeHtml(category.id)}">삭제</button>
          </div>
        </div>
      `;
    })
    .join("");

  checkCategoryList.innerHTML = html;
}

function openCheckCategoryModal() {
  clearCheckCategoryError();
  if (newCheckCategoryInput) {
    newCheckCategoryInput.value = "";
  }
  renderCheckCategoryList();

  if (typeof checkCategoryModal?.showModal === "function") {
    checkCategoryModal.showModal();
  } else {
    checkCategoryModal?.setAttribute("open", "");
  }
}

function bindTagEditor(student) {
  const tagList = detailContent.querySelector("#editableTagList");
  const input = detailContent.querySelector("#newTagInput");
  const addButton = detailContent.querySelector("#addTagButton");

  if (!tagList || !input || !addButton) return;

  const rerenderTagSection = () => {
    const refreshedStudent = state.students.find((item) => item.id === student.id);
    if (!refreshedStudent) return;
    student = refreshedStudent;
    tagList.innerHTML = renderEditableTags(student);
    refreshAndPersist();
  };

  addButton.addEventListener("click", () => {
    const nextTag = canonicalTag(input.value);
    if (!nextTag) return;

    if ((student.tags || []).some((tag) => tagKey(tag) === tagKey(nextTag))) {
      input.value = "";
      return;
    }

    student.tags = normalizeTags([...(student.tags || []), nextTag]);
    input.value = "";
    rerenderTagSection();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addButton.click();
    }
  });

  tagList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".tag-remove");
    if (removeButton) {
      const targetTag = decodeURIComponent(removeButton.dataset.tag || "");
      student.tags = student.tags.filter((tag) => tagKey(tag) !== tagKey(targetTag));
      rerenderTagSection();
      return;
    }

    const renameButton = event.target.closest(".tag-rename");
    if (!renameButton) return;

    const currentTag = decodeURIComponent(renameButton.dataset.tag || "");
    const renamed = window.prompt("태그 이름 변경", currentTag);
    if (renamed == null) return;

    const nextTag = canonicalTag(renamed);
    if (!nextTag || tagKey(nextTag) === tagKey(currentTag)) return;

    renameTagAcrossStudents(currentTag, nextTag);
    const refreshedStudent = state.students.find((item) => item.id === student.id);
    if (refreshedStudent) {
      student = refreshedStudent;
      tagList.innerHTML = renderEditableTags(student);
    }
  });
}

function showDetail(student) {
  detailContent.innerHTML = `
    <h3>${escapeHtml(student.name)} · ${escapeHtml(student.className)} ${escapeHtml(student.number)}번</h3>
    <div class="detail-grid">
      <div><strong>학생 전화</strong>: ${phoneWithCopyHtml(student.studentPhone, "학생 전화번호")}</div>
      <div><strong>주소</strong>: ${escapeHtml(student.address || "-")}</div>
      <div>
        <strong>보호자 연락</strong>
        <div class="guardian-contact-list">
          ${guardianActionRow(student.guardian1Name || "보호자 1", student.guardian1Phone)}
          ${guardianActionRow(student.guardian2Name || "보호자 2", student.guardian2Phone)}
        </div>
      </div>
      <div class="tag-editor">
        <strong>태그</strong>
        <div id="editableTagList" class="editable-tag-list">${renderEditableTags(student)}</div>
        <div class="tag-create-row">
          <input id="newTagInput" type="text" placeholder="새 태그 입력" />
          <button id="addTagButton" type="button" class="button secondary small">추가</button>
        </div>
      </div>
    </div>

    <section class="memo-editor">
      <label for="detailMemo"><strong>메모</strong></label>
      <textarea id="detailMemo" class="memo-input" rows="5" placeholder="자유롭게 메모를 입력하세요.">${escapeHtml(student.note || "")}</textarea>
    </section>
  `;

  const memoInput = detailContent.querySelector("#detailMemo");
  memoInput?.addEventListener("input", (event) => {
    const target = state.students.find((item) => item.id === student.id);
    if (!target) return;
    target.note = event.target.value;
    refreshAndPersist();
  });


  bindTagEditor(student);

  if (typeof detailModal.showModal === "function") {
    detailModal.showModal();
  } else {
    detailModal.setAttribute("open", "");
  }
}

function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(cell);
      if (row.some((value) => String(value).trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => String(value).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) {
    throw new Error("CSV 데이터가 충분하지 않습니다.");
  }

  const headers = rows[0].map((h) => String(h).trim());
  const required = ["name", "className", "number"];

  required.forEach((key) => {
    if (!headers.includes(key)) {
      throw new Error(`필수 헤더 누락: ${key}`);
    }
  });

  return rows
    .slice(1)
    .filter((values) => values.some((value) => String(value).trim() !== ""))
    .map((values) => {
      const row = Object.fromEntries(headers.map((h, i) => [h, (values[i] || "").trim()]));
      return normalizeStudent({
        id: makeId(),
        name: row.name,
        className: row.className,
        number: row.number,
        studentPhone: row.studentPhone,
        guardian1Name: row.guardian1Name || row.guardianName,
        guardian1Phone: row.guardian1Phone || row.primaryPhone,
        guardian2Name: row.guardian2Name,
        guardian2Phone: row.guardian2Phone,
        address: row.address,
        note: row.note,
        tags: row.tags ? row.tags.split("|").map((x) => x.trim()).filter(Boolean) : [],
        checks: parseChecksCell(row.checks)
      });
    });
}

function toCsvCell(value) {
  const raw = String(value ?? "");
  const escaped = raw.replace(/"/g, '""');
  if (/[",\n\r]/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

function exportStudentsToCsv() {
  const lines = [EXPORT_HEADERS.join(",")];

  state.students.forEach((student) => {
    const row = {
      name: student.name,
      className: student.className,
      number: student.number,
      studentPhone: student.studentPhone,
      guardian1Name: student.guardian1Name,
      guardian1Phone: student.guardian1Phone,
      guardian2Name: student.guardian2Name,
      guardian2Phone: student.guardian2Phone,
      address: student.address,
      note: student.note,
      tags: (student.tags || []).join("|"),
      checks: JSON.stringify(student.checks || {})
    };

    lines.push(EXPORT_HEADERS.map((header) => toCsvCell(row[header])).join(","));
  });

  const bom = "\uFEFF";
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `class-contacts-${datePart}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function setCsvError(message = "") {
  let errorEl = document.querySelector(".csv-upload .error");
  if (!errorEl) {
    errorEl = document.createElement("p");
    errorEl.className = "error";
    document.querySelector(".csv-upload").appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearAddStudentError() {
  if (addStudentError) {
    addStudentError.textContent = "";
  }
}

function openAddStudentModal() {
  clearAddStudentError();
  addStudentForm?.reset();

  if (typeof addStudentModal.showModal === "function") {
    addStudentModal.showModal();
  } else {
    addStudentModal.setAttribute("open", "");
  }
}

function closeAddStudentModal() {
  if (typeof addStudentModal.close === "function") {
    addStudentModal.close();
  } else {
    addStudentModal.removeAttribute("open");
  }
}

function parseTagInput(text) {
  return normalizeTags(
    String(text || "")
      .split(",")
      .map((tag) => canonicalTag(tag))
      .filter(Boolean)
  );
}

function buildStudentFromForm(formData) {
  return normalizeStudent({
    id: makeId(),
    name: formData.get("name"),
    className: formData.get("className"),
    number: formData.get("number"),
    studentPhone: formData.get("studentPhone"),
    guardian1Name: formData.get("guardian1Name"),
    guardian1Phone: formData.get("guardian1Phone"),
    guardian2Name: formData.get("guardian2Name"),
    guardian2Phone: formData.get("guardian2Phone"),
    address: formData.get("address"),
    note: formData.get("note"),
    tags: parseTagInput(formData.get("tags"))
  });
}

searchInput.addEventListener("input", applyFilters);
classFilter.addEventListener("change", applyFilters);
tagFilter.addEventListener("change", applyFilters);
checkFilter.addEventListener("change", applyFilters);
exportCsvButton?.addEventListener("click", () => {
  closeSettingsModal();
  exportStudentsToCsv();
});
openAddStudentButton?.addEventListener("click", () => {
  closeSettingsModal();
  openAddStudentModal();
});
openDeleteStudentButton?.addEventListener("click", () => {
  closeSettingsModal();
  openDeleteStudentModal();
});
openCheckCategoryButton?.addEventListener("click", () => {
  closeSettingsModal();
  openCheckCategoryModal();
});
openSettingsButton?.addEventListener("click", openSettingsModal);
cancelAddStudentButton?.addEventListener("click", closeAddStudentModal);
undoDeleteButton?.addEventListener("click", undoDelete);
document.addEventListener("click", handleCopyPhoneClick, true);

addCheckCategoryButton?.addEventListener("click", () => {
  clearCheckCategoryError();
  const result = addCheckCategory(newCheckCategoryInput?.value || "");
  if (!result.ok) {
    if (checkCategoryError) checkCategoryError.textContent = result.message;
    return;
  }

  if (newCheckCategoryInput) {
    newCheckCategoryInput.value = "";
    newCheckCategoryInput.focus();
  }
  renderCheckCategoryList();
  populateFilters();
  applyFilters();
});

newCheckCategoryInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCheckCategoryButton?.click();
  }
});

checkCategoryList?.addEventListener("click", (event) => {
  const renameButton = event.target.closest(".rename-check-category");
  if (renameButton) {
    const id = renameButton.dataset.id || "";
    const target = findCheckCategoryById(id);
    if (!target) return;

    const nextName = window.prompt("체크 항목 이름 변경", target.name);
    if (nextName == null) return;

    const result = renameCheckCategory(id, nextName);
    if (!result.ok) {
      if (checkCategoryError) checkCategoryError.textContent = result.message;
      return;
    }

    clearCheckCategoryError();
    renderCheckCategoryList();
    populateFilters();
    applyFilters();
    return;
  }

  const removeButton = event.target.closest(".remove-check-category");
  if (!removeButton) return;

  const id = removeButton.dataset.id || "";
  const target = findCheckCategoryById(id);
  if (!target) return;

  const confirmed = window.confirm(`체크 항목 "${target.name}"을(를) 삭제할까요?\n모든 학생의 체크 데이터에서도 제거됩니다.`);
  if (!confirmed) return;

  const result = removeCheckCategory(id);
  if (!result.ok) {
    if (checkCategoryError) checkCategoryError.textContent = result.message;
    return;
  }

  clearCheckCategoryError();
  renderCheckCategoryList();
});

deleteStudentList?.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-student-confirm");
  if (!button) return;

  const id = button.dataset.id || "";
  const target = state.students.find((student) => student.id === id);
  if (!target) return;

  const confirmed = window.confirm(`${target.className} ${target.number}번 ${target.name} 학생을 삭제할까요?`);
  if (!confirmed) return;

  deleteStudentById(id);
  renderDeleteStudentList();
});

addStudentForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  clearAddStudentError();

  const formData = new FormData(addStudentForm);
  const newStudent = buildStudentFromForm(formData);
  const validationError = validateStudentInput(newStudent);

  if (validationError) {
    addStudentError.textContent = validationError;
    return;
  }

  upsertStudentInState(newStudent);
  refreshAndPersist();
  closeAddStudentModal();
});

csvInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    state.students = rows;
    state.lastDeleted = null;
    if (undoBar) {
      undoBar.hidden = true;
    }
    refreshAndPersist();
    setCsvError("");
  } catch (error) {
    setCsvError(error.message || "CSV 파일 처리 중 오류가 발생했습니다.");
  } finally {
    csvInput.value = "";
  }
});

const storedCategories = loadCheckCategoriesFromStorage();
state.checkCategories = normalizeCheckCategories(storedCategories || []);

const storedStudents = loadStudentsFromStorage();
state.students = (storedStudents && storedStudents.length ? storedStudents : seedData).map(normalizeStudent);
state.filtered = [...state.students];
populateFilters();
renderCards();
