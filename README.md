# LD76 Code Agent

Mobile-first AI coding agent for GitHub repositories.

## Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Vercel Serverless Functions
- AI: Gemini API
- Repository integration: GitHub API
- Hosting: GitHub + Vercel

## Security

Secrets must never be placed in frontend JavaScript or committed to the repository.

Production environment variables are configured through Vercel Project Settings.

Required environment variable:

GEMINI_API_KEY

For local development, use .env.local.

## Project Status

Phase 0 — application foundation.

Current Phase 0 foundation includes:

- Mobile-first application shell
- Chat screen
- GitHub screen
- Settings screen
- Mobile navigation
- Vercel serverless API foundation
- Environment variable architecture
- Basic health endpoint

Later phases will add real Gemini integration, dynamic model discovery, GitHub authentication, repository operations, agent actions, permissions, memory, verification, and production hardening.
