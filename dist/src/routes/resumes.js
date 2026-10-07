"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const pool_1 = __importDefault(require("../db/pool"));
const auth_1 = __importDefault(require("../middleware/auth"));
const resumeQueue_1 = require("../queues/resumeQueue");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.post('/', auth_1.default, upload.single('resume'), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No resume file uploaded' });
    const data = await (0, pdf_parse_1.default)(req.file.buffer);
    const result = await pool_1.default.query('INSERT INTO resume_profiles (student_id, raw_text, status) VALUES ($1,$2,$3) RETURNING id, student_id, status, created_at', [req.user.id, data.text, 'pending']);
    await resumeQueue_1.resumeQueue.add('process-resume', { resumeId: result.rows[0].id }, {
        attempts: 4,
        backoff: {
            type: 'exponential',
            delay: 5000
        }
    });
    res.status(202).json(result.rows[0]);
});
router.get('/:id', auth_1.default, async (req, res) => {
    const result = await pool_1.default.query('SELECT id, status, parsed, created_at FROM resume_profiles WHERE id=$1', [req.params.id]);
    if (!result.rows[0])
        return res.status(404).json({ error: 'Resume not found' });
    res.json(result.rows[0]);
});
exports.default = router;
