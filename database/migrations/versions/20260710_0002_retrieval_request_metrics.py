"""Add per-request retrieval metrics for live dashboard data."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260710_0002"
down_revision: str | None = "20260710_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "retrieval_request_logs",
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("query_hash", sa.String(length=64), nullable=False),
        sa.Column("total_latency_ms", sa.Float(), nullable=False),
        sa.Column("cache_hit", sa.Boolean(), nullable=False),
        sa.Column("cache_type", sa.String(length=20), nullable=True),
        sa.Column("partial", sa.Boolean(), nullable=False),
        sa.Column("result_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("request_id", name="pk_retrieval_request_logs"),
    )
    op.create_index(
        "ix_retrieval_request_logs_tenant_id",
        "retrieval_request_logs",
        ["tenant_id"],
    )
    op.create_index(
        "ix_retrieval_requests_tenant_created",
        "retrieval_request_logs",
        ["tenant_id", "created_at"],
    )
    op.execute("ALTER TABLE retrieval_request_logs ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE retrieval_request_logs FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY retrieval_request_logs_tenant_policy ON retrieval_request_logs
        USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_retrieval_requests_tenant_created", table_name="retrieval_request_logs")
    op.drop_index("ix_retrieval_request_logs_tenant_id", table_name="retrieval_request_logs")
    op.drop_table("retrieval_request_logs")
