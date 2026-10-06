"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resumeQueue = void 0;
const bullmq_1 = require("bullmq");
const connection_1 = __importDefault(require("./connection"));
exports.resumeQueue = new bullmq_1.Queue('resume-processing', { connection: connection_1.default });
