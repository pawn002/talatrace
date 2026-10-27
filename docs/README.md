# TalaTrace documentation

[Linux candidate work](linux.md) tracks the initial Ubuntu build and the desktop/installer validation still required by #24.

Current guides describe the released **1.2.0** app. Windows x64 is the validated release target; [Linux support is tracked in #24](https://github.com/pawn002/talatrace/issues/24). Build-target declarations do not establish platform support.

## Using the app

| Guide | Use it for |
| --- | --- |
| [Install and update](installation.md) | Windows downloads, upgrades, profile locations and removal |
| [Use TalaTrace](usage.md) | Record/import audio, copy/export, settings and session history |
| [Speech models](models.md) | Implemented models, selection, storage, timing and reference measurements |
| [Troubleshooting](troubleshooting.md) | Microphone, model, transcription and source-build failures |

## Working on the project

| Guide | Use it for |
| --- | --- |
| [Development](development.md) | Source setup, actual npm commands, tests and packaging |
| [Architecture](architecture.md) | Capture, IPC, engines, persistence and current limits |
| [Releasing](releasing.md) | Maintainer release procedure and compatibility checks |
| [Candor widget inventory](candor-widget-review.md) | Current constructions and deliberate adaptations; read with [AGENTS.md](../AGENTS.md) before UI work |
| [Speech evaluation](speech-model-evaluation.md) | Reproducible local quality/speed evaluation |

[Release notes](releases/1.2.0.md) describe shipped changes. [Archived reviews](archive/README.md) preserve dated research, UI iterations and the completed repository migration; they are evidence, not setup instructions. The [documentation audit](../AUDIT_REPORT.md) records this cleanup and unresolved tooling findings.

Start at the [project README](../README.md). For help, check [troubleshooting](troubleshooting.md), then [existing issues](https://github.com/pawn002/talatrace/issues).
