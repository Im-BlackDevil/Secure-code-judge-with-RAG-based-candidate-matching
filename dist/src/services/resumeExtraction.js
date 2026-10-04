"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractResumeData = extractResumeData;
const gemini_1 = __importDefault(require("./gemini"));
async function extractResumeData(rawText) {
    const prompt = `Extract structured data from this resume text. Return ONLY valid JSON, no markdown formatting, no explanation, matching this exact shape:
{"skills": ["string"], "projects": ["string"], "experience": ["string"]}

Each project and experience entry should be a short one or two sentence summary. Resume text:
${rawText}`;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const response = await gemini_1.default.models.generateContent({
                model: 'gemini-3.8-flash',
                contents: prompt
            });
            const cleaned = (response.text ?? '').replace(/```json|```/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (!Array.isArray(parsed.skills) || !Array.isArray(parsed.projects) || !Array.isArray(parsed.experience)) {
                throw new Error('Malformed shape');
            }
            return parsed;
        }
        catch (err) {
            if (attempt === 1)
                throw new Error('Failed to extract structured resume data after retry');
        }
    }
    throw new Error('Unreachable');
}
