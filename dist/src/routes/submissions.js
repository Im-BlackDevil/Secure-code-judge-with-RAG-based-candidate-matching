"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pool_1 = __importDefault(require("../db/pool"));
const auth_1 = __importDefault(require("../middleware/auth"));
const submissionQueue_1 = require("../queues/submissionQueue");
const router = express_1.default.Router();
router.post('/', auth_1.default, async (req, res) => {
    const { problem_id, code } = req.body;
    const result = await pool_1.default.query('INSERT INTO submissions (student_id, problem_id, code, status) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, problem_id, code, 'pending']);
    const submission = result.rows[0];
    await submissionQueue_1.submissionQueue.add('run-submission', {
        submissionId: submission.id,
        problemId: problem_id,
        code
    });
    res.status(202).json(submission);
});
router.get('/:id', auth_1.default, async (req, res) => {
    const result = await pool_1.default.query('SELECT * FROM submissions WHERE id=$1', [req.params.id]);
    if (!result.rows[0])
        return res.status(404).json({ error: 'Submission not found' });
    res.json(result.rows[0]);
});
exports.default = router;
