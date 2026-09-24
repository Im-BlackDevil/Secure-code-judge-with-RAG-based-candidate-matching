"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const pool_1 = __importDefault(require("../db/pool"));
const router = express_1.default.Router();
router.post('/signup', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const hash = await bcrypt_1.default.hash(password, 10);
        const result = await pool_1.default.query('INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, role', [name, email, hash, role]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(400).json({ error: err.message });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const result = await pool_1.default.query('SELECT * FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user)
        return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt_1.default.compare(password, user.password_hash);
    if (!valid)
        return res.status(401).json({ error: 'Invalid credentials' });
    const token = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});
exports.default = router;
