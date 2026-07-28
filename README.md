To install dependencies:
```sh
bun install
```

To run:
```sh
bun run dev
```

open http://localhost:3000

## Docker

`docker-compose.yml` runs Postgres only — the API runs on the host with
`bun run dev`.

```sh
docker compose up -d
```

Postgres listens on `localhost:5432` with user `postgres`, database
`streetlights`, and data persisted in the `pgdata` volume.

`DATABASE_URL` in `.env` must match those values:

```
DATABASE_URL="postgresql://postgres:517517@localhost:5432/streetlights?schema=public"
```

Apply migrations against it with:

```sh
bun run db:migrate
```

### Building the API image

`Dockerfile` is multi-stage and independent of Compose. Build a specific stage
with `--target`:

- `runtime` (default) — production image, non-root `bun` user, prod dependencies
  only, `HEALTHCHECK` against `GET /`.
- `dev` — full dependency tree and `bun run dev` (hot reload); bind-mount your
  working tree over `/app` to use it.
- `migrate` — includes the Prisma CLI, runs `prisma migrate deploy`.

`prisma generate` runs during the build, so `src/generated/prisma` is baked into
the image and does not need to exist on the host.

```sh
docker build -t street-light-backend .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:517517@host.docker.internal:5432/streetlights?schema=public" \
  -e JWT_SECRET=... \
  street-light-backend
```
