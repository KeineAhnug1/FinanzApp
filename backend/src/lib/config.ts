import type { Env } from '@/types';

export function getConfig(env: Env) {
  return {
    supabaseUrl: env.SUPABASE_URL,
    supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? 'finanzapp_session',
    sessionTtlMinutes: Number(env.SESSION_TTL_MINUTES ?? 180),
    emailCodeTtlMinutes: Number(env.EMAIL_CODE_TTL_MINUTES ?? 15),
    resendApiKey: env.RESEND_API_KEY ?? '',
    emailFrom: env.EMAIL_FROM ?? 'FinanzApp <noreply@finanzapp.local>',
    stockApiUrl: env.STOCK_API_URL ?? '',
    stockApiKey: env.STOCK_API_KEY ?? '',
    twelveDataApiKey: env.TWELVE_DATA_API_KEY ?? '',
    finnhubApiKey: env.FINNHUB_API_KEY ?? '',
    openrouterApiKey: env.OPENROUTER_API_KEY ?? '',
    openrouterApiKey2: env.OPENROUTER_API_KEY_2 ?? '',
    openrouterModel: env.OPENROUTER_MODEL ?? 'arcee-ai/trinity-large-preview:free',
    openrouterAppName: env.OPENROUTER_APP_NAME ?? 'FinanzApp',
    openrouterSiteUrl: env.OPENROUTER_SITE_URL ?? 'https://finanzapp.pages.dev',
    stockDefaultExchange: env.STOCK_SEARCH_DEFAULT_EXCHANGE ?? 'NASDAQ',
    logoDevApiKey: env.LOGO_DEV_API_KEY ?? '',
    codeHmacSecret: env.CODE_HMAC_SECRET ?? '',
    frontendOrigin: env.FRONTEND_ORIGIN ?? '',
  };
}
