# PadhLeBhai AI

An AI study companion for students preparing for board, university and entrance exams. It takes you from syllabus to exam day in one place: plan, learn, practise, revise and track progress.

## Features

| Feature | What it does |
|---|---|
| **Subjects & exam countdown** | One subject per paper, each with an exam date, board/university and class/semester. |
| **Syllabus → topic tracker** | Upload a syllabus PDF or photo, or paste the text. AI splits it into units and topics, marks must-do topics and estimates study time. Track each topic as *not started → learning → done → revised* and rate your confidence. |
| **Adaptive study planner** | AI ranks topics by importance (optionally using web research on past papers). A deterministic scheduler then fits them around each exam date, your daily hours and your study days. It adds spaced "quick recall" revisions and a full-revision + mock-paper day before each exam. **Rebalance** reschedules missed work instantly at no AI cost. |
| **AI tutor** | Streaming chat that knows your syllabus and your weak topics. Replies in English or Hinglish, renders math (LaTeX), and solves questions from a **photo** step by step. |
| **Quizzes** | Exam-style MCQs per subject, per topic or for "my weak spots", with explanations. Scores update topic strength automatically. "Explain my mistakes" sends your wrong answers to the tutor. |
| **Flashcards (spaced repetition)** | Generate cards from a topic, pasted notes or an uploaded PDF/photo of notes. SM-2 scheduling brings each card back right before you'd forget it. |
| **Focus timer** | Pomodoro with configurable presets. It keeps running across pages, survives a refresh, and logs minutes to a subject/topic automatically. |
| **Today dashboard & progress** | Today's tasks, overdue nudges, streak, daily goal ring, weekly chart, weak topics and cards due. The progress page adds trends, a consistency heatmap, time per subject and a quiz score trend. |
| **Credits & limits** | Free monthly AI credit per user (tracked from real token usage), per-user AI rate limiting and upload size limits. |

## Tech stack

- **Backend:** FastAPI, SQLAlchemy 2 (SQLite locally, Postgres in production), OpenAI, Tavily (optional), PyMuPDF
- **Frontend:** React 19, Vite, React Router, Tailwind CSS v4, Recharts, KaTeX, Sonner

```
backend/app
├── main.py            # app setup, middleware, routers
├── config.py          # all settings from env
├── ai.py              # OpenAI wrapper: credit checks, cost tracking, JSON + streaming
├── routers/           # auth, subjects, plans, tutor, quizzes, flashcards, progress
└── services/          # scheduler, SM-2, document parsing, web research
frontend/src
├── pages/             # Dashboard, Subjects, SubjectDetail, Planner, Tutor, Quizzes, QuizPlay, Flashcards, Focus, Analytics, Settings
├── components/        # UI kit, layout, markdown/math renderer
└── lib/               # API client, auth, focus timer, hooks
```

## Running locally

**Backend** (Python 3.11+)

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env        # then set OPENAI_API_KEY (and optionally TAVILY_API_KEY)
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

**Frontend** (Node 20+)

```bash
cd frontend
npm install
cp .env.example .env        # points at http://127.0.0.1:8000
npm run dev                 # http://localhost:5173
```

**Tests**

```bash
cd backend && pytest        # scheduler, spaced repetition, and a full API flow with AI mocked
cd frontend && npm run lint && npm run build
```

## Deploying

- **Backend:** build `backend/Dockerfile`, or run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Set `APP_ENV=production`, a strong `JWT_SECRET`, a Postgres `DATABASE_URL`, `OPENAI_API_KEY` and `FRONTEND_URL` (your frontend's origin, for CORS).
- **Frontend:** `npm run build` and serve `frontend/dist` from any static host (Vercel, Netlify, Render static). Set `VITE_API_BASE_URL` at build time and add an SPA fallback rewrite to `index.html`.
- **Schema changes:** on startup the backend creates missing tables and adds new nullable columns, so existing databases upgrade in place. For renames or type changes, adopt Alembic.
- **Scaling note:** rate limiting is in-memory (per process). If you run several instances, back it with Redis.
