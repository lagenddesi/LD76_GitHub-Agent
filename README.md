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

```text
GEMINI_API_KEY
