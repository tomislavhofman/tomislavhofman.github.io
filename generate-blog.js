const fs = require('fs');
const path = require('path');
const marked = require('marked');

const POSTS_DIR = path.join(__dirname, 'posts');
const BLOG_HTML = path.join(__dirname, 'blog.html');
const BLOG_TEMPLATE = path.join(__dirname, 'blog.template.html');
const POST_TEMPLATE = path.join(__dirname, 'blog-post.template.html');

// Read template
let template = fs.readFileSync(BLOG_TEMPLATE, 'utf8');

// Read post template
let postTemplate = fs.existsSync(POST_TEMPLATE)
  ? fs.readFileSync(POST_TEMPLATE, 'utf8')
  : template;

// Read all posts
const postFiles = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));

// Parse frontmatter and content
function parsePost(filePath) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const match = raw.match(/^---([\s\S]*?)---([\s\S]*)$/);
    if (!match) return null;
    const meta = {};
    match[1].split('\n').forEach(line => {
        const [key, ...rest] = line.split(':');
        if (key && rest.length) meta[key.trim()] = rest.join(':').trim();
    });
    // Parse excerpt if present
    let content = match[2].trim();
    let excerpt = '';
    const excerptMatch = content.match(/<!--\s*excerpt\s*-->([\s\S]*?)<!--\s*endexcerpt\s*-->/i);
    if (excerptMatch) {
        excerpt = excerptMatch[1].trim();
        // Remove excerpt block from content for full post
        content = content.replace(excerptMatch[0], '').trim();
    }
    return {
        ...meta,
        content,
        excerpt,
        html: marked.parse(content),
        excerptHtml: excerpt ? marked.parse(excerpt) : ''
    };
}

const posts = postFiles.map(f => parsePost(path.join(POSTS_DIR, f)))
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));

// Render posts list with links
const postsHtml = posts.map(post => `
<li>
  <article class="blog-post">
    <h2><a href="posts/${post.slug}.html">${post.title}</a> – ${post.date}</h2>
    <div>${post.excerptHtml || ''}</div>
  </article>
</li>
`).join('\n');

// Only replace the blog-list (<!-- BLOG_POSTS -->) in the template
const output = template.replace('<!-- BLOG_POSTS -->', postsHtml);

fs.writeFileSync(BLOG_HTML, output);

// Generate individual post pages
posts.forEach(post => {
  // Only replace <!-- BLOG_POST_CONTENT --> in the post template
  const postHtml = postTemplate.replace('<!-- BLOG_POST_CONTENT -->', post.html);
  fs.writeFileSync(path.join(__dirname, 'posts', `${post.slug}.html`), postHtml);
});

// Configure marked to add language- prefix for code blocks
const escapeHtml = (str) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderer = new marked.Renderer();
renderer.code = (code, infostring, escaped) => {
  const lang = (infostring || '').match(/\S*/)[0];
  const escapedCode = escapeHtml(code);
  if (lang === 'kotlin') {
    return `<pre><code class="language-kotlin" data-lang="kotlin">${escapedCode}</code></pre>\n`;
  }
  const langClass = lang ? `language-${lang}` : '';
  return `<pre><code class="${langClass}">${escapedCode}</code></pre>\n`;
};
marked.setOptions({ renderer });

console.log('blog.html and individual post pages generated with', posts.length, 'posts.');
