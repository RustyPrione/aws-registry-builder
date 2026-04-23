const statusBox = document.getElementById("status");
const branchInput = document.getElementById("branch");
const arRepoInput = document.getElementById("arRepo");
const tagInput = document.getElementById("tag");

const SESSION_ID_KEY = "aws-registry-session-id";
const LOG_STORE_PREFIX = "aws-registry-activity-log-v1-";
const MAX_ACTIVITY_LOG_LINES = 500;

let branchNames = [];
let artifactRepoNames = [];
let previousArRepo = "";
let artifactRepoCreateMode = false;

/** @type {Array<{ ts: string, msg: string, type: string }>} */
let activityLogEntries = [];

function getSessionId() {
  try {
    let id = localStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch (_) {
    return "anonymous";
  }
}

function getLogStorageKey() {
  return LOG_STORE_PREFIX + getSessionId();
}

function saveActivityLogToLocalStorage() {
  try {
    localStorage.setItem(getLogStorageKey(), JSON.stringify(activityLogEntries));
  } catch (_) {
    /* quota or private mode */
  }
}

function renderActivityLogLine(entry) {
  const line = document.createElement("div");
  line.className = "line" + (entry.type ? ` ${entry.type}` : "");
  line.textContent = `[${entry.ts}] ${entry.msg}`;
  statusBox.appendChild(line);
}

function loadActivityLogFromLocalStorage() {
  activityLogEntries = [];
  statusBox.innerHTML = "";
  try {
    const raw = localStorage.getItem(getLogStorageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    activityLogEntries = parsed.slice(-MAX_ACTIVITY_LOG_LINES);
    for (const e of activityLogEntries) {
      if (e && typeof e.msg === "string" && typeof e.ts === "string") {
        renderActivityLogLine({
          ts: e.ts,
          msg: e.msg,
          type: typeof e.type === "string" ? e.type : "",
        });
      }
    }
    statusBox.scrollTop = statusBox.scrollHeight;
  } catch (_) {
    activityLogEntries = [];
  }
}

let serverLogPending = [];
let serverLogFlushTimer = null;
const SERVER_LOG_FLUSH_MS = 400;

function queueServerLogSync(entry) {
  serverLogPending.push(entry);
  clearTimeout(serverLogFlushTimer);
  serverLogFlushTimer = setTimeout(flushServerLogBatch, SERVER_LOG_FLUSH_MS);
}

async function flushServerLogBatch() {
  const batch = serverLogPending.splice(0);
  if (batch.length === 0) return;
  try {
    await fetch("/api/session/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: getSessionId(), entries: batch }),
    });
  } catch (_) {
    /* offline — localStorage still has copy */
  }
}

window.addEventListener("pagehide", () => {
  clearTimeout(serverLogFlushTimer);
  serverLogFlushTimer = null;
  if (serverLogPending.length === 0) return;
  const payload = JSON.stringify({
    sessionId: getSessionId(),
    entries: serverLogPending.splice(0),
  });
  try {
    navigator.sendBeacon(
      "/api/session/log",
      new Blob([payload], { type: "application/json" })
    );
  } catch (_) {
    serverLogPending = [];
  }
});

function log(msg, type = "") {
  let resolvedType = type;
  if (/(^|\s)WARNING:/i.test(String(msg))) {
    resolvedType = "warn";
  }
  const ts = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const entry = { ts, msg: String(msg), type: resolvedType };
  renderActivityLogLine(entry);
  activityLogEntries.push(entry);
  if (activityLogEntries.length > MAX_ACTIVITY_LOG_LINES) {
    activityLogEntries.shift();
    statusBox.removeChild(statusBox.firstChild);
  }
  saveActivityLogToLocalStorage();
  queueServerLogSync(entry);
  statusBox.scrollTop = statusBox.scrollHeight;
}

function getActiveBuildStorageKey() {
  return "aws-registry-active-build-v1-" + getSessionId();
}

function saveActiveBuild(snapshot) {
  try {
    localStorage.setItem(getActiveBuildStorageKey(), JSON.stringify(snapshot));
  } catch (_) {}
}

function loadActiveBuild() {
  try {
    const raw = localStorage.getItem(getActiveBuildStorageKey());
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.buildId !== "string") return null;
    return o;
  } catch (_) {
    return null;
  }
}

function clearActiveBuild() {
  try {
    localStorage.removeItem(getActiveBuildStorageKey());
  } catch (_) {}
}

function persistActiveBuild(ctx, buildId) {
  if (!ctx?.logLineCount) return;
  saveActiveBuild({
    buildId,
    imageUri: ctx.imageUri,
    repo: ctx.repo,
    tag: ctx.tag,
    codebuildLogsShown: ctx.logLineCount.count,
  });
}

/** Cancels in-flight poll/resume when incremented */
let buildPollGeneration = 0;

function bumpBuildPollGeneration() {
  buildPollGeneration += 1;
}

async function clearLog() {
  bumpBuildPollGeneration();
  clearActiveBuild();
  clearTimeout(serverLogFlushTimer);
  serverLogFlushTimer = null;
  serverLogPending = [];
  activityLogEntries = [];
  statusBox.innerHTML = "";
  try {
    localStorage.removeItem(getLogStorageKey());
  } catch (_) {}
  try {
    await fetch("/api/session/log", {
      method: "DELETE",
      headers: { "X-Session-Id": getSessionId() },
    });
  } catch (_) {}
}

document.getElementById("clearLogBtn")?.addEventListener("click", () => {
  clearLog();
});

function resetSource() {
  const repoUrlEl = document.getElementById("repoUrl");
  const branchListEl = document.getElementById("branch-list");
  if (repoUrlEl) repoUrlEl.value = "";
  branchInput.value = "";
  branchNames = [];
  if (branchListEl) {
    branchListEl.hidden = true;
    branchListEl.innerHTML = "";
  }
  branchInput.setAttribute("aria-expanded", "false");
  log("Source reset (URL and branch cleared).", "dim");
}

window.resetSource = resetSource;

function formatBuildDurationMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatImageBytes(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (n >= gb) {
    const v = n / gb;
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${v.toFixed(digits)} GB`;
  }
  const v = n / mb;
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} MB`;
}

async function fetchEcrImageSizeBytes(repo, tag) {
  const url = `/api/aws/images/${encodeURIComponent(repo)}/describe?tag=${encodeURIComponent(tag)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sizeBytes != null && Number.isFinite(Number(data.sizeBytes))) {
        return Number(data.sizeBytes);
      }
    } catch (_) {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

async function logSuccessfulBuildOutput({ imageUri, repo, tag, buildData }) {
  let durationStr = "—";
  if (buildData.startTime && buildData.endTime) {
    const ms = new Date(buildData.endTime) - new Date(buildData.startTime);
    durationStr = formatBuildDurationMs(ms);
  }

  const sizeBytes = await fetchEcrImageSizeBytes(repo, tag);
  const sizeStr = formatImageBytes(sizeBytes);

  const sep = "----------------------";
  log(sep, "ok");
  log("OUTPUT", "ok");
  log(sep, "ok");
  log(`Image URL: ${imageUri}`, "ok");
  log(`Time Took to Build: ${durationStr}`, "ok");
  log(`Docker Image Size: ${sizeStr}`, "ok");
}

function setLoading(btn, loading, labelIdle, labelBusy) {
  if (!btn) return;
  btn.disabled = loading;
  const span = btn.querySelector(".btn-label");
  if (span) span.textContent = loading ? labelBusy : labelIdle;
}

function filterAndSort(items, query) {
  const q = (query || "").trim().toLowerCase();
  const base = Array.isArray(items) ? [...items] : [];
  const filtered = !q ? base : base.filter((x) => String(x).toLowerCase().includes(q));
  return filtered.sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
}

/** ECR list entry: { name, uri, createdAt } or legacy string */
function repositoryShortName(entry) {
  if (entry == null) return "";
  if (typeof entry === "string") {
    const parts = entry.split("/");
    return parts[parts.length - 1] || entry;
  }
  const name = entry.name || entry.repositoryName || entry.repositoryId || "";
  if (!name) return "";
  const parts = String(name).split("/");
  return parts[parts.length - 1] || name;
}

function wireSearchableCombo(input, listEl, getItems, opts = {}) {
  const { onCommit, allowFreeText } = opts;
  let activeIndex = -1;
  let itemsInView = [];

  function renderList() {
    itemsInView = filterAndSort(getItems(), input.value);
    listEl.innerHTML = "";
    activeIndex = -1;

    if (itemsInView.length === 0) {
      const li = document.createElement("li");
      li.className = "combo-empty";
      li.textContent = allowFreeText ? "Type a value or pick from list" : "No matching names";
      listEl.appendChild(li);
      return;
    }

    itemsInView.forEach((text, i) => {
      const li = document.createElement("li");
      li.className = "combo-item";
      li.setAttribute("role", "option");
      li.textContent = text;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectIndex(i);
      });
      listEl.appendChild(li);
    });
  }

  function highlightActive() {
    [...listEl.querySelectorAll(".combo-item")].forEach((el, idx) => {
      el.classList.toggle("is-active", idx === activeIndex);
      el.setAttribute("aria-selected", idx === activeIndex ? "true" : "false");
    });
  }

  function selectIndex(i) {
    const text = itemsInView[i];
    if (text == null) return;
    input.value = text;
    listEl.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    onCommit?.(text);
  }

  function open() {
    if (input.disabled) return;
    renderList();
    listEl.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function close() {
    listEl.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    [...listEl.querySelectorAll(".combo-item")].forEach((el) => {
      el.classList.remove("is-active");
      el.setAttribute("aria-selected", "false");
    });
  }

  function commitFromInput() {
    if (input.disabled) return;
    const q = input.value.trim();
    const all = getItems();
    if (allowFreeText) {
      onCommit?.(q);
      return;
    }
    if (!q) return;
    const exact = all.find((x) => String(x).toLowerCase() === q.toLowerCase());
    if (exact) {
      if (input.value !== exact) input.value = exact;
      onCommit?.(exact);
      return;
    }
    const filtered = filterAndSort(all, q);
    if (filtered.length === 1) {
      input.value = filtered[0];
      onCommit?.(filtered[0]);
    }
  }

  input.addEventListener("input", () => {
    if (!input.disabled) open();
  });

  input.addEventListener("focus", () => {
    if (!input.disabled) open();
  });

  input.addEventListener("blur", () => {
    setTimeout(() => {
      commitFromInput();
      close();
    }, 160);
  });

  input.addEventListener("keydown", (e) => {
    if (input.disabled) return;

    if (listEl.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      open();
      e.preventDefault();
      if (itemsInView.length > 0) {
        activeIndex = e.key === "ArrowDown" ? 0 : itemsInView.length - 1;
        highlightActive();
      }
      return;
    }

    if (listEl.hidden) return;

    if (e.key === "Escape") {
      close();
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (activeIndex < 0) activeIndex = 0;
      else activeIndex = Math.min(activeIndex + 1, itemsInView.length - 1);
      highlightActive();
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (activeIndex < 0) activeIndex = itemsInView.length - 1;
      else activeIndex = Math.max(activeIndex - 1, 0);
      highlightActive();
    }

    if (e.key === "Enter" && activeIndex >= 0 && itemsInView[activeIndex]) {
      e.preventDefault();
      selectIndex(activeIndex);
    }
  });

  return { open, close, refresh: open };
}

window.loadBranches = loadBranches;
window.loadArtifactRepos = loadArtifactRepos;
window.startBuild = startBuild;
window.enterArtifactRepoCreateMode = enterArtifactRepoCreateMode;
window.cancelArtifactRepoCreateMode = cancelArtifactRepoCreateMode;
window.submitCreateArtifactRepo = submitCreateArtifactRepo;

async function loadBranches() {
  const btn = document.getElementById("fetchBranchesBtn");
  const repoUrl = document.getElementById("repoUrl").value.trim();
  if (!repoUrl) {
    log("Enter a Bitbucket repository URL first.", "err");
    return;
  }

  setLoading(btn, true, "Fetch branches", "Fetching…");

  try {
    log("POST /api/git/branches …", "dim");
    const res = await fetch("/api/git/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    branchNames = data.branches || [];
    branchInput.value = "";

    log(`Loaded ${branchNames.length} branch(es). Type and select a branch.`, "ok");
  } catch (e) {
    log(String(e.message || e), "err");
  } finally {
    setLoading(btn, false, "Fetch branches", "Fetching…");
  }
}

function getCreateRepoEls() {
  return {
    panel: document.getElementById("createRepoPanel"),
    newBtn: document.getElementById("newArtifactRepoBtn"),
    refreshBtn: document.getElementById("refreshReposBtn"),
    nameInput: document.getElementById("newArRepoName"),
    submitBtn: document.getElementById("submitCreateRepoBtn"),
  };
}

function enterArtifactRepoCreateMode() {
  const { panel, newBtn, refreshBtn, nameInput } = getCreateRepoEls();
  artifactRepoCreateMode = true;
  arRepoInput.disabled = true;
  if (newBtn) newBtn.disabled = true;
  if (refreshBtn) refreshBtn.disabled = true;
  if (panel) {
    panel.hidden = false;
  }
  if (nameInput) {
    nameInput.value = "";
    nameInput.focus();
  }
  log("Create mode: enter a new ECR repository name and submit, or Cancel.", "dim");
}

function cancelArtifactRepoCreateMode() {
  const { panel, newBtn, refreshBtn, nameInput } = getCreateRepoEls();
  artifactRepoCreateMode = false;
  arRepoInput.disabled = false;
  if (newBtn) newBtn.disabled = false;
  if (refreshBtn) refreshBtn.disabled = false;
  if (panel) panel.hidden = true;
  if (nameInput) nameInput.value = "";
}

async function submitCreateArtifactRepo() {
  const { nameInput, submitBtn } = getCreateRepoEls();
  const raw = nameInput?.value?.trim() || "";
  if (!raw) {
    log("Enter a repository name.", "err");
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.idleLabel = submitBtn.dataset.idleLabel || submitBtn.textContent;
    submitBtn.textContent = "Creating…";
  }

  try {
    log("POST /api/aws/create-repo …", "dim");
    const res = await fetch("/api/aws/create-repo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: raw }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const createdShort = data.name || repositoryShortName(data.repository) || raw;
    log(`ECR repository created: ${createdShort}`, "ok");

    cancelArtifactRepoCreateMode();
    await loadArtifactRepos({ preferRepo: createdShort || raw });
  } catch (e) {
    log(String(e.message || e), "err");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      if (submitBtn.dataset.idleLabel) submitBtn.textContent = submitBtn.dataset.idleLabel;
    }
  }
}

async function loadArtifactRepos(options = {}) {
  const { preferRepo } = options;
  const btn = document.getElementById("refreshReposBtn");
  if (btn && !artifactRepoCreateMode) btn.disabled = true;

  try {
    log("GET /api/aws/repos …", "dim");
    const res = await fetch("/api/aws/repos");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const raw = Array.isArray(data) ? data : [];
    artifactRepoNames = [...new Set(raw.map(repositoryShortName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    const pick = (preferRepo || "").trim();
    if (pick) {
      if (!artifactRepoNames.some((r) => r === pick)) {
        artifactRepoNames.push(pick);
        artifactRepoNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      }
      arRepoInput.value = pick;
      previousArRepo = pick;
    } else {
      arRepoInput.value = "";
      previousArRepo = "";
    }

    log(`Loaded ${artifactRepoNames.length} ECR repo(s). Type and select one.`, "ok");
  } catch (e) {
    log(String(e.message || e), "err");
  } finally {
    if (btn && !artifactRepoCreateMode) btn.disabled = false;
  }
}

/** CodeBuild terminal build statuses */
const terminalBuildStatuses = new Set([
  "SUCCEEDED",
  "FAILED",
  "FAULT",
  "TIMED_OUT",
  "STOPPED",
  "ABORTED",
]);

async function appendCodeBuildLogLines(buildId, ctx, generation) {
  if (generation !== buildPollGeneration) return;
  const logLineCount = ctx.logLineCount;
  if (!logLineCount) return;

  try {
    const id = encodeURIComponent(buildId);
    const res = await fetch(`/api/aws/build/${id}/logs`);
    if (!res.ok) return;
    const data = await res.json();
    const messages = Array.isArray(data) ? data : data.messages || [];
    if (generation !== buildPollGeneration) return;

    if (messages.length <= logLineCount.count) {
      persistActiveBuild(ctx, buildId);
      return;
    }
    for (let i = logLineCount.count; i < messages.length; i++) {
      if (generation !== buildPollGeneration) return;
      const trimmed = String(messages[i]).replace(/\r$/, "");
      if (trimmed) {
        log(`[CodeBuild] ${trimmed}`, "dim");
      }
    }
    logLineCount.count = messages.length;
    persistActiveBuild(ctx, buildId);
  } catch (_) {
    /* log stream may not exist yet */
  }
}

/**
 * @param {string} buildId
 * @param {{ imageUri?: string, repo?: string, tag?: string, logLineCount: { count: number } }} ctx
 * @param {number} generation
 */
async function pollBuildUntilDone(buildId, ctx, generation) {
  const id = encodeURIComponent(buildId);
  while (true) {
    if (generation !== buildPollGeneration) {
      return null;
    }

    await appendCodeBuildLogLines(buildId, ctx, generation);

    if (generation !== buildPollGeneration) {
      return null;
    }

    const res = await fetch(`/api/aws/build/${id}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const pollLine = `GET /api/aws/build/${buildId} → ${data.status}`;
    log(pollLine, data.status === "IN_PROGRESS" ? "warn" : "dim");

    if (data.logsUrl) {
      log(`CodeBuild console: ${data.logsUrl}`, "dim");
    }

    if (terminalBuildStatuses.has(data.status)) {
      await appendCodeBuildLogLines(buildId, ctx, generation);

      if (data.status === "SUCCEEDED") {
        log("CodeBuild finished successfully.", "ok");
        if (ctx?.imageUri && ctx?.repo && ctx?.tag) {
          await logSuccessfulBuildOutput({
            imageUri: ctx.imageUri,
            repo: ctx.repo,
            tag: ctx.tag,
            buildData: data,
          });
        }
      } else {
        log(`CodeBuild ended: ${data.status}`, "err");
      }
      clearActiveBuild();
      return data;
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function resumeBuildIfNeeded() {
  const saved = loadActiveBuild();
  if (!saved?.buildId) return;

  const gen = buildPollGeneration;
  log("Resuming build: fetching CodeBuild status and live logs from AWS…", "warn");

  try {
    await pollBuildUntilDone(
      saved.buildId,
      {
        imageUri: saved.imageUri,
        repo: saved.repo,
        tag: saved.tag,
        logLineCount: { count: Number(saved.codebuildLogsShown) || 0 },
      },
      gen
    );
  } catch (e) {
    log(String(e.message || e), "err");
    clearActiveBuild();
  }
}

async function startBuild() {
  const btn = document.getElementById("buildBtn");
  const repo = arRepoInput.value.trim();
  const tag = tagInput.value.trim();
  const gitUrl = document.getElementById("repoUrl").value.trim();
  const branch = branchInput.value.trim();

  if (!gitUrl) {
    log("Repository URL is required.", "err");
    return;
  }
  if (!branchNames.length) {
    log("Fetch branches first, then pick a branch.", "err");
    return;
  }
  if (!branch || !branchNames.some((b) => b === branch)) {
    log("Choose a branch from the list (must match a remote branch after fetch).", "err");
    return;
  }
  if (!repo || !artifactRepoNames.some((r) => r === repo)) {
    log("Choose an ECR repository from the list (refresh if empty).", "err");
    return;
  }
  if (!tag) {
    log("Enter an image tag.", "err");
    return;
  }

  const body = { repo, tag, gitUrl, branch };

  setLoading(btn, true, "Trigger CodeBuild & push to ECR", "Submitting…");

  try {
    bumpBuildPollGeneration();
    const gen = buildPollGeneration;

    log("POST /api/aws/build …", "dim");
    const res = await fetch("/api/aws/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    log(`Build queued — id: ${data.buildId}, status: ${data.status}`, "ok");
    if (data.image) {
      log(`Target image: ${data.image}`, "dim");
    }

    saveActiveBuild({
      buildId: data.buildId,
      imageUri: data.image,
      repo,
      tag,
      codebuildLogsShown: 0,
    });

    const ctx = {
      imageUri: data.image,
      repo,
      tag,
      logLineCount: { count: 0 },
    };

    setLoading(btn, false, "Trigger CodeBuild & push to ECR", "Submitting…");
    log("Polling GET /api/aws/build/:id …", "dim");
    await pollBuildUntilDone(data.buildId, ctx, gen);
  } catch (e) {
    log(String(e.message || e), "err");
    /* keep active build in localStorage so a refresh can resume unless the build already finished */
  } finally {
    setLoading(btn, false, "Trigger CodeBuild & push to ECR", "Submitting…");
  }
}

wireSearchableCombo(branchInput, document.getElementById("branch-list"), () => branchNames, {});

wireSearchableCombo(arRepoInput, document.getElementById("arRepo-list"), () => artifactRepoNames, {
  onCommit: (text) => {
    if (!text || text === previousArRepo) return;
    previousArRepo = text;
  },
});

branchInput.value = "";
arRepoInput.value = "";
tagInput.value = "";

getSessionId();
loadActivityLogFromLocalStorage();
loadArtifactRepos();
void resumeBuildIfNeeded();
