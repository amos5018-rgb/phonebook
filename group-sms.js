(() => {
  if (window.__phonebookGroupSmsLoaded) return;
  window.__phonebookGroupSmsLoaded = true;

  if (
    typeof state === "undefined" ||
    typeof renderCards !== "function" ||
    typeof toTel !== "function"
  ) {
    console.warn("Group SMS feature could not initialize.");
    return;
  }

  const selectedStudentIds = new Set();
  let selectionMode = false;

  const toggleSelectionButton = document.getElementById("toggleSelectionButton");
  const selectionBar = document.getElementById("selectionBar");
  const selectionCount = document.getElementById("selectionCount");
  const selectAllButton = document.getElementById("selectAllButton");
  const clearSelectionButton = document.getElementById("clearSelectionButton");
  const openGroupSmsButton = document.getElementById("openGroupSmsButton");
  const cancelSelectionButton = document.getElementById("cancelSelectionButton");
  const groupSmsModal = document.getElementById("groupSmsModal");
  const groupSmsSummary = document.getElementById("groupSmsSummary");
  const groupSmsError = document.getElementById("groupSmsError");

  function allStudents() {
    return Array.isArray(state.students) ? state.students : [];
  }

  function visibleStudents() {
    return Array.isArray(state.filtered) ? state.filtered : [];
  }

  function selectedStudents() {
    return allStudents().filter((student) => selectedStudentIds.has(student.id));
  }

  function cleanupSelection() {
    const validIds = new Set(allStudents().map((student) => student.id));
    selectedStudentIds.forEach((id) => {
      if (!validIds.has(id)) selectedStudentIds.delete(id);
    });
  }

  function phoneFieldLabel(phoneField) {
    return {
      studentPhone: "학생 번호",
      guardian1Phone: "보호자 1",
      guardian2Phone: "보호자 2"
    }[phoneField] || "연락처";
  }

  function groupSmsNumbers(phoneField) {
    const unique = new Set();
    selectedStudents().forEach((student) => {
      const phone = toTel(student[phoneField] || "");
      if (phone) unique.add(phone);
    });
    return [...unique];
  }

  function updateSelectionUi() {
    cleanupSelection();
    const count = selectedStudentIds.size;
    const visible = visibleStudents();
    const selectedVisibleCount = visible.filter((student) => selectedStudentIds.has(student.id)).length;
    const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length;

    if (toggleSelectionButton) {
      toggleSelectionButton.textContent = selectionMode ? "선택 중" : "선택";
      toggleSelectionButton.setAttribute("aria-pressed", String(selectionMode));
    }

    if (selectionCount) {
      selectionCount.textContent = `선택 ${count}명`;
    }

    if (selectionBar) {
      selectionBar.hidden = !selectionMode;
    }

    if (selectAllButton) {
      selectAllButton.disabled = !selectionMode || visible.length === 0 || allVisibleSelected;
    }

    if (clearSelectionButton) {
      clearSelectionButton.disabled = count === 0;
    }

    if (openGroupSmsButton) {
      openGroupSmsButton.disabled = count === 0;
      openGroupSmsButton.classList.toggle("disabled", count === 0);
    }
  }

  function toggleStudent(studentId) {
    if (selectedStudentIds.has(studentId)) {
      selectedStudentIds.delete(studentId);
    } else {
      selectedStudentIds.add(studentId);
    }
    decorateCards();
    updateSelectionUi();
  }

  function selectAllVisibleStudents() {
    const visible = visibleStudents();
    if (!visible.length) return;

    visible.forEach((student) => {
      selectedStudentIds.add(student.id);
    });
    decorateCards();
    updateSelectionUi();
  }

  function setSelectionMode(enabled) {
    selectionMode = Boolean(enabled);
    if (!selectionMode) {
      selectedStudentIds.clear();
      closeGroupSmsModal();
    }
    decorateCards();
    updateSelectionUi();
  }

  function decorateCards() {
    cleanupSelection();
    const visible = visibleStudents();
    const cards = [...document.querySelectorAll(".student-card")];

    cards.forEach((card, index) => {
      const student = visible[index];
      if (!student) return;

      const selected = selectedStudentIds.has(student.id);
      const checkbox = card.querySelector(".student-select-checkbox");

      card.classList.toggle("selection-mode", selectionMode);
      card.classList.toggle("selected", selected);
      card.dataset.studentId = student.id;
      card.setAttribute("aria-selected", String(selectionMode && selected));

      if (checkbox) {
        checkbox.checked = selected;
        checkbox.setAttribute("aria-label", `${student.name} 선택`);
      }

      if (card.dataset.groupSmsBound === "true") return;
      card.dataset.groupSmsBound = "true";

      if (checkbox) {
        checkbox.addEventListener(
          "click",
          (event) => {
            if (!selectionMode) return;
            event.stopPropagation();
          },
          true
        );
        checkbox.addEventListener("change", (event) => {
          if (!selectionMode) return;
          event.stopPropagation();
          const targetId = card.dataset.studentId;
          if (!targetId) return;
          if (event.target.checked) {
            selectedStudentIds.add(targetId);
          } else {
            selectedStudentIds.delete(targetId);
          }
          decorateCards();
          updateSelectionUi();
        });
      }

      card.addEventListener(
        "click",
        (event) => {
          if (!selectionMode) return;
          if (event.target.closest(".selection-check")) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const targetId = card.dataset.studentId;
          if (targetId) toggleStudent(targetId);
        },
        true
      );

      card.addEventListener(
        "keydown",
        (event) => {
          if (!selectionMode || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const targetId = card.dataset.studentId;
          if (targetId) toggleStudent(targetId);
        },
        true
      );
    });
  }

  function openGroupSmsModal() {
    if (!selectedStudentIds.size) return;

    if (groupSmsSummary) {
      groupSmsSummary.textContent =
        `${selectedStudentIds.size}명 선택됨 · ` +
        `학생 번호 ${groupSmsNumbers("studentPhone").length}개 · ` +
        `보호자 1 ${groupSmsNumbers("guardian1Phone").length}개 · ` +
        `보호자 2 ${groupSmsNumbers("guardian2Phone").length}개`;
    }

    if (groupSmsError) {
      groupSmsError.textContent = "";
    }

    if (typeof groupSmsModal?.showModal === "function") {
      groupSmsModal.showModal();
    } else {
      groupSmsModal?.setAttribute("open", "");
    }
  }

  function closeGroupSmsModal() {
    if (typeof groupSmsModal?.close === "function") {
      groupSmsModal.close();
    } else {
      groupSmsModal?.removeAttribute("open");
    }
  }

  function openGroupSms(phoneField) {
    const numbers = groupSmsNumbers(phoneField);
    if (!numbers.length) {
      if (groupSmsError) {
        groupSmsError.textContent = `${phoneFieldLabel(phoneField)}가 있는 학생을 선택하세요.`;
      }
      return;
    }

    window.location.href = `sms:/open?addresses=${numbers.map(encodeURIComponent).join(",")}`;
  }

  const originalRenderCards = renderCards;
  renderCards = function patchedRenderCards(...args) {
    originalRenderCards(...args);
    decorateCards();
    updateSelectionUi();
  };

  toggleSelectionButton?.addEventListener("click", () => setSelectionMode(!selectionMode));
  selectAllButton?.addEventListener("click", selectAllVisibleStudents);
  clearSelectionButton?.addEventListener("click", () => {
    selectedStudentIds.clear();
    decorateCards();
    updateSelectionUi();
  });
  cancelSelectionButton?.addEventListener("click", () => setSelectionMode(false));
  openGroupSmsButton?.addEventListener("click", openGroupSmsModal);
  groupSmsModal?.addEventListener("click", (event) => {
    const option = event.target.closest(".group-sms-option");
    if (!option) return;
    openGroupSms(option.dataset.phoneField || "");
  });

  decorateCards();
  updateSelectionUi();
})();
