1. Get the **first** unchecked task `docs/TODO.md` (ONLY THE FIRST TASK ID)
2. Fully implement that task.
3. Run `/do:check-code` command (OPTIONAL - only if needed)
3. Complete the task end-to-end, ensuring:
   - All defined success criteria are satisfied
   - No type, format, lint errors.
   - No errors.
4. Update `docs/TODO.md` to mark the task as completed (checked).
5. Git commit (use `/do:commit` custom command)
6. Calculate the total number of tasks and the number of unfinished (unchecked) tasks, then display the overall progress and send it using plugin/command `/telegram-notify:send repotrend ✅ Progress: XX/XXX tasks (XX%)`.

If no unchecked tasks remain, output: <promise>COMPLETE</promise>