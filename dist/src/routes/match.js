"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pool_1 = __importDefault(require("../db/pool"));
const auth_1 = __importDefault(require("../middleware/auth"));
const embeddings_1 = require("../services/embeddings");
const gemini_1 = __importDefault(require("../services/gemini"));
const router = express_1.default.Router();
router.get('/:jobId', auth_1.default, async (req, res) => {
    if (req.user?.role !== 'recruiter')
        return res.status(403).json({ error: 'Only recruiters can view matches' });
    const jobResult = await pool_1.default.query('SELECT * FROM jobs WHERE id=$1', [req.params.jobId]);
    const job = jobResult.rows[0];
    if (!job)
        return res.status(404).json({ error: 'Job not found' });
    const jobText = `${job.title}. ${job.description}. Required skills: ${(job.required_skills || []).join(', ')}`;
    const jobVector = await (0, embeddings_1.embedText)(jobText);
    const topMatches = await pool_1.default.query(`SELECT resume_id, text, entity_type, 1 - (embedding <=> $1) AS similarity
     FROM resume_entities
     ORDER BY embedding <=> $1
     LIMIT 10`, [(0, embeddings_1.toVectorLiteral)(jobVector)]);
    const byResume = new Map();
    for (const row of topMatches.rows) {
        if (!byResume.has(row.resume_id))
            byResume.set(row.resume_id, []);
        byResume.get(row.resume_id).push({ text: row.text, type: row.entity_type, similarity: row.similarity });
    }
    const results = [];
    for (const [resumeId, matchedEntities] of byResume) {
        const context = matchedEntities.map(e => `- (${e.type}) ${e.text}`).join('\n');
        const prompt = `A recruiter is hiring for: "${job.title} — ${job.description}".
A candidate's resume has these matching highlights:
${context}

In 1-2 sentences, explain why this candidate is a good match, citing specific overlaps. Be concise and factual.`;
        const explanation = await gemini_1.default.models.generateContent({ model: 'gemini-3.8-flash', contents: prompt });
        results.push({ resumeId, explanation: explanation.text, topMatches: matchedEntities });
    }
    res.json(results);
});
exports.default = router;
