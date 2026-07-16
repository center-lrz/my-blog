import "./styles.css";

const state = {
  user: null,
  topics: [],
  posts: [],
  activeTopic: "all",
  activePost: null,
  query: "",
};

const tokenKey = "forum_session_token";
const app = document.querySelector("#app");

const topicColors = {
  life: "#0f766e",
  tech: "#2563eb",
  study: "#7c3aed",
  project: "#c2410c",
  chat: "#be123c",
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem(tokenKey);

  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "请求失败，请稍后重试");
  }

  return payload;
}

function shell() {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="/">
        <span>李润社区</span>
        <small>话题、帖子和朋友圈式留言</small>
      </a>
      <form class="search" id="search-form">
        <input id="search-input" type="search" placeholder="搜索帖子、内容或话题" value="${escapeHtml(state.query)}" />
        <button type="submit">搜索</button>
      </form>
      <div class="account-slot" id="account-slot"></div>
    </header>

    <main class="layout">
      <aside class="topics-panel">
        <div class="panel-title">
          <span>话题大类</span>
          <strong id="topic-count">0</strong>
        </div>
        <div class="topic-list" id="topic-list"></div>
      </aside>

      <section class="feed">
        <div class="composer" id="composer"></div>
        <div class="feed-toolbar">
          <div>
            <p class="eyebrow">Community Feed</p>
            <h1 id="feed-title">全部帖子</h1>
          </div>
          <button class="ghost-button" id="refresh-button" type="button">刷新</button>
        </div>
        <div class="posts" id="posts"></div>
      </section>

      <aside class="detail-panel" id="detail-panel"></aside>
    </main>
  `;

  bindShellEvents();
  renderAccount();
  renderTopics();
  renderComposer();
  renderPosts();
  renderDetail();
}

function renderAccount() {
  const slot = document.querySelector("#account-slot");

  if (!state.user) {
    slot.innerHTML = `
      <button class="ghost-button" data-auth="login" type="button">登录</button>
      <button class="primary-button" data-auth="register" type="button">注册</button>
    `;
    return;
  }

  slot.innerHTML = `
    <div class="user-chip">
      <span>${escapeHtml(state.user.username.slice(0, 1).toUpperCase())}</span>
      <strong>${escapeHtml(state.user.username)}</strong>
    </div>
    <button class="ghost-button" id="logout-button" type="button">退出</button>
  `;
}

function renderTopics() {
  const list = document.querySelector("#topic-list");
  const count = document.querySelector("#topic-count");
  count.textContent = state.topics.length;

  const allCount = state.topics.reduce((total, topic) => total + Number(topic.post_count || 0), 0);
  const rows = [
    {
      slug: "all",
      name: "全部",
      description: "查看所有话题的新帖子",
      post_count: allCount,
      color: "#111827",
    },
    ...state.topics,
  ];

  list.innerHTML = rows
    .map((topic) => {
      const color = topic.color || topicColors[topic.slug] || "#4b5563";
      return `
        <button class="topic-item ${state.activeTopic === topic.slug ? "active" : ""}" data-topic="${escapeHtml(topic.slug)}" type="button">
          <span class="topic-dot" style="background:${escapeHtml(color)}"></span>
          <span>
            <strong>${escapeHtml(topic.name)}</strong>
            <small>${escapeHtml(topic.description || "暂无简介")}</small>
          </span>
          <em>${Number(topic.post_count || 0)}</em>
        </button>
      `;
    })
    .join("");

  const active = rows.find((topic) => topic.slug === state.activeTopic);
  document.querySelector("#feed-title").textContent = active ? `${active.name}帖子` : "全部帖子";
}

function renderComposer() {
  const composer = document.querySelector("#composer");

  if (!state.user) {
    composer.innerHTML = `
      <div class="login-nudge">
        <strong>登录后可以发帖和留言</strong>
        <span>注册一个账号，就能像朋友圈一样发布动态、参与话题。</span>
      </div>
    `;
    return;
  }

  composer.innerHTML = `
    <form id="post-form" class="post-form">
      <div class="form-grid">
        <input name="title" maxlength="80" placeholder="帖子标题" required />
        <select name="topic_id" required>
          ${state.topics
            .map((topic) => `<option value="${topic.id}">${escapeHtml(topic.name)}</option>`)
            .join("")}
        </select>
      </div>
      <textarea name="body" rows="4" maxlength="2000" placeholder="分享一点新鲜事、问题或项目进展..." required></textarea>
      <div class="form-actions">
        <span>最多 2000 字</span>
        <button class="primary-button" type="submit">发表帖子</button>
      </div>
    </form>
  `;
}

function renderPosts() {
  const posts = document.querySelector("#posts");

  if (!state.posts.length) {
    posts.innerHTML = `
      <div class="empty-state">
        <strong>这里还没有帖子</strong>
        <span>换个话题看看，或者登录后发布第一条。</span>
      </div>
    `;
    return;
  }

  posts.innerHTML = state.posts
    .map(
      (post) => `
        <article class="post-card ${state.activePost?.id === post.id ? "selected" : ""}" data-post-id="${post.id}">
          <div class="post-head">
            <div class="avatar">${escapeHtml(post.username.slice(0, 1).toUpperCase())}</div>
            <div>
              <strong>${escapeHtml(post.username)}</strong>
              <span>${escapeHtml(post.topic_name)} · ${formatTime(post.created_at)}</span>
            </div>
          </div>
          <h2>${escapeHtml(post.title)}</h2>
          <p>${escapeHtml(post.body)}</p>
          <div class="post-foot">
            <span>${Number(post.comment_count || 0)} 条留言</span>
            <button type="button">查看讨论</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderDetail() {
  const detail = document.querySelector("#detail-panel");

  if (!state.activePost) {
    detail.innerHTML = `
      <div class="sticky-card">
        <p class="eyebrow">Thread</p>
        <h2>选择一个帖子</h2>
        <p>点击中间的信息流卡片，可以查看完整内容和下方留言。</p>
      </div>
    `;
    return;
  }

  const comments = state.activePost.comments || [];
  detail.innerHTML = `
    <div class="sticky-card thread-card">
      <div class="thread-topic">${escapeHtml(state.activePost.topic_name)}</div>
      <h2>${escapeHtml(state.activePost.title)}</h2>
      <p>${escapeHtml(state.activePost.body)}</p>
      <div class="thread-meta">由 ${escapeHtml(state.activePost.username)} 发布 · ${formatTime(state.activePost.created_at)}</div>

      <div class="comments">
        <h3>留言 ${comments.length}</h3>
        <div class="comment-list">
          ${
            comments.length
              ? comments
                  .map(
                    (comment) => `
                      <div class="comment">
                        <div class="avatar small">${escapeHtml(comment.username.slice(0, 1).toUpperCase())}</div>
                        <div>
                          <strong>${escapeHtml(comment.username)}</strong>
                          <span>${formatTime(comment.created_at)}</span>
                          <p>${escapeHtml(comment.body)}</p>
                        </div>
                      </div>
                    `,
                  )
                  .join("")
              : `<div class="muted">还没有留言，来坐第一排。</div>`
          }
        </div>
      </div>

      ${
        state.user
          ? `
            <form id="comment-form" class="comment-form">
              <textarea name="body" rows="3" maxlength="1000" placeholder="写下你的留言..." required></textarea>
              <button class="primary-button" type="submit">发送留言</button>
            </form>
          `
          : `<div class="login-nudge compact">登录后可以留言</div>`
      }
    </div>
  `;
}

function bindShellEvents() {
  document.querySelector("#search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.query = document.querySelector("#search-input").value.trim();
    await loadPosts();
  });

  document.querySelector("#refresh-button").addEventListener("click", loadPosts);

  document.querySelector("#app").addEventListener("click", async (event) => {
    const authButton = event.target.closest("[data-auth]");
    const topicButton = event.target.closest("[data-topic]");
    const postCard = event.target.closest("[data-post-id]");
    const logoutButton = event.target.closest("#logout-button");

    if (authButton) {
      openAuthDialog(authButton.dataset.auth);
      return;
    }

    if (topicButton) {
      state.activeTopic = topicButton.dataset.topic;
      state.activePost = null;
      renderTopics();
      renderDetail();
      await loadPosts();
      return;
    }

    if (postCard) {
      await loadPost(Number(postCard.dataset.postId));
      renderPosts();
      return;
    }

    if (logoutButton) {
      await logout();
    }
  });

  document.querySelector("#app").addEventListener("submit", async (event) => {
    if (event.target.id === "post-form") {
      event.preventDefault();
      await createPost(event.target);
    }

    if (event.target.id === "comment-form") {
      event.preventDefault();
      await createComment(event.target);
    }
  });
}

function openAuthDialog(mode = "login") {
  const isRegister = mode === "register";
  const dialog = document.createElement("dialog");
  dialog.className = "auth-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="auth-card">
      <button class="close-button" value="cancel" type="submit">×</button>
      <p class="eyebrow">${isRegister ? "Create Account" : "Welcome Back"}</p>
      <h2>${isRegister ? "注册账号" : "登录账号"}</h2>
      <label>
        用户名
        <input name="username" minlength="2" maxlength="24" autocomplete="username" required />
      </label>
      <label>
        密码
        <input name="password" type="password" minlength="6" autocomplete="${isRegister ? "new-password" : "current-password"}" required />
      </label>
      <button class="primary-button" value="submit" type="submit">${isRegister ? "注册并登录" : "登录"}</button>
      <button class="link-button" data-switch-auth="${isRegister ? "login" : "register"}" type="button">
        ${isRegister ? "已有账号，去登录" : "没有账号，去注册"}
      </button>
      <p class="form-error" id="auth-error"></p>
    </form>
  `;

  document.body.append(dialog);
  dialog.showModal();

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => dialog.remove());

  dialog.querySelector("[data-switch-auth]").addEventListener("click", (event) => {
    const next = event.currentTarget.dataset.switchAuth;
    dialog.close();
    openAuthDialog(next);
  });

  dialog.querySelector(".auth-card").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = dialog.querySelector("#auth-error");
    const body = {
      username: form.username.value.trim(),
      password: form.password.value,
    };

    try {
      const payload = await api(`/api/auth/${isRegister ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      localStorage.setItem(tokenKey, payload.token);
      state.user = payload.user;
      dialog.close();
      renderAccount();
      renderComposer();
      renderDetail();
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

async function loadSession() {
  if (!localStorage.getItem(tokenKey)) return;

  try {
    const payload = await api("/api/session");
    state.user = payload.user;
  } catch {
    localStorage.removeItem(tokenKey);
    state.user = null;
  }
}

async function loadTopics() {
  const payload = await api("/api/topics");
  state.topics = payload.topics;
}

async function loadPosts() {
  const params = new URLSearchParams();
  if (state.activeTopic !== "all") params.set("topic", state.activeTopic);
  if (state.query) params.set("q", state.query);

  try {
    const payload = await api(`/api/posts?${params.toString()}`);
    state.posts = payload.posts;
    renderTopics();
    renderPosts();
  } catch (err) {
    showFatal(err.message);
  }
}

async function loadPost(id) {
  try {
    const payload = await api(`/api/posts/${id}`);
    state.activePost = payload.post;
    renderDetail();
  } catch (err) {
    showToast(err.message);
  }
}

async function createPost(form) {
  const data = new FormData(form);
  const body = {
    title: data.get("title").trim(),
    body: data.get("body").trim(),
    topic_id: Number(data.get("topic_id")),
  };

  try {
    const payload = await api("/api/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    form.reset();
    await loadPosts();
    await loadPost(payload.post.id);
  } catch (err) {
    showToast(err.message);
  }
}

async function createComment(form) {
  const data = new FormData(form);
  const body = { body: data.get("body").trim() };

  try {
    await api(`/api/posts/${state.activePost.id}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    form.reset();
    await loadPost(state.activePost.id);
    await loadPosts();
  } catch (err) {
    showToast(err.message);
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Logging out should still clear the local session if the server token is stale.
  }

  localStorage.removeItem(tokenKey);
  state.user = null;
  renderAccount();
  renderComposer();
  renderDetail();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2800);
}

function showFatal(message) {
  document.querySelector("#posts").innerHTML = `
    <div class="empty-state warning">
      <strong>后端暂时不可用</strong>
      <span>${escapeHtml(message)}。如果刚刚改完代码，请先创建并初始化 Cloudflare D1 数据库。</span>
    </div>
  `;
}

async function start() {
  shell();

  try {
    await loadSession();
    await loadTopics();
    await loadPosts();
    renderAccount();
    renderComposer();
  } catch (err) {
    showFatal(err.message);
  }
}

start();
