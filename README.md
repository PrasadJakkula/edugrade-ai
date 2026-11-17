# Evalora — Smarter Grading. Fairer Evaluation.

Evidence-based AI answer evaluation, rubric versioning, instant regrading, and teacher agreement platform.
Built on the open-source foundation of [`ArturoBarriga/EvaluAI-Project`](https://github.com/ArturoBarriga/EvaluAI-Project) (Apache-2.0 License, University of Extremadura / Arturo Barriga).

Evalora transforms LLM-assisted grading from opaque score generation into a transparent, auditable assessment workflow:
- **Conceptual multi-subject grading** across Physics, Chemistry, Biology, Mathematics, Computer Science, Electronics & Engineering, History, Geography, English, and General Science.
- **Verbatim evidence verification** that programmatically anchors every awarded mark to exact substrings in the student's text and flags ungrounded citations.
- **3-tier reliability & uncertainty detection** (`reliable`, `needs_review`, `cannot_reliably_grade`) using evidence coverage, OCR quality checks, score arithmetic invariants, and ambiguity signals—without fabricated confidence percentages.
- **Immutable rubric versioning & instant regrading** with side-by-side Old vs. New scores, criterion-level deltas, and preserved grading history.
- **Teacher consistency & agreement analytics** (MAE, RMSE, Exact Agreement, Within-1-Mark Agreement, Quadratic-Weighted Cohen's Kappa with minimum sample-size guards).
- **Evaluation, validation & calibration lab** with CSV/JSON dataset upload, deterministic leakage-safe Train/Validation/Test splits, prompt versioning, and additive validation-only bias calibration (explicitly distinguishing prompt/calibration tuning from foundation model weight fine-tuning).
- **PDF, image, and handwriting OCR preview** with quality checks and manual correction prior to grading.
- **Non-blocking batch grading** with persistent job progress, per-item failure retry, and CSV export.

---

## Repository Structure

- `server.ts` & `server/` — Full-stack TypeScript/Express + Vite runtime (`@google/genai` `gemini-4-hydrogen`) for live single-command execution on port `3000`.
- `src/` — Redesigned React 19 + Tailwind v4 TypeScript application.
- `backend/` — Upgraded Python FastAPI + MongoDB (`pymongo`) backend, modular AI providers (`gemini_client.py`, `openai_client.py`, `openrouter_client.py`), `services/`, `routers/`, `repo/`, `Dockerfile`, and `tests/`.
- `frontend/` — Legacy CRA frontend preserved with updated `frontend/Dockerfile` and environment-aware `frontend/src/api.js`.
- `docker-compose.yml` — Fixed multi-container orchestration (`mongo:7`, `backend`, `frontend`).
- `case-study/` & `examples/` — Original repository case study spreadsheets and example exam/rubric PDFs.

---

## Setup & Running Instructions

### Option A: Live Full-Stack Vite + Express Runtime (Port 3000)

1. Configure environment variables in `.env`:
   - `GEMINI_API_KEY` (required for live grading & multimodal OCR)
   - `JWT_SECRET` (recommended >= 32 random hex chars)
2. Install and start:
   ```bash
   npm install
   npm run dev
   ```
3. Open `http://localhost:3000` (or click **Launch Interactive Demo** / sign in as Demo Teacher).

### Option B: Docker Compose (FastAPI + MongoDB + Nginx)

```bash
cp .env.example .env
# Edit .env to set GEMINI_API_KEY and a strong JWT_SECRET
docker compose up --build
```
- Frontend: `http://localhost:3000` (proxies `/api/*` to FastAPI backend)
- FastAPI Docs: `http://localhost:8000/docs`
- MongoDB: `localhost:27017`

### Option C: Local Python FastAPI + MongoDB

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
export MONGODB_URI="mongodb://localhost:27017/evaluai"
export JWT_SECRET="$(openssl rand -hex 32)"
export GEMINI_API_KEY="your_api_key"
uvicorn backend.main:app --reload --port 8000
```

---

## Testing

- **TypeScript server & core engines**: `node --import tsx --test server/engines.test.ts`
- **Python pure-Python core engines**: `python3 -m unittest backend/tests/test_core_engines.py -v`
- **Full Python FastAPI test suite (requires `backend/requirements.txt`)**: `pytest backend/tests -v`
- **Frontend type-check & production bundle**: `npm run lint && npm run build`

---

## License & Attribution

Preserves the original **Apache License 2.0** (`LICENSE`). Original repository: `https://github.com/ArturoBarriga/EvaluAI-Project`.
