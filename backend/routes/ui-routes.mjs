import path from "node:path";

const PROTECTED_UI_PATHS = new Set(["/dashboard.html", "/fragen", "/groups", "/konten", "/aktien"]);
const PROTECTED_UI_PREFIXES = ["/fragen/", "/groups/", "/konten/", "/aktien/", "/js/dashboard/"];
const UI_ROOT_REDIRECTS = new Map([
  ["/groups", "/groups/"],
  ["/fragen", "/fragen/"],
  ["/aktien", "/aktien/"],
  ["/konten", "/konten/"]
]);
const STATIC_EXACT_FILES = new Map([
  ["/", ["uebersicht", "index.html"]],
  ["/dashboard.html", ["uebersicht", "dashboard.html"]],
  ["/dashboard.css", ["uebersicht", "dashboard.css"]],
  ["/style.css", ["uebersicht", "style.css"]],
  ["/script.js", ["uebersicht", "script.js"]]
]);
const STATIC_SECTION_ROUTES = [
  { basePath: "/groups", directory: "groups", indexFile: "index.html" },
  { basePath: "/fragen", directory: "fragen", indexFile: "index.html" },
  { basePath: "/aktien", directory: "aktien", indexFile: "ShareView.html" },
  { basePath: "/konten", directory: "konten", indexFile: "index.html" }
];

export function isProtectedUiPath(pathname) {
  if (PROTECTED_UI_PATHS.has(pathname)) return true;
  return PROTECTED_UI_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function redirectUiRoot(pathname, res) {
  const target = UI_ROOT_REDIRECTS.get(pathname);
  if (!target) return false;
  res.writeHead(302, { Location: target });
  res.end();
  return true;
}

export function resolveStaticPath(projectRoot, pathname) {
  const exactFile = STATIC_EXACT_FILES.get(pathname);
  if (exactFile) return path.join(projectRoot, ...exactFile);

  if (pathname.startsWith("/js/")) {
    return path.join(projectRoot, "uebersicht", pathname.slice(1));
  }

  for (const route of STATIC_SECTION_ROUTES) {
    if (pathname === `${route.basePath}/`) {
      return path.join(projectRoot, route.directory, route.indexFile);
    }
    if (pathname.startsWith(`${route.basePath}/`)) {
      const relative = pathname.slice(route.basePath.length + 1);
      return path.join(projectRoot, route.directory, relative);
    }
  }

  return path.join(projectRoot, pathname.slice(1));
}
