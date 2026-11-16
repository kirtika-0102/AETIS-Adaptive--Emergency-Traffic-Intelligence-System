"""
AETIS Central Engine — FastAPI Application Entrypoint
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import admin, analytics, auth, emergencies, hospitals, vehicles

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    description="Adaptive Emergency Traffic Intelligence System — Central Backend API",
)

# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server and any other origins during development
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# API Routers
# ---------------------------------------------------------------------------
app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"],
)

app.include_router(
    emergencies.router,
    prefix="/api/v1/emergencies",
    tags=["Emergencies"],
)

app.include_router(
    vehicles.router,
    prefix="/api/v1/vehicles",
    tags=["Vehicles"],
)

app.include_router(
    hospitals.router,
    prefix="/api/v1/hospitals",
    tags=["Hospitals"],
)

app.include_router(
    analytics.router,
    prefix="/api/v1/analytics",
    tags=["Analytics"],
)

app.include_router(
    admin.router,
    prefix="/api/v1/admin",
    tags=["Admin"],
)


# ---------------------------------------------------------------------------
# Health-check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["Health"])
async def health_check():
    """Simple liveness probe."""
    return {"status": "ok"}
