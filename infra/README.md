# TextShare infrastructure (AWS, Terraform)

```
Internet ──▶ Elastic IP ──▶ NLB ──▶ ALB (internal) ──┬─▶ frontend  (ECS Fargate, :3000)
                                                     └─▶ backend   (ECS Fargate, :4000) ──▶ RDS Postgres (private subnets)
                                                         /api/*, /socket.io/*
GitHub Actions ──(OIDC role, no stored keys)──▶ ECR (images) + ECS (deploys)
```

| File | What it creates |
| --- | --- |
| `network.tf` | VPC, 2 public subnets (load balancers + containers), 2 private subnets (database), internet gateway |
| `security_groups.tf` | Firewalls: internet → NLB → ALB → containers → database |
| `load_balancers.tf` | Elastic IP, public NLB, internal ALB with path routing, target groups + health checks |
| `database.tf` | RDS Postgres (`db.t4g.micro`, encrypted, private, daily backups) |
| `secrets.tf` | Generated DB password and JWT secret in Secrets Manager |
| `ecr.tf` | Image repositories `textshare-backend` / `textshare-frontend` |
| `ecs.tf` | ECS cluster, task definitions (ARM64), services, CloudWatch log groups |
| `iam.tf` | ECS execution role, GitHub OIDC provider, least-privilege GitHub deploy role |

Approximate cost while running: **$60–80/month** (NLB ≈ $18, ALB ≈ $18, RDS ≈ $15, 2 Fargate tasks ≈ $15, Elastic IP + public IPs ≈ $11, secrets ≈ $1).

## First-time setup

Prerequisites: AWS CLI profile `textshare` with admin rights, Terraform ≥ 1.10, Docker, `gh` logged in.

```bash
export AWS_PROFILE=textshare
export AWS_REGION=ap-south-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export BUCKET=textshare-tfstate-$ACCOUNT_ID
export REGISTRY=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 1. S3 bucket for Terraform state (one time; Terraform can't create its own state bucket)
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION \
  --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-bucket-versioning --bucket $BUCKET --versioning-configuration Status=Enabled

# 2. Connect Terraform to the state bucket
cd infra
terraform init -backend-config="bucket=$BUCKET"

# 3. Create the image repositories first, and push the first images
terraform apply -target=aws_ecr_repository.app
aws ecr get-login-password | docker login --username AWS --password-stdin $REGISTRY
docker build -t $REGISTRY/textshare-backend:initial ../backend   && docker push $REGISTRY/textshare-backend:initial
docker build -t $REGISTRY/textshare-frontend:initial ../frontend && docker push $REGISTRY/textshare-frontend:initial

# 4. Create everything else (shows a plan and asks "yes" first)
terraform apply

# 5. Tell GitHub Actions which role to use
gh variable set AWS_REGION   --body "$AWS_REGION"
gh variable set AWS_ROLE_ARN --body "$(terraform output -raw github_deploy_role_arn)"

terraform output app_url   # open this in the browser
```

## Everyday deploys

Push to `main`. The **Deploy** workflow runs the checks, builds ARM images tagged with the commit hash, pushes them to ECR and rolls out both ECS services, waiting until they are healthy. A failed rollout is rolled back automatically (ECS deployment circuit breaker).

To redeploy without a code change, use **Actions → Deploy → Run workflow**.

## Changing infrastructure

Edit the `.tf` files, then `terraform plan` (preview) and `terraform apply`. Changes to container settings (environment variables, CPU/memory) are picked up by the **next deploy**, because GitHub Actions owns the running task definition revision.

## Debugging

- Logs: CloudWatch → Log groups → `/ecs/textshare/backend` and `/ecs/textshare/frontend`, or
  `aws logs tail /ecs/textshare/backend --follow`
- Service events (why a task stopped): ECS → Clusters → textshare → service → *Events* tab
- Health: EC2 → Target groups → `textshare-backend` / `textshare-frontend` / `textshare-nlb-to-alb` → *Targets*

## Scaling notes

- **Backend runs exactly one task.** Each room's live document is in its memory; deploys stop the old task before starting the new one (a few seconds of reconnecting). Running several backends needs Redis pub/sub first.
- Frontend can scale: set `frontend_desired_count`.
- The NLB uses one subnet/Elastic IP. For zone redundancy add a second `subnet_mapping` with another Elastic IP.

## Tear down (stop all charges)

```bash
terraform apply -var="db_deletion_protection=false"   # allow deleting the database
terraform destroy                                       # keeps a final DB snapshot "textshare-db-final"
aws s3 rb s3://$BUCKET --force                          # optional: remove the state bucket
```
