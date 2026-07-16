const sessionDays = 30;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (!env.DB) {
        return json({ error: "Cloudflare D1 数据库还没有绑定到 DB" }, 500);
      }

      await cleanupExpiredSessions(env.DB);

      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true });
      }

      if (request.method === "GET" && url.pathname === "/api/session") {
        const user = await requireUser(request, env.DB);
        return json({ user });
      }

      if (request.method === "POST" && url.pathname === "/api/auth/register") {
        return register(request, env.DB);
      }

      if (request.method === "POST" && url.pathname === "/api/auth/login") {
        return login(request, env.DB);
      }

      if (request.method === "POST" && url.pathname === "/api/auth/logout") {
        return logout(request, env.DB);
      }

      if (request.method === "GET" && url.pathname === "/api/topics") {
        return listTopics(env.DB);
      }

      if (request.method === "GET" && url.pathname === "/api/posts") {
        return listPosts(url, env.DB);
      }

      if (request.method === "POST" && url.pathname === "/api/posts") {
        const user = await requireUser(request, env.DB);
        return createPost(request, env.DB, user);
      }

      const postMatch = url.pathname.match(/^\/api\/posts\/(\d+)$/);
      if (postMatch && request.method === "GET") {
        return getPost(env.DB, Number(postMatch[1]));
      }

      const commentMatch = url.pathname.match(/^\/api\/posts\/(\d+)\/comments$/);
      if (commentMatch && request.method === "POST") {
        const user = await requireUser(request, env.DB);
        return createComment(request, env.DB, user, Number(commentMatch[1]));
      }

      return json({ error: "接口不存在" }, 404);
    } catch (err) {
      if (err.status) {
        return json({ error: err.message }, err.status);
      }

      return json({ error: "服务器暂时不可用" }, 500);
    }
  },
};

async function register(request, db) {
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!username) throw httpError(400, "用户名只能包含中文、英文、数字、下划线和短横线，长度 2-24 位");
  if (password.length < 6) throw httpError(400, "密码至少需要 6 位");

  const existing = await db.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").bind(username).first();
  if (existing) throw httpError(409, "这个用户名已经被注册");

  const salt = randomToken(16);
  const passwordHash = await hashPassword(password, salt);
  const result = await db
    .prepare("INSERT INTO users (username, password_hash, password_salt) VALUES (?, ?, ?)")
    .bind(username, passwordHash, salt)
    .run();

  const user = {
    id: result.meta.last_row_id,
    username,
  };
  const token = await createSession(db, user.id);

  return json({ user, token }, 201);
}

async function login(request, db) {
  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = String(body.password || "");

  if (!username || !password) throw httpError(400, "请输入用户名和密码");

  const row = await db
    .prepare("SELECT id, username, password_hash, password_salt FROM users WHERE lower(username) = lower(?)")
    .bind(username)
    .first();

  if (!row) throw httpError(401, "用户名或密码不正确");

  const passwordHash = await hashPassword(password, row.password_salt);
  if (passwordHash !== row.password_hash) throw httpError(401, "用户名或密码不正确");

  const user = {
    id: row.id,
    username: row.username,
  };
  const token = await createSession(db, user.id);

  return json({ user, token });
}

async function logout(request, db) {
  const token = readToken(request);
  if (token) {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true });
}

async function listTopics(db) {
  const { results } = await db
    .prepare(
      `SELECT
        topics.id,
        topics.slug,
        topics.name,
        topics.description,
        topics.color,
        COUNT(posts.id) AS post_count
      FROM topics
      LEFT JOIN posts ON posts.topic_id = topics.id
      GROUP BY topics.id
      ORDER BY topics.id ASC`,
    )
    .all();

  return json({ topics: results || [] });
}

async function listPosts(url, db) {
  const topic = url.searchParams.get("topic");
  const query = url.searchParams.get("q")?.trim();
  const values = [];
  const filters = [];

  if (topic) {
    filters.push("topics.slug = ?");
    values.push(topic);
  }

  if (query) {
    filters.push("(posts.title LIKE ? OR posts.body LIKE ? OR topics.name LIKE ?)");
    values.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { results } = await db
    .prepare(
      `SELECT
        posts.id,
        posts.title,
        posts.body,
        posts.created_at,
        users.username,
        topics.name AS topic_name,
        topics.slug AS topic_slug,
        COUNT(comments.id) AS comment_count
      FROM posts
      JOIN users ON users.id = posts.user_id
      JOIN topics ON topics.id = posts.topic_id
      LEFT JOIN comments ON comments.post_id = posts.id
      ${where}
      GROUP BY posts.id
      ORDER BY posts.created_at DESC
      LIMIT 80`,
    )
    .bind(...values)
    .all();

  return json({ posts: results || [] });
}

async function getPost(db, postId) {
  const post = await db
    .prepare(
      `SELECT
        posts.id,
        posts.title,
        posts.body,
        posts.created_at,
        users.username,
        topics.name AS topic_name,
        topics.slug AS topic_slug
      FROM posts
      JOIN users ON users.id = posts.user_id
      JOIN topics ON topics.id = posts.topic_id
      WHERE posts.id = ?`,
    )
    .bind(postId)
    .first();

  if (!post) throw httpError(404, "帖子不存在");

  const { results } = await db
    .prepare(
      `SELECT comments.id, comments.body, comments.created_at, users.username
      FROM comments
      JOIN users ON users.id = comments.user_id
      WHERE comments.post_id = ?
      ORDER BY comments.created_at ASC`,
    )
    .bind(postId)
    .all();

  post.comments = results || [];
  return json({ post });
}

async function createPost(request, db, user) {
  const body = await readJson(request);
  const title = cleanText(body.title, 80);
  const content = cleanText(body.body, 2000);
  const topicId = Number(body.topic_id);

  if (!title) throw httpError(400, "帖子标题不能为空");
  if (!content) throw httpError(400, "帖子内容不能为空");
  if (!Number.isInteger(topicId)) throw httpError(400, "请选择话题大类");

  const topic = await db.prepare("SELECT id FROM topics WHERE id = ?").bind(topicId).first();
  if (!topic) throw httpError(400, "话题大类不存在");

  const result = await db
    .prepare("INSERT INTO posts (topic_id, user_id, title, body) VALUES (?, ?, ?, ?)")
    .bind(topicId, user.id, title, content)
    .run();

  return json({ post: { id: result.meta.last_row_id } }, 201);
}

async function createComment(request, db, user, postId) {
  const body = await readJson(request);
  const content = cleanText(body.body, 1000);

  if (!content) throw httpError(400, "留言不能为空");

  const post = await db.prepare("SELECT id FROM posts WHERE id = ?").bind(postId).first();
  if (!post) throw httpError(404, "帖子不存在");

  const result = await db
    .prepare("INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)")
    .bind(postId, user.id, content)
    .run();

  return json({ comment: { id: result.meta.last_row_id } }, 201);
}

async function requireUser(request, db) {
  const token = readToken(request);
  if (!token) throw httpError(401, "请先登录");

  const row = await db
    .prepare(
      `SELECT users.id, users.username
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > datetime('now')`,
    )
    .bind(token)
    .first();

  if (!row) throw httpError(401, "登录已过期，请重新登录");

  return {
    id: row.id,
    username: row.username,
  };
}

async function createSession(db, userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(token, userId, expires)
    .run();

  return token;
}

async function cleanupExpiredSessions(db) {
  await db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "请求内容不是有效 JSON");
  }
}

function readToken(request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function normalizeUsername(value) {
  const username = String(value || "").trim();
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username)) return "";
  return username;
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 120000,
      hash: "SHA-256",
    },
    key,
    256,
  );

  return base64Url(new Uint8Array(bits));
}

function randomToken(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
