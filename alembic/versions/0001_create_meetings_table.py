"""create meetings table and search index

Revision ID: 0001_create_meetings_table
Revises: 
Create Date: 2026-05-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_create_meetings_table"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False, server_default="0"),
        sa.Column("audio_filename", sa.String(length=1024), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=False),
        sa.Column("minutes", sa.Text(), nullable=False),
        sa.Column("language", sa.String(length=16), nullable=False, server_default="und"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
            meeting_id UNINDEXED,
            title,
            transcript,
            minutes,
            language,
            content=''
        );
        """
    )

    op.execute(
        """
        CREATE TRIGGER meetings_ai_insert AFTER INSERT ON meetings BEGIN
            INSERT INTO meetings_fts(meeting_id, title, transcript, minutes, language)
            VALUES (new.id, new.title, new.transcript, new.minutes, new.language);
        END;
        """
    )

    op.execute(
        """
        CREATE TRIGGER meetings_ai_update AFTER UPDATE ON meetings BEGIN
            DELETE FROM meetings_fts WHERE meeting_id = old.id;
            INSERT INTO meetings_fts(meeting_id, title, transcript, minutes, language)
            VALUES (new.id, new.title, new.transcript, new.minutes, new.language);
        END;
        """
    )

    op.execute(
        """
        CREATE TRIGGER meetings_ai_delete AFTER DELETE ON meetings BEGIN
            DELETE FROM meetings_fts WHERE meeting_id = old.id;
        END;
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS meetings_ai_delete;")
    op.execute("DROP TRIGGER IF EXISTS meetings_ai_update;")
    op.execute("DROP TRIGGER IF EXISTS meetings_ai_insert;")
    op.execute("DROP TABLE IF EXISTS meetings_fts;")
    op.drop_table("meetings")
