# Soulvolks Backend

Strapi CMS backend for [soulvolks.it](https://soulvolks.it).

## Stack
- Strapi 5
- PostgreSQL 15
- Node.js 20
- Docker

## Features
- Events management
- Ticket system with QR code
- Blog / articles
- Media management

## Development

```bash
npm run develop
```

## Production

Deployed via Docker on a self-hosted VPS.

```bash
docker compose up -d
```

## Environment variables

See `.env.example` for required variables.
