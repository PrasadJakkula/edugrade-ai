import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.routers.users import router as users_router
from backend.routers.rubrics import router as rubrics_router
from backend.routers.exams import router as exams_router
from backend.routers.temp_exams import router as temp_exams_router
from backend.routers.grading import router as grading_router
from backend.routers.evaluation import router as evaluation_router
from backend.routers.batch import router as batch_router
from backend.services.ai_provider import AIProviderError

app = FastAPI(
    title="EvaluAI API",
    version="2.0.0",
    description="Evidence-based AI answer evaluation, rubric versioning, instant regrading, and reliability platform.",
)

cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.exception_handler(AIProviderError)
async def ai_provider_error_handler(request: Request, exc: AIProviderError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Never expose internal stack traces to API callers
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(users_router)
app.include_router(rubrics_router)
app.include_router(exams_router)
app.include_router(temp_exams_router)
app.include_router(grading_router)
app.include_router(evaluation_router)
app.include_router(batch_router)
