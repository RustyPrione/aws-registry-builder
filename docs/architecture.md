# Architecture

## Navigation

- [Quickstart](./quickstart.md)
- [Configuration](./configuration.md)
- [README](../README.md)

## Overview

This repository is built as an Express-based backend for AWS registry and build operations. It exposes REST endpoints, generates Swagger docs, and uses AWS SDK services to manage ECR repositories, CodeBuild jobs, and CloudWatch logs.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Browser)                     │
│            (HTML/CSS/JS served from /public)                │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP
                       ▼
┌──────────────────────────────────────────────────────────────┐
│               Express.js Backend (Node.js)                   │
│                         app.js                               │
├──────────────────────────────────────────────────────────────┤
│ Routes:                                                      │
│  ├─ /api/aws      → AWS ECR & CodeBuild operations           │
│  ├─ /api/git      → Bitbucket branch and clone operations    │
│  ├─ /api/session  → session log storage                      │
│  └─ /docs         → Swagger API documentation                │
├──────────────────────────────────────────────────────────────┤
│ Services:                                                    │
│  ├─ ecrService.js      → ECR repo / image management          │
│  ├─ codeBuildService.js→ CodeBuild build orchestration        │
│  ├─ logService.js      → CloudWatch build logs               │
│  └─ gitService.js      → Bitbucket repo clone & branches      │
├──────────────────────────────────────────────────────────────┤
│ Config:                                                      │
│  ├─ config/aws.js      → AWS credentials and account info     │
│  └─ config/git.js      → Bitbucket credentials                │
└──────────────────────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌──────────────────┐         ┌───────────────────────────────┐
│   AWS ECR        │         │   AWS CodeBuild / CloudWatch   │
│ (Repository API) │         │   (Build + Log Services)       │
└──────────────────┘         └───────────────────────────────┘
```

## Core components

- `app.js`
  - Loads environment variables with `dotenv`
  - Sets up Express, CORS, JSON parsing, and static assets
  - Mounts route groups and Swagger UI

- `routes/awsRegistry.js`
  - ECR repository listing and creation
  - Image listing and tag-based image lookup
  - Build trigger and build status/log retrieval

- `services/`
  - `ecrService.js` – ECR operations
  - `codeBuildService.js` – build creation and status
  - `logService.js` – fetches CodeBuild logs from CloudWatch

- `config/`
  - `aws.js` – AWS region, account, and credentials
  - `git.js` – Bitbucket credentials and Git config

## Request flow

1. Client calls `/api/aws/...`.
2. Route validates input and forwards it to a service.
3. The service calls AWS SDK APIs.
4. Results are returned as JSON.

## Swagger

- API documentation is served at `/docs`
- Inline JSDoc Swagger comments are used in route files
