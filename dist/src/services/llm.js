"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateWithRetry = generateWithRetry;
const gemini_1 = __importDefault(require("./gemini"));
async function generateWithRetry(prompt, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await gemini_1.default.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: prompt
            });
            return response.text ?? '';
        }
        catch (err) {
            console.error(`Gemini attempt ${attempt}/${maxAttempts} failed:`, err.message);
            if (attempt === maxAttempts)
                throw err;
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
    }
    throw new Error('Unreachable');
}
