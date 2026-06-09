// @ts-check
import path from "node:path";
// @ts-check
const PROTECTED_UI_PREFIXES = [
  "/pages/dashboard/",
  "/pages/questions/",
  "/pages/groups/",
  "/pages/accounts/",
  "/pages/stocks/",
  "/pages/settings/",
];

// Short URLs without trailing slash → redirect to canonical form
const UI_ROOT_REDIRECTS = new Map([
  ["/pages/groups", "/pages/groups/"],
  ["/pages/questions", "/pages/questions/"],
  ["/pages/stocks", "/pages/stocks/"],
  ["/pages/accounts", "/pages/accounts/"],
  ["/pages/settings", "/pages/settings/"],
  ["/pages/homepage", "/pages/homepage/"],
]);

/** @param {string} pathname */
export function isProtectedUiPath(pathname) {
  return PROTECTED_UI_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * @param {string} pathname
 * @param {http.ServerResponse} res
 */
export function redirectUiRoot(pathname, res) {
  const target = UI_ROOT_REDIRECTS.get(pathname);
  if (!target) return false;
  res.writeHead(302, { Location: target });
  res.end();
  return true;
}

/**
 * Resolve a URL pathname to a file path in the Vite dist output.
 * @param {string} projectRoot
 * @param {string} pathname
 */
export function resolveStaticPath(projectRoot, pathname) {
  // Serve built frontend from frontend/dist
  const distRoot = path.join(projectRoot, "frontend", "dist");

  // Root auth/landing page
  if (pathname === "/") return path.join(distRoot, "index.html");

  // Hashed assets from Vite build — serve directly
  if (pathname.startsWith("/assets/")) {
    return path.join(distRoot, pathname.slice(1));
  }

  // Section index pages
  const sectionMap = new Map([
    ["/pages/accounts/", path.join(distRoot, "pages", "accounts", "index.html")],
    ["/pages/groups/", path.join(distRoot, "pages", "groups", "index.html")],
    ["/pages/settings/", path.join(distRoot, "pages", "settings", "index.html")],
    ["/pages/homepage/", path.join(distRoot, "pages", "homepage", "index.html")],
    ["/pages/questions/", path.join(distRoot, "pages", "questions", "index.html")],
    ["/pages/stocks/", path.join(distRoot, "pages", "stocks", "index.html")],
    ["/pages/dashboard/", path.join(distRoot, "index.html")], // auth page — no separate copy
  ]);

  const sectionRoot = sectionMap.get(pathname);
  if (sectionRoot) return sectionRoot;

  // All other paths: map directly from dist root (covers /pages/**/* and public assets)
  return path.join(distRoot, pathname.slice(1));
}

/**
 * Resolve the 404 HTML page path.
 * @param {string} projectRoot
 */
export function resolve404Path(projectRoot) {
  return path.join(projectRoot, "frontend", "dist", "pages", "404", "index.html");
}
