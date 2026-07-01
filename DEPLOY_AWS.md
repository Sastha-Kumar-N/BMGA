# BMGA AWS Production Deployment Security Checklist

This application handles sensitive biological, user, and admin data. Production deployments must use secure environment variables, private networking, HTTPS, strict CORS, audit logging, and monitored traffic controls.

For the EC2 + S3 deployment path requested for BMGA, follow:

```text
AWS_EC2_S3_DEPLOYMENT.md
```

## Required Secrets And Configuration

Store secrets in AWS Secrets Manager or SSM Parameter Store. Do not commit production secrets to Git.

Required production values:

- `NODE_ENV=production`
- `ALLOW_INSECURE_DEV_SECRETS=false`
- `DATABASE_URL`
- `JWT_SECRET` with at least 32 random characters
- `NEXTAUTH_SECRET` with at least 32 random characters
- `CORS_ORIGIN=https://your-domain.example`
- `FRONTEND_URL=https://your-domain.example`
- `NEXTAUTH_URL=https://your-domain.example`
- `BMGA_ADMIN_EMAIL`
- `BMGA_ADMIN_PASSWORD`
- `STORAGE_DRIVER=s3` for production uploads
- `S3_BUCKET`
- `S3_REGION`
- `S3_PREFIX`
- `SEED_DEMO_USER=false`
- `SEED_DEMO_DATA=false`
- `BMGA_DEMO_PASSWORD` only if demo accounts are explicitly allowed in that environment

Recommended values:

- `LOG_LEVEL=info`
- `ENABLE_REQUEST_LOGGING=true`
- `RATE_LIMIT_WINDOW_MS=900000`
- `LOGIN_RATE_LIMIT_MAX=10`
- `CONTACT_RATE_LIMIT_MAX=5`
- `ADMIN_RATE_LIMIT_MAX=300`
- `IMPORT_RATE_LIMIT_MAX=40`
- `MAX_IMPORT_FILE_BYTES=5242880`
- `ADMIN_ALLOWED_IPS` if admin access should be IP restricted
- `ADMIN_EMAIL_DOMAINS` if admins must use approved email domains

## Database

Use Amazon RDS for PostgreSQL. Run the app with a least-privilege database user, not the master user. Restrict inbound database access to the app security group only.

Enable:

- automated backups
- encryption at rest
- private subnets where possible
- rotation of database credentials
- migration execution through the backend deployment job or one-off task

Run migrations as a separate deployment job or one-off task. The public API container should not run database migrations on every boot.

```bash
npm run db:migrate
```

For local Docker Compose:

```bash
docker compose --profile migrate run --rm migrate
docker compose up --build
```

Demo organism/tool-result records are disabled by default. Set `SEED_DEMO_DATA=true` only for local demos or isolated staging environments, never for production biological data.

## App Runner

Recommended App Runner health check path:

```text
/health
```

Readiness check path for database dependency:

```text
/ready
```

Set App Runner port to the backend/frontend container port, or set `PORT` so the container binds to the expected value. The app binds to `0.0.0.0`.

Suggested autoscaling:

- minimum instances: `1` for low traffic, `2` for higher availability
- maximum instances: start at `5`, increase after load testing
- concurrency: start at `50`
- monitor CPU, memory, request count, latency, 4xx, 5xx, and restarts

## ECS/ALB Alternative

If using ECS with an Application Load Balancer:

- target group health check path: `/ready`
- restrict task security group ingress to the ALB
- restrict database ingress to the backend task security group
- use HTTPS listener with ACM certificate
- enable ALB access logs
- configure target tracking on CPU, memory, and request count per target

## Logging And Monitoring

The backend writes structured JSON logs in production to stdout/stderr. Send container logs to CloudWatch Logs.

Logs include:

- request ID
- method
- path
- status code
- duration
- IP address
- user agent

Sensitive values are not logged: passwords, tokens, cookies, authorization headers, and secrets.

Recommended monitoring:

- CloudWatch Logs retention policy
- CloudWatch alarms for 5xx rate, high latency, CPU, memory, and restart count
- uptime checks against `/health`
- dependency checks against `/ready`
- optional Sentry or equivalent error tracking using `SENTRY_DSN`

## Audit Logs

Admin actions are written to the `AdminLog` table with request metadata. Audited events include:

- admin login success
- failed login attempts
- permission denied events
- user role changes
- admin password resets
- contact message reads
- contact message status updates
- contact message archives
- organism upload approval/rejection/deletion
- blog approval/rejection/deletion
- MAYA/tool result imports

Do not store secrets in audit metadata.

## CORS, CSRF, And Sessions

Set `CORS_ORIGIN` and `FRONTEND_URL` to trusted HTTPS origins only. Wildcard CORS is not allowed in production.

Backend APIs use Bearer JWTs in the `Authorization` header, so browser CSRF risk is materially lower than cookie-authenticated mutation APIs. NextAuth sessions use secure, httpOnly, sameSite cookies in production for the frontend session. Admin mutation APIs still require server-side admin authorization and rate limits.

## AWS WAF And Edge Protection

For public traffic, place AWS WAF in front of App Runner, ALB, or CloudFront.

Enable:

- AWS managed common rule set
- SQL injection managed rules
- known bad inputs managed rules
- rate-based rule for login/contact/admin paths
- bot control if abusive traffic appears
- optional IP allowlist for `/admin` routes
- blocking of common exploit patterns

Use CloudFront in front of the frontend if static asset caching and edge TLS termination are needed.

## Upload And File Security

The API validates import file extensions and size before parsing. Store uploaded results outside the public web root. Never execute uploaded files.

Production file storage should use:

```text
STORAGE_DRIVER=s3
S3_BUCKET=<private bucket>
S3_REGION=<bucket region>
S3_PREFIX=bmga-prod
```

The backend stores uploaded MAYA/result files as private S3 objects and streams downloads through authenticated application routes. Keep S3 public access blocked and grant the EC2 instance role only the object actions needed for the configured prefix.

For production malware scanning, store uploads in S3 and use an antivirus scanning workflow such as S3 event -> Lambda/ECS scanner -> quarantine or release tag.

## IAM And Network Security

- Use IAM roles with least privilege.
- Keep app and database in private networking where supported.
- Restrict security groups to required ports.
- Use separate dev, staging, and production AWS accounts or environments.
- Rotate secrets periodically.
- Enable GuardDuty.
- Enable AWS Config/Security Hub where available.

## Dependency And CI Checks

Run:

```bash
cd backend && npm run typecheck && npm run audit:prod
cd frontend && npm run lint && npm run typecheck && npm run build && npm run audit:prod
docker compose build
```

Do not promote a release while `npm run audit:prod` reports unresolved high or critical production vulnerabilities. Patch Next.js, next-auth/Auth.js, Prisma, and other runtime dependencies before deployment; use Dependabot PRs for routine patch updates and test them with the same commands above.

Enable GitHub secret scanning, Dependabot, and branch protection for production deployments.
