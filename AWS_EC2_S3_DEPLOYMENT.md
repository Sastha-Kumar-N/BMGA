# BMGA EC2 + S3 Secure Deployment Guide

This guide deploys BMGA on one EC2 instance, stores uploaded MAYA/result files in private S3, and uses RDS PostgreSQL for structured data. This is safer than running PostgreSQL inside the EC2 app instance.

## Target Architecture

- Route 53/domain DNS points to EC2 Elastic IP.
- EC2 runs Docker Compose with:
  - Caddy reverse proxy on ports `80` and `443`
  - Next.js frontend, internal only
  - Express backend, internal only
- Amazon RDS PostgreSQL stores users, organisms, audit logs, and metadata.
- Private S3 bucket stores uploaded MAYA/result files.
- EC2 instance profile grants S3 access. Do not put AWS access keys in `.env`.

## 1. Create The S3 Data Bucket

Use a globally unique bucket name such as `bmga-prod-data-your-org`.

Security settings:

- Block all public access: enabled.
- Bucket versioning: enabled.
- Default encryption: SSE-S3 or SSE-KMS.
- Object ownership: bucket owner enforced.
- Public bucket policy: none.

Create folders/prefixes conceptually through object keys; BMGA will write to:

```text
bmga-prod/maya-results/<organism-id>/<tool-name>/<timestamp>-<uuid>-<file>
```

## 2. Create IAM Role For EC2

Create an IAM role for EC2, then attach a least-privilege S3 policy based on:

```text
deploy/aws/iam-s3-policy.json
```

Replace `REPLACE_WITH_BUCKET_NAME` with your bucket name.
The policy includes `s3:DeleteObject` so Admin Delete Management can remove stored result files instead of leaving orphaned private objects.

If you use a customer-managed KMS key for S3, also allow:

```json
{
  "Effect": "Allow",
  "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
}
```

## 3. Create RDS PostgreSQL

Recommended settings:

- Engine: PostgreSQL 16 or current supported PostgreSQL.
- Public access: no.
- Encryption: enabled.
- Automated backups: enabled.
- Multi-AZ: enabled for production when budget allows.
- Security group: allow inbound `5432` only from the EC2 security group.
- Database name: `bmga`.
- App database user: create a non-master user for the application.

The app connection string should look like:

```text
postgresql://bmga_app:STRONG_PASSWORD@RDS_ENDPOINT:5432/bmga?schema=public&sslmode=require
```

## 4. Create EC2 Instance

Recommended minimum:

- Ubuntu 24.04 LTS or Amazon Linux 2023.
- Instance type: start with `t3.medium` or `t4g.medium` if using ARM-compatible builds.
- Storage: encrypted gp3 EBS, 30-60 GB.
- IAM instance profile: attach the EC2 S3 role from step 2.
- Security group inbound:
  - `22` from your IP only, or use SSM Session Manager and close SSH.
  - `80` from `0.0.0.0/0` and `::/0`.
  - `443` from `0.0.0.0/0` and `::/0`.
  - Do not expose `3000`, `3001`, or `5432`.

## 5. Prepare DNS

Create an Elastic IP and attach it to the EC2 instance.

In Route 53 or your DNS provider:

```text
A record: bmga.example.org -> EC2 Elastic IP
```

Wait for DNS to resolve before starting Caddy, because Caddy will request the HTTPS certificate.

## 6. Install Docker On EC2

SSH or SSM into EC2:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
```

Log out and back in so group membership applies.

## 7. Copy Code To EC2

Use your preferred secure path:

```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git bmga
cd bmga
```

Or copy a release tarball if the repository is private and you do not want Git credentials on EC2.

## 8. Create Production Environment File

```bash
cd deploy/aws
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production`:

```bash
nano .env.production
```

Required values:

- `BMGA_DOMAIN`
- `ACME_EMAIL`
- `NEXTAUTH_URL`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `DATABASE_URL`
- `JWT_SECRET`
- `NEXTAUTH_SECRET`
- `BMGA_ADMIN_EMAIL`
- `BMGA_ADMIN_PASSWORD`
- `S3_BUCKET`
- `S3_REGION`

Generate strong secrets:

```bash
openssl rand -base64 48
```

Do not reuse local development secrets.

## 9. Run Migrations And Seed First Admin

From the repository root:

```bash
docker compose --env-file deploy/aws/.env.production -f deploy/aws/docker-compose.prod.yml --profile migrate run --rm migrate
```

This applies Prisma migrations and creates the first admin from:

- `BMGA_ADMIN_EMAIL`
- `BMGA_ADMIN_PASSWORD`

## 10. Start Production

```bash
docker compose --env-file deploy/aws/.env.production -f deploy/aws/docker-compose.prod.yml up -d --build
```

Check health:

```bash
docker compose --env-file deploy/aws/.env.production -f deploy/aws/docker-compose.prod.yml ps
curl -I https://YOUR_DOMAIN
```

Open:

```text
https://YOUR_DOMAIN
```

## 11. Verify S3 Storage

In the Admin Portal, upload a small MAYA result file.

Then check S3:

```bash
aws s3 ls s3://YOUR_BUCKET/bmga-prod/maya-results/ --recursive
```

The database stores the object reference as an `s3://...` path. Downloads stream through the backend so the bucket can remain private.

## 12. Security Checklist Before Public Launch

- S3 public access blocked.
- EC2 IAM role uses least privilege, no static AWS keys in `.env`.
- EC2 security group exposes only `80`, `443`, and restricted SSH/SSM.
- RDS is private and only accepts the EC2 security group.
- Production secrets are strong and not committed.
- `ALLOW_INSECURE_DEV_SECRETS=false`.
- `SEED_DEMO_USER=false`.
- `SEED_DEMO_DATA=false`.
- HTTPS works.
- Admin password changed after first login.
- CloudWatch log retention configured.
- GuardDuty enabled.
- AWS Backup or RDS automated backups enabled.

## 13. Routine Updates

On EC2:

```bash
cd bmga
git pull
docker compose --env-file deploy/aws/.env.production -f deploy/aws/docker-compose.prod.yml --profile migrate run --rm migrate
docker compose --env-file deploy/aws/.env.production -f deploy/aws/docker-compose.prod.yml up -d --build
docker image prune -f
```

## 14. Emergency Stop

```bash
docker compose --env-file deploy/aws/.env.production -f deploy/aws/docker-compose.prod.yml down
```

This stops web traffic but does not delete RDS or S3 data.
