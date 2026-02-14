 # Extensions Development

 ## Status
 - **hot-reload-extension-v2**: DO NOT USE. Keeping for historical reference.
 - **pi-apply-patch**: DEPRECATED by pi-hash. Keeping for reference.
 - **pi-enforce-read**: DEPRECATED by pi-hash. Keeping for reference.

 ## Active Extensions
 All active extensions have been moved to their own feature branches for extraction.
 ## Procedures
 - **CHANGELOG.md**: You MUST update `CHANGELOG.md` whenever a feature or fix is shipped to `master`.
 - **Dependencies**: You MUST NOT commit `package-lock.json` files.
When operating in this directory you MUST consider loading these workflows:
- `prepare-extension-packages-for-community-publish`
