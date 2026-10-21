import * as mistakeModel from "../models/mistake.js";
export function listMistakes(userId, filters = {}) { return mistakeModel.findByUser(userId, filters); }
export function markReviewed(userId, questionId) { mistakeModel.incrementReview(userId, questionId); }
