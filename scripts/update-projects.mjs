// Fetches the owner's public repositories from the GitHub REST API and
// rewrites the Projects list in index.html between the marker comments.
import { readFile, writeFile } from "node:fs/promises";

const OWNER = process.env.GITHUB_OWNER ?? "Togo-Iwasaki";
const INDEX_PATH = new URL("../index.html", import.meta.url);
const START_MARKER = "<!-- projects:start -->";
const END_MARKER = "<!-- projects:end -->";
const EXCLUDED_REPOS = new Set([OWNER, `${OWNER}.github.io`].map((name) => name.toLowerCase()));
const INDENT = "        ";

async function fetchRepos() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const repos = [];
  let url = `https://api.github.com/users/${OWNER}/repos?type=owner&sort=pushed&per_page=100`;
  while (url) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`);
    }
    repos.push(...(await response.json()));
    url = response.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return repos;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderRepo(repo) {
  const meta = [repo.language, `Updated ${repo.pushed_at.slice(0, 7)}`].filter(Boolean).join(" &middot; ");
  const lines = [
    `${INDENT}<li>`,
    `${INDENT}  <a href="${escapeHtml(repo.html_url)}">${escapeHtml(repo.name)}</a>`,
  ];
  if (repo.description) {
    lines.push(`${INDENT}  <span class="desc">${escapeHtml(repo.description)}</span>`);
  }
  lines.push(`${INDENT}  <span class="note">${meta}</span>`, `${INDENT}</li>`);
  return lines.join("\n");
}

async function main() {
  const repos = (await fetchRepos())
    .filter((repo) => !repo.fork && !repo.archived && !repo.private)
    .filter((repo) => !EXCLUDED_REPOS.has(repo.name.toLowerCase()))
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));

  const html = await readFile(INDEX_PATH, "utf8");
  const start = html.indexOf(START_MARKER);
  const end = html.indexOf(END_MARKER);
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Projects markers were not found in index.html");
  }

  const body = repos.length > 0 ? repos.map(renderRepo).join("\n") : `${INDENT}<li class="note">No public projects yet.</li>`;
  const updated = `${html.slice(0, start + START_MARKER.length)}\n${body}\n${INDENT}${html.slice(end)}`;

  if (updated === html) {
    console.log(`No changes (${repos.length} projects)`);
    return;
  }
  await writeFile(INDEX_PATH, updated);
  console.log(`Updated index.html with ${repos.length} projects`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
