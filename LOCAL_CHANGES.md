# Local Change Log

Date: 2026-06-16
Branch: main
HEAD commit before snapshot: 0096942

## Modified Files
- `logic/appointmentLogic.js`
  - Fixed typo in WhatsApp appointment confirmation text.
- `services/aiService.js`
  - Improved assistant JSON response parsing and message extraction.
  - Updated assistant prompt rules for customer salutation and business hours.
- `services/conversationService.js`
  - Added appointmentDate derivation from response date/time.
  - Reset session state after appointment creation.

## Untracked Files
- `claude_api_key` (left untracked; likely a local API key file and not committed for safety)

## Notes
- These changes are saved locally in a commit and can be reverted if needed.
- To discard the snapshot later: `git reset --hard HEAD~1` (use with caution).
