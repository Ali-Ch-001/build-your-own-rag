"""Add evaluation_runs and evaluation_metrics tables for RAGAS evaluation pipeline."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260710_0003"
down_revision: str | None = "20260710_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evaluation_runs",
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("dataset_name", sa.String(length=256), nullable=False),
        sa.Column("corpus_id", sa.Uuid(), nullable=False),
        sa.Column("case_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="running"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("run_id", name="pk_evaluation_runs"),
    )
    op.create_index(
        "ix_evaluation_runs_tenant_created",
        "evaluation_runs",
        ["tenant_id", "created_at"],
    )

    op.create_table(
        "evaluation_metrics",
        sa.Column("metric_id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("question_hash", sa.String(length=64), nullable=False),
        sa.Column("metrics", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("metric_id", name="pk_evaluation_metrics"),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["evaluation_runs.run_id"],
            ondelete="CASCADE",
            name="fk_evaluation_metrics_run_id",
        ),
    )
    op.create_index(
        "ix_evaluation_metrics_run",
        "evaluation_metrics",
        ["run_id"],
    )
    op.create_index(
        "ix_evaluation_metrics_tenant_run",
        "evaluation_metrics",
        ["tenant_id", "run_id"],
    )

    for table in ("evaluation_runs", "evaluation_metrics"):
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
    op.drop_index("ix_evaluation_metrics_tenant_run", table_name="evaluation_metrics")
    op.drop_index("ix_evaluation_metrics_run", table_name="evaluation_metrics")
    op.drop_table("evaluation_metrics")
    op.drop_index("ix_evaluation_runs_tenant_created", table_name="evaluation_runs")
    op.drop_table("evaluation_runs")
