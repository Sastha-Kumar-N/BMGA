# BMGA FAIR registration handoff

The portal publishes live DCAT 3 and Bioschemas-compatible JSON-LD at `/api/backend/fair/catalog`, per-strain metadata at `/api/backend/fair/strains/:id`, and an OpenAPI description at `/api/backend/openapi.json`.

Before claiming external registration, the BMGA owner must:

1. Approve a dataset reuse license and set `DATASET_LICENSE_NAME` and `DATASET_LICENSE_URL`.
2. Verify the public production domain, institutional publisher, contact email, data governance policy, and update cadence.
3. Review the public catalog for accurate access rights, provenance, evidence limitations, and distributions.
4. Submit the database at <https://fairsharing.org/new> using the organization owner's account.
5. Complete FAIRsharing ownership and curation requests.
6. Set `FAIRSHARING_RECORD_URL` to the accepted public record URL and redeploy.
7. Optionally mint a DOI for the catalog or release and set `DATASET_DOI`.

The application deliberately reports `OWNER_ACTION_REQUIRED` until a registry URL is configured. FAIR-enabling implementation does not itself prove FAIR compliance or registry acceptance.
