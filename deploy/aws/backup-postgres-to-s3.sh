#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root on the EC2 host. AWS CLI uses the EC2 instance role;
# no AWS access key is read from this script or the production environment file.
ENV_FILE="${1:-deploy/aws/.env.ec2}"
COMPOSE_FILE="deploy/aws/docker-compose.ec2.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Production environment file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

for required in POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD S3_BUCKET S3_REGION; do
  if [[ -z "${!required:-}" ]]; then
    echo "Missing required setting: $required" >&2
    exit 1
  fi
done

backup_dir="$(mktemp -d)"
backup_file="$backup_dir/bmga-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
trap 'rm -rf "$backup_dir"' EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=plain' \
  | gzip -9 > "$backup_file"

aws s3 cp "$backup_file" "s3://$S3_BUCKET/${S3_PREFIX:-bmga-prod}/database-backups/$(basename "$backup_file")" \
  --region "$S3_REGION" \
  --only-show-errors

echo "Database backup uploaded successfully."
