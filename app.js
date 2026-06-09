const wordsStorageKey = "tikslu-taikinys-laisvi-zodziai";
const notesStorageKey = "tikslu-sistema-uzrasai-v1";
const board = document.querySelector(".board");
const target = document.getElementById("target");
const layer = document.getElementById("wordLayer");

let words = JSON.parse(localStorage.getItem(wordsStorageKey) || "[]");
let notes = JSON.parse(localStorage.getItem(notesStorageKey) || "{}");
let activeWord = null;
let dragStart = null;
let selectedWordId = null;
let targetScale = Number(localStorage.getItem(`${wordsStorageKey}-mastelis`) || 1);
let targetPan = JSON.parse(localStorage.getItem(`${wordsStorageKey}-slinkimas`) || "{\"x\":0,\"y\":0}");
let panStart = null;
let currentLayout = { yellowInset: 19, greenInset: 38, centers: { red: 40.5, yellow: 21.5, green: 7.4 } };

function saveWords() { localStorage.setItem(wordsStorageKey, JSON.stringify(words)); }
function saveNotes() { localStorage.setItem(notesStorageKey, JSON.stringify(notes)); }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function capitalizeFirst(text) { const trimmed = text.trim(); return trimmed ? trimmed.charAt(0).toLocaleUpperCase("lt-LT") + trimmed.slice(1) : ""; }

function applyViewTransform(saveScale = true, savePan = true) {
  targetScale = clamp(Number(targetScale) || 1, 0.65, 2.2);
  targetPan = {
    x: Number.isFinite(targetPan?.x) ? targetPan.x : 0,
    y: Number.isFinite(targetPan?.y) ? targetPan.y : 0
  };
  board.style.transform = `matrix(${targetScale}, 0, 0, ${targetScale}, ${targetPan.x}, ${targetPan.y})`;
  board.style.transformOrigin = "0 0";
  board.style.setProperty("--board-scale", targetScale);
  board.style.setProperty("--board-pan-x", targetPan.x);
  board.style.setProperty("--board-pan-y", targetPan.y);
  target.style.setProperty("--target-scale", 1);
  target.style.setProperty("--target-pan-x", "0px");
  target.style.setProperty("--target-pan-y", "0px");
  if (saveScale) localStorage.setItem(`${wordsStorageKey}-mastelis`, String(targetScale));
  if (savePan) localStorage.setItem(`${wordsStorageKey}-slinkimas`, JSON.stringify(targetPan));
}

function updateTargetScale(save = true) { applyViewTransform(save, false); }
function updateTargetPan(save = true) { applyViewTransform(false, save); }

function pointInsideTarget(x, y) {
  const dx = x - 50;
  const dy = y - 50;
  return Math.sqrt(dx * dx + dy * dy) <= 49;
}

function getZone(x, y) {
  const dx = x - 50;
  const dy = y - 50;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const yellowOuter = 50 - currentLayout.yellowInset;
  const greenOuter = 50 - currentLayout.greenInset;
  if (radius <= greenOuter) return "green";
  if (radius <= yellowOuter) return "yellow";
  return "red";
}

function getZoneCounts() {
  return words.reduce((counts, word) => {
    const zone = word.zone || getZone(word.x, word.y);
    counts[zone] += 1;
    return counts;
  }, { red: 0, yellow: 0, green: 0 });
}

function getBandWidths(counts) {
  const available = 47.2;
  const minimum = { red: 12, yellow: 12, green: 7 };
  const baseline = { red: 19, yellow: 19, green: 9.2 };
  const weights = {
    red: baseline.red * (1 + counts.red * 0.35),
    yellow: baseline.yellow * (1 + counts.yellow * 0.35),
    green: baseline.green * (1 + counts.green * 0.35)
  };
  const totalWeight = weights.red + weights.yellow + weights.green;
  const widths = {
    red: Math.max(minimum.red, available * weights.red / totalWeight),
    yellow: Math.max(minimum.yellow, available * weights.yellow / totalWeight),
    green: Math.max(minimum.green, available * weights.green / totalWeight)
  };
  const totalWidth = widths.red + widths.yellow + widths.green;
  if (totalWidth > available) {
    const overflow = totalWidth - available;
    const reducible = { red: widths.red - minimum.red, yellow: widths.yellow - minimum.yellow, green: widths.green - minimum.green };
    const totalReducible = reducible.red + reducible.yellow + reducible.green;
    if (totalReducible > 0) {
      widths.red -= overflow * (reducible.red / totalReducible);
      widths.yellow -= overflow * (reducible.yellow / totalReducible);
      widths.green -= overflow * (reducible.green / totalReducible);
    }
  }
  return widths;
}

function updateColorLayout() {
  const widths = getBandWidths(getZoneCounts());
  const yellowInset = widths.red;
  const greenInset = widths.red + widths.yellow;
  const centerRadius = 2.8;
  currentLayout = {
    yellowInset,
    greenInset,
    centers: {
      red: 50 - widths.red / 2,
      yellow: 50 - widths.red - widths.yellow / 2,
      green: centerRadius + widths.green / 2
    }
  };
  target.style.setProperty("--yellow-inset", `${yellowInset}%`);
  target.style.setProperty("--green-inset", `${greenInset}%`);
}

function snapWordToZoneCenter(word) {
  const zone = word.zone || getZone(word.x, word.y);
  const angle = Math.atan2(word.y - 50, word.x - 50);
  const radius = currentLayout.centers[zone];
  word.x = 50 + Math.cos(angle) * radius;
  word.y = 50 + Math.sin(angle) * radius;
  word.zone = zone;
  const item = document.querySelector(`.word[data-id="${word.id}"]`);
  if (item) {
    item.style.left = `${word.x}%`;
    item.style.top = `${word.y}%`;
  }
}

function getAutoSize(zone, count) {
  const base = { red: 18, yellow: 17, green: 16 }[zone];
  return clamp(base - Math.max(0, count - 1) * 1.15, 10, base);
}

function updateAllWordSizes() {
  const counts = getZoneCounts();
  document.querySelectorAll(".word").forEach((item) => {
    const data = words.find((word) => word.id === item.dataset.id);
    if (!data) return;
    const zone = data.zone || getZone(data.x, data.y);
    const scale = clamp(target.offsetWidth / 700, 0.78, 1.2);
    const size = clamp((getAutoSize(zone, counts[zone]) + (data.sizeDelta || 0)) * scale, 8, 30);
    item.style.setProperty("--word-size", `${size}px`);
  });
}

function renderActionLists() {
  document.querySelectorAll("[data-zone-list]").forEach((list) => {
    list.innerHTML = "";
    const zone = list.dataset.zoneList;
    words.filter((word) => word.zone === zone).forEach((word) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = word.text || "Žodis";
      chip.addEventListener("click", () => {
        const item = document.querySelector(`.word[data-id="${word.id}"]`);
        if (!item) return;
        setSelectedWord(word.id);
        item.focus();
        placeCaretAtEnd(item);
      });
      list.appendChild(chip);
    });
  });
}

function refreshSystem(save = true) {
  updateColorLayout();
  words.forEach(snapWordToZoneCenter);
  updateAllWordSizes();
  renderActionLists();
  if (save) saveWords();
}

function updateWordsOnly(save = true) {
  updateColorLayout();
  updateAllWordSizes();
  renderActionLists();
  if (save) saveWords();
}

function setSelectedWord(id) {
  selectedWordId = id;
  document.querySelectorAll(".word").forEach((item) => item.classList.toggle("selected", item.dataset.id === id));
}

function clearSelectedWord() {
  selectedWordId = null;
  document.querySelectorAll(".word").forEach((item) => item.classList.remove("selected"));
  if (document.activeElement?.classList?.contains("word")) document.activeElement.blur();
}

function placeCaretAtEnd(item) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(item);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function selectEntireWord(item) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(item);
  selection.removeAllRanges();
  selection.addRange(range);
  item.focus();
}

function normalizeSavedWords() {
  let changed = false;
  words.forEach((word) => {
    const nextText = capitalizeFirst(word.text || "");
    if (word.text !== nextText) { word.text = nextText; changed = true; }
    if (!word.zone) { word.zone = getZone(word.x || 50, word.y || 50); changed = true; }
  });
  if (changed) saveWords();
}

function createWord(data) {
  const item = document.createElement("div");
  item.className = "word";
  item.contentEditable = "true";
  item.spellcheck = false;
  item.dataset.id = data.id;
  item.textContent = capitalizeFirst(data.text || "");
  item.style.left = `${data.x}%`;
  item.style.top = `${data.y}%`;
  data.sizeDelta = data.sizeDelta || 0;

  item.addEventListener("input", () => {
    const saved = words.find((word) => word.id === data.id);
    if (!saved) return;
    saved.text = item.textContent.trim();
    saveWords();
    renderActionLists();
  });

  item.addEventListener("blur", () => {
    const saved = words.find((word) => word.id === data.id);
    if (!saved) return;
    const nextText = capitalizeFirst(item.textContent);
    if (!nextText) {
      words = words.filter((word) => word.id !== data.id);
      selectedWordId = selectedWordId === data.id ? null : selectedWordId;
      item.remove();
      refreshSystem();
      return;
    }
    saved.text = nextText;
    item.textContent = nextText;
    updateWordsOnly();
  });

  item.addEventListener("focus", () => setSelectedWord(data.id));
  item.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); setSelectedWord(data.id); selectEntireWord(item); });
  item.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); item.blur(); }
    if ((event.key === "Backspace" || event.key === "Delete") && item.textContent.trim() === "") {
      event.preventDefault();
      words = words.filter((word) => word.id !== data.id);
      item.remove();
      selectedWordId = selectedWordId === data.id ? null : selectedWordId;
      refreshSystem();
    }
  });

  item.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    setSelectedWord(data.id);
    activeWord = item;
    dragStart = { x: event.clientX, y: event.clientY, left: parseFloat(item.style.left), top: parseFloat(item.style.top), moved: false };
    item.classList.add("dragging");
    item.setPointerCapture(event.pointerId);
  });

  item.addEventListener("pointermove", (event) => {
    if (!activeWord || activeWord !== item || !dragStart) return;
    const rect = target.getBoundingClientRect();
    const x = clamp(dragStart.left + ((event.clientX - dragStart.x) / rect.width) * 100, 2, 98);
    const y = clamp(dragStart.top + ((event.clientY - dragStart.y) / rect.height) * 100, 2, 98);
    if (!pointInsideTarget(x, y)) return;
    dragStart.moved = true;
    item.style.left = `${x}%`;
    item.style.top = `${y}%`;
  });

  item.addEventListener("pointerup", (event) => {
    item.releasePointerCapture(event.pointerId);
    item.classList.remove("dragging");
    const saved = words.find((word) => word.id === data.id);
    if (saved) {
      saved.x = parseFloat(item.style.left);
      saved.y = parseFloat(item.style.top);
      saved.zone = getZone(saved.x, saved.y);
      refreshSystem();
    }
    if (!dragStart?.moved) item.focus();
    activeWord = null;
    dragStart = null;
  });

  layer.appendChild(item);
  return item;
}

function addWordAt(x, y, zone = getZone(x, y), text = "") {
  if (!pointInsideTarget(x, y)) return;
  const data = { id: crypto.randomUUID(), text: capitalizeFirst(text), x, y, zone, sizeDelta: 0 };
  words.push(data);
  saveWords();
  const item = createWord(data);
  setSelectedWord(data.id);
  refreshSystem();
  item.focus();
  placeCaretAtEnd(item);
}

function addWordInZone(zone) {
  const counts = getZoneCounts();
  const angle = (-90 + counts[zone] * 41) * Math.PI / 180;
  const radius = currentLayout.centers[zone];
  addWordAt(50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius, zone);
}

function hydrateNotes() {
  document.querySelectorAll("[data-note]").forEach((field) => {
    const key = field.dataset.note;
    if (notes[key] !== undefined) field.value = notes[key];
    field.addEventListener("input", () => { notes[key] = field.value; saveNotes(); });
  });
}

normalizeSavedWords();
hydrateNotes();
words.forEach(createWord);
updateTargetScale(false);
updateTargetPan(false);
refreshSystem();

target.addEventListener("dblclick", (event) => {
  if (event.target.classList.contains("word")) return;
  const rect = target.getBoundingClientRect();
  addWordAt(((event.clientX - rect.left) / rect.width) * 100, ((event.clientY - rect.top) / rect.height) * 100);
});

document.querySelectorAll("[data-add-zone]").forEach((button) => button.addEventListener("click", () => addWordInZone(button.dataset.addZone)));

document.getElementById("clearWords").addEventListener("click", () => {
  words = [];
  selectedWordId = null;
  layer.innerHTML = "";
  localStorage.removeItem(wordsStorageKey);
  refreshSystem(false);
});

document.getElementById("resetView").addEventListener("click", () => {
  targetScale = 1;
  targetPan = { x: 0, y: 0 };
  updateTargetScale();
  updateTargetPan();
});

document.getElementById("decreaseWord").addEventListener("click", () => {
  const selected = words.find((word) => word.id === selectedWordId);
  if (!selected) return;
  selected.sizeDelta = clamp((selected.sizeDelta || 0) - 2, -8, 14);
  updateAllWordSizes();
  saveWords();
});

document.getElementById("increaseWord").addEventListener("click", () => {
  const selected = words.find((word) => word.id === selectedWordId);
  if (!selected) return;
  selected.sizeDelta = clamp((selected.sizeDelta || 0) + 2, -8, 14);
  updateAllWordSizes();
  saveWords();
});

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".word") || event.target.closest(".size-panel")) return;
  clearSelectedWord();
});

document.addEventListener("wheel", (event) => {
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  const previousScale = targetScale;
  const nextScale = clamp(previousScale + direction * 0.08, 0.65, 2.2);
  if (nextScale === previousScale) return;

  const boardRect = board.getBoundingClientRect();
  const pointerX = (event.clientX - boardRect.left) / previousScale;
  const pointerY = (event.clientY - boardRect.top) / previousScale;

  targetPan = {
    x: targetPan.x - pointerX * (nextScale - previousScale),
    y: targetPan.y - pointerY * (nextScale - previousScale)
  };
  targetScale = nextScale;
  updateTargetScale();
  updateTargetPan();
}, { passive: false });

board.addEventListener("contextmenu", (event) => event.preventDefault());
board.addEventListener("pointerdown", (event) => {
  if (event.button !== 2) return;
  event.preventDefault();
  clearSelectedWord();
  panStart = { x: event.clientX, y: event.clientY, panX: targetPan.x, panY: targetPan.y };
  board.setPointerCapture(event.pointerId);
});
board.addEventListener("pointermove", (event) => {
  if (!panStart) return;
  targetPan = { x: panStart.panX + event.clientX - panStart.x, y: panStart.panY + event.clientY - panStart.y };
  updateTargetPan(false);
});
board.addEventListener("pointerup", (event) => {
  if (!panStart) return;
  board.releasePointerCapture(event.pointerId);
  panStart = null;
  updateTargetPan();
});

window.addEventListener("resize", updateAllWordSizes);
document.getElementById("print").addEventListener("click", () => window.print());
