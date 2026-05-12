export function getLineChartGeometry(width, height) {
  const compact = width < 520;
  const padLeft = compact ? 56 : 78;
  const padRight = compact ? 16 : 26;
  const padTop = compact ? 16 : 20;
  const padBottom = compact ? 36 : 44;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  return {
    bCompact: compact,
    padLeft,
    padRight,
    padTop,
    padBottom,
    iPadL: padLeft,
    iPadR: padRight,
    iPadT: padTop,
    iPadB: padBottom,
    innerWidth,
    innerHeight,
    iInnerWidth: innerWidth,
    iInnerHeight: innerHeight
  };
}

export function intervalToStepMs(interval) {
  const value = String(interval || "").trim().toLowerCase();
  const match = value.match(/^(\d+)\s*(min|day|week|month)$/);
  if (!match) return 24 * 60 * 60 * 1000;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return 24 * 60 * 60 * 1000;
  if (match[2] === "min") return count * 60 * 1000;
  if (match[2] === "day") return count * 24 * 60 * 60 * 1000;
  if (match[2] === "week") return count * 7 * 24 * 60 * 60 * 1000;
  if (match[2] === "month") return count * 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function canvasRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

window.FinanzAppShareViewChartUtils = {
  canvasRoundRect,
  getLineChartGeometry,
  intervalToStepMs
};
