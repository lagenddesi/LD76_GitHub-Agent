LD76 Code Agent

A mobile-first AI coding agent for GitHub repositories.

LD76 Code Agent is a production-oriented web application that combines Gemini AI, GitHub, and Vercel to provide an AI-assisted coding workflow directly from a mobile-friendly interface.

The long-term goal is simple: talk to the agent about your codebase, let it understand the repository, plan changes, and—only with permission—perform real changes through GitHub.

---

✨ Features

AI Coding Assistant

- Gemini-powered conversational coding assistant
- Natural-language coding instructions
- Code planning and analysis
- Repository-aware agent workflow
- Server-side Gemini API integration

Dynamic Gemini Models

- Discovers available models directly from the Gemini API
- No hardcoded model catalogue
- Capability-based model filtering
- Manual model selection
- Auto model selection
- Model refresh
- Graceful API and quota error handling

GitHub Integration

- GitHub repository connection
- Repository selection
- Branch-aware workflow
- Foundation for real repository inspection and modification
- Designed for real GitHub API operations rather than simulated data

Mobile-First Interface

- Responsive mobile UI
- Dedicated Chat, GitHub and Settings sections
- Lightweight Vanilla JavaScript frontend
- Designed for use directly from an Android phone

Secure Architecture

- Gemini API key stored server-side
- Vercel environment variables for secrets
- API requests routed through the backend
- Secrets are never exposed to frontend JavaScript

---

🏗️ Architecture

┌──────────────────────┐
│      Mobile UI       │
│                      │
│ Chat / GitHub /      │
│ Settings             │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    Vercel API        │
│                      │
│ Server-side routing  │
└───────┬────────┬─────┘
        │        │
        ▼        ▼
┌────────────┐ ┌────────────┐
│  Gemini    │ │  GitHub    │
│  Service   │ │  Service   │
└─────┬──────┘ └─────┬──────┘
      │              │
      ▼              ▼
┌────────────┐ ┌────────────┐
│ Gemini API │ │ GitHub API │
└────────────┘ └────────────┘

The agent layer will coordinate AI reasoning with repository operations as the project progresses.

---

🛠️ Tech Stack

Layer| Technology
Frontend| HTML, CSS, Vanilla JavaScript
Backend| Vercel Serverless Functions
AI| Google Gemini API
Repository| GitHub API
Hosting| Vercel
Source Control| GitHub
Client Storage| IndexedDB — planned

---

🔐 Environment Variables

The Gemini API key must be configured as a server-side environment variable:

LD76_GEMINI_API_KEY=your_gemini_api_key

For local development:

.env.local

The API key must never be placed in frontend JavaScript or committed to the repository.

Production deployments should configure secrets through the Vercel project environment settings.

---

🚀 Development

Clone the repository:

git clone https://github.com/lagenddesi/LD76_GitHub-Agent.git
cd LD76_GitHub-Agent

Install dependencies if required by the current backend:

npm install

Configure the required environment variables and run the project using the appropriate Vercel development workflow.

---

📊 Project Status

Phase 0 — Foundation

Complete

Application shell, navigation, frontend structure, Vercel API foundation and core backend architecture are in place.

Phase 1 — Gemini Integration

Complete

Real Gemini API communication, server-side API key handling, connection testing and AI conversation are working.

Phase 2 — Dynamic Gemini Models

Complete

Dynamic model discovery, capability filtering, model refresh, manual selection and Auto model selection are implemented.

Phase 3 — GitHub Integration

In Progress

GitHub connection, repository selection and branch-aware functionality are being expanded and verified.

Phase 4 — Repository Tools

In Progress

Repository tree inspection, file operations and real GitHub commits are being developed.

Phase 5 — AI Coding Agent

In Progress

The core agent workflow is being connected to repository inspection and modification tools.

Phase 6 — Permission System

Planned

Explicit approval for repository-changing and sensitive operations.

Phase 7 — Persistent Chat

Planned

Persistent multi-conversation history using IndexedDB.

Phase 8 — Project Memory

Planned

Repository-specific memory, project instructions and efficient working context.

Phase 9 — Production Hardening

Planned

Security, performance, error handling, conflict handling and complete end-to-end verification.

---

🧠 Agent Workflow

The target coding workflow is:

User Request
     ↓
Understand
     ↓
Inspect Repository
     ↓
Plan
     ↓
Read Required Files
     ↓
Analyze
     ↓
Generate Changes
     ↓
Request Permission
     ↓
Modify GitHub
     ↓
Verify
     ↓
Commit
     ↓
Report Result

The agent is designed to work with the repository incrementally instead of blindly sending an entire codebase to the AI for every request.

---

🔒 Design Principles

- Real APIs only
- No fake repository operations
- No simulated commits
- No hardcoded Gemini model list
- Server-side secret handling
- Explicit permission for sensitive actions
- Accurate operation reporting
- Repository-aware context
- Mobile-first UX
- Incremental development and verification

---

🗺️ Roadmap

[✓] Foundation
[✓] Gemini Integration
[✓] Dynamic Gemini Models
[ ] GitHub Authentication
[ ] Repository Tools
[ ] Full AI Coding Agent
[ ] Permission System
[ ] Persistent Chat History
[ ] Project Memory
[ ] Production Hardening

---

🌐 Project

Repository

"lagenddesi/LD76_GitHub-Agent"

Production

"https://ld-76-git-hub-agent-two.vercel.app/"

---

📄 License

This project is currently developed as a personal AI coding-agent project.

License and distribution terms may be added as the project approaches a public release.
