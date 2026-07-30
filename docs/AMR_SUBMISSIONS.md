# AMR Finding and Publication Submissions

## Purpose

The AMR Findings of India module keeps contributor submissions private until an administrator reviews, approves, and publishes them. An AMR gene detection is represented as genotypic evidence unless linked phenotypic or experimental evidence is explicitly supplied.

## Roles

| Role | Permitted actions |
| --- | --- |
| Public visitor | Read only published AMR findings and publications. |
| Registered user | Save and edit own drafts, submit findings, import valid JSON, submit publications, and read feedback addressed to them. |
| Administrator | Create and edit records, assign reviewers, add private or submitter-visible notes, request changes, approve, publish, unpublish, reject, archive, restore, resolve duplicates, run imports, and inspect audit logs. |

## Workflow

`DRAFT -> SUBMITTED -> UNDER_REVIEW -> CHANGES_REQUESTED | APPROVED -> PUBLISHED`

Records can also be `REJECTED` or `ARCHIVED`. `APPROVED` is not public: a separate `PUBLISHED` action is required. Scheduled publication runs server-side once per minute for approved records with a due time.

## JSON Upload

- Maximum file size: 2 MB.
- Maximum records per upload: 100.
- Use [amr-finding-submission.schema.json](amr-finding-submission.schema.json) for the accepted structure.
- See [the single-record example](amr-finding-submission.example.json) and [batch example](amr-finding-submission-batch.example.json). Both are explicitly fictional and must not be submitted as data.
- Unsupported fields, malformed coordinates, unsafe URLs, invalid identifiers, implausible years, and incomplete high/critical-importance justifications are rejected.

## Publication Identifiers and Duplicates

Publication records normalize DOI URLs and validate PMID, PMCID, Europe PMC identifiers, and external URLs. Duplicate warnings use this order: DOI, PMID, PMCID, Europe PMC ID, normalized title plus publication year, then normalized title. The application never merges records automatically; a reviewer must explicitly mark or merge a duplicate.

## External Literature Imports

PubMed and Europe PMC imports are modular and disabled by default. Set `AMR_IMPORT_ALLOW_NETWORK=true` only after approving the deployment's data-governance policy. Imports create private AMR publication drafts, not published AMR findings. Curators must review them and create or link an evidence-backed finding separately.

## Audit and Privacy

All submission, moderation, source-import, duplicate, link, and scheduled-publication actions write to the existing `AdminLog` audit trail. Submitters see only feedback deliberately marked visible to them. Public APIs exclude identities, private notes, administrative assignments, internal links, and unpublished records.
