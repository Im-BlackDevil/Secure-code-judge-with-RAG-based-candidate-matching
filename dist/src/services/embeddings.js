"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedText = embedText;
exports.toVectorLiteral = toVectorLiteral;
const gemini_1 = __importDefault(require("./gemini"));
async function embedText(text) {
    const response = await gemini_1.default.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
        config: { outputDimensionality: 768 }
    });
    return response.embeddings[0].values;
}
function toVectorLiteral(vec) {
    return `[${vec.join(',')}]`;
}
