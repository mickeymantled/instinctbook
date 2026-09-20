# infra/terraform

Empty on purpose.

Production infrastructure-as-code is out of scope until a deploy target (managed Postgres
provider, container host, object storage, CDN, secrets manager — see `docs/SPEC.md`
"Deployment") is actually chosen. Writing Terraform against a hypothetical target now would mean
maintaining fake modules nobody runs, or worse, modules that look real enough to run against the
wrong account by accident. `compose.yaml` (repo root) is the only deployment target this repo
currently supports: a local Docker Compose stack. See its own
[README section](../../README.md#run-the-full-stack) and [infra/docker/README.md](../docker/README.md).

When a deploy target is chosen, this directory gets real Terraform (or whatever that target's
IaC tool is) covering at least: the Postgres instance (with the backup/PITR posture
`docs/SPEC.md` "Deployment" calls for), object storage buckets (private, matching
`compose.yaml`'s `ibook-artifacts` / `ibook-quarantine` naming), the container hosts for
`ibook-api` / `ibook-worker` / `ibook-web`, and secrets-manager-backed credentials — never
credentials committed to this repo.
