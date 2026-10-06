"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const connection_1 = __importDefault(require("../queues/connection"));
const pool_1 = __importDefault(require("../db/pool"));
const resumeExtraction_1 = require("../services/resumeExtraction");
const embeddings_1 = require("../services/embeddings");
const worker = new bullmq_1.Worker('resume-processing', async (job) => {
    const { resumeId } = job.data;
    const resumeResult = await pool_1.default.query('SELECT raw_text FROM resume_profiles WHERE id=$1', [resumeId]);
    const rawText = resumeResult.rows[0].raw_text;
    const parsed = await (0, resumeExtraction_1.extractResumeData)(rawText);
    await pool_1.default.query('UPDATE resume_profiles SET parsed=$1, status=$2 WHERE id=$3', [JSON.stringify(parsed), 'ready', resumeId]);
    const entities = [
        ...parsed.skills.map(text => ({ type: 'skill', text })),
        ...parsed.projects.map(text => ({ type: 'project', text })),
        ...parsed.experience.map(text => ({ type: 'experience', text }))
    ];
    for (const entity of entities) {
        const vector = await (0, embeddings_1.embedText)(entity.text);
        await pool_1.default.query('INSERT INTO resume_entities (resume_id, entity_type, text, embedding) VALUES ($1,$2,$3,$4)', [resumeId, entity.type, entity.text, (0, embeddings_1.toVectorLiteral)(vector)]);
    }
}, { connection: connection_1.default });
worker.on('completed', (job) => console.log(`Resume ${job.id} processed`));
worker.on('failed', (job, err) => console.error(`Resume job ${job?.id} failed:`, err));
console.log('Resume worker is listening for jobs...');
