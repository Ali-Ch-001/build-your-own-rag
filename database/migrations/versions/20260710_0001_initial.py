"""Create the initial document, chunk, workflow, and retrieval schema."""

from collections.abc import Sequence

from alembic import op

from rag_platform.db.base import Base

revision: str = "20260710_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    initial_tables = [
        table for name, table in Base.metadata.tables.items() if name != "retrieval_request_logs"
    ]
    Base.metadata.create_all(bind=bind, tables=initial_tables)

    for table in (
        "documents",
        "document_versions",
        "sections",
        "chunks",
        "ingestion_stages",
        "retrieval_logs",
    ):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_tenant_policy ON {table}
            USING (
              tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
            )
            WITH CHECK (
              tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
            )
            """
        )


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind())
