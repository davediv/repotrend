1. Get the **first** unchecked task `docs/TODO.md` (ONLY THE FIRST TASK ID)
2. Fully implement that task.
3. Launch one `div-dev:code-reviewer` agent focuses: simplicity/DRY/elegance, bugs/functional correctness, project conventions/abstractions. Then fix all identified issues — including minor suggestions. No exceptions. DO NOT SKIP THIS.
4. Complete the task end-to-end, ensuring:
   - All defined success criteria are satisfied
   - No type, format, lint errors.
   - No errors.
5. Update `docs/TODO.md` to mark the task as completed (checked).
5. Git commit (use `/do:commit` custom command - DO NOT SKIP THIS)
6. Calculate the total number of tasks and the number of unfinished (unchecked) tasks, then display the overall progress and send it using plugin/command `/telegram-notify:send repotrend ✅ Progress: XX/XXX tasks (XX%)`. DO NOT SKIP THIS.

If no unchecked tasks remain, output: <promise>COMPLETE</promise>