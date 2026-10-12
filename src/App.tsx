
import { useState } from "react";
import "./App.css";

type Issue = {
  level: "error" | "warning" | "success";
  message: string;
};

const example = `---
name: example-skill
description: A sample skill for testing SkillFix.
---

# Example Skill

## Instructions
Explain the task and expected behavior here.
`;



const allowedMetadataKeys = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

const frontmatterPattern =
  /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const headingPattern = /^[ \t]{0,3}#{1,6}\s+\S+/m;
const instructionsPattern = /^[ \t]{0,3}#{1,6}\s+Instructions\s*$/im;

function normalizeYamlValue(value: string): string {
  const trimmed = value.trim();
  const quotePattern = /^(['"])([\s\S]*?)\1$/;
  const quotedMatch = trimmed.match(quotePattern);

  if (quotedMatch) {
    return quotedMatch[2].replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }

  return trimmed;
}

function isValidSkillName(value: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.trim());
}

function normalizeSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function sanitizeDescription(value: string): string {
  const cleaned = normalizeYamlValue(value).replace(/\r/g, "").trim();
  return cleaned.length > 1024 ? cleaned.slice(0, 1024) : cleaned;
}

function serializeMetadataValue(key: string, value: string): string {
  const normalized = normalizeYamlValue(value);
  const plainValue =
    key === "name"
      ? normalizeSkillName(normalized)
      : key === "description"
        ? sanitizeDescription(normalized)
        : normalized;

  if (!plainValue) {
    return "";
  }

  const needsQuotes =
    /[:#\[\]{}\n\r"\\]|^\s|\s$/.test(plainValue) ||
    /['"]/.test(plainValue);

  return needsQuotes ? JSON.stringify(plainValue) : plainValue;
}

function extractFrontmatter(content: string) {
  const normalized = content.replace(/^\uFEFF/, "").trimStart();
  const match = normalized.match(frontmatterPattern);

  if (match) {
    return {
      frontmatter: match[1],
      body: normalized.slice(match[0].length).replace(/^\r?\n/, ""),
      malformed: false,
    };
  }

  if (normalized.startsWith("---")) {
    const lines = normalized.split(/\r?\n/);
    return {
      frontmatter: "",
      body: lines.slice(1).join("\n"),
      malformed: true,
    };
  }

  return {
    frontmatter: "",
    body: normalized,
    malformed: false,
  };
}

function validateSkill(content: string): Issue[] {
  const issues: Issue[] = [];

  if (!content.trim()) {
    return [{ level: "error", message: "Your skill file is empty." }];
  }

  const { frontmatter, malformed } = extractFrontmatter(content);

  if (!frontmatter && !malformed) {
    issues.push({
      level: "error",
      message:
        "Missing or malformed YAML frontmatter. Add opening and closing --- lines.",
    });
  } else if (malformed) {
    issues.push({
      level: "error",
      message:
        "Malformed YAML frontmatter. Add a closing --- delimiter to finish the metadata section.",
    });
  } else {
    const metadata = frontmatter;
    const lines = metadata.split(/\r?\n/);
    const values = new Map<string, string>();

    lines.forEach((line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) return;

      const match = trimmed.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);

      if (!match) {
        issues.push({
          level: "error",
          message: `Invalid metadata line: "${trimmed}". Use key: value format.`,
        });
        return;
      }

      const rawKey = match[1];
      const key = rawKey.toLowerCase();
      const value = normalizeYamlValue(match[2]);

      if (!allowedMetadataKeys.has(key)) {
        issues.push({
          level: "error",
          message: `Unknown metadata field "${key}".`,
        });
        return;
      }

      if (values.has(key)) {
        issues.push({
          level: "error",
          message: `Duplicate metadata field "${key}".`,
        });
        return;
      }

      values.set(key, value);

      if (!value && key !== "metadata") {
        issues.push({
          level: "error",
          message: `Metadata field "${key}" has an empty value.`,
        });
      }
    });

    const name = values.get("name");
    const description = values.get("description");

    if (!name) {
      issues.push({
        level: "error",
        message: "Missing name metadata. Add a non-empty name field.",
      });
    } else {
      if (name.length > 64) {
        issues.push({
          level: "error",
          message: "Skill name must be 64 characters or fewer.",
        });
      }

      if (!isValidSkillName(name)) {
        issues.push({
          level: "error",
          message:
            "Skill name must use lowercase letters, numbers, and single hyphens only.",
        });
      }
    }

    if (!description) {
      issues.push({
        level: "error",
        message: "Missing description metadata. Add a non-empty description field.",
      });
    } else if (description.length > 1024) {
      issues.push({
        level: "error",
        message: "Description must be 1024 characters or fewer.",
      });
    }
  }

  if (!headingPattern.test(content)) {
    issues.push({
      level: "warning",
      message: "Add a descriptive Markdown heading.",
    });
  }

  if (!instructionsPattern.test(content)) {
    issues.push({
      level: "warning",
      message: "Consider adding an Instructions section to organize your skill.",
    });
  }

  if (issues.length === 0) {
    issues.push({
      level: "success",
      message: "All current SkillFix checks passed!",
    });
  }

  return issues;
}

function autoFixSkill(content: string): string {
  const text = content.replace(/^\uFEFF/, "").trim();

  if (!text) {
    return `---
name: my-skill
description: Describe what this skill does and when to use it.
---

# My Skill

## Instructions
Add your skill instructions here.
`;
  }

  const { frontmatter, body } = extractFrontmatter(text);
  const values = new Map<string, string>();

  // Keep valid metadata fields and discard malformed or unknown lines.
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);

    if (!match) continue;

    const key = match[1].toLowerCase();
    const value = normalizeYamlValue(match[2]);

    if (!allowedMetadataKeys.has(key) || values.has(key)) continue;
    if (!value && key !== "metadata") continue;

    values.set(key, value);
  }

  // Repair the skill name instead of replacing it unnecessarily.
  const originalName = values.get("name") || "my-skill";
  let name = normalizeSkillName(originalName);

  if (!name) name = "my-skill";
  if (name.length > 64) name = name.slice(0, 64).replace(/-+$/, "");

  values.set("name", name);

  // Supply a description when missing.
  const description = sanitizeDescription(values.get("description") || "");

  values.set(
    "description",
    description || "Describe what this skill does and when to use it."
  );

  const metadata = [
    `name: ${values.get("name")}`,
    `description: ${JSON.stringify(values.get("description"))}`,
    ...Array.from(values.entries())
      .filter(([key]) => key !== "name" && key !== "description")
      .map(([key, value]) => `${key}: ${serializeMetadataValue(key, value)}`)
  ].join("\n");

  let nextBody = body.trim();

  if (!nextBody) {
    nextBody = "# My Skill\n\n## Instructions\nAdd your skill instructions here.";
  }

  if (!headingPattern.test(nextBody)) {
    nextBody = `# My Skill\n\n${nextBody}`;
  }

  if (!instructionsPattern.test(nextBody)) {
    nextBody += "\n\n## Instructions\nAdd your skill instructions here.";
  }

  return `---\n${metadata}\n---\n\n${nextBody.trim()}\n`;
}

function App() {
  const [content, setContent] = useState(example);
  const [issues, setIssues] = useState<Issue[] | null>(null);

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (file) {
      setContent(await file.text());
      setIssues(null);
    }

    event.target.value = "";
  }

  function handleAutoFix() {
  console.log("AUTO-FIX CLICKED", content);

  const fixed = autoFixSkill(content);

  console.log("AUTO-FIX OUTPUT", fixed);

  setContent(fixed);
  setIssues(validateSkill(fixed));
}

  function exportFile() {
    const blob = new Blob([content], {
      type: "text/markdown;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "SKILL.md";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">S</span>
          <div>
            <h1>SkillFix</h1>
            <p>Agent Skill Validator</p>
          </div>
        </div>
        <span className="local-badge">● Runs locally</span>
      </header>

      <section className="intro">
        <p className="eyebrow">DEVELOPER TOOLKIT / 01</p>
        <h2>Make your skills ready for agents.</h2>
        <p>Inspect your SKILL.md file, find common mistakes, and export it.</p>
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Skill file</h3>
              <p>Edit or import Markdown</p>
            </div>
            <label className="button secondary">
              Import file
              <input
                type="file"
                accept=".md,.markdown,.txt"
                onChange={importFile}
                hidden
              />
            </label>
          </div>

          <textarea
            aria-label="Skill Markdown content"
            spellCheck={false}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setIssues(null);
            }}
          />

          <div className="editor-footer">
            <span>{content.length} characters</span>

            <div className="editor-actions">
              <button
                className="button secondary"
                onClick={handleAutoFix}
              >
                Auto-fix
              </button>

              <button
                className="button primary"
                onClick={() => setIssues(validateSkill(content))}
              >
                Validate skill →
              </button>
            </div>
          </div>
        </div>

        <div className="panel results-panel">
          <div className="panel-heading">
            <div>
              <h3>Validation results</h3>
              <p>Structure and metadata checks</p>
            </div>
          </div>

          {!issues ? (
            <div className="empty-state">
              <span className="empty-icon">⌕</span>
              <h3>Ready to inspect</h3>
              <p>Click Validate skill to see your results.</p>
            </div>
          ) : (
            <div className="issue-list" aria-live="polite">
              {issues.map((issue, index) => (
                <div className="issue" key={`${issue.message}-${index}`}>
                  <span className={`issue-icon ${issue.level}`}>
                    {issue.level === "error"
                      ? "!"
                      : issue.level === "success"
                        ? "✓"
                        : "i"}
                  </span>
                  <div>
                    <strong>{issue.level.toUpperCase()}</strong>
                    <p>{issue.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="export-area">
            <button className="button secondary full" onClick={exportFile}>
              Export SKILL.md ↓
            </button>
            <p>Export saves your current content. Fix suggestions come next.</p>
          </div>
        </div>
      </section>

      <footer>SkillFix · Built for the agent skills ecosystem</footer>
    </main>
  );
}

export default App;
