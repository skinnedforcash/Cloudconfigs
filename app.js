const API_BASE = "https://api.github.com";
const TOKEN_KEY = "cloudconfigs_token";

const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    username: "",
    entries: [],
};

const el = {
    list: document.getElementById("list"),
    search: document.getElementById("search"),
    authBtn: document.getElementById("auth-btn"),
    authStatus: document.getElementById("auth-status"),
    modal: document.getElementById("token-modal"),
    tokenInput: document.getElementById("token-input"),
    tokenSave: document.getElementById("token-save"),
    tokenClear: document.getElementById("token-clear"),
    uploadForm: document.getElementById("upload-form"),
    uploadName: document.getElementById("upload-name"),
    uploadDescription: document.getElementById("upload-description"),
    uploadData: document.getElementById("upload-data"),
    uploadSubmit: document.getElementById("upload-submit"),
    uploadStatus: document.getElementById("upload-status"),
};

function authHeaders() {
    return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
    return decodeURIComponent(escape(atob(str)));
}

function slugify(name) {
    const base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "config";

    const suffix = Math.random().toString(36).slice(2, 8);

    return `${base}-${suffix}.json`;
}

async function refreshAuthState() {
    if (!state.token) {
        el.authStatus.textContent = "not signed in";
        state.username = "";
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/user`, { headers: authHeaders() });

        if (!res.ok) throw new Error("bad token");

        const data = await res.json();

        state.username = data.login;
        el.authStatus.textContent = `signed in as ${data.login}`;
    } catch {
        el.authStatus.textContent = "invalid token";
        state.username = "";
    }
}

async function loadEntries() {
    el.list.innerHTML = `<p class="empty">loading configs...</p>`;

    try {
        const res = await fetch(
            `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIGS_PATH}?ref=${GITHUB_BRANCH}`,
            { headers: authHeaders() }
        );

        if (res.status === 404) {
            state.entries = [];
            renderEntries();
            return;
        }

        if (!res.ok) throw new Error(`list failed: ${res.status}`);

        const files = (await res.json()).filter((f) => f.type === "file" && f.name.endsWith(".json"));

        const entries = await Promise.all(
            files.map(async (file) => {
                try {
                    const contentRes = await fetch(file.download_url);
                    const parsed = await contentRes.json();

                    return {
                        path: file.path,
                        sha: file.sha,
                        downloadUrl: file.download_url,
                        name: parsed.name || file.name,
                        author: parsed.author || "unknown",
                        description: parsed.description || "",
                    };
                } catch {
                    return null;
                }
            })
        );

        state.entries = entries.filter(Boolean);
        renderEntries();
    } catch (err) {
        el.list.innerHTML = `<p class="empty">failed to load configs (${err.message})</p>`;
    }
}

function renderEntries() {
    const query = el.search.value.trim().toLowerCase();

    const visible = state.entries.filter((entry) => {
        if (!query) return true;

        const haystack = `${entry.name} ${entry.description} ${entry.author}`.toLowerCase();

        return haystack.includes(query);
    });

    if (visible.length === 0) {
        el.list.innerHTML = `<p class="empty">${state.entries.length === 0 ? "no configs uploaded yet" : "no configs match your search"}</p>`;
        return;
    }

    el.list.innerHTML = "";

    for (const entry of visible) {
        const row = document.createElement("div");
        row.className = "entry";

        row.innerHTML = `
            <span class="entry-indicator"></span>
            <div class="entry-info">
                <div class="entry-title">${escapeHtml(entry.name)}</div>
                <div class="entry-meta">${escapeHtml(entry.description)}${entry.description ? " · " : ""}uploaded by ${escapeHtml(entry.author)}</div>
            </div>
            <div class="entry-actions">
                <button class="btn btn-outline" data-action="copy">Copy URL</button>
                <button class="btn btn-primary" data-action="download">Download</button>
            </div>
        `;

        row.querySelector('[data-action="download"]').addEventListener("click", () => downloadEntry(entry));
        row.querySelector('[data-action="copy"]').addEventListener("click", () => copyEntryUrl(entry));

        el.list.appendChild(row);
    }
}

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

function downloadEntry(entry) {
    const a = document.createElement("a");
    a.href = entry.downloadUrl;
    a.download = entry.path.split("/").pop();
    a.click();
}

async function copyEntryUrl(entry) {
    await navigator.clipboard.writeText(entry.downloadUrl);
}

async function uploadEntry(evt) {
    evt.preventDefault();

    if (!state.token) {
        el.uploadStatus.textContent = "set a token first";
        el.modal.classList.remove("hidden");
        return;
    }

    const name = el.uploadName.value.trim();
    const description = el.uploadDescription.value.trim();
    const raw = el.uploadData.value.trim();

    let parsedConfig;

    try {
        parsedConfig = JSON.parse(raw);
    } catch {
        el.uploadStatus.textContent = "config data isn't valid JSON";
        return;
    }

    const envelope = {
        name,
        description,
        author: state.username || "unknown",
        uploadedAt: new Date().toISOString(),
        config: parsedConfig,
    };

    const filename = slugify(name);

    el.uploadSubmit.disabled = true;
    el.uploadStatus.textContent = "uploading...";

    try {
        const res = await fetch(
            `${API_BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CONFIGS_PATH}/${filename}`,
            {
                method: "PUT",
                headers: { ...authHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: `Add config: ${name}`,
                    content: utf8ToBase64(JSON.stringify(envelope, null, 2)),
                    branch: GITHUB_BRANCH,
                }),
            }
        );

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || `upload failed: ${res.status}`);
        }

        el.uploadStatus.textContent = "uploaded!";
        el.uploadForm.reset();

        await loadEntries();
    } catch (err) {
        el.uploadStatus.textContent = err.message;
    } finally {
        el.uploadSubmit.disabled = false;
    }
}

function openTokenModal() {
    el.tokenInput.value = state.token;
    el.modal.classList.remove("hidden");
}

function closeTokenModal() {
    el.modal.classList.add("hidden");
}

async function saveToken() {
    state.token = el.tokenInput.value.trim();
    localStorage.setItem(TOKEN_KEY, state.token);

    closeTokenModal();

    await refreshAuthState();
    await loadEntries();
}

function clearToken() {
    state.token = "";
    state.username = "";
    localStorage.removeItem(TOKEN_KEY);

    el.tokenInput.value = "";
    el.authStatus.textContent = "not signed in";

    closeTokenModal();
}

el.authBtn.addEventListener("click", openTokenModal);
el.tokenSave.addEventListener("click", saveToken);
el.tokenClear.addEventListener("click", clearToken);
el.modal.addEventListener("click", (evt) => {
    if (evt.target === el.modal) closeTokenModal();
});

el.search.addEventListener("input", renderEntries);
el.uploadForm.addEventListener("submit", uploadEntry);

(async function init() {
    await refreshAuthState();
    await loadEntries();
})();
