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
  RESEND_API_KEY?: string;
  BREVO_API_KEY?: string;
  EMAIL_FROM: string;
  DEV_EXPOSE_VERIFICATION_CODE?: string;
  FINNHUB_API_KEY?: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_API_KEY_2?: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_APP_NAME: string;
  OPENROUTER_SITE_URL?: string;
  LOGO_DEV_API_KEY?: string;
  FRONTEND_ORIGIN?: string;
  NODE_ENV?: string;
  FINZBRO_BOT_EMAIL?: string;
}
