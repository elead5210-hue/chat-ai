```markdown
// FILE: README.md
# Nexus AI

Nexus AI is a browser-based React application built with Vite. From its structure, it appears to guide a user through a structured conversation with an AI assistant, using a defined interchange protocol: it generates prompts, accepts pasted responses, validates them against a schema, renders them as forms and components, tracks progress through a checklist, and produces a final document.

> This README is based only on the project's name, description and file tree. Details that cannot be determined from those sources (exact scripts, versions, runtime behaviour) are intentionally left out. See `package.json` and `docs/nexus-protocol.md` for specifics.

## Features

Based on the files in the repository, the project includes:

- **Conversation UI** with a checklist-progress display (`src/components/conversation/`).
- **Prompt generation** for the conversation and for the final document (`src/prompt/`), along with a component catalog.
- **Interchange panels** for previewing prompts, pasting responses, viewing a context package and viewing the final document (`src/components/interchange/`).
- **Protocol schema and response validation** (`src/protocol/`).
- **Schema-driven component rendering**, including a form renderer and field components (`src/components/renderer/`) and a component registry (`src/components/registry/`).
- **Document preview** with a Markdown-to-HTML converter (`src/components/document/`).
- **Context handling**: context packages, snapshots and fingerprints (`src/context/`).
- **State management** for the checklist, conversation, prompt input, UI state and sessions (`src/state/`).
- **Session persistence** through a session database and snapshots (`src/storage/`).
- **Session menu** in the layout (`src/components/layout/`).
- **Unit tests** alongside most modules (files named `*.test.js` / `*.test.jsx`).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) and npm (the project has a `package.json` and `package-lock.json`).

### Install

```bash
npm install
```

### Run

The project uses Vite (see `vite.config.js`). Check the `scripts` section of `package.json` for the exact commands available. Typically, a Vite project is started with:

```bash
npm run dev
```

### Tests

Test files are present throughout `src/`. Check `package.json` for the configured test command.

## Project Structure

```
.
├── docs/
│   └── nexus-protocol.md        # Documentation of the Nexus protocol
├── src/
│   ├── main.jsx                 # Application entry point
│   ├── App.jsx                  # Root component
│   ├── components/
│   │   ├── conversation/        # ConversationPanel, ChecklistProgress
│   │   ├── document/            # DocumentPreview, markdownToHtml
│   │   ├── interchange/         # InterchangePanel, PromptPreview, ResponsePaste,
│   │   │                        # ContextPackagePanel, FinalDocumentPanel
│   │   ├── layout/              # SessionMenu
│   │   ├── registry/            # componentRegistry, coreComponents
│   │   └── renderer/            # ComponentRenderer, SchemaForm, fields
│   ├── context/                 # contextPackage, contextSnapshot, contextFingerprint
│   ├── prompt/                  # generatePrompt, generateFinalDocumentPrompt, componentCatalog
│   ├── protocol/                # schema, validateResponse
│   ├── state/                   # checklistStore, conversationStore, promptInput,
│   │                            # uiStateStore, useSession
│   ├── storage/                 # sessionDb, sessionSnapshot
│   └── styles/
│       └── app.css              # Application styles
├── index.html                   # HTML entry point for Vite
├── vite.config.js               # Vite configuration
├── package.json                 # Dependencies and scripts
├── package-lock.json            # Locked dependency versions
├── init.md                      # Project initialisation notes
├── .intentforge/                # Project metadata (project, roadmap, archive)
└── .vite/                       # Vite dependency cache (generated)
```

### Folder overview

| Path | Purpose |
| --- | --- |
| `src/components/` | React UI components, grouped by feature area. |
| `src/context/` | Building, snapshotting and fingerprinting the context passed along in the conversation. |
| `src/prompt/` | Generating prompts and describing the available components. |
| `src/protocol/` | Defining the protocol schema and validating responses against it. |
| `src/state/` | Stores and hooks managing application and session state. |
| `src/storage/` | Persisting sessions and session snapshots. |
| `src/styles/` | Global CSS. |
| `docs/` | Protocol documentation. |

### Other files and directories

- `.intentforge/` holds project metadata (`project.json`, `roadmap.json`) and an archive snapshot.
- `.vite/` contains Vite's generated dependency pre-bundling cache; it is not source code.
- `init.md` contains initial project notes.

## Documentation

For details of the protocol the app implements, see [`docs/nexus-protocol.md`](docs/nexus-protocol.md).
```