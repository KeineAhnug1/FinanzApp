export async function dispatchQuestionRoutes(ctx) {
  const { req, res, pathname, url, session, handlers } = ctx;

  if (pathname === "/api/questions") {
    await handlers.handleQuestions(req, res, session, url);
    return true;
  }

  const questionAnswerMatch = pathname.match(/^\/api\/questions\/([^/]+)\/answers$/);
  if (questionAnswerMatch) {
    await handlers.handleQuestionAnswerCreate(req, res, questionAnswerMatch[1], session);
    return true;
  }

  const questionLikeMatch = pathname.match(/^\/api\/questions\/([^/]+)\/like$/);
  if (questionLikeMatch) {
    await handlers.handleQuestionLike(req, res, questionLikeMatch[1], session);
    return true;
  }

  const questionByIdMatch = pathname.match(/^\/api\/questions\/([^/]+)$/);
  if (questionByIdMatch) {
    await handlers.handleQuestionById(req, res, questionByIdMatch[1], session);
    return true;
  }

  const answerLikeMatch = pathname.match(/^\/api\/answers\/([^/]+)\/like$/);
  if (answerLikeMatch) {
    await handlers.handleAnswerLike(req, res, answerLikeMatch[1], session);
    return true;
  }

  const answerByIdMatch = pathname.match(/^\/api\/answers\/([^/]+)$/);
  if (answerByIdMatch) {
    await handlers.handleAnswerById(req, res, answerByIdMatch[1], session);
    return true;
  }

  return false;
}
