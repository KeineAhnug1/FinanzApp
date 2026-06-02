"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toUserId = toUserId;
exports.toAccountId = toAccountId;
exports.toISODate = toISODate;
function toUserId(value) {
    return String(value);
}
function toAccountId(value) {
    return value;
}
function toISODate(date) {
    return date.toISOString();
}
//# sourceMappingURL=ids.js.map