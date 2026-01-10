# Legacy Service Removal Plan

This document outlines the steps to safely remove the legacy Python microservices once the Vercel migration is fully verified.

## Removal Steps

### Phase 1: Preparation (Verification)
1. **Run Full Verification**: Execute `./scripts/verify-deployment.sh` and `./scripts/test-persistence.sh` against the production environment.
2. **Review Checklist**: Ensure all items in `docs/legacy-service-deprecation-checklist.md` are completed.
3. **Notify Stakeholders**: Inform the team that legacy services will be removed.

### Phase 2: Cleanup
1. **Remove Python Services**: Delete the following directories:
   - `services/api-gateway/`
   - `services/budget-ingestion-service/`
   - `services/clarification-service/`
   - `services/optimization-service/`
   - `services/shared/`
   - `services/combined-backend/`
2. **Update Root Files**:
   - Remove root-level `pyproject.toml` and `requirements-dev.txt`.
   - Delete `tests/` directory (containing legacy integration tests).
   - Remove `.github/workflows/ci.yml` if it only tests legacy services.
3. **Update Documentation**:
   - Update `README.md` to remove references to legacy services.
   - Update `docs/roadmap.md` to mark Phase 5/6 as completely finished.
   - Archive any legacy-specific documentation in `docs/archive/`.

### Phase 3: Infrastructure
1. **Decommission Legacy Servers**: Shut down any running instances of the Python microservices (e.g., on Heroku, AWS, or local Docker).
2. **Clean up Environment Variables**: Remove any environment variables from Vercel or CI that were only used by legacy services (e.g., `SUGGESTION_PROVIDER_TIMEOUT`).

## Git History Note
Deleting these files will not remove them from Git history. They can always be retrieved using `git checkout` if needed for reference.

## Post-Removal Verification
1. **Build `services/ui-web`**: Ensure the Next.js app still builds and deploys successfully.
2. **Run E2E Tests**: Verify that the complete user flow still works without any legacy backend dependencies.



