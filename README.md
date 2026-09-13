LD76 Code Agent

Mobile-first, production-focused AI coding agent for working with GitHub repositories.

The goal of LD76 Code Agent is not to be a generic chatbot. It is being built as a personal AI coding agent that can understand coding requests, inspect repositories, work with project context, and eventually perform real GitHub code operations with explicit user permission.

Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Vercel Serverless Functions
- AI: Google Gemini API
- Repository integration: GitHub API
- Hosting: GitHub + Vercel
- Client-side persistence: IndexedDB (planned)
- Mobile-first responsive UI

Core Principles

- Real production functionality only.
- No fake or simulated GitHub operations.
- No mocked AI responses.
- No hardcoded Gemini model list.
- Gemini API keys remain server-side.
- GitHub operations must use real GitHub APIs.
- Failed operations must never be reported as successful.
- Destructive or sensitive operations require explicit permission.
- Large repositories must be handled through targeted inspection and context management rather than sending the entire repository to the AI on every request.
- Development is performed phase-by-phase with verification before moving to the next major phase.

---

Security

Secrets must never be placed in frontend JavaScript or committed to the repository.

Production environment variables are configured through Vercel Project Settings.

Required Gemini environment variable:

"LD76_GEMINI_API_KEY"

For local development, use ".env.local".

The Gemini API key is used only by server-side Vercel functions and is never exposed to the frontend.

GitHub credentials and sensitive server-side operations must also remain protected from frontend exposure.

---

Current Project Status

Phase 0 — Foundation

Status: Complete

Completed foundation includes:

- Mobile-first application shell
- Chat interface
- GitHub interface
- Settings interface
- Mobile navigation
- Vercel serverless API foundation
- Central API routing
- Server-side architecture for Gemini integration
- Production deployment through Vercel
- Basic error handling and service status handling

---

Phase 1 — Gemini Integration

Status: Complete

Completed:

- Secure server-side Gemini API key handling
- Gemini configuration status endpoint
- Gemini connection test endpoint
- Real Gemini API requests
- Server-side Gemini request handling
- Human-readable Gemini API errors
- Frontend model selection integration
- Successful normal AI conversation through the agent interface

The frontend does not contain the Gemini API key.

The Gemini API is accessed through the Vercel backend.

---

Phase 2 — Dynamic Gemini Model Discovery & Selection

Status: Complete

Phase 2 is considered complete at the project level.

Completed functionality:

- Real Gemini Models API integration
- Dynamic model discovery
- Model pagination support
- Runtime model retrieval from the configured Gemini API key
- Filtering based on Gemini model capabilities
- Filtering of unsupported model types
- Dynamic model selector
- Manual Gemini model selection
- Auto model-selection mode
- Model refresh support
- Handling of unavailable/invalid models
- Human-readable Gemini API errors
- No hardcoded Gemini model names
- Gemini model information is derived from the configured API rather than a static model list

The application does not maintain a fixed list such as:

"gemini-2.5-flash"

"gemini-3.x"

or any other hardcoded model catalogue.

Instead, available models are discovered dynamically from the configured Gemini API.

The selected model is then used by the server-side Gemini request layer.

Phase 2 Architecture

The flow is:

Vercel Environment
        │
        ▼
LD76_GEMINI_API_KEY
        │
        ▼
Vercel Backend
        │
        ▼
Gemini Models API
        │
        ▼
Dynamic Model Discovery
        │
        ▼
Capability / Usability Filtering
        │
        ├── Manual Model Selection
        │
        └── Auto Model Selection
                │
                ▼
        Gemini Generation
                │
                ▼
          Agent Response

The frontend receives model information required for selection but never receives the Gemini API key.

---

Phase 3 — GitHub Authentication & Repository Selection

Status: In Progress / Foundation Available

Current functionality includes the GitHub connection layer and repository selection foundation.

The project is now moving toward full GitHub authentication and repository workflow verification.

Target functionality:

- Secure GitHub authentication
- GitHub account connection
- Repository listing
- Repository selection
- Branch selection
- Authentication state handling
- GitHub permission/error handling
- Secure server-side GitHub API access

---

Phase 4 — GitHub Repository Tools

Status: In Progress

Target functionality:

- Repository tree inspection
- Directory inspection
- File reading
- File creation
- File editing
- File deletion
- Branch operations
- Real GitHub commits
- Commit status/result reporting
- File conflict handling
- GitHub API error handling

All operations must use the real GitHub API.

No fake repository state or simulated commits are acceptable.

---

Phase 5 — AI Coding Agent

Status: Started

The real Gemini-powered agent conversation layer is working.

The next stage is completing the full coding-agent workflow.

Target workflow:

USER REQUEST
     │
     ▼
UNDERSTAND REQUEST
     │
     ▼
INSPECT REPOSITORY
     │
     ▼
PLAN
     │
     ▼
READ REQUIRED FILES
     │
     ▼
ANALYZE
     │
     ▼
GENERATE CHANGES
     │
     ▼
REQUEST PERMISSION
     │
     ▼
WRITE TO GITHUB
     │
     ▼
VERIFY
     │
     ▼
COMMIT
     │
     ▼
REPORT RESULT

The agent must not modify files merely because a conversation occurred.

Coding actions must be based on explicit user instructions and the project's permission rules.

---

Phase 6 — Permission System

Status: Foundation / In Progress

The permission architecture is being developed around explicit user approval.

Planned permission modes include:

- "ALLOW ONCE"
- "ALLOW FOR TASK"
- "DENY"

Sensitive and destructive operations must require confirmation.

Examples include:

- Creating files
- Editing files
- Deleting files
- Creating branches
- Committing changes
- Other potentially destructive repository operations

The server must independently validate permissions rather than trusting frontend state.

---

Phase 7 — Persistent Chat History

Status: Planned

Target functionality:

- Persistent conversations
- Multiple conversations
- Conversation titles
- Conversation switching
- Conversation deletion
- IndexedDB storage
- Conversation restoration after reload
- Mobile-friendly history interface

Chat history should remain available without requiring the user to send the entire previous conversation to Gemini every time.

---

Phase 8 — Project Memory & Context Management

Status: Planned

Project memory will allow the agent to maintain useful repository-specific context.

Target functionality:

- Memory per repository
- Project instructions
- Important architecture decisions
- User preferences
- Relevant previous decisions
- Working context
- Task context
- Repository-aware conversation state

The system should avoid blindly sending an entire large repository to Gemini.

Instead, the agent should retrieve only the files and context required for the current task.

---

Phase 9 — Hardening & Production Verification

Status: Planned

Final hardening will cover:

- Security review
- Authentication validation
- Permission validation
- Gemini error handling
- GitHub error handling
- Rate-limit handling
- Quota handling
- Invalid model handling
- API timeout handling
- Concurrent operation handling
- Git conflicts
- Large repository handling
- Context limits
- Performance optimization
- Mobile UI reliability
- Production deployment verification
- End-to-end coding-task testing

The final system must be tested using real repositories and real API operations.

---

Project Architecture

Current high-level architecture:

┌─────────────────────────────┐
│       Mobile Web UI         │
│                             │
│ Chat / GitHub / Settings    │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│       Vercel API Layer      │
│                             │
│ Central API Router          │
└───────┬───────────┬─────────┘
        │           │
        ▼           ▼
┌─────────────┐ ┌─────────────┐
│   Gemini    │ │   GitHub    │
│   Service   │ │   Service   │
└──────┬──────┘ └──────┬──────┘
       │               │
       ▼               ▼
┌─────────────┐ ┌─────────────┐
│ Gemini API  │ │ GitHub API  │
└─────────────┘ └─────────────┘

The agent layer sits above the service layer and coordinates AI reasoning with repository operations.

---

Development Rules

1. No fake production functionality.
2. No simulated GitHub commits.
3. No placeholder success responses for real operations.
4. No hardcoded Gemini model names.
5. Gemini models must be discovered dynamically.
6. Gemini API keys must remain server-side.
7. GitHub credentials must remain protected.
8. The frontend must not directly expose server secrets.
9. Failed operations must never be reported as successful.
10. Sensitive operations require explicit permission.
11. Server-side validation must not rely solely on frontend controls.
12. Large repositories must use targeted context rather than blindly sending the complete repository.
13. Each major phase must be verified before moving forward.
14. Existing working functionality should not be unnecessarily rewritten.
15. The application must remain usable on mobile devices.
16. Production functionality must use real APIs and real responses.

---

Phase Progress

Phase| Status
Phase 0 — Foundation| Complete
Phase 1 — Gemini Integration| Complete
Phase 2 — Dynamic Gemini Models| Complete
Phase 3 — GitHub Authentication| In Progress
Phase 4 — GitHub Repository Tools| In Progress
Phase 5 — AI Coding Agent| Started
Phase 6 — Permission System| Foundation
Phase 7 — Persistent Chat History| Planned
Phase 8 — Project Memory| Planned
Phase 9 — Hardening & Verification| Planned

---

Current Milestone

Phase 2 is considered complete.

The project now has a working foundation, real Gemini integration, dynamic Gemini model discovery, model filtering, manual model selection, Auto model selection architecture, and real Gemini conversation capability.

The next major milestone is completing the GitHub repository operation layer and connecting it to the AI agent so the agent can safely inspect and modify real repositories through explicit user-approved actions.

---

Repository

GitHub:

"lagenddesi/LD76_GitHub-Agent"

Production:

"https://ld-76-git-hub-agent-two.vercel.app/"

---

Important Note

This README describes the project's current development state and roadmap.

A phase being marked complete means its defined project milestone is considered complete at the project-planning level. Individual features inside later phases still require end-to-end verification before those phases can be marked complete.
