// Pure helper functions (no browser APIs), so they are easy to test.

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Group clips by page URL and number the sources 1, 2, 3...
function buildSources(clips) {
  const map = new Map();
  clips.forEach((c) => {
    const key = c.source.url || c.source.title;
    if (!map.has(key)) map.set(key, { n: map.size + 1, title: c.source.title, url: c.source.url });
  });
  return map;
}

function words(s) {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\u0900-\u097f\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
}
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let common = 0;
  A.forEach((w) => { if (B.has(w)) common++; });
  return common / Math.min(A.size, B.size) > 0.75;
}

// Offline "demo mode": merges clips without AI (removes repeated sentences, keeps sources).
function localNote(topic, clips) {
  const sources = buildSources(clips);
  const kept = [];
  clips.filter((c) => c.type === "text").forEach((c) => {
    const n = sources.get(c.source.url || c.source.title).n;
    c.content.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 15).forEach((s) => {
      if (!kept.some((k) => similar(k.text, s))) kept.push({ text: s, n });
    });
  });
  const imgs = clips.filter((c) => c.type === "image");
  let md = "# " + (topic || "Research Note") + "\n\n";
  md += "> Demo mode (no AI key set): repeated points are removed and sources are kept. Add an API key in Settings for the full AI note.\n\n";
  md += "## Key points\n";
  md += kept.length ? kept.map((k) => "- " + k.text + " [Source " + k.n + "]").join("\n") : "- No text clips yet.";
  if (imgs.length) md += "\n\n## Images marked\n" + imgs.map((c) => "- Image from Source " + sources.get(c.source.url || c.source.title).n).join("\n");
  md += "\n\n## Sources\n" + [...sources.values()].map((s) => s.n + ". " + s.title + (s.url ? " - " + s.url : "")).join("\n");
  return md;
}

// Builds the message that is sent to the AI model.
function buildPrompt(topic, clips, level, language) {
  const sources = buildSources(clips);
  const blocks = [];
  blocks.push({
    type: "text",
    text:
      "You are ResearchMate, a study assistant. A student marked the clips below while researching the topic \"" + (topic || "unspecified") + "\".\n" +
      "Write ONE well-organized study note in " + language + " at " + level + " level.\n" +
      "Rules:\n" +
      "- Structure: Title, Overview, Key Concepts (basics first, advanced later), Explanation, Summary, Sources.\n" +
      "- Merge the clips, remove repeated points, and fix awkward wording.\n" +
      "- If sources disagree, add a short 'Conflicting information' section.\n" +
      "- For every image clip, explain in one or two sentences what it shows and where it fits.\n" +
      "- Mention the source as [Source N] after facts. Use only the clips given; do not invent facts.\n" +
      "- Use simple Markdown (#, ##, -, **bold**).\n\nCLIPS:",
  });
  clips.forEach((c, i) => {
    const n = sources.get(c.source.url || c.source.title).n;
    if (c.type === "text") {
      blocks.push({ type: "text", text: "\n[Clip " + (i + 1) + ", Source " + n + ", text]\n" + c.content });
    } else {
      blocks.push({ type: "text", text: "\n[Clip " + (i + 1) + ", Source " + n + ", image]" });
      blocks.push({ type: "image", source: { type: "url", url: c.content } });
    }
  });
  blocks.push({
    type: "text",
    text: "\nSOURCES:\n" + [...sources.values()].map((s) => s.n + ". " + s.title + (s.url ? " - " + s.url : "")).join("\n"),
  });
  return blocks;
}

// Very small Markdown to HTML converter (safe: escapes HTML first).
function renderMarkdown(md) {
  const lines = escapeHtml(md).split("\n");
  let html = "", inList = false;
  const inline = (t) =>
    t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  lines.forEach((l) => {
    if (/^\s*[-*]\s+/.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += "<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>"; return; }
    closeList();
    if (/^###\s+/.test(l)) html += "<h4>" + inline(l.replace(/^###\s+/, "")) + "</h4>";
    else if (/^##\s+/.test(l)) html += "<h3>" + inline(l.replace(/^##\s+/, "")) + "</h3>";
    else if (/^#\s+/.test(l)) html += "<h2>" + inline(l.replace(/^#\s+/, "")) + "</h2>";
    else if (/^&gt;\s?/.test(l)) html += '<p class="quote">' + inline(l.replace(/^&gt;\s?/, "")) + "</p>";
    else if (l.trim()) html += "<p>" + inline(l) + "</p>";
  });
  closeList();
  return html;
}

if (typeof module !== "undefined") module.exports = { localNote, buildPrompt, renderMarkdown, buildSources };
