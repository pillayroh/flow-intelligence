# Participant consent

Consent version: **1.0** (recorded per participant as `consent_version`).

The extension shows this summary in a modal before any data is collected;
enrollment cannot proceed without explicit consent.

## Study purpose

Flow Intelligence is a research study on human-AI collaboration flow during
software development. It measures behavioral and AI-interaction signals to
understand when and why developers experience flow while working with AI tools.

## What is collected (metadata only)

- **Behavioral:** active time, session length, focus/context switches, edit
  sizes (character counts), git commit counts, error/warning counts.
- **AI interaction:** prompt frequency and length, AI edit and Tab acceptance
  sizes, agent tool usage, shell command *category* (e.g. test/git/run).
- **Flow check-ins:** your occasional 1-5 self-ratings of flow, frustration,
  and confidence.

## What is NEVER collected

- No prompt text, no code, no file contents.
- No raw file paths (only file extensions like `ts`, `py`).
- No raw shell commands (only a coarse category).
- No keystroke content.

## Your rights

- Participation is **voluntary** and data is **anonymous** (a random participant id).
- You may **pause** collection any time: Command Palette -> "Flow Intelligence: Pause Collection".
- You may **withdraw** any time: "Flow Intelligence: Withdraw from Study". This
  stops collection and removes the Cursor hooks. Ask the researcher for deletion
  of previously collected records if desired.

## Data handling

- Data is transmitted over HTTPS to a Supabase backend and stored in an
  access-controlled database readable only by the research team.
- Enforcement is technical, not just policy: clients send metadata only, and the
  ingest endpoint rejects any payload containing free-text content.

## Contact

Add the responsible researcher's name, institution, and contact email here
before recruiting participants. If this study is run under an institution,
obtain IRB/ethics approval and reference the protocol number here.
