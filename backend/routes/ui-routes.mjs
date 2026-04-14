import path from "node:path";

const PROTECTED_UI_PATHS = new Set(["/dashboard.html", "/fragen", "/groups", "/konten", "/aktien", "/einstellungen", "/nachrichten"]);
const PROTECTED_UI_PREFIXES = ["/fragen/", "/groups/", "/konten/", "/aktien/", "/js/", "/einstellungen/", "/nachrichten/"];
const UI_ROOT_REDIRECTS = new Map([
  ["/groups", "/groups/"],
  ["/fragen", "/fragen/"],
  ["/aktien", "/aktien/"],
  ["/konten", "/konten/"],
  ["/einstellungen", "/einstellungen/"],
  ["/nachrichten", "/nachrichten/"],
  ["/homepage", "/homepage/"]
]);
const STATIC_EXACT_FILES = new Map([
  ["/", ["frontend", "dashboard", "index.html"]],
  ["/dashboard.html", ["frontend", "dashboard", "dashboard.html"]],
  ["/dashboard.css", ["frontend", "dashboard", "dashboard.css"]],
  ["/style.css", ["frontend", "dashboard", "style.css"]],
  ["/script.js", ["frontend", "dashboard", "js", "script.js"]]
]);
const STATIC_SECTION_ROUTES = [
  { basePath: "/homepage", directory: path.join("frontend", "homepage"), indexFile: "index.html" },
  { basePath: "/groups", directory: path.join("frontend", "groups"), indexFile: "index.html" },
  { basePath: "/fragen", directory: path.join("frontend", "questions"), indexFile: "index.html" },
  { basePath: "/aktien", directory: path.join("frontend", "stocks"), indexFile: "ShareView.html" },
  { basePath: "/konten", directory: path.join("frontend", "accounts"), indexFile: "index.html" },
  { basePath: "/einstellungen", directory: path.join("frontend", "einstellungen"), indexFile: "index.html" },
  { basePath: "/nachrichten", directory: path.join("frontend", "nachrichten"), indexFile: "index.html" }
];

export function isProtectedUiPath(pathname) {
  if (pathname === "/js/script.js") return false;
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
    return path.join(projectRoot, "frontend", "dashboard", pathname.slice(1));
  }

  if (pathname.startsWith("/shared/")) {
    return path.join(projectRoot, "frontend", pathname.slice(1));
  }

  if (pathname.startsWith("/global-information/")) {
    return path.join(projectRoot, "frontend", "data", pathname.slice("/global-information/".length));
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
