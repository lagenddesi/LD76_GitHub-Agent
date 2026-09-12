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

LD76_GEMINI_API_KEY

For local development, use `.env.local`.

The Gemini API key is used only by server-side Vercel functions and is never exposed to the frontend.

## Project Status

Phase 2 — dynamic Gemini model discovery and selection.

### Completed foundation

- Mobile-first application shell
- Chat screen
- GitHub screen
- Settings screen
- Mobile navigation
- Vercel serverless API foundation
- Secure server-side Gemini API key handling
- Gemini configuration status endpoint
- Gemini connection test endpoint
- Dynamic Gemini model discovery
- Gemini model pagination support
- Filtering for models that support `generateContent`
- Dynamic model selector
- Auto model selection option
- Model refresh support
- Human-readable Gemini API errors
- No hardcoded Gemini model names

### Current Gemini architecture

The configured Gemini API key is stored server-side as:

`LD76_GEMINI_API_KEY`

The application discovers available Gemini models from the Gemini Models API instead of maintaining a hardcoded model list.

Only models advertising `generateContent` support are exposed to the application.

The frontend never receives the Gemini API key.

## Planned Phases

- Phase 3: GitHub authentication, repository listing and repository selection
- Phase 4: Repository tree, file read/create/edit/delete and real commits
- Phase 5: Agent tool/action system, repository inspection, planning, modification and verification
- Phase 6: Permission system
- Phase 7: Persistent multi-conversation history
- Phase 8: Project memory and context management
- Phase 9: Security hardening, error handling, performance, conflict handling and end-to-end verification

## Development Rules

- No fake or simulated production functionality.
- No hardcoded Gemini model names.
- No secrets in frontend code.
- Sensitive GitHub operations must require permission.
- Failed operations must never be reported as successful.
- Production functionality must use real APIs and real responses.
