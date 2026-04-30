# Spec Kit Status

Spec Kit Status is a lightweight VS Code extension that surfaces the current Spec Kit state directly in the Explorer and status bar.

It shows:

- Current phase
- Current workflow bucket
- Active feature
- Completion percentage

## How it works

The extension follows generic Spec Kit conventions by default, and it reads richer workspace metadata when available.

Coverage includes:

- Active feature is resolved in Spec Kit order: `SPECIFY_FEATURE_DIRECTORY`, then `.specify/feature.json`, then the current git branch, then the latest matching directory under `specs/`
- Configured workflow name and steps are read from `.specify/workflows/*/workflow.yml` and `workflow-registry.json`
- Runtime phase hints are read from `.specify/.runtime/phase-done.txt`
- Hook coverage is read from `.specify/extensions.yml`
- Integration and branch numbering details are read from `.specify/init-options.json` and `.specify/integration.json`
- Planning coverage includes `plan.md`, `research.md`, `data-model.md`, and `quickstart.md`
- Checklist coverage includes `checklists/*.md`
- Implementation progress uses checked tasks in `tasks.md`

## UI

- Explorer view: `Spec Kit Status`
- Status bar summary: `% complete`, `feature`, and current `phase`

## Notes

- The status bar can be disabled with `specKitStatus.showStatusBar`
- Git branch detection can be disabled with `specKitStatus.preferGitBranchFeature`
- If `kitt-scanner-statusbar` is installed, Spec Kit Status enables it automatically while a refresh or tracked active process is running, and turns it back off when that activity finishes
- If a workspace does not include the richer `.specify` workflow files, the extension falls back to a simpler artifact-based Spec Kit flow

## Development

Run the smoke test:

```powershell
npm test
```

Package the extension:

```powershell
npm run package:vsix
```
