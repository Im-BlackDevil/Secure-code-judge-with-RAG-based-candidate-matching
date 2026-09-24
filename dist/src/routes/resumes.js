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
const router = express_1.default.Router();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
router.post('/', auth_1.default, upload.single('resume'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No resume file uploaded' });
    }
    const data = await (0, pdf_parse_1.default)(req.file.buffer);
    const result = await pool_1.default.query('INSERT INTO resume_profiles (student_id, raw_text) VALUES ($1,$2) RETURNING id, student_id, created_at', [req.user.id, data.text]);
    res.status(201).json(result.rows[0]);
});
exports.default = router;
