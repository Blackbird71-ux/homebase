-- Pin flag for notes (pinned notes are surfaced on the dashboard Notes card; toggled from the notes list and detail screens)
ALTER TABLE "Note" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
