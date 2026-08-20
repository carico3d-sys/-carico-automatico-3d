from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("caricamento", "0025_sync_legacy_blocca_posizionati"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        'ALTER TABLE "caricamento_pianodicarico" '
                        'DROP COLUMN IF EXISTS "blocca_posizionati"'
                    ),
                    reverse_sql=migrations.RunSQL.noop,
                ),
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="pianodicarico",
                    name="blocca_posizionati",
                ),
            ],
        ),
    ]
