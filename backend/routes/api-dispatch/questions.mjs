// @ts-check
import { isStateChangingMethod, checkCsrf } from "../../utils/csrf.mjs";
import { jsonResponse } from "../../utils/http.mjs";

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchQuestionRoutes(ctx) {
  const { request, pathname, url, session, handlers } = ctx;
  if (isStateChangingMethod(request.method)) {
    if (!checkCsrf(request)) return jsonResponse({ ok: false, message: "CSRF token invalid or missing" }, 403);
  }

  if (pathname === "/api/questions") return await handlers.handleQuestions(request, session, url);

  const questionAnswerMatch = pathname.match(/^\/api\/questions\/([^/]+)\/answers$/);
  if (questionAnswerMatch) return await handlers.handleQuestionAnswerCreate(request, questionAnswerMatch[1], session);

  const questionLikeMatch = pathname.match(/^\/api\/questions\/([^/]+)\/like$/);
  if (questionLikeMatch) return await handlers.handleQuestionLike(request, questionLikeMatch[1], session);

  const questionByIdMatch = pathname.match(/^\/api\/questions\/([^/]+)$/);
  if (questionByIdMatch) return await handlers.handleQuestionById(request, questionByIdMatch[1], session);

  const answerLikeMatch = pathname.match(/^\/api\/answers\/([^/]+)\/like$/);
  if (answerLikeMatch) return await handlers.handleAnswerLike(request, answerLikeMatch[1], session);

  const answerByIdMatch = pathname.match(/^\/api\/answers\/([^/]+)$/);
  if (answerByIdMatch) return await handlers.handleAnswerById(request, answerByIdMatch[1], session);

  return null;
}
