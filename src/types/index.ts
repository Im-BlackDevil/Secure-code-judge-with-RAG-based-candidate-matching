export interface User {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: 'student' | 'recruiter';
  created_at: Date;
}

export interface Job {
  id: number;
  recruiter_id: number;
  title: string;
  description: string;
  required_skills: string[];
  created_at: Date;
}

export interface TestCase {
  id: number;
  problem_id: number;
  input: string;
  expected_output: string;
}

export interface Submission {
  id: number;
  student_id: number;
  problem_id: number;
  code: string;
  status: string;
  created_at: Date;
}

export interface ResumeProfile {
  id: number;
  student_id: number;
  raw_text: string;
  created_at: Date;
}