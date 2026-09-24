"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pool_1 = __importDefault(require("../db/pool"));
const auth_1 = __importDefault(require("../middleware/auth"));
const router = express_1.default.Router();
router.post('/', auth_1.default, async (req, res) => {
    if (req.user?.role !== 'recruiter') {
        return res.status(403).json({ error: 'Only recruiters can post jobs' });
    }
    const { title, description, required_skills } = req.body;
    const result = await pool_1.default.query('INSERT INTO jobs (recruiter_id, title, description, required_skills) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, title, description, required_skills]);
    res.status(201).json(result.rows[0]);
});
router.get('/', async (req, res) => {
    const result = await pool_1.default.query('SELECT * FROM jobs ORDER BY created_at DESC');
    res.json(result.rows);
});
exports.default = router;
