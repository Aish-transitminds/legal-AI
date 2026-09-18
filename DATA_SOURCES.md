# Data Sources

This project separates authoritative legal material from research and training data.
Research data must never override or silently enter the authoritative legal retrieval path.

## MVP v1 authoritative sources

| Name | Purpose | Source | License / terms | Authoritative | Commercial use | Downloaded | Checksum | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The Indian Contract Act, 1872 | Official legal source for NDA-related contract analysis | India Code: https://www.indiacode.nic.in/ | Government source; verify current access and reuse terms | Yes | Verify before commercial use | Not yet | Not yet | Not yet manually verified |

The MVP will use only manually sourced and verified sections from India Code. No Kaggle,
GitHub, Hugging Face, or secondary legal copy will be treated as authoritative law.

## Research and training sources

These sources are recorded for later phases only. They are not required for MVP v1 and must
not be used as legal authority.

| Name | Purpose | Source | License / status | Authoritative | Commercial use | Downloaded | Checksum | Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CUAD | Future clause-classification training/evaluation | https://github.com/TheAtticusProject/cuad | CC BY 4.0, verify current repository terms | No | Research/training use; verify intended use | No | Not applicable | Pending v2 review |
| ICAT | Future contract clause research | To be identified and verified before use | Must be verified | No | Unknown until verified | No | Not applicable | RESEARCH_ONLY |
| Indian Contract Clauses | Future research/training only | To be identified and verified before use | Currently listed as unknown; do not use in production without verification | No | Unknown | No | Not applicable | RESEARCH_ONLY |
| Legal RAG Evaluation | Future evaluation only | To be identified and verified before use | Must be verified | No | Unknown until verified | No | Not applicable | RESEARCH_ONLY |

## Provenance rules

1. Every downloaded source receives a checksum and verification record.
2. Official legislation is stored under `data/official/`.
3. Research and training material is stored under `data/research/`.
4. Uploaded documents are untrusted input and are never training data by default.
5. Government-site access protections will not be bypassed. If India Code requires manual
   download, that limitation will be recorded here.
