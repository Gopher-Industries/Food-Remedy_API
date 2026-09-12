# DB052 – Verify Release Pipeline Reproducibility

## Why this doc exists

This ticket asks me to check that if we run the release pipeline twice with the same input and same config, we get the same output both times. This matters because before we generate the final release dataset, we need proof the pipeline isn't doing anything random or flaky.

I only tested the enrich stage. I did NOT touch the seed stage anywhere, so production Firestore was never written to or read from during this whole test.

## What I used

- Input file: `database/seeding/products_5k_enriched.json`
- Output file (this is the "release candidate"): `database/seeding/products_enriched.json`
- Config file: `database/pipeline/pipeline.config.json`
- Config commit hash: `26838781a420810c5ca2cc5bae3cdb423c13bf2d` (from 2026-05-11)

I saved a copy of the exact config I used at `database/Release/DB052-repro/pipeline.config.used.json` so there's no confusion later if the config file changes.

Modules that ran during enrich (all from the config):
- allergens
- db009_personalisation_tags
- db021_mood_tags
- db019_alternative_product_mapping (this one has a fixed rng_seed of 20260419)

Clean stage was off (not part of this test). Seed stage I forced off with `--no-seed` every time, even though the config file itself has seed enabled — I didn't want to risk it accidentally writing to Firestore.

## How I ran it

From the repo root (important — running from inside `database/pipeline` breaks the file paths):

```powershell
python database\pipeline\run_pipeline.py -c database\pipeline\pipeline.config.json --no-clean --enrich --no-seed --force
```

I ran this exact command twice, saving the output somewhere safe after each run so the second run couldn't overwrite the first one's evidence:

```powershell
# after run 1
mkdir database\Release\DB052-repro\run1 -Force
copy database\seeding\products_enriched.json database\Release\DB052-repro\run1\products_enriched.json
copy database\pipeline\pipeline_run_metadata.json database\Release\DB052-repro\run1\pipeline_run_metadata.json

# after run 2
mkdir database\Release\DB052-repro\run2 -Force
copy database\seeding\products_enriched.json database\Release\DB052-repro\run2\products_enriched.json
copy database\pipeline\pipeline_run_metadata.json database\Release\DB052-repro\run2\pipeline_run_metadata.json
```

The `--force` flag makes sure each run actually starts fresh instead of just resuming from a checkpoint left over from the last run — otherwise "run 2" wouldn't really be a second run at all.

Full terminal output for both runs is saved in `run1/console_log.txt` and `run2/console_log.txt`.

## Making sure Firestore was safe

Every run printed this line, confirming the seed stage never fired:
[SAFE MODE] Seed stage disabled via --no-seed. No Firestore seeding will be performed.
So no writes to production Firestore happened at any point.

## Run results

| | Run 1 | Run 2 |
|---|---|---|
| Started | 10:33:19 | 10:36:53 |
| Finished | 10:34:21 | 10:37:53 |
| Took about | 62 sec | 60 sec |
| Records out | 5000 | 5000 |
| Failures | 0 | 0 |

The db019 module (alternative products) printed this exact same line both times:
products=5000 categories=71 no_similar=52 no_healthier=1737 healthier(strict/any/sugar/fiber)=0/0/3081/182
## Comparing the two runs

**Product counts:** 5000 vs 5000. Match.

**Validation:** I ran the validator (`db021_validator.py`) on each run's output separately. Small annoyance: this script has the input file path hardcoded in the code instead of taking it as an argument, so I had to temporarily swap each run's output into that path, run the validator, then put the original test file back afterward (checked with `git status` that nothing was left changed).

Results — identical both times:
| Check | Run 1 | Run 2 |
|---|---|---|
| Basic schema issues | 0 | 0 |
| Nutrient errors | 0 | 0 |
| Allergen errors | 0 | 0 |
| Empty barcodes | 0 | 0 |
| Invalid format barcodes | 3 | 3 |
| Duplicate barcodes | 0 | 0 |
| Advanced schema invalid | 0 | 0 |

**Actual file comparison:** Both output files are exactly 26,183,695 bytes.
run1 count: 5000
run2 count: 5000
only in run1: 0
only in run2: 0
records that differ: 0

So literally zero differences across all 5000 products between the two runs.

## Did anything behave randomly?

Before running anything, I was a little worried about two things:
1. The db019 module uses a fixed random seed — wanted to make sure it's actually being used properly.
2. The mood tags module could have some tie-breaking logic that isn't deterministic.

After running it twice, neither one caused any problems — both runs matched perfectly. So I'd say the pipeline is deterministic, at least for this input and config.

## Bottom line

Ran the pipeline twice with the same input and config. Got the same product count, same validation results, and literally identical output both times. No random behaviour showed up. Firestore was never touched. Pipeline looks reproducible.

## Where the evidence lives

Everything's saved under `database/Release/DB052-repro/`:
pipeline.config.used.json
pipeline.config.commit.txt
run1/console_log.txt
run1/pipeline_run_metadata.json
run1/products_enriched.json
run1/validation_output.txt
run2/console_log.txt
run2/pipeline_run_metadata.json
run2/products_enriched.json
run2/validation_output.txt
Realized `--force` only clears checkpoints, not the actual output file, so a run could end up reusing old leftover data instead of starting completely fresh. Also noticed something odd in the metadata — the allergens step was writing to a strange duplicate path (`database/database/seeding/...`).

Checked both. Found a real bug in `allergens_enrich.py` it was calculating the project's root folder wrong, going up 2 folders instead of 3, which is why it wrote to the wrong nested path. Fixed that one line.Then properly deleted the output file before each run this time (not just the checkpoint) and ran the pipeline twice again. Both runs finished cleanly with zero errors, and the outputs matched exactly — confirmed using a SHA-256 hash (a fingerprint of the file):
Run 1: 3637F29E6AC8E86A6FF131593029270FA397FCA00E80854E1BB043C428DE3B31
Run 2: 3637F29E6AC8E86A6FF131593029270FA397FCA00E80854E1BB043C428DE3B31

Both hashes match, so the pipeline is reproducible from a genuinely clean state. Evidence saved under `run1_v3/` and `run2_v3/`.