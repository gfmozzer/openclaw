---
slug: deployment
category: operations
generatedAt: 2026-02-21T18:03:51.126Z
relevantFiles:
  - docker-compose.yml
  - Dockerfile
  - Dockerfile.sandbox
  - Dockerfile.sandbox-browser
  - Dockerfile.sandbox-common
  - scripts\e2e\Dockerfile
  - scripts\e2e\Dockerfile.qr-import
  - scripts\docker\cleanup-smoke\Dockerfile
  - scripts\docker\install-sh-e2e\Dockerfile
  - scripts\docker\install-sh-nonroot\Dockerfile
---

# How do I deploy this project?

## Deployment

### Docker

This project includes Docker configuration.

```bash
docker build -t app .
docker run -p 3000:3000 app
```

### CI/CD

CI/CD pipelines are configured for this project.
Check `.github/workflows/` or equivalent for pipeline configuration.