#!/bin/sh
# Container entrypoint. ROLE=api (default) or ROLE=worker.
# The api container applies migrations and Better Auth's tables before starting;
# with SEED_ON_BOOT=true it instead wipes and seeds the database (staging only).
set -e

if [ "${ROLE:-api}" = "api" ]; then
  if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
    echo "SEED_ON_BOOT=true: resetting and seeding the database"
    npm run seed:reset
  else
    npx prisma db migrate --advance-ref db
    npx auth migrate --config src/auth/cli.ts --yes
  fi
  exec node src/main.ts
fi

exec node src/worker.ts
