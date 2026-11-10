# Dataset provenance and handling

Phase 1 targets consumer-finance complaint category triage using the narrative field and `Product` label.

**Live-source warning (verified 2026-10-20):** CFPB API release notes say consumer complaint narratives were removed from the current database in September 2026. The live API is therefore not assumed to provide training narratives. See:

- Official CFPB API release notes: https://cfpb.github.io/api/ccdb/release-notes.html
- Candidate pre-removal CFPB snapshot mirror: https://huggingface.co/datasets/vivekkopthsd/cfpb-consumer-complaints

The candidate mirror describes a pre-removal export through 2026-08-11. Verify the exact snapshot metadata and terms before relying on it. It is a third-party mirror of CFPB public data, not the live official API. Do not claim the dataset is a current API response.

Place a downloaded historical CSV ZIP at a local path and run:

```powershell
python nlp-service/training/inspect_dataset.py --csv "C:\path\to\complaints.csv.zip" --start-date 2025-01-01 --end-date 2025-06-30 --limit 25000
```

The script streams the archive in chunks, counts all eligible rows in the date window, and uses a seeded reservoir sample for the detailed sample metrics. Raw source files should not be committed. Preserve the raw narratives unchanged and remove `XXXX` masks only in a documented preprocessing step.

The Product label indicates a consumer financial product category, not a government department. The model and UI must say so.
