const BASE_DB_NAME = process.env.MONGODB_DB || "finanzapp";

export const PORT = Number(process.env.PORT || 3000);
export const DATABASE_URL = process.env.DATABASE_URL || "";

export const VERIFICATION_TTL_MINUTES = Number(process.env.EMAIL_CODE_TTL_MINUTES || 15);
export const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 180);
export const SESSION_COOKIE_NAME = "finanzapp_session";

export const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
export const TWELVE_DATA_API_KEY = String(process.env.TWELVE_DATA_API_KEY || process.env.TWELVE_API_KEY || "").trim();
export const EXCHANGE_RATE_BASE_URL = "https://v6.exchangerate-api.com/v6";
export const EXCHANGE_RATE_API_KEY = String(
  process.env.EXCHANGE_RATE_API_KEY || process.env.EXCHANGERATE_API_KEY || process.env.EXCHANGE_API_KEY || ""
).trim();
export const STOCK_SEARCH_BASE_URL = String(
  process.env.STOCK_SEARCH_BASE_URL || process.env.STOCK_API_BASE_URL || "http://3.225.21.161"
).trim();
export const STOCK_API_KEY = String(process.env.STOCK_API_KEY || "").trim();
export const STOCK_SEARCH_DEFAULT_EXCHANGE = String(process.env.STOCK_SEARCH_DEFAULT_EXCHANGE || "NASDAQ")
  .trim()
  .toUpperCase();
export const LOGO_DEV_BASE_URL = String(process.env.LOGO_DEV_BASE_URL || "https://img.logo.dev").trim();
export const LOGO_DEV_API_KEY = String(process.env.LOGO_DEV_API_KEY || process.env.LOGODEV_API_KEY || "").trim();

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_API_KEY = String(process.env.OPENROUTER_API_KEY || "").trim();
export const OPENROUTER_API_KEY_2 = String(process.env.OPENROUTER_API_KEY_2 || "").trim();
export const OPENROUTER_MODEL = "arcee-ai/trinity-large-preview:free";
export const OPENROUTER_SITE_URL = String(process.env.OPENROUTER_SITE_URL || "http://localhost:3000").trim();
export const OPENROUTER_APP_NAME = String(process.env.OPENROUTER_APP_NAME || "FinanzApp").trim();

export const FINZBRO_USERNAME = "finzbro";
export const FINZBRO_EMAIL = String(process.env.FINZBRO_BOT_EMAIL || "finzbro@finanzapp.local").trim().toLowerCase();
export const FINZBRO_MENTION_REGEX = /@finzbro\b/i;

export const SMTP_HOST = process.env.SMTP_HOST || "";
export const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
export const SMTP_SECURE = process.env.SMTP_SECURE === "true";
export const SMTP_USER = process.env.SMTP_USER || "";
export const SMTP_PASS = process.env.SMTP_PASS || "";
export const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

export const PRESET_INCOME_CATEGORY_KEYS = new Set(["salary", "freelance", "bonus", "refund", "investment", "other"]);
export const PRESET_EXPENSE_CATEGORY_KEYS = new Set(["rent", "groceries", "utilities", "transport", "health", "entertainment", "other"]);

export const MIME_BY_EXT = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

export const QUESTION_TOPIC_MAX_LENGTH = 80;
export const QUESTION_MESSAGE_MAX_LENGTH = 4000;
export const ANSWER_MESSAGE_MAX_LENGTH = 4000;
