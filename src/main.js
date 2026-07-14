import "./styles.css";

const posts = [
  {
    title: "我的第一篇博客",
    category: "随笔",
    date: "2026-07-14",
    minutes: 3,
    image:
      "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80",
    excerpt:
      "这是博客上线前的第一篇文章，用来记录建站过程、写作计划，以及一点点开始公开表达的兴奋。",
  },
  {
    title: "如何把网站部署到 Cloudflare Pages",
    category: "技术",
    date: "2026-07-14",
    minutes: 5,
    image:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80",
    excerpt:
      "从本地构建、上传 GitHub，到连接 Cloudflare Pages，整理一条适合新手的发布路线。",
  },
  {
    title: "最近在学的东西",
    category: "学习",
    date: "2026-07-13",
    minutes: 4,
    image:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    excerpt:
      "把零散学习变成稳定输出：每天记一点，项目做一点，问题复盘一点。",
  },
  {
    title: "给未来网站加点什么",
    category: "计划",
    date: "2026-07-12",
    minutes: 2,
    image:
      "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80",
    excerpt:
      "下一步可以加文章详情页、评论系统、访问统计、自定义域名和更完整的个人介绍。",
  },
];

const categories = ["全部", ...new Set(posts.map((post) => post.category))];

function postCard(post) {
  return `
    <article class="post-card">
      <img src="${post.image}" alt="${post.title}" loading="lazy" />
      <div class="post-content">
        <div class="post-meta">
          <span>${post.category}</span>
          <span>${post.date}</span>
          <span>${post.minutes} 分钟</span>
        </div>
        <h3>${post.title}</h3>
        <p>${post.excerpt}</p>
        <a href="#" aria-label="阅读 ${post.title}">阅读全文</a>
      </div>
    </article>
  `;
}

function renderPosts(category = "全部") {
  const filtered =
    category === "全部"
      ? posts
      : posts.filter((post) => post.category === category);

  document.querySelector("#posts").innerHTML = filtered.map(postCard).join("");

  document.querySelectorAll(".category-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === category);
  });
}

document.querySelector("#app").innerHTML = `
  <header class="site-header">
    <a class="brand" href="#">李润的博客</a>
    <nav aria-label="主导航">
      <a href="#posts-section">文章</a>
      <a href="#about">关于</a>
      <a href="mailto:hello@example.com">联系</a>
    </nav>
  </header>

  <main>
    <section class="featured">
      <div class="featured-copy">
        <p class="eyebrow">Personal Blog</p>
        <h1>记录学习、项目和生活里的新发现</h1>
        <p>
          这是一个简易个人博客模板，已经适配 Cloudflare Pages。你可以先部署上线，
          再慢慢替换文章、头像、域名和个人介绍。
        </p>
      </div>
      <img
        src="https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80"
        alt="桌面上的电脑和笔记本"
      />
    </section>

    <section class="section-heading" id="posts-section">
      <div>
        <p class="eyebrow">Latest Posts</p>
        <h2>最新文章</h2>
      </div>
      <div class="categories" aria-label="文章分类">
        ${categories
          .map(
            (category) =>
              `<button class="category-button" data-category="${category}" type="button">${category}</button>`,
          )
          .join("")}
      </div>
    </section>

    <section class="posts" id="posts" aria-live="polite"></section>

    <section class="about" id="about">
      <div>
        <p class="eyebrow">About</p>
        <h2>你好，我是李润</h2>
      </div>
      <p>
        这里可以写你的个人介绍，比如专业方向、正在做的项目、学习笔记、作品集链接。
        现在它只是一个起点，但已经可以发布到公网让别人访问。
      </p>
    </section>
  </main>
`;

document.querySelectorAll(".category-button").forEach((button) => {
  button.addEventListener("click", () => renderPosts(button.dataset.category));
});

renderPosts();
