# JSON schemas of the Make Apps Editor

The schemas in this folder are copied verbatim from the Make Apps Editor for
VS Code (`integromat/vscode-apps-sdk`, commit `6ff5f3dd9960ccbeb24de3beb1cca935de89eaa0`,
2026-10-08), files `syntaxes/imljson/schemas/*.json` and
`syntaxes/local-development/schemas/makecomapp.schema.json`. They are the same
schemas the extension uses to validate app code files in the editor
(`contributes.jsonValidation` in its `package.json`), so `npm run validate`
reports the same structural problems the editor would.

Copyright (c) 2022 Celonis, Inc. (www.make.com), MIT License. See the
extension repository for the full license text.
