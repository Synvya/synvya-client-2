# synvya-client-2

Synvya’s merchant-facing web client for onboarding, profile management, and Square catalog publishing. The repo contains the Vite/React frontend, supporting Lambda functions, and deployment plumbing for Synvya’s second-generation client site (`https://client2.synvya.com`).

## Repository Layout
- `client/` – Vite + React application (TypeScript, Tailwind) and local dev tooling.
- `infra/` – AWS SAM template, Lambda sources, and zipped artifacts for console-based deployments.
- `internal/` – Deployment references (GitHub secrets, IAM policy history, NIP-99 notes).

## Local Development
- Node.js 20+
- From `client/`:
  ```bash
  npm install
  cp .env.example .env
  # Fill in the values described below
  npm run dev
  ```
- The dev server runs on `http://localhost:5173`.

### Required `.env` values
| Variable | Purpose |
| --- | --- |
| `VITE_UPLOAD_NSEC` | nostr.build upload secret for local media testing. |
| `VITE_UPLOAD_PROXY_URL` | Base URL that exposes `/media/upload` (CloudFront routes to the Lambda proxy). |
| `VITE_API_BASE_URL` | Base URL for the API Gateway that fronts the Lambda functions. |
| `VITE_DEFAULT_RELAYS` | Comma-separated relay list for publishing profile events. |
| `VITE_SQUARE_*` | Square OAuth configuration (env, application id, redirect URI). |

## Build & Continuous Delivery
- Production builds are generated with `npm run build` from `client/` which creates `client/dist/`.
- `.github/workflows/deploy.yml` automates deployment on pushes to `main` or manual dispatch:
  - Install deps (`npm ci`), run the production build.
  - Assume IAM role `arn:aws:iam::122610503853:role/SynvyaClientGithubActions`.
  - `aws s3 sync dist/ s3://client2-synvya-com --delete`.
  - Optionally invalidate CloudFront distribution `E10XBQFR9NDURM`.
- GitHub repository secrets (documented in `internal/github_variables.md`) drive the workflow:
  | Secret | Value |
  | --- | --- |
  | `AWS_REGION` | `us-east-1` |
  | `AWS_ROLE_ARN` | `arn:aws:iam::122610503853:role/SynvyaClientGithubActions` |
  | `VITE_UPLOAD_PROXY_URL` | `https://client2.synvya.com` |
  | `CLOUDFRONT_DISTRIBUTION_ID` | `E10XBQFR9NDURM` |

## AWS Infrastructure

### Static Frontend Hosting (manual console steps)
The static hosting stack was configured directly via the AWS console:
1. **S3 bucket** `client2-synvya-com`
   - Region: `us-east-1`.
   - Block Public Access disabled (serves via CloudFront), but bucket policy restricted to CloudFront Origin Access Control (OAC).
   - Versioning left disabled (deploy pipeline uses `--delete` sync).
2. **CloudFront distribution** pointing at the S3 bucket
   - Origin Access Control connected to the bucket.
   - Alternate domain name `client2.synvya.com` with an ACM certificate in `us-east-1`.
   - Default root object `index.html`, error responses mapped for SPA routing (404 → 200).
   - Additional behavior: `/media/*` (and other API paths such as `/square/*`) forward to the API Gateway domain created below.
3. **Route 53** record – `client2.synvya.com` ALIAS → CloudFront distribution.
4. Tested that `https://client2.synvya.com` served the built assets and that `/media/upload` proxied requests to the Lambda API.

### Backend API (SAM stack + console hand-offs)
`infra/template.yaml` defines the upload proxy and Square integration. Deployment steps:
1. Packaged the Lambda source (see zipped artifacts in `infra/`) using `npm install --production` and `zip`.
2. Uploaded the template through **CloudFormation → Create stack → With new resources (standard)**.
   - Template source: uploaded local copy of `infra/template.yaml`.
   - Parameters:
     - `UploadSecretArn`: ARN of the Secrets Manager secret holding the nostr `nsec`.
     - `AllowedOrigins`: `https://client2.synvya.com`.
     - `SquareEnvironment`: `production`.
     - `SquareApplicationId`, `SquareClientSecret`, `SquareRedirectUri` (copied from Square Developer dashboard).
     - `NostrRelays`: coma-separated relay list used for publishing catalog events.
     - `NostrNsec`: server-held Nostr secret key for signing NIP-99 listings.
3. After stack creation, verified resources in the console:
   - `AWS::Serverless::HttpApi` – base URL exported as stack output.
   - Lambda functions `UploadProxyFunction` and `SquareIntegrationFunction`.
   - DynamoDB table for Square connections.
4. Captured the API base URL (e.g., `https://xxxxx.execute-api.us-east-1.amazonaws.com`) and updated:
   - `VITE_API_BASE_URL` (frontend build-time variable) so Square API calls hit the HttpApi.
   - CloudFront behavior origins so `/media/*` routes to `{ApiBaseUrl}` while static assets continue to use S3.
   - Local `.env` for developer testing; for production builds set an environment variable or GitHub secret before running `npm run build`.

### Secrets & Keys (manual)
1. **AWS Secrets Manager**
   - Created secret (e.g., `synvya-upload-nsec`) in `us-east-1`.
   - Secret value stored as JSON: `{ "synvya-nsec": "nsec1..." }` to match the Lambda default key.
   - Recorded the ARN for the SAM parameter `UploadSecretArn`.
2. **Nostr Signing Key**
   - Separate secret storing the backend signing `nsec` used by the Square Lambda (referenced via parameter `NostrNsec`).
3. **Square Developer Portal**
   - Created an application in the Square dashboard (production mode).
   - Added redirect URI `https://client2.synvya.com/square/callback` and sandbox equivalent for testing.
   - Captured Application ID and Client Secret for both SAM template parameters and local `.env`.

### IAM & GitHub Integration (manual console steps)
1. Configured an IAM OIDC provider for `token.actions.githubusercontent.com` (if not already present).
2. Created role `SynvyaClientGithubActions` with trust policy limiting access to the `Synvya/synvya-client-2` repo.
3. Attached deployment policy allowing:
   - S3 sync to `client2-synvya-com`.
   - CloudFront invalidations on distribution `E10XBQFR9NDURM`.
   - CloudFormation/Lambda access for manual updates when required.
4. Stored the role ARN in GitHub secrets and validated `aws sts get-caller-identity` from a workflow run.

### Manual Lambda Maintenance
- Zipped artifacts `infra/lambda.zip` (upload proxy) and `infra/synvya-square-integration.zip` mirror the versions currently deployed. They can be re-uploaded via the Lambda console when an urgent hotfix is required without going through CloudFormation.

## Operations Checklist
- **Local testing**: `npm run dev`, `npm run build`, `npm run preview`.
- **Deployment**: merge to `main` or trigger the “Deploy Frontend” GitHub Action.
- **Cache busting**: workflow triggers CloudFront invalidation; re-run if assets appear stale.
- **Secrets rotation**: update Secrets Manager value, then re-deploy the SAM stack (or trigger environment variables via console) and update GitHub secrets if URLs change.

## Troubleshooting
- Frontend returning 403 → confirm CloudFront OAC has read access to the S3 bucket and that `aws s3 sync` uploaded the latest build.
- Upload proxy CORS errors → ensure `AllowedOrigins` parameter includes the site origin and redeploy the SAM stack.
- Square OAuth failures → double-check redirect URI in Square Developer dashboard and the `VITE_SQUARE_*` values in both `.env` and SAM parameters.
