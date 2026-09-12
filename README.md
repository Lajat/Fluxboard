# fluxboard

A real-time collaborative Kanban board — built to demonstrate a clean,
well-structured full-stack TypeScript monorepo, not a distributed-systems
showcase (see [`resilient-stack`](../resilient-stack) for that side of the
portfolio instead).

## Structure

```mermaid
flowchart TB
    Root["fluxboard/ (pnpm workspace root)"]
    Web["apps/web<br/>Next.js + TypeScript + Tailwind"]
    Api["apps/api<br/>Node/Express + TypeScript + Socket.io"]
    Shared["packages/shared-types<br/>Card, Board, List, User, SocketEvents"]

    Root --> Web
    Root --> Api
    Root --> Shared
    Web -->|"imports types from"| Shared
    Api -->|"imports types from"| Shared
    Web <-->|"REST + WebSocket"| Api
```

The whole point of the monorepo: `Card`, `Board`, `List`, and the real-time
event names are defined **once**, in `packages/shared-types`, and imported by
both the frontend and the backend. A type change on one side is a compile
error on the other if they've drifted — not a runtime bug discovered later.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Drag & drop | `dnd-kit` |
| Backend | Node.js + Express + TypeScript |
| Real-time | Socket.io |
| Database | MongoDB (Mongoose) |
| Auth | JWT (access + refresh tokens) |
| Deploy | Frontend → Vercel · Backend → AWS · DB → MongoDB Atlas |
| Monorepo tooling | pnpm workspaces + Turborepo |

## Getting started

```bash
pnpm install
pnpm dev        # runs both apps/web and apps/api in parallel via Turborepo
```

## Status

🚧 Early scaffold — auth and board/list/card CRUD are being built first,
real-time sync and deployment come after. See open issues for current phase.
