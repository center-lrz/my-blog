import "./styles.css";

const state = {
  user: null,
  topics: [],
  posts: [],
  activeTopic: "all",
  activePost: null,
  query: "",
  pendingAttachment: null,
};

const tokenKey = "forum_session_token";
const app = document.querySelector("#app");
let appEventsBound = false;

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

function attachmentMarkup(post, variant = "card") {
  if (!post.attachment_data) return "";

  return `
    <figure class="attachment ${variant}">
      <button class="attachment-open" type="button" aria-label="查看完整图片">
        <img src="${escapeHtml(post.attachment_data)}" alt="${escapeHtml(post.attachment_name || "帖子图片")}" loading="lazy" />
      </button>
      <figcaption>${escapeHtml(post.attachment_name || "图片附件")}</figcaption>
    </figure>
  `;
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

async function openSinglePostPage(postId) {
  await loadPost(postId, { render: false });

  app.innerHTML = `
    <header class="topbar single-topbar">
      <button class="brand brand-button" data-home type="button">
        <span>李润社区</span>
        <small>单帖查看</small>
      </button>
      <button class="ghost-button" data-home type="button">返回社区首页</button>
      <div class="account-slot" id="account-slot"></div>
    </header>

    <main class="single-page">
      <section class="single-thread" id="single-thread"></section>
    </main>
  `;

  bindShellEvents();
  renderAccount();
  renderSinglePostContent();
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
    <div class="account-menu-wrap">
      <button class="user-chip profile-button" type="button" aria-label="打开账号菜单">
        <span class="avatar-badge-wrap">
          ${escapeHtml(state.user.username.slice(0, 1).toUpperCase())}
          ${
            Number(state.user.unread_comment_count || 0) > 0
              ? `<em class="notification-badge">${Math.min(Number(state.user.unread_comment_count), 99)}</em>`
              : ""
          }
        </span>
        <strong>${escapeHtml(state.user.username)}</strong>
      </button>
      <div class="account-menu" role="menu">
        <button type="button" data-account-action="profile">个人中心</button>
        <button type="button" data-account-action="posts">我的帖子</button>
        <button type="button" data-account-action="security">安全中心</button>
        <button type="button" data-account-action="logout">退出登录</button>
      </div>
    </div>
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
      <div class="composer-body">
        <textarea name="body" rows="4" maxlength="2000" placeholder="分享一点新鲜事、问题或项目进展..."></textarea>
        <button class="attach-button" type="button" aria-label="添加图片附件">+</button>
        <input class="attachment-input" name="attachment" type="file" accept="image/*" hidden />
      </div>
      <div class="attachment-preview" id="attachment-preview">
        ${state.pendingAttachment ? pendingAttachmentMarkup() : ""}
      </div>
      <div class="form-actions">
        <span>最多 2000 字，图片建议小于 700KB</span>
        <button class="primary-button" type="submit">发表帖子</button>
      </div>
    </form>
  `;
}

function pendingAttachmentMarkup() {
  return `
    <div class="preview-card">
      <img src="${escapeHtml(state.pendingAttachment.dataUrl)}" alt="${escapeHtml(state.pendingAttachment.name)}" />
      <div>
        <strong>${escapeHtml(state.pendingAttachment.name)}</strong>
        <span>${Math.ceil(state.pendingAttachment.size / 1024)} KB</span>
      </div>
      <button class="remove-attachment" type="button" aria-label="移除图片">移除</button>
    </div>
  `;
}

function renderPosts() {
  const posts = document.querySelector("#posts");
  if (!posts) return;

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
          ${post.body ? `<p>${escapeHtml(post.body)}</p>` : ""}
          ${attachmentMarkup(post)}
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
  if (!detail) return;

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
      ${state.activePost.body ? `<p>${escapeHtml(state.activePost.body)}</p>` : ""}
      ${attachmentMarkup(state.activePost, "detail")}
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

function renderSinglePostContent() {
  const target = document.querySelector("#single-thread");
  if (!target || !state.activePost) return;

  const comments = state.activePost.comments || [];
  target.innerHTML = `
    <article class="single-thread-card">
      <div class="thread-topic">${escapeHtml(state.activePost.topic_name)}</div>
      <h1>${escapeHtml(state.activePost.title)}</h1>
      ${state.activePost.body ? `<p>${escapeHtml(state.activePost.body)}</p>` : ""}
      ${attachmentMarkup(state.activePost, "detail")}
      <div class="thread-meta">由 ${escapeHtml(state.activePost.username)} 发布 · ${formatTime(state.activePost.created_at)}</div>
    </article>

    <section class="single-comments">
      <div class="single-section-title">
        <h2>留言</h2>
        <span>${comments.length} 条</span>
      </div>
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
            : `<div class="muted-block">这个帖子还没有留言。</div>`
        }
      </div>
    </section>

    ${
      state.user
        ? `
          <form id="comment-form" class="comment-form single-comment-form">
            <textarea name="body" rows="3" maxlength="1000" placeholder="写下你的留言..." required></textarea>
            <button class="primary-button" type="submit">发送留言</button>
          </form>
        `
        : `<div class="login-nudge compact">登录后可以留言</div>`
    }
  `;
}

function bindShellEvents() {
  if (appEventsBound) return;
  appEventsBound = true;

  document.querySelector("#app").addEventListener("click", async (event) => {
    const authButton = event.target.closest("[data-auth]");
    const homeButton = event.target.closest("[data-home]");
    const topicButton = event.target.closest("[data-topic]");
    const postCard = event.target.closest("[data-post-id]");
    const logoutButton = event.target.closest("#logout-button");
    const attachButton = event.target.closest(".attach-button");
    const removeAttachment = event.target.closest(".remove-attachment");
    const imageButton = event.target.closest(".attachment-open");
    const profileButton = event.target.closest(".profile-button");
    const refreshButton = event.target.closest("#refresh-button");
    const accountAction = event.target.closest("[data-account-action]");

    if (homeButton) {
      state.activePost = null;
      shell();
      await loadTopics();
      await loadPosts();
      return;
    }

    if (accountAction) {
      const action = accountAction.dataset.accountAction;
      if (action === "profile" || action === "posts") await openProfileDialog();
      if (action === "security") openSecurityDialog();
      if (action === "logout") await logout();
      return;
    }

    if (refreshButton) {
      await loadPosts();
      return;
    }

    if (authButton) {
      openAuthDialog(authButton.dataset.auth);
      return;
    }

    if (imageButton) {
      const figure = imageButton.closest(".attachment");
      const img = imageButton.querySelector("img");
      const caption = figure?.querySelector("figcaption")?.textContent || "图片";
      openImageViewer(img?.src, caption);
      return;
    }

    if (profileButton) {
      await openProfileDialog();
      return;
    }

    if (attachButton) {
      document.querySelector(".attachment-input")?.click();
      return;
    }

    if (removeAttachment) {
      state.pendingAttachment = null;
      const input = document.querySelector(".attachment-input");
      if (input) input.value = "";
      renderAttachmentPreview();
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

  document.querySelector("#app").addEventListener("change", async (event) => {
    if (event.target.matches(".attachment-input")) {
      await handleAttachmentSelect(event.target);
    }
  });

  document.querySelector("#app").addEventListener("submit", async (event) => {
    if (event.target.id === "search-form") {
      event.preventDefault();
      state.query = document.querySelector("#search-input")?.value.trim() || "";
      await loadPosts();
      return;
    }

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
      <button class="close-button" value="cancel" type="button">×</button>
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
  dialog.querySelector(".close-button").addEventListener("click", () => dialog.close());

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

async function refreshSession() {
  if (!localStorage.getItem(tokenKey)) return;

  try {
    const payload = await api("/api/session");
    state.user = payload.user;
    renderAccount();
  } catch {
    localStorage.removeItem(tokenKey);
    state.user = null;
    renderAccount();
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
    if (document.querySelector("#topic-list")) renderTopics();
    if (document.querySelector("#posts")) renderPosts();
  } catch (err) {
    showFatal(err.message);
  }
}

async function loadPost(id, options = {}) {
  try {
    const payload = await api(`/api/posts/${id}`);
    state.activePost = payload.post;
    if (options.render === false) return;
    if (document.querySelector("#single-thread")) {
      renderSinglePostContent();
    } else {
      renderDetail();
    }
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
    attachment: state.pendingAttachment
      ? {
          name: state.pendingAttachment.name,
          type: state.pendingAttachment.type,
          dataUrl: state.pendingAttachment.dataUrl,
        }
      : null,
  };

  try {
    const payload = await api("/api/posts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    form.reset();
    state.pendingAttachment = null;
    renderAttachmentPreview();
    await loadPosts();
    await loadPost(payload.post.id);
  } catch (err) {
    showToast(err.message);
  }
}

async function handleAttachmentSelect(input) {
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("目前只支持上传图片");
    input.value = "";
    return;
  }

  if (file.size > 700 * 1024) {
    showToast("图片太大了，请选择 700KB 以内的图片");
    input.value = "";
    return;
  }

  try {
    state.pendingAttachment = {
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: await readFileAsDataUrl(file),
    };
    renderAttachmentPreview();
  } catch {
    showToast("图片读取失败，请换一张试试");
    input.value = "";
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function renderAttachmentPreview() {
  const preview = document.querySelector("#attachment-preview");
  if (!preview) return;
  preview.innerHTML = state.pendingAttachment ? pendingAttachmentMarkup() : "";
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
    if (document.querySelector("#single-thread")) {
      renderSinglePostContent();
    } else {
      await loadPosts();
    }
    await refreshSession();
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
  const posts = document.querySelector("#posts");
  if (!posts) {
    showToast(message);
    return;
  }

  posts.innerHTML = `
    <div class="empty-state warning">
      <strong>后端暂时不可用</strong>
      <span>${escapeHtml(message)}。如果刚刚改完代码，请先创建并初始化 Cloudflare D1 数据库。</span>
    </div>
  `;
}

function openImageViewer(src, caption = "图片") {
  if (!src) return;

  const dialog = document.createElement("dialog");
  dialog.className = "image-dialog";
  dialog.innerHTML = `
    <div class="image-viewer">
      <button class="close-button" value="cancel" type="button">×</button>
      <img src="${escapeHtml(src)}" alt="${escapeHtml(caption)}" />
      <p>${escapeHtml(caption)}</p>
    </div>
  `;

  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector(".close-button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
}

async function openProfileDialog() {
  if (!state.user) return;

  const dialog = document.createElement("dialog");
  dialog.className = "profile-dialog";
  dialog.innerHTML = `
    <div class="profile-card">
      <button class="close-button" value="cancel" type="button">×</button>
      <div class="profile-loading">正在打开个人中心...</div>
    </div>
  `;

  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector(".close-button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());

  try {
    const payload = await api("/api/profile");
    state.user = payload.user;
    renderAccount();
    dialog.querySelector(".profile-card").innerHTML = profileMarkup(payload);
    dialog.querySelector(".close-button").addEventListener("click", () => dialog.close());
    dialog.querySelectorAll("[data-profile-post]").forEach((button) => {
      button.addEventListener("click", async () => {
        dialog.close();
        await openSinglePostPage(Number(button.dataset.profilePost));
      });
    });
    dialog.querySelectorAll("[data-profile-comment-post]").forEach((button) => {
      button.addEventListener("click", async () => {
        dialog.close();
        await openSinglePostPage(Number(button.dataset.profileCommentPost));
      });
    });
  } catch (err) {
    dialog.querySelector(".profile-card").innerHTML = `
      <button class="close-button" value="cancel" type="button">×</button>
      <div class="empty-state warning">
        <strong>个人中心打开失败</strong>
        <span>${escapeHtml(err.message)}</span>
      </div>
    `;
    dialog.querySelector(".close-button").addEventListener("click", () => dialog.close());
  }
}

function profileMarkup(payload) {
  const user = payload.user;
  const posts = payload.posts || [];
  const comments = payload.recent_comments || [];

  return `
    <button class="close-button" value="cancel" type="button">×</button>
    <section class="profile-hero">
      <div class="profile-avatar">${escapeHtml(user.username.slice(0, 1).toUpperCase())}</div>
      <div>
        <p class="eyebrow">Profile</p>
        <h2>${escapeHtml(user.username)}</h2>
        <span>已发布 ${Number(user.post_count || 0)} 个帖子 · 收到 ${Number(user.received_comment_count || 0)} 条留言</span>
      </div>
    </section>

    <section class="profile-section">
      <h3>我发表过的帖子</h3>
      <div class="profile-posts">
        ${
          posts.length
            ? posts
                .map(
                  (post) => `
                    <button class="profile-post" type="button" data-profile-post="${post.id}">
                      <strong>${escapeHtml(post.title)}</strong>
                      <span>${escapeHtml(post.topic_name)} · ${formatTime(post.created_at)} · ${Number(post.comment_count || 0)} 条留言</span>
                    </button>
                  `,
                )
                .join("")
            : `<div class="muted-block">还没有发表过帖子。</div>`
        }
      </div>
    </section>

    <section class="profile-section">
      <h3>最近收到的留言</h3>
      <div class="profile-comments">
        ${
          comments.length
            ? comments
                .map(
                  (comment) => `
                    <button class="profile-comment profile-comment-link" type="button" data-profile-comment-post="${comment.post_id}">
                      <strong>${escapeHtml(comment.username)} 评论了《${escapeHtml(comment.post_title)}》</strong>
                      <p>${escapeHtml(comment.body)}</p>
                      <span>${formatTime(comment.created_at)}</span>
                    </button>
                  `,
                )
                .join("")
            : `<div class="muted-block">暂时还没有收到留言。</div>`
        }
      </div>
    </section>
  `;
}

function openSecurityDialog() {
  if (!state.user) return;

  const dialog = document.createElement("dialog");
  dialog.className = "security-dialog";
  dialog.innerHTML = `
    <form class="security-card">
      <button class="close-button" type="button">×</button>
      <p class="eyebrow">Security</p>
      <h2>安全中心</h2>
      <div class="security-summary">
        <strong>${escapeHtml(state.user.username)}</strong>
        <span>修改密码后，请使用新密码登录。</span>
      </div>
      <label>
        当前密码
        <input name="current_password" type="password" autocomplete="current-password" required />
      </label>
      <label>
        新密码
        <input name="new_password" type="password" minlength="6" autocomplete="new-password" required />
      </label>
      <label>
        确认新密码
        <input name="confirm_password" type="password" minlength="6" autocomplete="new-password" required />
      </label>
      <button class="primary-button" type="submit">保存新密码</button>
      <p class="form-error" id="security-error"></p>
    </form>
  `;

  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector(".close-button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());

  dialog.querySelector(".security-card").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const error = dialog.querySelector("#security-error");
    const currentPassword = form.current_password.value;
    const newPassword = form.new_password.value;
    const confirmPassword = form.confirm_password.value;

    if (newPassword !== confirmPassword) {
      error.textContent = "两次输入的新密码不一致";
      return;
    }

    try {
      await api("/api/security/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      dialog.close();
      showToast("密码已修改");
    } catch (err) {
      error.textContent = err.message;
    }
  });
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
