// Cloudflare Workers environment bindings
export interface Env {
  // KV
  SESSIONS: KVNamespace;
  // Hyperdrive (database)
  HYPERDRIVE?: Hyperdrive;
  // Legacy direct postgres (fallback)
  DATABASE_URL?: string;
  // Supabase REST API (optional alternative)
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SESSION_COOKIE_NAME: string;
  SESSION_TTL_MINUTES: string;
  EMAIL_CODE_TTL_MINUTES: string;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  STOCK_API_URL: string;
  STOCK_API_KEY: string;
  TWELVE_DATA_API_KEY?: string;
  FINNHUB_API_KEY?: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_API_KEY_2?: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_APP_NAME: string;
  OPENROUTER_SITE_URL?: string;
  STOCK_SEARCH_DEFAULT_EXCHANGE: string;
  LOGO_DEV_API_KEY?: string;
  CODE_HMAC_SECRET?: string;
  FRONTEND_ORIGIN?: string;
  NODE_ENV?: string;
  FINZBRO_BOT_EMAIL?: string;
}
