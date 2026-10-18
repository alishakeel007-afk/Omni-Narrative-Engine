import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const styles = read("app/globals.css");
const navbar = read("components/navbar.tsx");
const projects = read("screens/MyProjectsScreen.tsx");
const preview = read("components/synchronized-story-preview.tsx");

assert(styles.includes(":focus-visible"), "Global keyboard focus styling is missing.");
assert(styles.includes("prefers-reduced-motion: reduce"), "Reduced-motion support is missing.");
assert(navbar.includes('event.key === "Escape"'), "Profile menu does not close with Escape.");
assert(navbar.includes('aria-haspopup="menu"'), "Profile trigger is missing menu semantics.");
assert(navbar.includes('aria-label="Primary navigation"'), "Mobile navigation lacks an accessible label.");
assert(projects.includes("Guided and Custom projects"), "My Projects loading state is not workflow-neutral.");
assert(projects.includes("No projects in progress"), "My Projects empty state is still workflow-specific.");
assert(preview.includes('role="progressbar"'), "Preview progress is not exposed to assistive technology.");
assert(preview.includes('aria-label="Story preview controls"'), "Preview controls lack a group label.");
assert(preview.includes("sm:w-auto"), "Preview controls do not include responsive button sizing.");

console.log("STEP 127 UI polish regression checks passed.");
