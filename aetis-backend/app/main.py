from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.routers import auth, emergencies, vehicles, hospitals, analytics, admin

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Adaptive Emergency Traffic Intelligence System (AETIS) - Central Engine Backend API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS Middleware setup allowing all origins including Vite (http://localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Primary v1 API Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(emergencies.router, prefix="/api/v1/emergencies", tags=["Emergencies"])
app.include_router(vehicles.router, prefix="/api/v1/vehicles", tags=["Vehicles"])
app.include_router(hospitals.router, prefix="/api/v1/hospitals", tags=["Hospitals & Triage Alerts"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics & KPIs"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Administration"])

# Unversioned aliases for Vite dev proxy (/api/*) compatibility
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"], include_in_schema=False)
app.include_router(emergencies.router, prefix="/api/emergencies", tags=["Emergencies"], include_in_schema=False)
app.include_router(vehicles.router, prefix="/api/vehicles", tags=["Vehicles"], include_in_schema=False)
app.include_router(hospitals.router, prefix="/api/hospitals", tags=["Hospitals & Triage Alerts"], include_in_schema=False)
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics & KPIs"], include_in_schema=False)
app.include_router(admin.router, prefix="/api/admin", tags=["Administration"], include_in_schema=False)


@app.get("/", tags=["Root"])
def root():
    return {
        "project": settings.PROJECT_NAME,
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "auth": "/api/v1/auth",
            "emergencies": "/api/v1/emergencies",
            "vehicles": "/api/v1/vehicles",
            "hospitals": "/api/v1/hospitals",
            "analytics": "/api/v1/analytics",
            "admin": "/api/v1/admin",
        },
    }


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
